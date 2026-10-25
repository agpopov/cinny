"""Exercise editor, startup and native back routing against a production bundle."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from session_fixture import ROOM, DIRECT, SPACE, CHANNEL, MESSAGE, install_session_fixture, seed_session, assert_session_ready

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18102')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/client-fixes'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []

with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        context = browser.new_context(service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: (errors.append(str(error)), print('PAGEERROR ' + engine + ' ' + str(error), flush=True)))
        page.on('console', lambda msg: print('CONSOLE ' + engine + ' ' + msg.text[:2000], flush=True) if msg.type == 'error' else None)
        install_session_fixture(page)
        page.route("**/typing/*", lambda route: route.fulfill(json={}))
        page.goto(APP + '/config.json')
        seed_session(page)
        page.goto(APP + '/#/home/' + ROOM + '/')
        assert_session_ready(page)
        editor = page.locator('[data-editable-name="RoomInput"]')
        editor.click()
        page.keyboard.insert_text('hello')
        page.wait_for_timeout(150)
        editor.press('Control+A')
        page.wait_for_function("getSelection().toString()==='hello'")
        page.wait_for_timeout(150)
        editor.evaluate('''node => {
          const data = new DataTransfer(); data.setData('text/plain', 'https://example.org/');
          const event = new ClipboardEvent('paste', {bubbles:true, cancelable:true});
          Object.defineProperty(event, 'clipboardData', {value:data}); node.dispatchEvent(event);
        }''')
        expect(editor.locator('a')).to_have_text('hello')
        page.keyboard.insert_text(' ordinary text')
        expect(editor).to_have_text('hello ordinary text')
        expect(editor.locator('a')).to_have_text('hello')
        checks.append(engine + ': typing after an end-of-paragraph link is plain text')

        pending = []
        page.route('**/send/m.room.message/*', lambda route: pending.append(route))
        print('LINK PASS ' + engine, flush=True)
        editor.press('Control+A')
        page.keyboard.insert_text('Immediate local echo')
        page.wait_for_timeout(150)
        if editor.count() == 0:
            print('MISSING EDITOR ' + page.locator('body').inner_text(), flush=True)
        editor.press('Enter')
        expect(editor.locator('[data-slate-string]')).to_have_count(0, timeout=10000)
        expect(page.get_by_text('Immediate local echo', exact=True)).to_be_visible()
        assert len(pending) == 1
        # HTTP is still pending: the composer must already be empty.
        pending.pop().fulfill(json={'event_id': '$sent-client-fixes'})
        expect(editor).to_have_attribute('contenteditable', 'true')
        checks.append(engine + ': local echo and cleared composer before HTTP response')

        editor.click()
        page.keyboard.insert_text('Restore on failure')
        page.wait_for_timeout(150)
        editor.press('Enter')
        expect(editor.locator('[data-slate-string]')).to_have_count(0)
        page.wait_for_timeout(100)
        assert len(pending) == 1
        pending.pop().fulfill(status=403, json={'errcode':'M_FORBIDDEN','error':'Test send denied'})
        expect(editor).to_have_text('Restore on failure', timeout=10000)
        expect(editor).to_have_attribute('contenteditable', 'true')
        checks.append(engine + ': failed send restores the original draft')

        # Enable the native bridge after real SDK startup. The Kotlin callback
        # dispatches this exact cancelable event even with no WebView history.
        page.set_viewport_size({'width':390,'height':844})
        page.wait_for_timeout(300)
        page.evaluate('''() => {
          Object.defineProperty(navigator, 'userAgent', {value:'Mozilla/5.0 (Linux; Android 15)', configurable:true});
          window.isTauri = true;
          window.__TAURI_INTERNALS__ = {invoke:async command => {
            if(command === 'native_notification_permission') return 'granted';
            return {};
          }};
        }''')
        for route, parent, marker in [
            ('/direct/' + DIRECT + '/', '/direct/', 'Direct conversation is open'),
            ('/' + SPACE + '/' + CHANNEL + '/', '/' + SPACE, 'Workspace channel is open'),
            ('/home/' + ROOM + '/', '/home/', MESSAGE),
        ]:
            page.evaluate('(path) => location.hash=path', route)
            expect(page.get_by_text(marker, exact=True)).to_be_visible()
            expect(editor).to_have_attribute('contenteditable', 'true')
            page.wait_for_timeout(150)
            print('BACK ' + engine + ' ' + page.url, flush=True)
            handled = page.evaluate("!window.dispatchEvent(new Event('cinny:back', {cancelable:true}))")
            assert handled, (engine, route)
            page.wait_for_function('(parent) => decodeURIComponent(location.hash.slice(1)).replace(/\\/$/, "") === parent.replace(/\\/$/, "")', arg=parent)
        checks.append(engine + ': Android back returns from rooms, directs and spaces to their channel lists')
        page.screenshot(path=str(OUT / (engine + '-list.png')))
        assert not errors, errors
        context.close()
        browser.close()
        for check in checks[-4:]: print('PASS ' + check, flush=True)
(OUT / 'summary.json').write_text(json.dumps(checks, indent=2) + '\n')
