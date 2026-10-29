"""Create threads with real polls, uploads, emoji and stickers through the full UI."""
import json
import os
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import expect
from session_fixture import ROOM, USER, install_session_fixture, seed_session


def assert_new_thread_content(page, output, kinds=None):
    output = Path(output)
    output.mkdir(exist_ok=True, parents=True)
    origin = page.evaluate('location.origin')
    reports = {}
    for kind in kinds or ['poll', 'files', 'emoji', 'sticker']:
        page.goto(origin + '/config.json')
        live = {ROOM: []}
        install_session_fixture(page, live_events=live)
        page.route('**/_matrix/client/versions', lambda route: route.fulfill(json={
            'versions': ['v1.1', 'v1.4', 'v1.11'], 'unstable_features': {}}))
        root_id = '$content-' + kind + '-root'
        events, sent, accepted, uploads = {}, [], {}, []
        fail_reply = kind in ['poll', 'files']

        def send(route):
            nonlocal fail_reply
            content = route.request.post_data_json
            parts = unquote(urlsplit(route.request.url).path).rsplit('/', 2)
            event_type, txn = parts[-2:]
            thread = content.get('m.relates_to', {}).get('rel_type') == 'm.thread'
            sent.append({'type': event_type, 'txn': txn, 'content': content, 'failed': thread and fail_reply})
            if thread and fail_reply:
                fail_reply = False
                route.fulfill(status=403, json={'errcode': 'M_FORBIDDEN', 'error': 'Retry the first thread event'})
                return
            event_id = accepted.setdefault(txn, '$content-' + kind + '-reply-' + str(len(accepted)) if thread else root_id)
            event = {'type': event_type, 'event_id': event_id, 'sender': USER,
                     'origin_server_ts': int(time.time() * 1000), 'content': content,
                     'unsigned': {'transaction_id': txn}, 'room_id': ROOM}
            events[event_id] = event
            live[ROOM].append(event)
            route.fulfill(json={'event_id': event_id})

        def root():
            result = json.loads(json.dumps(events.get(root_id, {})))
            replies = [event for event_id, event in events.items() if event_id != root_id]
            if result and replies:
                result['unsigned']['m.relations'] = {'m.thread': {'count': len(replies), 'current_user_participated': True, 'latest_event': replies[-1]}}
            return result

        def upload(route):
            uploads.append(route.request.url)
            route.fulfill(json={'content_uri': 'mxc://session.cinny.test/thread-upload-' + str(len(uploads))})

        page.route('**/send/*/*', send)
        def relations(route):
            path = unquote(urlsplit(route.request.url).path).split('/')
            chunk = [event for event_id, event in events.items() if event_id != root_id] if root_id in path and 'm.thread' in path else []
            route.fulfill(json={'chunk': chunk})

        def get_event(route):
            event_id = unquote(urlsplit(route.request.url).path).rsplit('/', 1)[-1]
            event = root() if event_id == root_id else events.get(event_id)
            if not event or not event.get('type'):
                # Older fixture rooms can still have pending background reads.
                # A missing event is a Matrix 404, never an untyped timeline event.
                route.fulfill(status=404, json={'errcode': 'M_NOT_FOUND', 'error': 'Event not in this fixture'})
            else:
                route.fulfill(json=event)

        page.route('**/relations/**', relations)
        page.route('**/event/*', get_event)
        page.route('**/threads*', lambda route: route.fulfill(json={'chunk': [root()] if len(events) > 1 else []}))
        page.route('**/_matrix/media/**/upload*', upload)
        page.route('**/_matrix/client/v1/media/upload*', upload)
        seed_session(page)
        page.goto(origin + '/#/home/' + ROOM + '/')
        room_input = page.locator('[data-editable-name="RoomInput"]')
        expect(room_input).to_have_attribute('contenteditable', 'true', timeout=60000)
        page.get_by_role('button', name='Прикрепить', exact=True).click()
        page.get_by_role('button', name='Создать тред', exact=True).click()
        name = page.get_by_label('Название треда')
        name.fill('Тред: ' + kind)
        assert name.evaluate('(el) => getComputedStyle(el).outlineStyle') == 'none'
        composer = page.locator('fieldset')
        first = page.locator('[data-editable-name="NewThreadInput"]')
        if kind == 'poll':
            composer.get_by_role('button', name='Прикрепить', exact=True).click()
            page.get_by_role('button', name='Опрос', exact=True).click()
            page.get_by_placeholder('О чём спросить?').fill('Когда встречаемся?')
            page.get_by_placeholder('Вариант 1').fill('Сегодня')
            page.get_by_placeholder('Вариант 2').fill('Завтра')
            send_poll = page.get_by_role('button', name='Создать тред с опросом', exact=True)
            send_poll.click()
            expect(page.get_by_text('Не удалось отправить опрос:', exact=False)).to_be_visible(timeout=30000)
            send_poll.click()
        elif kind == 'files':
            composer.get_by_role('button', name='Прикрепить', exact=True).click()
            with page.expect_file_chooser() as chooser:
                page.get_by_role('button', name='Файл', exact=True).click()
            chooser.value.set_files([
                {'name': 'thread-first.txt', 'mimeType': 'text/plain', 'buffer': b'first thread attachment'},
                {'name': 'thread-second.txt', 'mimeType': 'text/plain', 'buffer': b'second thread attachment'},
            ])
            expect(page.get_by_text('Готово к отправке: 2', exact=True)).to_be_visible(timeout=30000)
            page.get_by_role('button', name='Создать тред', exact=True).click()
            retry = page.get_by_role('button', name='Повторить создание', exact=True)
            expect(retry).to_be_enabled(timeout=30000)
            retry.click()
        else:
            composer.get_by_role('button', name='Эмодзи', exact=True).click()
            if kind == 'sticker':
                page.locator('#portalContainer').get_by_role('button', name='Стикеры', exact=True).click()
                page.locator('[data-emoji-type="sticker"]').first.click()
            else:
                page.locator('[data-emoji-type="emoji"]').first.click()
                expect(first).not_to_have_text('')
                page.get_by_role('button', name='Создать тред', exact=True).click()
        expect(page.locator('[data-editable-name="ThreadInput"]')).to_have_attribute('contenteditable', 'true', timeout=30000)
        successes = [item for item in sent if not item['failed']]
        roots = [item for item in successes if 'm.relates_to' not in item['content']]
        replies = [item for item in successes if 'm.relates_to' in item['content']]
        assert len(roots) == 1 and roots[0]['content']['body'] == 'Тред: ' + kind, sent
        assert len(replies) == (2 if kind == 'files' else 1), sent
        for reply in replies:
            assert reply['content']['m.relates_to']['event_id'] == root_id, sent
        if kind == 'poll':
            assert replies[0]['type'] == 'org.matrix.msc3381.poll.start', sent
            assert sent[1]['txn'] == sent[2]['txn'] and sent[1]['content'] == sent[2]['content'], sent
            expect(page.get_by_text('Когда встречаемся?', exact=True)).to_be_visible(timeout=30000)
        elif kind == 'files':
            assert [reply['content']['body'] for reply in replies] == ['thread-first.txt', 'thread-second.txt'], sent
            assert len(uploads) == 2, uploads
        elif kind == 'sticker':
            assert replies[0]['type'] == 'm.sticker' and replies[0]['content']['url'].startswith('mxc://'), sent
            assert len(uploads) == 1, uploads
        else:
            assert replies[0]['type'] == 'm.room.message' and replies[0]['content']['body'].strip(), sent
        page.screenshot(path=str(output / (kind + '-created.png')))
        reports[kind] = {'events': sent, 'uploads': uploads}
        print('PASS new thread first content: ' + kind, flush=True)
    (output / 'thread-content-events.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950}, service_workers='block')
        page.goto(os.environ.get('APP_URL', 'http://127.0.0.1:18085') + '/config.json')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            assert_new_thread_content(page, os.environ.get('TEST_OUTPUT', 'artifacts/thread-content-windows-20261029/local/content'), os.environ.get('THREAD_CONTENT_CASES', 'poll,files,emoji,sticker').split(','))
            assert not errors, errors
        except Exception:
            page.screenshot(path='/tmp/thread-content-failure.png', full_page=True)
            raise
        finally:
            browser.close()
