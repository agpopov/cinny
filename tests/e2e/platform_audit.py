"""Run source-level browser regressions without compiling or bundling.

Requires Node >=24, Python Playwright and its browsers. TypeScript is served
using Node's native type stripping, with real React hooks in each engine.
AUDIT_BROWSERS selects chromium,firefox,webkit (all three by default).
"""

import json
import os
from pathlib import Path
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PAGE = """<!doctype html><div id="root"></div><button id="focus">Focus</button>
<script src="/node_modules/react/umd/react.development.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.development.js"></script>
<script type="importmap">{"imports":{"react":"/react.mjs"}}</script>
<script type="module">
import {usePermissionState} from '/src/app/hooks/usePermission.ts';
import {useObjectURL} from '/src/app/hooks/useObjectURL.ts';
import {checkIndexedDBSupport} from '/src/app/utils/featureCheck.ts';
import {copyToClipboard, selectFile} from '/src/app/utils/dom.ts';
window.probeStorage = checkIndexedDBSupport;
window.copyMessage = copyToClipboard;
window.selectFile = selectFile;
const root = ReactDOM.createRoot(document.getElementById('root'));
function Probe() {
  const permission = usePermissionState('notifications');
  return React.createElement('output', {id: 'permission'}, permission);
}
window.mount = () => ReactDOM.flushSync(() => root.render(React.createElement(Probe)));
window.unmount = () => ReactDOM.flushSync(() => root.render(null));
function BlobProbe({blob}) {
  const url = useObjectURL(blob);
  return React.createElement('output', {id: 'blob-url'}, url || 'none');
}
window.renderBlob = text => ReactDOM.flushSync(() => root.render(React.createElement(
  BlobProbe, {blob: text === null ? undefined : new Blob([text])})));
window.ready = true;
</script>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/':
            body = PAGE.encode()
        elif self.path == '/react.mjs':
            body = b'export const {useState, useEffect, useMemo} = window.React;'
        else:
            path = (ROOT / self.path.lstrip('/')).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                self.send_error(404)
                return
            body = path.read_bytes()
            if path.suffix == '.ts':
                body = subprocess.run([
                    'node', '--input-type=module', '-e',
                    "import {stripTypeScriptTypes} from 'node:module';"
                    "import {readFileSync} from 'node:fs';"
                    "process.stdout.write(stripTypeScriptTypes(readFileSync(0,'utf8')));",
                ], input=body, capture_output=True, check=True).stdout
        self.send_response(200)
        self.send_header('Content-Type', 'text/html' if self.path == '/' else 'text/javascript')
        self.end_headers()
        self.wfile.write(body)


def check(page, name, expression):
    assert page.evaluate(expression), name
    print('PASS ' + name, flush=True)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as playwright:
        for engine in os.environ.get('AUDIT_BROWSERS', 'chromium,firefox,webkit').split(','):
            launch_options = {}
            if engine == 'webkit' and os.environ.get('AUDIT_WEBKIT_EXECUTABLE'):
                launch_options['executable_path'] = os.environ['AUDIT_WEBKIT_EXECUTABLE']
            browser = getattr(playwright, engine).launch(**launch_options)
            for width in (390, 1400):
                label = f'{engine} {width}: '
                page = browser.new_page(viewport={'width': width, 'height': 850})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(origin)
                page.wait_for_function('window.ready')
                check(page, label + 'IndexedDB probe succeeds', 'probeStorage()')
                page.wait_for_function("""async () => !(await indexedDB.databases()).some(
                    db => db.name.startsWith('checkIndexedDBSupport-'))""")
                print('PASS ' + label + 'temporary IndexedDB removed', flush=True)

                # Missing Permissions API must not crash settings in WebViews.
                page.evaluate("""() => {
                    Object.defineProperty(navigator, 'permissions', {configurable: true, value: undefined});
                    Object.defineProperty(window, 'Notification', {configurable: true,
                        value: {permission: 'default'}});
                    mount();
                }""")
                page.wait_for_function("document.querySelector('#permission').textContent === 'prompt'")
                page.evaluate("""() => { Notification.permission = 'granted';
                    window.dispatchEvent(new Event('focus')); }""")
                page.wait_for_function("document.querySelector('#permission').textContent === 'granted'")
                print('PASS ' + label + 'notification permission fallback and refresh', flush=True)
                page.evaluate('unmount()')

                # Some engines expose query() but reject this permission name.
                page.evaluate("""() => {
                    Notification.permission = 'denied';
                    Object.defineProperty(navigator, 'permissions', {configurable: true,
                        value: {query: async () => { throw new TypeError('unsupported'); }}});
                    mount();
                }""")
                page.wait_for_function("document.querySelector('#permission').textContent === 'denied'")
                print('PASS ' + label + 'unsupported permission query', flush=True)
                page.evaluate('unmount()')

                # A query that resolves after unmount must not attach a listener.
                page.evaluate("""() => {
                    window.added = 0; window.removed = 0;
                    window.permissionStatus = new EventTarget();
                    permissionStatus.state = 'granted';
                    const add = permissionStatus.addEventListener.bind(permissionStatus);
                    const remove = permissionStatus.removeEventListener.bind(permissionStatus);
                    permissionStatus.addEventListener = (...args) => { added++; add(...args); };
                    permissionStatus.removeEventListener = (...args) => { removed++; remove(...args); };
                    Object.defineProperty(navigator, 'permissions', {configurable: true,
                        value: {query: () => new Promise(resolve => {window.resolveQuery = resolve;})}});
                    mount(); unmount(); resolveQuery(permissionStatus);
                }""")
                check(page, label + 'late permission query does not leak a listener',
                      'async () => {await Promise.resolve(); return added === 0;}')

                page.evaluate("""() => {
                    Object.defineProperty(navigator, 'permissions', {configurable: true,
                        value: {query: async () => permissionStatus}});
                    mount();
                }""")
                page.wait_for_function('added === 1')
                page.evaluate("""() => {permissionStatus.state = 'denied';
                    permissionStatus.dispatchEvent(new Event('change'));}""")
                page.wait_for_function("document.querySelector('#permission').textContent === 'denied'")
                page.evaluate('unmount()')
                check(page, label + 'live permission listener removed', 'removed === 1')

                page.evaluate("""() => {
                    window.revoked = [];
                    const revoke = URL.revokeObjectURL.bind(URL);
                    URL.revokeObjectURL = url => {revoked.push(url); revoke(url);};
                    renderBlob('first');
                }""")
                first = page.locator('#blob-url').text_content()
                assert first.startswith('blob:')
                page.evaluate("renderBlob('second')")
                second = page.locator('#blob-url').text_content()
                assert second.startswith('blob:') and second != first
                assert page.evaluate('url => revoked.includes(url)', first)
                print('PASS ' + label + 'replaced attachment URL released', flush=True)
                page.evaluate('unmount()')
                assert page.evaluate('url => revoked.includes(url)', second)
                print('PASS ' + label + 'unmounted attachment URL released', flush=True)

                check(page, label + 'clipboard denial preserves multiline text and focus', """async () => {
                    Object.defineProperty(navigator, 'clipboard', {configurable: true,
                        value: {writeText: async () => {throw new Error('NotAllowedError');}}});
                    let copied;
                    document.execCommand = () => {copied = document.querySelector('textarea').value; return true;};
                    const focus = document.querySelector('#focus'); focus.focus();
                    const text = 'Одна строка\\nДругая строка 🔑';
                    copyMessage(text); await Promise.resolve();
                    return copied === text && document.activeElement === focus &&
                        !document.querySelector('textarea');
                }""")
                check(page, label + 'file selection cancellation settles', """async () => {
                    HTMLInputElement.prototype.click = function () {this.dispatchEvent(new Event('cancel'));};
                    return (await selectFile('*', true)) === undefined;
                }""")
                assert not errors, json.dumps(errors, ensure_ascii=False)
                page.close()
            browser.close()
finally:
    server.shutdown()
    server.server_close()
