"""Send/echo/scroll regression against a built app and the real Matrix SDK.

Only the homeserver is mocked. Run against APP_URL with Playwright's Chromium,
Firefox and WebKit; WEBKIT_EXECUTABLE supports a locally prepared WebKit runtime.
"""
import json
import os
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit
from playwright.sync_api import sync_playwright, expect
from session_fixture import USER, PEER, ROOM, install_session_fixture, seed_session

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18105').rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/scroll-fix-20261027/production'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []
NOW = int(time.time() * 1000)


def event(event_id, body, index=0, relation=None):
    content = {'msgtype': 'm.text', 'body': body}
    if relation:
        content['m.relates_to'] = relation
    return {'type': 'm.room.message', 'event_id': event_id, 'sender': USER,
            'origin_server_ts': NOW - 100000 + index * 100, 'content': content}


# Scope every measurement to this editor's timeline, including the thread panel.
SCROLLER = '''editor => {
    let parent = editor.parentElement;
    while (parent) {
        if (parent.querySelector('[data-message-id]')) {
            const row = [...parent.querySelectorAll('[data-message-id]')].at(-1);
            let scroll = row.parentElement;
            while (scroll && !['auto','scroll'].includes(getComputedStyle(scroll).overflowY)) scroll = scroll.parentElement;
            return scroll;
        }
        parent = parent.parentElement;
    }
}'''
METRICS = '''scroll => ({top:scroll.scrollTop, gap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop,
    height:scroll.scrollHeight, view:scroll.clientHeight})'''


def scenario(browser, engine, layout, count, width, native_page=None, app_url=APP):
    context = native_page.context if native_page else browser.new_context(viewport={'width': width, 'height': 750},
                                  has_touch=width < 600, service_workers='block')
    page = native_page or context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    print(f'START {engine} layout={layout} count={count} width={width}', flush=True)
    root = event('$scroll-root', 'Корень тестового треда', 0)
    replies = [event('$scroll-thread-' + str(i), 'Ответ в треде ' + str(i) + ' текст ' * 15, i,
                     {'rel_type': 'm.thread', 'event_id': root['event_id'], 'is_falling_back': True,
                      'm.in_reply_to': {'event_id': root['event_id']}}) for i in range(25)]
    root['unsigned'] = {'m.relations': {'m.thread': {'count': len(replies), 'latest_event': replies[-1],
                                                  'current_user_participated': True}}}
    history = [event('$scroll-' + str(i), 'Сообщение ' + str(i) + ' длинный текст ' * (20 if i % 5 == 0 else 1), i)
               for i in range(count)]
    incoming = {ROOM: []}
    requests = install_session_fixture(page, room_events=[*history, root, *replies], live_events=incoming)
    page.route('**/_matrix/client/versions', lambda route: route.fulfill(json={'versions': ['v1.' + str(i) for i in range(1, 12)], 'unstable_features': {}}))
    page.route('**/typing/*', lambda route: route.fulfill(json={}))
    page.route('**/threads?*', lambda route: route.fulfill(json={'chunk': [root]}))
    page.route('**/relations/**', lambda route: route.fulfill(json={'chunk': replies}))
    sent = []

    def send(route):
        path = unquote(urlsplit(route.request.url).path)
        content = route.request.post_data_json
        remote = event('$scroll-sent-' + str(len(sent)), content.get('body', ''))
        remote['content'] = content
        remote['origin_server_ts'] = int(time.time() * 1000)
        remote['unsigned'] = {'transaction_id': path.rsplit('/', 1)[-1]}
        sent.append(remote)
        incoming[ROOM].append(remote)
        # Keep the acknowledgement pending long enough to observe the local echo.
        time.sleep(0.15)
        route.fulfill(json={'event_id': remote['event_id']})

    page.route('**/send/**', send)
    page.goto(app_url + '/config.json')
    seed_session(page)
    page.evaluate('layout => localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings")),messageLayout:layout,isPeopleDrawer:false,enterForNewline:false}))', layout)
    page.goto(app_url + '/#/home/' + ROOM + '/')
    editor = page.locator('[data-editable-name="RoomInput"]')
    expect(editor).to_have_attribute('contenteditable', 'true', timeout=60000)
    expect(page.get_by_role('button', name='Открыть тред:', exact=False).first).to_be_visible(timeout=30000)
    page.wait_for_timeout(1200)

    def verify_send(input_editor, label, index):
        scroll = input_editor.evaluate_handle(SCROLLER)
        # Begin at the latest message; also cancels any preceding manual scroll.
        scroll.evaluate('s => s.scrollTo({top:s.scrollHeight,behavior:"instant"})')
        page.wait_for_timeout(200)
        text = label + ' отправка ' + str(index)
        input_editor.click()
        page.keyboard.insert_text(text + ('\nМногострочное сообщение' * 7 if index % 2 else ''))
        page.wait_for_timeout(200)
        # Observe the real local-echo DOM node before the HTTP acknowledgement.
        page.evaluate('''text => {
            window.echoNode = undefined;
            window.echoObserver?.disconnect();
            window.echoObserver = new MutationObserver(() => {
                if (!window.echoNode) window.echoNode = [...document.querySelectorAll('[data-message-id]')].find(row => row.dataset.messageId.startsWith('~') && row.textContent.includes(text));
            });
            window.echoObserver.observe(document.body,{childList:true,subtree:true});
        }''', text)
        print(f'SEND {label} {index}', flush=True)
        previous = len(sent)
        input_editor.press('Enter')
        expect(input_editor.locator('[data-slate-string]')).to_have_count(0)
        page.wait_for_function('text => [...document.querySelectorAll("[data-message-id]")].some(row => row.dataset.messageId.startsWith("$scroll-sent-") && row.textContent.includes(text))', arg=text)
        page.wait_for_timeout(500)
        assert len(sent) == previous + 1, (engine, label, sent)
        metrics = scroll.evaluate(METRICS)
        assert abs(metrics['gap']) <= 2, (engine, layout, label, index, metrics)
        echo = page.evaluate('({seen:!!echoNode, connected:echoNode?.isConnected})')
        assert not echo['seen'] or echo['connected'], (engine, label, 'local echo was remounted')
        if label == 'Комната':
            assert echo['seen'], (engine, label, 'local echo was not observed')
        metrics['local_echo'] = echo['seen']
        expect(input_editor).to_be_focused()
        return metrics

    print('READY room', flush=True)
    samples = [verify_send(editor, 'Комната', i) for i in range(4)]
    scroll = editor.evaluate_handle(SCROLLER)
    # A user reading older messages must stay there when another message arrives.
    scroll.evaluate('s => s.scrollTo({top:Math.max(0,s.scrollHeight-s.clientHeight-450),behavior:"instant"})')
    page.wait_for_timeout(1400)
    before = scroll.evaluate(METRICS)
    remote = event('$scroll-incoming', 'Входящее сообщение во время чтения истории')
    remote['sender'] = PEER
    incoming[ROOM].append(remote)
    page.wait_for_timeout(900)
    after = scroll.evaluate(METRICS)
    assert abs(after['top'] - before['top']) <= 2, (engine, 'history moved', before, after)
    assert after['gap'] > 100, (engine, 'history jumped to end', after)
    scroll.evaluate('s => s.scrollTo({top:s.scrollHeight,behavior:"instant"})')
    page.wait_for_timeout(300)
    page.get_by_role('button', name='Открыть тред:', exact=False).first.click()
    thread_editor = page.locator('[data-editable-name="ThreadInput"]')
    expect(thread_editor).to_have_attribute('contenteditable', 'true', timeout=30000)
    page.wait_for_timeout(500)
    samples.extend(verify_send(thread_editor, 'Тред', i) for i in range(2))
    assert all(item['content'].get('m.relates_to', {}).get('rel_type') == 'm.thread' for item in sent[-2:]), sent[-2:]
    assert not errors, errors
    assert any(item['path'].endswith('/sync') for item in requests)
    name = f'{engine}-layout-{layout}-count-{count}-width-{width}'
    page.screenshot(path=str(OUT / (name + '.png')))
    result = {'case': name, 'sends': len(sent), 'samples': samples, 'history': [before, after]}
    checks.append(result)
    (OUT / 'summary.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
    print('PASS ' + name + ': room/thread sends, stable echo nodes, bottom gap <=2px, history preserved', flush=True)
    if not native_page:
        context.close()


def main():
    with sync_playwright() as p:
        for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
            options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
            if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
                options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
            browser = getattr(p, engine).launch(**options)
            for layout, count, width in [(0, 25, 1280), (1, 120, 1280), (2, 25, 390)]:
                scenario(browser, engine, layout, count, width)
            browser.close()
    

if __name__ == '__main__':
    main()
