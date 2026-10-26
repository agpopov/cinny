"""Verify floating message actions against a production build and real Matrix SDK."""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from session_fixture import USER, PEER, ROOM, install_session_fixture, seed_session, assert_session_ready

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18104').rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/message-actions-r2/production'))
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

NO_OVERLAP = '''row => {
    const bar = row.querySelector('[data-visible]');
    const a = bar.getBoundingClientRect();
    return [...row.querySelectorAll('time')].every(time => {
        const b = time.getBoundingClientRect();
        return a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
    });
}'''

LAYOUT = '''row => {
    const bar = row.querySelector('[data-visible]');
    const content = [...row.children].find(child => child !== bar);
    const rect = element => {const r = element.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]};
    const before = [rect(row), rect(content)];
    const display = bar.style.display;
    bar.style.display = 'none';
    const without = [rect(row), rect(content)];
    bar.style.display = display;
    return {before, without};
}'''

TEXT_GEOMETRY = '''node => {
    const text = node.getBoundingClientRect();
    const row = node.closest('div[tabindex="0"]').getBoundingClientRect();
    return [text.x - row.x, text.y - row.y, text.width, text.height];
}'''

with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        for layout in [0, 1, 2]:
            context = browser.new_context(viewport={'width': 1280, 'height': 1000}, service_workers='block')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            install_session_fixture(page, room_events=[root, reply, short], room_state=[member])
            page.route('**/typing/*', lambda route: route.fulfill(json={}))
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
                    dimensions = row.evaluate(LAYOUT)
                    assert dimensions['before'] == dimensions['without'], (engine, layout, width, label, 'actions reserve space', dimensions)
                    before = target.evaluate(TEXT_GEOMETRY)
                    row.hover()
                    bar = row.locator('[data-visible]').first
                    expect(bar).to_have_css('opacity', '1')
                    page.wait_for_function(NO_OVERLAP, arg=row.element_handle())
                    after = target.evaluate(TEXT_GEOMETRY)
                    assert before == after, (engine, layout, width, label, 'hover reflows text', before, after)
                    dimensions = row.evaluate(LAYOUT)
                    assert dimensions['before'] == dimensions['without'], (engine, layout, width, label, 'visible actions reserve space', dimensions)
                    actions = row.locator('[data-message-actions]').bounding_box()
                    assert actions['x'] >= 0 and actions['x'] + actions['width'] <= width, (engine, layout, width, actions)
                    assert row.evaluate('node => node.scrollWidth <= node.clientWidth + 1'), (engine, layout, width, label, 'overflow')
                    if label == 'reply' and width in [390, 1024]:
                        page.screenshot(path=str(OUT / f'{engine}-layout-{layout}-{width}.png'))
                checks.append(f'{engine}: layout={layout}, width={width}: long/reply/collapsed messages retain full width and wrapping; actions avoid dates')
            page.set_viewport_size({'width': 1280, 'height': 1000})
            target = page.get_by_text(REPLY_BODY, exact=True).first
            target.scroll_into_view_if_needed()
            row = target.locator('xpath=ancestor::div[@tabindex="0"][1]')
            row.hover()
            page.wait_for_function(NO_OVERLAP, arg=row.element_handle())
            # Resize a pane while the controls remain visible, without a mouse move.
            row.evaluate('node => {node.style.width="280px"}')
            page.wait_for_function(NO_OVERLAP, arg=row.element_handle())
            dimensions = row.evaluate(LAYOUT)
            assert dimensions['before'] == dimensions['without'], (engine, layout, 'narrow pane reserves space')
            # Larger text can wrap the date and must still leave it legible.
            page.evaluate('document.documentElement.style.fontSize="24px"')
            page.wait_for_function(NO_OVERLAP, arg=row.element_handle())
            page.evaluate('document.documentElement.style.fontSize=""')
            row.evaluate('node => {node.style.width=""}')
            row.locator('[data-message-actions]').click()
            expect(page.get_by_text('Скопировать текст', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
            checks.append(f'{engine}: layout={layout}: live pane/font resize and actions menu passed')
            assert not errors, errors
            context.close()
            print(checks[-1], flush=True)
        browser.close()
(OUT / 'summary.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2))
