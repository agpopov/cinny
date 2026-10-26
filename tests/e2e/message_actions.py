"""Verify floating message actions against a production build and real Matrix SDK."""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from session_fixture import USER, PEER, ROOM, install_session_fixture, seed_session, assert_session_ready

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18104').rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/message-actions-r3/production'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []
ROOT_BODY = 'Проверка полной ширины сообщения. ' + 'Длинный текст должен использовать всю доступную ширину. ' * 8
REPLY_BODY = 'Как мне сказали, при создании новой категории будут заполнять для неё код. ' * 5
SHORT_BODY = 'Короткое продолжение без повторного заголовка'
NOW = int(time.time() * 1000)

def event(event_id, body, sender, ts, relation=None):
    content = {'msgtype': 'm.text', 'body': body}
    if relation:
        content['m.relates_to'] = relation
    return {'type': 'm.room.message', 'event_id': event_id, 'sender': sender,
            'origin_server_ts': ts, 'content': content}

root = event('$actions-root', ROOT_BODY, USER, NOW - 172800000)
reply = event('$actions-reply', REPLY_BODY, PEER, NOW - 86400000,
              {'m.in_reply_to': {'event_id': '$actions-root'}})
short = event('$actions-short', SHORT_BODY, PEER, NOW - 86399000)
member = {'type': 'm.room.member', 'event_id': '$actions-member', 'sender': PEER,
          'state_key': PEER, 'origin_server_ts': NOW - 172800000,
          'content': {'membership': 'join', 'displayname': 'Участник с длинным именем'}}
THREAD_BODY = 'Проверка мобильной кнопки в треде'
thread_reply = event('$actions-thread-reply', THREAD_BODY, PEER, NOW - 86398000,
                     {'rel_type': 'm.thread', 'event_id': '$actions-root', 'is_falling_back': True,
                      'm.in_reply_to': {'event_id': '$actions-root'}})
root['unsigned'] = {'m.relations': {'m.thread': {'count': 1, 'latest_event': thread_reply,
                                              'current_user_participated': True}}}

NO_OVERLAP = '''row => {
    const bar = row.querySelector('[data-visible]');
    const a = bar.getBoundingClientRect();
    return [...row.querySelectorAll('time')].every(time => {
        const b = time.getBoundingClientRect();
        if (bar.dataset.combinedTime === 'true') {
            const frame = bar.firstElementChild.getBoundingClientRect();
            const inside = b.left >= frame.left && b.right <= frame.right && b.top >= frame.top && b.bottom <= frame.bottom;
            const centered = Math.abs((b.top + b.bottom - frame.top - frame.bottom) / 2) <= 0.5;
            return inside && centered && [...bar.querySelectorAll('button')].every(button => {
                const c = button.getBoundingClientRect();
                return !c.width || !c.height || c.right <= b.left || c.left >= b.right || c.bottom <= b.top || c.top >= b.bottom;
            });
        }
        return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
    });
}'''

LAYOUT = '''row => {
    const bar = row.querySelector('[data-visible]');
    const content = [...row.children].find(child => child !== bar);
    const rect = element => {const r = element.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]};
    const before = [rect(row), rect(content)];
    const beforeScroll = row.scrollWidth;
    const display = bar.style.display;
    bar.style.display = 'none';
    const without = [rect(row), rect(content)];
    const withoutScroll = row.scrollWidth;
    bar.style.display = display;
    return {before, without, beforeScroll, withoutScroll};
}'''

TEXT_GEOMETRY = '''node => {
    const text = node.getBoundingClientRect();
    const row = node.closest('div[tabindex="0"]').getBoundingClientRect();
    return [text.x - row.x, text.y - row.y, text.width, text.height];
}'''

TIMESTAMP_GEOMETRY = '''row => {
    const origin = row.getBoundingClientRect();
    return [...row.querySelectorAll('time')].map(time => {
        const box = time.getBoundingClientRect();
        return [box.x - origin.x, box.y - origin.y, box.width, box.height];
    });
}'''


def install_fixture(page):
    install_session_fixture(page, room_events=[root, reply, short, thread_reply], room_state=[member])
    page.route('**/_matrix/client/versions', lambda route: route.fulfill(json={'versions': ['v1.' + str(i) for i in range(1, 12)], 'unstable_features': {}}))
    page.route('**/typing/*', lambda route: route.fulfill(json={}))
    page.route('**/relations/**', lambda route: route.fulfill(json={'chunk': [thread_reply]}))


def wait_actions_layout(page, row):
    try:
        page.wait_for_function(NO_OVERLAP, arg=row.element_handle(), timeout=5000)
    except Exception:
        print(row.evaluate('''row => {
            const bar = row.querySelector('[data-visible]');
            return {combined:bar.dataset.combinedTime, visible:bar.dataset.visible, inline:bar.getAttribute('style'),
                    frame:bar.firstElementChild.getBoundingClientRect().toJSON(),
                    time:[...row.querySelectorAll('time')].map(node=>node.getBoundingClientRect().toJSON())};
        }'''), flush=True)
        page.screenshot(path=str(OUT / 'failed-frame.png'))
        raise


def long_press(page, target):
    target.scroll_into_view_if_needed()
    rect = target.bounding_box()
    target.dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True,
                                         'clientX': rect['x'] + 5, 'clientY': rect['y'] + 5})
    expect(page.get_by_text('Скопировать текст', exact=True)).to_be_visible()
    target.dispatch_event('pointerup', {'pointerType': 'touch', 'isPrimary': True})
    # A real touch release also generates a click. The long-press handler
    # consumes that click so the next tap on the menu button remains usable.
    target.dispatch_event('click')

with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        for layout in ([] if os.environ.get('ACTION_TEST_MODE') == 'touch' else [0, 1, 2]):
            context = browser.new_context(viewport={'width': 1280, 'height': 1000}, service_workers='block')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            install_fixture(page)
            page.goto(APP + '/config.json')
            seed_session(page)
            page.evaluate('layout => localStorage.setItem("settings",JSON.stringify({...JSON.parse(localStorage.getItem("settings")),messageLayout:layout,isPeopleDrawer:false,useSystemTheme:false,themeId:"dark-theme"}))', layout)
            page.goto(APP + '/#/home/' + ROOM + '/')
            assert_session_ready(page)
            for width in [320, 360, 390, 600, 768, 1024, 1920]:
                page.set_viewport_size({'width': width, 'height': 1000})
                for label, body in [('long', ROOT_BODY), ('reply', REPLY_BODY), ('collapsed', SHORT_BODY)]:
                    target = page.get_by_text(body, exact=True).first
                    target.scroll_into_view_if_needed()
                    row = target.locator('xpath=ancestor::div[@tabindex="0"][1]')
                    if label == 'collapsed':
                        expect(row.locator('time')).to_have_count(0)
                    dimensions = row.evaluate(LAYOUT)
                    assert dimensions['before'] == dimensions['without'], (engine, layout, width, label, 'actions reserve space', dimensions)
                    before = target.evaluate(TEXT_GEOMETRY)
                    timestamp_before = row.evaluate(TIMESTAMP_GEOMETRY)
                    row.hover()
                    bar = row.locator('[data-visible]').first
                    expect(bar).to_have_css('opacity', '1')
                    wait_actions_layout(page, row)
                    after = target.evaluate(TEXT_GEOMETRY)
                    assert before == after, (engine, layout, width, label, 'hover reflows text', before, after)
                    timestamp_after = row.evaluate(TIMESTAMP_GEOMETRY)
                    assert len(timestamp_before) == len(timestamp_after)
                    for old, new in zip(timestamp_before, timestamp_after):
                        assert [old[0], old[2], old[3]] == [new[0], new[2], new[3]], (engine, layout, width, 'hover changes timestamp width or horizontal position')
                    if layout in [0, 2] and label != 'collapsed':
                        expect(bar).to_have_attribute('data-combined-time', 'true')
                    if label == 'collapsed':
                        expect(bar).to_have_attribute('data-combined-time', 'false')
                        assert bar.evaluate('node => parseFloat(getComputedStyle(node).getPropertyValue("--cinny-message-options-time-space"))') == 0
                    dimensions = row.evaluate(LAYOUT)
                    assert dimensions['before'] == dimensions['without'], (engine, layout, width, label, 'visible actions reserve space', dimensions)
                    actions = row.locator('[data-message-actions]').bounding_box()
                    assert actions['x'] >= 0 and actions['x'] + actions['width'] <= width, (engine, layout, width, actions)
                    assert dimensions['beforeScroll'] <= dimensions['withoutScroll'] + 1, (engine, layout, width, label, 'actions add horizontal overflow')
                    if label == 'reply' and width in [390, 1024]:
                        page.screenshot(path=str(OUT / f'{engine}-layout-{layout}-{width}.png'))
                checks.append(f'{engine}: layout={layout}, width={width}: date centered in shared frame; full message width, wrapping and horizontal timestamp position stay unchanged')
            page.set_viewport_size({'width': 1280, 'height': 1000})
            target = page.get_by_text(REPLY_BODY, exact=True).first
            target.scroll_into_view_if_needed()
            row = target.locator('xpath=ancestor::div[@tabindex="0"][1]')
            row.hover()
            wait_actions_layout(page, row)
            page.keyboard.press('Tab')
            row.locator('[data-message-actions]').focus()
            expect(row.locator('[data-visible]').first).to_have_css('opacity', '1')
            # Resize a pane while the controls remain visible, without a mouse move.
            row.evaluate('node => {node.style.width="280px"}')
            wait_actions_layout(page, row)
            dimensions = row.evaluate(LAYOUT)
            assert dimensions['before'] == dimensions['without'], (engine, layout, 'narrow pane reserves space')
            # Larger text can wrap the date and must still leave it legible.
            page.evaluate('document.documentElement.style.fontSize="24px"')
            wait_actions_layout(page, row)
            page.evaluate('document.documentElement.style.fontSize=""')
            row.evaluate('node => {node.style.width=""}')
            row.locator('[data-message-actions]').click()
            expect(page.get_by_text('Скопировать текст', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
            checks.append(f'{engine}: layout={layout}: live pane/font resize and actions menu passed')
            assert not errors, errors
            context.close()
            print(checks[-1], flush=True)
        for layout in ([] if os.environ.get('ACTION_TEST_MODE') == 'desktop' else [0, 2]):
            context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            install_fixture(page)
            page.goto(APP + '/config.json')
            seed_session(page)
            page.evaluate('layout => localStorage.setItem("settings",JSON.stringify({...JSON.parse(localStorage.getItem("settings")),messageLayout:layout,isPeopleDrawer:false,useSystemTheme:false,themeId:"dark-theme"}))', layout)
            page.goto(APP + '/#/home/' + ROOM + '/')
            assert_session_ready(page)
            for width in [320, 390, 600, 768]:
                page.set_viewport_size({'width': width, 'height': 844})
                target = page.get_by_text(REPLY_BODY, exact=True).first
                target.scroll_into_view_if_needed()
                row = target.locator('xpath=ancestor::div[@tabindex="0"][1]')
                bar = row.locator('[data-visible]').first
                expect(bar).to_have_css('opacity', '0')
                target.tap()
                expect(bar).to_have_css('opacity', '0')
                long_press(page, target)
                expect(bar).to_have_css('opacity', '1')
                wait_actions_layout(page, row)
                buttons = bar.locator('button:visible')
                expect(buttons).to_have_count(1)
                action = bar.locator('[data-message-actions]')
                rect = action.bounding_box()
                assert rect['width'] >= 44 and rect['height'] >= 44, (engine, layout, width, 'small touch target')
                assert rect['x'] >= 0 and rect['x'] + rect['width'] <= width
                dimensions = row.evaluate(LAYOUT)
                assert dimensions['before'] == dimensions['without'], (engine, layout, width, 'touch action reserves width')
                # Exercise a real touch-menu action. Keyboard focus followed by
                # a touch changes :focus-visible and intentionally hides a
                # keyboard-only toolbar, so it is not a mobile reopen gesture.
                page.get_by_text('Ответить', exact=True).tap()
                expect(page.get_by_text('Скопировать текст', exact=True)).to_have_count(0)
                close_reply = page.get_by_role('button', name='Закрыть', exact=True)
                expect(close_reply).to_be_visible()
                close_reply.tap()
                page.locator('[data-editable-name="RoomInput"]').tap()
                expect(bar).to_have_css('opacity', '0')
                checks.append(f'{engine}: touch layout={layout}, width={width}: single 44px menu, long press, reply action, dismiss and full message width passed')
            page.get_by_role('button', name='Открыть тред: 1 ответ', exact=True).tap()
            thread = page.get_by_text(THREAD_BODY, exact=True).last
            expect(thread).to_be_visible()
            row = thread.locator('xpath=ancestor::div[@tabindex="0"][1]')
            bar = row.locator('[data-visible]').first
            thread.tap()
            expect(bar).to_have_css('opacity', '0')
            long_press(page, thread)
            wait_actions_layout(page, row)
            expect(bar.locator('button:visible')).to_have_count(1)
            assert bar.locator('[data-message-actions]').bounding_box()['width'] >= 44
            page.screenshot(path=str(OUT / f'{engine}-touch-thread-layout-{layout}.png'))
            page.keyboard.press('Escape')
            checks.append(f'{engine}: touch layout={layout}: thread long-press/menu button preserved')
            assert not errors, errors
            context.close()
            print(checks[-1], flush=True)
        browser.close()
(OUT / 'summary.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2))
