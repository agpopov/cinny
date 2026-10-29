"""Create a thread from scratch using the actual composer, Matrix SDK and server API shapes."""
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect
from session_fixture import ROOM, USER, install_session_fixture, seed_session


def assert_new_thread(page, output, fail_first_reply=True, check_mobile=False):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    origin = page.evaluate('location.origin')
    page.goto(origin + '/config.json')
    live = {ROOM: []}
    install_session_fixture(page, live_events=live)
    page.route('**/_matrix/client/versions', lambda route: route.fulfill(json={
        'versions': ['v1.1', 'v1.4', 'v1.11'], 'unstable_features': {}}))
    sent = []
    events = {}
    fail = fail_first_reply

    def send(route):
        nonlocal fail
        content = route.request.post_data_json
        thread = content.get('m.relates_to', {}).get('rel_type') == 'm.thread'
        txn = unquote(urlsplit(route.request.url).path).rsplit('/', 1)[-1]
        sent.append({'txn': txn, 'content': content, 'failed': thread and fail})
        if thread and fail:
            fail = False
            route.fulfill(status=403, json={'errcode': 'M_FORBIDDEN', 'error': 'Temporary thread send failure'})
            return
        event_id = '$new-thread-first' if thread else '$new-thread-root'
        event = {'type': 'm.room.message', 'event_id': event_id, 'sender': USER,
                 'origin_server_ts': int(time.time() * 1000), 'content': content,
                 'unsigned': {'transaction_id': txn}, 'room_id': ROOM}
        events[event_id] = event
        live[ROOM].append(event)
        route.fulfill(json={'event_id': event_id})

    def root_event():
        root = json.loads(json.dumps(events.get('$new-thread-root', {})))
        if root and '$new-thread-first' in events:
            root['unsigned']['m.relations'] = {'m.thread': {
                'count': 1, 'current_user_participated': True,
                'latest_event': events['$new-thread-first']}}
        return root

    def relations(route):
        route.fulfill(json={'chunk': [events['$new-thread-first']] if '$new-thread-first' in events else []})

    def get_event(route):
        key = unquote(urlsplit(route.request.url).path).rsplit('/', 1)[-1]
        route.fulfill(json=root_event() if key == '$new-thread-root' else events.get(key, {}))

    page.route('**/send/m.room.message/*', send)
    page.route('**/relations/**', relations)
    page.route('**/event/*', get_event)
    page.route('**/threads*', lambda route: route.fulfill(json={'chunk': [root_event()] if '$new-thread-first' in events else []}))
    seed_session(page)
    page.goto(origin + '/#/home/' + ROOM + '/')
    room_input = page.locator('[data-editable-name="RoomInput"]')
    expect(room_input).to_have_attribute('contenteditable', 'true', timeout=60000)
    room_input.click()
    page.keyboard.insert_text('Черновик сообщения комнаты')
    page.get_by_role('button', name='Прикрепить', exact=True).click()
    page.get_by_role('button', name='Создать тред', exact=True).click()
    name = page.get_by_label('Название треда')
    first = page.locator('[data-editable-name="NewThreadInput"]')
    create = page.get_by_role('button', name='Создать тред', exact=True)
    expect(create).to_be_disabled()
    name.fill('План следующего релиза')
    expect(create).to_be_disabled()
    first.click()
    page.keyboard.insert_text('Обсудим **новый релиз** здесь.\nПервое сообщение без ответа на старое.')
    expect(create).to_be_enabled()
    page.get_by_role('button', name='Отмена', exact=True).click()
    page.get_by_role('button', name='Создать тред', exact=True).click()
    expect(name).to_have_value('План следующего релиза')
    expect(first).to_contain_text('новый релиз')
    expect(create).to_be_enabled()
    page.screenshot(path=str(output / 'new-thread-form.png'))
    if check_mobile:
        viewport = page.viewport_size
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(name).to_be_visible()
        expect(create).to_be_in_viewport()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(output / 'new-thread-mobile.png'))
        page.set_viewport_size(viewport)
    create.click()
    if fail_first_reply:
        retry = page.get_by_role('button', name='Повторить создание', exact=True)
        expect(retry).to_be_enabled(timeout=30000)
        expect(name).to_have_attribute('readonly', '')
        page.screenshot(path=str(output / 'new-thread-retry.png'))
        # Closing and reopening must continue the same server-side root.
        page.get_by_role('button', name='Отмена', exact=True).click()
        page.get_by_role('button', name='Создать тред', exact=True).click()
        expect(retry).to_be_enabled()
        retry.click()
    thread_input = page.locator('[data-editable-name="ThreadInput"]')
    expect(thread_input).to_have_attribute('contenteditable', 'true', timeout=30000)
    expect(page.locator('[data-message-id="$new-thread-first"]')).to_contain_text('Первое сообщение без ответа на старое.')
    page.screenshot(path=str(output / 'new-thread-created.png'))
    # Narrow native windows show the thread instead of the room. Close it
    # before checking the independent room draft, as a user would do.
    if room_input.count() == 0:
        page.get_by_role('button', name='Закрыть', exact=True).click()
    expect(room_input).to_have_attribute('contenteditable', 'true', timeout=30000)
    expect(room_input).to_contain_text('Черновик сообщения комнаты')
    roots = [entry for entry in sent if 'm.relates_to' not in entry['content']]
    replies = [entry for entry in sent if 'm.relates_to' in entry['content']]
    assert len(roots) == 1, sent
    assert len(replies) == (2 if fail_first_reply else 1), sent
    assert len(set(entry['txn'] for entry in replies)) == 1, replies
    relation = replies[-1]['content']['m.relates_to']
    assert relation == {'rel_type': 'm.thread', 'event_id': '$new-thread-root',
                        'm.in_reply_to': {'event_id': '$new-thread-root'}, 'is_falling_back': True}, relation
    assert roots[0]['content'] == {'msgtype': 'm.text', 'body': 'План следующего релиза', 'm.mentions': {}}
    assert re.search(r'<strong[^>]*>новый релиз</strong>', replies[-1]['content']['formatted_body']), replies
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path=str(output / 'new-thread-created.png'))
    # Discover it again entirely through standard server events and /threads.
    page.reload()
    expect(room_input).to_have_attribute('contenteditable', 'true', timeout=60000)
    page.get_by_role('button', name='Список тредов', exact=True).click()
    item = page.locator('button[data-thread-id="$new-thread-root"]')
    expect(item).to_contain_text('План следующего релиза', timeout=30000)
    item.click()
    expect(thread_input).to_have_attribute('contenteditable', 'true', timeout=30000)
    expect(page.locator('[data-message-id="$new-thread-first"]')).to_contain_text('Первое сообщение без ответа на старое.')
    page.screenshot(path=str(output / 'new-thread-reloaded.png'))
    (output / 'new-thread-events.json').write_text(json.dumps(sent, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS new thread: title + formatted first message, Matrix m.thread and reply fallback, draft survives close, retry does not duplicate root, room draft preserved', flush=True)


if __name__ == '__main__':
    import os
    from playwright.sync_api import sync_playwright
    app = os.environ.get('APP_URL', 'http://127.0.0.1:18085')
    out = Path(os.environ.get('TEST_OUTPUT', 'artifacts/new-threads-20261029'))
    with sync_playwright() as p:
        for engine in os.environ.get('BROWSERS', 'chromium').split(','):
            browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
            page = browser.new_page(viewport={'width': 1400, 'height': 950}, color_scheme='dark', service_workers='block')
            errors = []
            page.on('pageerror', lambda error: (errors.append(str(error)), print('PAGEERROR', str(error), flush=True)))
            page.goto(app + '/config.json')
            try:
                assert_new_thread(page, out / engine, check_mobile=True)
                assert not errors, errors
            except Exception:
                (out / engine).mkdir(exist_ok=True, parents=True)
                page.screenshot(path=str(out / engine / 'failure.png'))
                raise
            finally:
                browser.close()
