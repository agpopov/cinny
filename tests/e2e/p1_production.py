"""P1 integration against an actual production build and disposable Synapse.

APP_URL and HS_URL must point to the isolated test application and homeserver.
Requires Playwright; never use production accounts. No mocked application modules.
"""
import json
import os
import time
import uuid
import urllib.request
import http.server
import threading
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright, expect

APP = os.environ['APP_URL'].rstrip('/')
HS = os.environ['HS_URL'].rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', '/tmp/cinny-p1-production'))
OUT.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method, path, token=None, body=None):
    request = urllib.request.Request(HS + path, method=method, headers={
        'Content-Type': 'application/json',
        **({'Authorization': 'Bearer ' + token} if token else {}),
    })
    with opener.open(request, json.dumps(body).encode() if body is not None else None, timeout=30) as response:
        return json.loads(response.read() or b'{}')


def check(label):
    print('PASS ' + label, flush=True)


class MatrixProxy(http.server.BaseHTTPRequestHandler):
    # A real HTTP proxy makes response loss deterministic even when WebKit or
    # Firefox bypass Playwright request routes through the service worker.
    def forward(self):
        data = self.rfile.read(int(self.headers.get('Content-Length', 0))) or None
        uncertain_send = self.command == 'PUT' and '/send/m.room.message/' in self.path and data and self.server.marker.encode() in data
        if uncertain_send and self.server.broken:
            self.server.pause_sync = True
        request = urllib.request.Request(HS + self.path, data=data, method=self.command,
            headers={key: value for key, value in self.headers.items()
                     if key.lower() not in ['host', 'content-length', 'connection', 'accept-encoding']})
        try:
            response = opener.open(request, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            result = response.read()
            status = response.status
            content_type = response.headers.get('Content-Type', 'application/json')
        if '/sync?' in self.path and self.server.pause_sync:
            self.server.sync_gate.wait(timeout=60)
        if uncertain_send:
            self.server.transactions.append(self.path.rsplit('/', 1)[-1])
            if self.server.broken:
                assert status == 200, status
                status = 400
                result = json.dumps({'errcode': 'M_UNKNOWN', 'error': 'Test response lost after acceptance'}).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(result)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        try:
            self.wfile.write(result)
        except (BrokenPipeError, ConnectionResetError):
            pass

    do_GET = forward
    do_POST = forward
    do_PUT = forward
    do_DELETE = forward

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.end_headers()

    def log_message(self, *args):
        pass


with sync_playwright() as playwright:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        run = uuid.uuid4().hex[:8]
        session = api('POST', '/_matrix/client/v3/register', body={
            'username': 'p1' + run, 'password': 'pass123', 'auth': {'type': 'm.login.dummy'},
        })
        token = session['access_token']
        room = api('POST', '/_matrix/client/v3/createRoom', token, {'name': 'P1 production ' + run})['room_id']

        def send(body, content=None):
            return api('PUT', f'/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}', token,
                       content or {'msgtype': 'm.text', 'body': body})['event_id']

        root = send('P1 THREAD ROOT ' + run)
        thread_body = 'P1 thread needle ' + run
        thread_event = send(thread_body, {'msgtype': 'm.text', 'body': thread_body, 'm.relates_to': {
            'rel_type': 'm.thread', 'event_id': root, 'is_falling_back': True,
            'm.in_reply_to': {'event_id': root},
        }})
        for index in range(45):
            send('P1 history ' + run + ' ' + str(index))
        proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 0), MatrixProxy)
        proxy.daemon_threads = True
        proxy.marker = 'P1 uncertain transaction ' + run
        proxy.broken = True
        proxy.transactions = []
        proxy.pause_sync = False
        proxy.sync_gate = threading.Event()
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        app_hs = f'http://127.0.0.1:{proxy.server_port}'
        options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(playwright, engine).launch(**options)
        context = browser.new_context(viewport={'width': 1400, 'height': 900})
        page = context.new_page()
        errors = []
        expected_aborts = []
        logging_out = [False]
        def page_error(error):
            message = str(error)
            if engine == 'webkit' and f'127.0.0.1:{proxy.server_port}/_matrix/client/' in message and '/sync?' in message and 'due to access control checks' in message:
                # WebKit reports cancellation of this fixture's cross-origin
                # long poll during intentional reloads/logout as a CORS error.
                # Record only that exact endpoint; other errors still fail.
                expected_aborts.append(message)
            else:
                errors.append(message)
        page.on('pageerror', page_error)
        page.route('**/config.json', lambda route: route.fulfill(json={
            'homeserverList': [app_hs], 'allowCustomHomeservers': True,
            'hashRouter': {'enabled': False, 'basename': '/'},
        }))
        page.goto(APP + '/config.json')
        page.evaluate('s => {for (const [key,value] of Object.entries(s)) localStorage.setItem("cinny_"+key,value)}', {
            'access_token': token, 'device_id': session['device_id'],
            'user_id': session['user_id'], 'hs_base_url': app_hs,
        })
        room_url = APP + '/home/' + room + '/'
        editor = page.locator('[data-editable-name="RoomInput"]')

        def open_room():
            page.goto(room_url)
            expect(editor).to_have_attribute('contenteditable', 'true', timeout=45000)
            page.keyboard.press('Escape')

        def expect_empty():
            expect(editor.locator('[data-slate-placeholder]')).to_be_visible(timeout=20000)

        def compose(target, value):
            # contenteditable.fill can replace Slate's DOM without producing its
            # input operation in Firefox after restoring an empty document.
            expect(target).to_have_attribute('contenteditable', 'true', timeout=45000)
            target.click()
            page.keyboard.type(value, delay=10)
            expect(target.locator('[data-slate-string]')).to_have_text(value)

        def search(term):
            field = page.get_by_placeholder('Поиск по тексту', exact=True)
            field.fill(term)
            field.press('Enter')

        try:
            open_room()
            draft = 'P1 persistent draft ' + run
            compose(editor, draft)
            page.wait_for_timeout(700)
            page.reload()
            expect(editor).to_have_text(draft, timeout=45000)
            expect(editor).to_have_attribute('contenteditable', 'true', timeout=45000)
            check(engine + ' production composer restores its draft after reload')
            editor.press('Enter')
            expect_empty()
            page.reload()
            expect(editor).to_have_attribute('contenteditable', 'true', timeout=45000)
            expect_empty()
            check(engine + ' successful send removes persisted draft')

            # Accept the real HTTP request, then replace its response with an error.
            # A new page must retry the durable transaction rather than create a duplicate.
            uncertain = proxy.marker
            compose(editor, uncertain)
            page.wait_for_timeout(700)
            editor.press('Enter')
            expect(page.get_by_role('button', name='Повторить отправку', exact=True)).to_be_visible(timeout=30000)
            expect(editor).to_have_text(uncertain)
            proxy.broken = False
            proxy.pause_sync = False
            proxy.sync_gate.set()
            page.reload()
            expect(editor).to_have_text(uncertain, timeout=45000)
            expect(editor).to_have_attribute('contenteditable', 'true', timeout=45000)
            editor.press('Enter')
            expect_empty()
            transactions = proxy.transactions
            assert len(transactions) in [1, 2] and len(set(transactions)) == 1, transactions
            messages = api('GET', f'/_matrix/client/v3/rooms/{room}/messages?dir=b&limit=100', token)['chunk']
            assert len([event for event in messages if event.get('content', {}).get('body') == uncertain]) == 1
            expect(page.locator('[data-message-id]').filter(has_text=uncertain)).to_have_count(1, timeout=15000)
            check(engine + ' response loss and reload reuse one transaction and one server event')

            # Search stays local until the user explicitly selects server search.
            requests = []
            page.on('request', lambda request: requests.append(request.url) if '/search?' in request.url or request.url.endswith('/search') else None)
            page.get_by_role('link', name='Поиск сообщений', exact=True).click()
            page.get_by_role('button', name='Загрузить более раннюю историю выбранных комнат', exact=True).click()
            expect(page.get_by_role('status').filter(has_text='История загружена.')).to_be_visible(timeout=45000)
            search(thread_body)
            expect(page.get_by_text(thread_body, exact=True)).to_be_visible(timeout=20000)
            assert not requests, requests
            assert 'needle' not in page.url
            page.get_by_label('Автор (Matrix ID)', exact=True).fill('@missing:localhost')
            expect(page.get_by_text(thread_body, exact=True)).to_have_count(0, timeout=10000)
            page.get_by_label('Автор (Matrix ID)', exact=True).fill(session['user_id'])
            expect(page.get_by_text(thread_body, exact=True)).to_be_visible(timeout=10000)
            page.get_by_label('Тип содержимого', exact=True).select_option('attachment')
            expect(page.get_by_text(thread_body, exact=True)).to_have_count(0, timeout=10000)
            page.get_by_label('Тип содержимого', exact=True).select_option('m.text')
            expect(page.get_by_text(thread_body, exact=True)).to_be_visible(timeout=10000)
            page.locator('#search-after').fill('2099-01-01')
            expect(page.get_by_text(thread_body, exact=True)).to_have_count(0, timeout=10000)
            page.locator('#search-after').fill('')
            expect(page.get_by_text(thread_body, exact=True)).to_be_visible(timeout=10000)
            check(engine + ' production local history search applies author, type and date without server query')
            page.get_by_role('button', name='Открыть', exact=True).last.click()
            expect(page.locator('[data-editable-name="ThreadInput"]')).to_be_visible(timeout=20000)
            expect(page.locator(f'[data-message-id="{thread_event}"]')).to_be_visible(timeout=20000)
            check(engine + ' local search result opens the correct thread and event')
            main_draft = 'P1 parent draft ' + run
            thread_draft = 'P1 independent thread draft ' + run
            thread_editor = page.locator('[data-editable-name="ThreadInput"]')
            compose(editor, main_draft)
            compose(thread_editor, thread_draft)
            page.wait_for_timeout(700)
            page.reload()
            expect(editor).to_have_text(main_draft, timeout=45000)
            root_row = page.locator(f'[data-message-id="{root}"]')
            root_row.get_by_role('button').filter(has_text='ответ').first.click()
            expect(thread_editor).to_have_text(thread_draft, timeout=20000)
            check(engine + ' main and thread drafts restore independently after reload')
            counts = page.evaluate("""async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('cinny-private-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const counts=await Promise.all(['keys','records'].map(name=>new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})));db.close();return counts;}""")
            assert all(count > 0 for count in counts), counts
            page.get_by_role('button', name='Настройки пользователя', exact=True).click()
            page.get_by_role('button', name='Выйти', exact=True).first.click()
            page.get_by_text('Выйти из аккаунта?', exact=True).wait_for()
            assert not errors, errors
            logging_out[0] = True
            page.get_by_role('button', name='Выйти', exact=True).last.click()
            expect(page.get_by_role('button', name='Войти', exact=True)).to_be_visible(timeout=30000)
            counts = page.evaluate("""async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('cinny-private-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const counts=await Promise.all(['keys','records'].map(name=>new Promise((resolve,reject)=>{if(!db.objectStoreNames.contains(name)){resolve(0);return}const r=db.transaction(name).objectStore(name).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})));db.close();return counts;}""")
            assert counts == [0, 0], counts
            check(engine + ' real logout removes private draft/search records and encryption keys')
            assert not errors, errors
            if expected_aborts:
                print('INFO '+engine+' fixture /sync cancellation during intentional reload/logout: '+json.dumps(expected_aborts), flush=True)
            page.screenshot(path=str(OUT / (engine + '-p1.png')))
            check(engine + ' P1 production integration has no unexpected JavaScript errors')
        except Exception:
            page.screenshot(path=str(OUT / (engine + '-failure.png')))
            print('FAULT STATE', {'transactions': proxy.transactions, 'pause_sync': proxy.pause_sync, 'base_url': page.evaluate("localStorage.getItem('cinny_hs_base_url')"), 'composer': editor.evaluate('(el)=>el.outerHTML') if editor.count() else None}, flush=True)
            print('BODY', page.locator('body').inner_text()[-4000:], flush=True)
            print('ERRORS', errors, flush=True)
            raise
        finally:
            context.close()
            browser.close()
            proxy.shutdown()
            proxy.server_close()
