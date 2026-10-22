"""P2 UI acceptance on the built application and an isolated Matrix homeserver.

Real sync, receipts and sent events; accounts are disposable. No application modules
are mocked. Desktop/mobile browser emulation is not a claim of physical iOS testing.
"""
import json
import os
import time
import uuid
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18084').rstrip('/')
HS = os.environ.get('HS_URL', 'http://127.0.0.1:18008').rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/p2-2026-10-22/production'))
OUT.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
results = []


def api(method, path, token=None, body=None):
    req = urllib.request.Request(HS + path, method=method, headers={
        'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {}),
    })
    with opener.open(req, json.dumps(body).encode() if body is not None else None, timeout=40) as response:
        return json.loads(response.read() or b'{}')


def check(label):
    results.append(label)
    if 'page' in globals(): page.evaluate('(phase) => window.__p2Phase = phase', label)
    print('PASS ' + label, flush=True)


def send(token, room, body, extra=None):
    return api('PUT', f'/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}', token,
               {'msgtype': 'm.text', 'body': body, **(extra or {})})['event_id']


def audit_accessibility(page, label):
    url = os.environ.get('AXE_SCRIPT_URL')
    if not url: return
    if not page.evaluate('typeof window.axe !== "undefined"'):
        page.add_script_tag(url=url)
    result = page.evaluate("""async () => await axe.run(document, {runOnly:{type:'rule',values:['button-name','aria-input-field-name','label','color-contrast','aria-allowed-attr','aria-valid-attr-value']}, resultTypes:['violations','incomplete']})""")
    (OUT / (label.replace('/', '-') + '-accessibility.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    assert not result['violations'], [(v['id'], [node['target'] for node in v['nodes']]) for v in result['violations']]
    check(label + ' axe accessible names, ARIA and contrast')


def set_settings(page, changes):
    page.evaluate('(changes) => localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings") || "{}"), ...changes}))', changes)
    page.reload()
    page.locator('[data-editable-name="RoomInput"]').wait_for(timeout=45000)
    page.keyboard.press('Escape')
    page.wait_for_timeout(1200)


with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**options)
        for width in [int(value) for value in os.environ.get('WIDTHS','390,1400').split(',')]:
            label = f'{engine}/{width}'
            run = uuid.uuid4().hex[:9]
            a, b = [api('POST', '/_matrix/client/v3/register', body={
                'username': name + run, 'password': 'pass123', 'auth': {'type': 'm.login.dummy'},
            }) for name in ['p2a', 'p2b']]
            token = a['access_token']
            room = api('POST', '/_matrix/client/v3/createRoom', token, {'name': 'P2 actions ' + run, 'invite': [b['user_id']]})['room_id']
            api('POST', f'/_matrix/client/v3/join/{room}', b['access_token'], {})
            action_body = 'P2 action target ' + run
            target = send(token, room, action_body)
            context = browser.new_context(viewport={'width': width, 'height': 900}, has_touch=True if width == 390 else False, reduced_motion='reduce')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error, sink=errors: sink.append({'message':str(error),'stack':error.stack}))
            page.on('console', lambda message: print(message.text, flush=True) if message.text.startswith('P2_DIAG') else None)
            page.add_init_script('''window.addEventListener('unhandledrejection', e=>console.error('P2_DIAG '+JSON.stringify({kind:'rejection',phase:window.__p2Phase,url:location.href,name:e.reason?.name,message:e.reason?.message,stack:e.reason?.stack,cause:e.reason?.cause?.message})));
                window.addEventListener('error', e=>console.error('P2_DIAG '+JSON.stringify({kind:'error',phase:window.__p2Phase,url:location.href,filename:e.filename,line:e.lineno,message:e.message,stack:e.error?.stack})));
                window.__copied = ''; window.__notices = [];
                Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {window.__copied=text;}}});
                window.Notification = class {
                    static permission = 'granted'; static requestPermission = async () => 'granted';
                    constructor(title, options) { window.__notices.push({title, ...options}); }
                    close() {}
                };''')
            page.route('**/config.json', lambda route: route.fulfill(json={
                'homeserverList': [HS], 'allowCustomHomeservers': True, 'hashRouter': {'enabled': '/#' in APP, 'basename': '/'},
            }))
            page.goto(APP.split('/#', 1)[0] + '/config.json')
            page.evaluate('s => {for (const [key,value] of Object.entries(s)) localStorage.setItem("cinny_"+key,value)}', {
                'access_token': token, 'device_id': a['device_id'], 'user_id': a['user_id'], 'hs_base_url': HS,
            })
            page.evaluate('localStorage.setItem("settings", JSON.stringify({isNotificationSounds:false, showNotifications:true, useSystemTheme:false, themeId:"dark-theme"}))')
            room_url = APP + '/home/' + room + '/'
            page.goto(room_url)
            editor = page.locator('[data-editable-name="RoomInput"]')
            expect(editor).to_have_attribute('contenteditable', 'true', timeout=45000)
            page.wait_for_timeout(1800)
            page.keyboard.press('Escape')
            row = page.locator('[data-message-id="' + target + '"]')
            actions = row.get_by_role('button', name='Действия сообщения', exact=True)
            page.mouse.move(0, 0)
            expect(actions).to_be_visible()
            actions.click()
            page.wait_for_timeout(200)
            page.screenshot(path=str(OUT / f'{engine}-{width}-menu.png'))
            (OUT / f'{engine}-{width}-menu.html').write_text(page.content())
            expect(actions).to_have_attribute('aria-expanded','true')
            page.get_by_role('button', name='Скопировать текст', exact=True).click()
            assert page.evaluate('window.__copied') == action_body
            check(label + ' persistent actions and copy without hover')

            actions.click()
            page.get_by_role('button', name='Ответить', exact=True).last.click()
            expect(editor).to_be_visible()
            assert action_body in page.locator('body').inner_text()
            check(label + ' reply without hover')

            # ContextMenu/Shift+F10 operates on the focused message itself.
            row.focus()
            row.press('Shift+F10')
            expect(page.get_by_role('button', name='Скопировать текст', exact=True)).to_be_visible()
            # FocusTrap activates after the positioned popup mounts.
            page.wait_for_timeout(150)
            page.keyboard.press('Escape')
            expect(page.get_by_role('button', name='Скопировать текст', exact=True)).to_be_hidden()
            check(label + ' keyboard message menu and Escape')
            page.get_by_role('button', name='Показать панель форматирования', exact=True).click()
            audit_accessibility(page, label + '-formatting')
            page.get_by_role('button', name='Жирный', exact=True).wait_for()
            page.get_by_role('button', name='Скрыть панель форматирования', exact=True).click()
            check(label + ' formatting controls have accessible names')

            if width == 390:
                # A touch hold opens the menu; moving more than 10px cancels it.
                row.get_by_text(action_body, exact=True).last.dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 100, 'clientY': 200, 'pointerId': 2})
                page.wait_for_timeout(620)
                expect(page.get_by_role('button', name='Скопировать текст', exact=True)).to_be_visible()
                page.go_back()
                expect(page.get_by_role('button', name='Скопировать текст', exact=True)).to_have_count(0)
                expect(editor).to_be_visible()
                check(label + ' touch hold and system Back dismiss only the menu')
                row.get_by_text(action_body, exact=True).last.dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 100, 'clientY': 200, 'pointerId': 3})
                row.get_by_text(action_body, exact=True).last.dispatch_event('pointermove', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 100, 'clientY': 230, 'pointerId': 3})
                page.wait_for_timeout(620)
                expect(page.get_by_role('button', name='Скопировать текст', exact=True)).to_have_count(0)
                check(label + ' scrolling cancels the long press')

            actions.click()
            page.get_by_role('button', name='Ответить в треде', exact=True).last.click()
            thread_editor = page.locator('[data-editable-name="ThreadInput"]')
            expect(thread_editor).to_be_visible(timeout=20000)
            page.go_back()
            expect(thread_editor).to_have_count(0)
            expect(editor).to_be_visible()
            check(label + ' system Back returns from thread to room')
            if width == 390:
                page.go_back()
                expect(editor).to_have_count(0)
                assert '/home' in page.url
                check(label + ' system Back returns from room to list')
                page.goto(room_url)
                expect(editor).to_have_attribute('contenteditable', 'true', timeout=30000)

            # Reaction is a real Matrix event.
            row.get_by_role('button', name='Действия сообщения', exact=True).click()
            page.get_by_role('button', name='Добавить реакцию', exact=True).last.click()
            page.locator('button[data-emoji-data]').first.wait_for(timeout=10000)
            emoji = page.locator('button[data-emoji-data]').first
            if emoji.count():
                emoji.click()
                for attempt in range(30):
                    events = api('GET', f'/_matrix/client/v3/rooms/{room}/messages?dir=b&limit=50', token)['chunk']
                    if any(event['type'] == 'm.reaction' for event in events): break
                    time.sleep(.1)
                else: raise AssertionError('Reaction was not sent')
                check(label + ' react through touch-accessible menu')
            else:
                page.keyboard.press('Escape')
                raise AssertionError('Emoji selector not found; inspect production markup')

            # File selection and upload use real browser Files and the server media API.
            page.get_by_role('button', name='Прикрепить', exact=True).click()
            with page.expect_file_chooser() as chooser:
                page.get_by_role('button', name='Файл', exact=True).click()
            chooser.value.set_files({'name': 'p2-file.txt', 'mimeType': 'text/plain', 'buffer': b'P2 file content'})
            expect(page.get_by_text('Лимит сервера:', exact=False)).to_be_visible(timeout=15000)
            expect(page.get_by_role('button', name='Отправить', exact=True).last).to_be_visible(timeout=20000)
            page.get_by_role('button', name='Отменить загрузку', exact=True).click()
            check(label + ' real file upload, visible server limit and cancellation')

            # Delete through the menu, followed by the existing confirmation dialog.
            row.get_by_role('button', name='Действия сообщения', exact=True).click()
            page.get_by_role('button', name='Удалить', exact=True).last.click()
            page.get_by_role('button', name='Удалить', exact=True).last.click()
            for attempt in range(50):
                data = api('GET', f'/_matrix/client/v3/rooms/{room}/event/{target}', token)
                if not data.get('content', {}).get('body'): break
                time.sleep(.1)
            else: raise AssertionError('Message was not redacted')
            check(label + ' delete without hover with server-confirmed redaction')

            # Zoom, reduced motion, light/dark and persistent actions on a fresh row.
            fresh = send(token, room, 'P2 zoom target ' + run)
            for theme in ['light', 'dark']:
                set_settings(page, {'themeId': theme + '-theme', 'pageZoom': 200, 'useSystemTheme': False})
                page.screenshot(path=str(OUT / f'{engine}-{width}-{theme}-zoom.png'))
                bounds = page.evaluate("""() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,text:el.textContent.slice(0,60),cls:el.className,rect:el.getBoundingClientRect().toJSON()})).filter(el=>el.rect.right>innerWidth+1&&el.rect.width>0).slice(0,30)})""")
                (OUT / f'{engine}-{width}-{theme}-bounds.json').write_text(json.dumps(bounds, ensure_ascii=False, indent=2))
                assert bounds['scroll'] <= bounds['width'] + 1, bounds
                assert page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')
                assert (page.locator('.dark-theme').count() > 0) == (theme == 'dark')
                page.screenshot(path=str(OUT / f'{engine}-{width}-{theme}-zoom.png'))
                check(label + ' ' + theme + ' at 200% font without document overflow')
                audit_accessibility(page, label + '-' + theme)
            set_settings(page, {'pageZoom': 100})

            # New unread items accumulate while the attention center stays open.
            ordinary = api('POST', '/_matrix/client/v3/createRoom', token, {'name': 'P2 ordinary ' + run, 'invite': [b['user_id']]})['room_id']
            mentioned = api('POST', '/_matrix/client/v3/createRoom', token, {'name': 'P2 mention ' + run, 'invite': [b['user_id']]})['room_id']
            for rid in [ordinary, mentioned]: api('POST', f'/_matrix/client/v3/join/{rid}', b['access_token'], {})
            page.goto(APP + '/inbox/notifications/')
            expect(page.get_by_text('Центр внимания', exact=True)).to_be_visible(timeout=30000)
            ordinary_event = send(b['access_token'], ordinary, 'P2 ordinary unread ' + run)
            mention_event = send(b['access_token'], mentioned, 'P2 personal mention ' + run, {'m.mentions': {'user_ids': [a['user_id']]}})
            expect(page.get_by_text('P2 ordinary ' + run, exact=True)).to_be_visible(timeout=20000)
            expect(page.get_by_text('P2 mention ' + run, exact=True)).to_be_visible(timeout=20000)
            page.get_by_role('button', name='Мне', exact=True).click()
            expect(page.get_by_text('P2 ordinary ' + run, exact=True)).to_have_count(0)
            expect(page.get_by_text('P2 mention ' + run, exact=True)).to_be_visible()
            check(label + ' attention includes live unreads and Me filters ordinary noise')
            audit_accessibility(page, label + '-attention')
            # Another device sends a real main receipt; no reload or manual queue refresh.
            other_device = api('POST', '/_matrix/client/v3/login', body={'type': 'm.login.password', 'identifier': {'type': 'm.id.user', 'user': a['user_id']}, 'password': 'pass123'})
            api('POST', f'/_matrix/client/v3/rooms/{mentioned}/receipt/m.read/{mention_event}', other_device['access_token'], {'thread_id': 'main'})
            expect(page.get_by_text('P2 mention ' + run, exact=True)).to_have_count(0, timeout=20000)
            check(label + ' attention reconciles a receipt from another device')
            page.get_by_role('button', name='Всё непрочитанное', exact=True).click()
            page.get_by_role('button', name='Открыть сообщение', exact=True).first.click()
            expect(page.locator('[data-message-id="' + ordinary_event + '"]')).to_be_visible(timeout=20000)
            check(label + ' attention opens the exact unread event')

            # Followed threads are part of the same queue, with their own receipts.
            thread_root = send(token, ordinary, 'P2 followed root ' + run)
            page.goto(APP + '/inbox/notifications/')
            expect(page.get_by_text('Центр внимания', exact=True)).to_be_visible(timeout=20000)
            thread_body = 'P2 followed unread ' + run
            thread_reply = send(b['access_token'], ordinary, thread_body, {'m.relates_to': {
                'rel_type': 'm.thread', 'event_id': thread_root, 'is_falling_back': True,
                'm.in_reply_to': {'event_id': thread_root},
            }})
            page.get_by_role('button', name='Треды', exact=True).click()
            expect(page.get_by_text('P2 ordinary ' + run + ' › тред', exact=True)).to_be_visible(timeout=20000)
            page.get_by_role('button', name='Открыть сообщение', exact=True).first.click()
            expect(page.locator('[data-editable-name="ThreadInput"]')).to_be_visible(timeout=20000)
            expect(page.locator('[data-message-id="' + thread_reply + '"]')).to_be_visible(timeout=20000)
            check(label + ' followed-thread queue opens the exact reply')

            # Invitation/message policies are exercised on live sync. Keep the room elsewhere.
            if width == 1400:
                page.goto(APP + '/home/')
                expect(page.get_by_text('Добро пожаловать в Cinny', exact=True)).to_be_visible(timeout=30000)
                page.wait_for_timeout(1500)
                for index in range(3): send(b['access_token'], ordinary, 'P2 burst ' + str(index))
                page.wait_for_function('() => window.__notices.length > 0', timeout=15000)
                page.wait_for_timeout(1500)
                notices = page.evaluate('window.__notices')
                assert len(notices) == 1, notices
                assert '3 новых сообщений' in notices[0].get('body', ''), notices
                check(label + ' live message burst makes one grouped system notification')

            # The window handler must not focus an editor removed after permission changes.
            readonly = api('POST', '/_matrix/client/v3/createRoom', b['access_token'], {'name':'P2 readonly '+run, 'invite':[a['user_id']]})['room_id']
            api('POST', f'/_matrix/client/v3/join/{readonly}', token, {})
            page.goto(APP + '/home/' + readonly + '/')
            page.locator('[data-editable-name="RoomInput"]').wait_for(timeout=30000)
            levels = api('GET', f'/_matrix/client/v3/rooms/{readonly}/state/m.room.power_levels', b['access_token'])
            levels.setdefault('events', {})['m.room.message'] = 1
            api('PUT', f'/_matrix/client/v3/rooms/{readonly}/state/m.room.power_levels', b['access_token'], levels)
            expect(page.get_by_text('У вас нет права отправлять сообщения в эту комнату', exact=True)).to_be_visible(timeout=20000)
            page.evaluate('document.activeElement?.blur()')
            for key in ['a', 'Escape', 'F10', 'ContextMenu']: page.keyboard.press(key)
            page.wait_for_timeout(200)
            assert page.locator('[data-editable-name="RoomInput"]').count() == 0
            check(label + ' removed composer preserves control keys without Slate focus errors')

            assert not errors, errors
            check(label + ' no uncaught application errors')
            context.close()
        browser.close()

(OUT / 'summary.json').write_text(json.dumps({'passed': len(results), 'checks': results}, ensure_ascii=False, indent=2))
print(f'{len(results)} production checks passed', flush=True)
