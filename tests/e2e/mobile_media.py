"""Exercise the mobile fallback with real React and Chromium, without a build.

Requires Python Playwright, installed Chromium and Node >= 24. Sources are served
using Node's native TypeScript type stripping; no bundler/compiler is invoked.
Run: python3 tests/e2e/mobile_media.py
"""

import base64
import json
from pathlib import Path
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PIXEL = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
)
MEDIA_PATH = '/_matrix/client/v1/media/download/server/'
PAGE = """<!doctype html><div id="root"></div>
<a id="external" href="https://example.org/page" target="_blank"><span>External</span></a>
<a id="mention" href="https://matrix.to/#/@me:example.org">Mention</a>
<script src="/node_modules/react/umd/react.development.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.development.js"></script>
<script type="importmap">{"imports": {
  "react": "/react.mjs",
  "@tauri-apps/api/core": "/node_modules/@tauri-apps/api/core.js",
  "@tauri-apps/api/event": "/node_modules/@tauri-apps/api/event.js"
}}</script>
<script type="module">
import { useMediaSource } from '/src/app/hooks/useMediaSource.ts';
import { installMobileLinks } from '/src/app/utils/mobileLinks.ts';
window.isTauri = true;
window.nativeCalls = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (command, args) => { window.nativeCalls.push({command, args}); }
};
localStorage.setItem('cinny_hs_base_url', location.origin);
localStorage.setItem('cinny_user_id', '@me:example.org');
localStorage.setItem('cinny_device_id', 'DEVICE');
localStorage.setItem('cinny_access_token', 'test-token');
window.revoked = [];
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = url => { window.revoked.push(url); revoke(url); };
const root = ReactDOM.createRoot(document.getElementById('root'));
function Image({src}) {
  const resolved = useMediaSource(src);
  return React.createElement('img', {id: 'image', src: resolved});
}
window.showImage = src => root.render(React.createElement(Image, {src}));
window.removeImage = () => root.render(null);
document.getElementById('mention').addEventListener('click', event => event.preventDefault());
installMobileLinks();
window.ready = true;
</script>"""


class Handler(BaseHTTPRequestHandler):
    media_requests = []

    def log_message(self, *args):
        pass

    def send(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Expected when an obsolete image request is cancelled.

    def do_GET(self):
        if self.path == '/':
            return self.send(200, PAGE.encode(), 'text/html')
        if self.path == '/react.mjs':
            return self.send(
                200, b'export const {useState, useEffect} = window.React;', 'text/javascript'
            )
        if self.path.startswith(MEDIA_PATH):
            self.media_requests.append(self.path)
            if self.headers.get('Authorization') != 'Bearer test-token':
                return self.send(401, b'Unauthorized', 'text/plain')
            if self.path.endswith('/slow'):
                time.sleep(1)
            if self.path.endswith('/missing'):
                return self.send(404, b'Not found', 'text/plain')
            return self.send(200, PIXEL, 'image/png')
        path = (ROOT / self.path.lstrip('/')).resolve()
        if not path.is_relative_to(ROOT):
            return self.send(404, b'', 'text/plain')
        if not path.suffix:
            path = path.with_suffix('.ts')
        if not path.is_file():
            return self.send(404, b'', 'text/plain')
        body = path.read_bytes()
        if path.suffix == '.ts':
            body = subprocess.run(
                ['node', '--input-type=module', '-e',
                 "import {stripTypeScriptTypes} from 'node:module';"
                 "import {readFileSync} from 'node:fs';"
                 "process.stdout.write(stripTypeScriptTypes(readFileSync(0,'utf8')));"],
                input=body, capture_output=True, check=True,
            ).stdout
        return self.send(200, body, 'text/javascript')


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--no-sandbox'])
        page = browser.new_page(user_agent='Mozilla/5.0 (Linux; Android 12) Mobile')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin)
        page.wait_for_function('window.ready')
        assert page.evaluate('!navigator.serviceWorker.controller')

        # No source means no network activity before the caller enables media.
        page.evaluate('showImage(undefined)')
        page.wait_for_selector('#image', state='attached')
        assert Handler.media_requests == []
        assert page.locator('#image').get_attribute('src') is None

        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'first')
        page.wait_for_function('document.querySelector("#image").naturalWidth === 1')
        first = page.locator('#image').get_attribute('src')
        assert first.startswith('blob:') and 'test-token' not in first

        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'second')
        page.wait_for_function('old => document.querySelector("#image").src !== old && '
                               'document.querySelector("#image").naturalWidth === 1', arg=first)
        assert first in page.evaluate('revoked')

        # An obsolete slow request must not overwrite a newer image.
        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'slow')
        page.wait_for_function('!document.querySelector("#image").getAttribute("src")')
        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'third')
        page.wait_for_function('document.querySelector("#image").naturalWidth === 1')
        third = page.locator('#image').get_attribute('src')
        page.wait_for_timeout(1200)
        assert page.locator('#image').get_attribute('src') == third

        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'missing')
        page.wait_for_function('document.querySelector("#image").src.startsWith("data:")')
        page.evaluate('src => showImage(src)', origin + MEDIA_PATH + 'first')
        page.wait_for_function('document.querySelector("#image").naturalWidth === 1')

        # Nested link targets are opened once, without navigating the WebView.
        page.locator('#external span').click()
        assert page.evaluate('nativeCalls') == [{
            'command': 'plugin:opener|open_url',
            'args': {'url': 'https://example.org/page'},
        }]
        page.locator('#mention').click()
        assert len(page.evaluate('nativeCalls')) == 1
        assert page.url == origin + '/'

        current = page.locator('#image').get_attribute('src')
        page.evaluate('removeImage()')
        page.wait_for_function('url => revoked.includes(url)', arg=current)
        assert not errors, errors
        browser.close()
        print('PASS: native media without SW, image changes, cancellation, URL cleanup and links')
finally:
    server.shutdown()
    server.server_close()
