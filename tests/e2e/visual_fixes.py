"""UI regression checks against the production bundle and Matrix HTTP fixtures."""
import html
import json
import os
import time
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright, expect
from session_fixture import (
    USER, PEER, ROOM, SPACE, MESSAGE, install_session_fixture, seed_session, assert_session_ready,
)

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18089').rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/visual-fixes/verification'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []


def check(label):
    checks.append(label)
    print('PASS ' + label, flush=True)


def event(event_id, content, sender=USER, kind='m.room.message', state_key=None):
    result = {'event_id': event_id, 'type': kind, 'sender': sender,
              'origin_server_ts': int(time.time() * 1000), 'content': content}
    if state_key is not None:
        result['state_key'] = state_key
    return result


def action_bar(message):
    return message.locator('xpath=ancestor::div[@tabindex="0"][1]').locator('[data-message-actions]')


def computed(locator, prop):
    return locator.evaluate('(node, prop) => getComputedStyle(node)[prop]', prop)


group = {'id': 'ui-group', 'name': 'Группа для теста', 'spaceId': SPACE, 'color': '#ff7744',
         'members': [{'id': USER, 'name': 'Startup user'}]}
marker = html.escape(quote(json.dumps(group), safe=''), quote=True)
group_html = f'<span data-cinny-mention-group="{marker}">@Группа для теста (<a href="https://matrix.to/#/{quote(USER, safe="")}">@Startup user</a>)</span>'
root_event = event('$ui-root', {'msgtype': 'm.text', 'body': 'Вопрос для треда Inter Matrix 290 рублей'})
reply = event('$ui-reply', {'msgtype': 'm.text', 'body': 'Ответ в треде для проверки',
                           'm.relates_to': {'rel_type': 'm.thread', 'event_id': '$ui-root',
                                            'is_falling_back': True, 'm.in_reply_to': {'event_id': '$ui-root'}}}, PEER)
root_event['unsigned'] = {'m.relations': {'m.thread': {'count': 1, 'latest_event': reply, 'current_user_participated': True}}}
room_events = [root_event, reply,
               event('$ui-group-msg', {'msgtype': 'm.text', 'body': '@Группа для теста (@startup:session.cinny.test)',
                                       'format': 'org.matrix.custom.html', 'formatted_body': group_html}),
               event('$ui-image', {'msgtype': 'm.image', 'body': 'visual-test.png',
                                   'url': 'mxc://session.cinny.test/visual-test',
                                   'info': {'mimetype': 'image/png', 'w': 57, 'h': 57}})]
room_state = [event('$ui-member', {'membership': 'join', 'displayname': 'Участник теста'}, PEER,
                    'm.room.member', PEER)]

with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        context = browser.new_context(viewport={'width': 1400, 'height': 1000}, service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        install_session_fixture(page, room_events=room_events, room_state=room_state)
        page.route('**/_matrix/client/versions', lambda route: route.fulfill(json={'versions': ['v1.' + str(i) for i in range(1, 12)], 'unstable_features': {}}))
        page.route('**/relations/**', lambda route: route.fulfill(json={'chunk': [reply]}))
        image_file = Path('public/res/apple/apple-touch-icon-57x57.png')
        if not image_file.exists():
            image_file = next(Path('public').rglob('*.png'))
        page.route('**/media/**', lambda route: route.fulfill(path=str(image_file), content_type='image/png'))
        page.goto(APP + '/config.json')
        seed_session(page)
        page.evaluate('localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings")), messageLayout: 2, developerTools: true, isPeopleDrawer: false, useSystemTheme: false, themeId: "dark-theme"}))')
        page.goto(APP + '/#/home/' + ROOM + '/')
        assert_session_ready(page)
        page.mouse.move(0, 0)
        target = page.get_by_text(MESSAGE, exact=True)
        actions = action_bar(target)
        bar = actions.locator('xpath=ancestor::div[@data-visible][1]')
        expect(bar).to_have_css('opacity', '0')
        assert actions.bounding_box()['width'] <= 32, actions.bounding_box()
        target.hover()
        expect(bar).to_have_css('opacity', '1')
        check(engine + ': compact desktop actions appear on hover')
        actions.click()
        expect(page.get_by_text('Пожаловаться', exact=True)).to_have_count(0)
        expect(page.get_by_text('Исходное событие', exact=True)).to_have_count(0)
        expect(page.get_by_text('Скопировать текст', exact=True)).to_be_visible()
        page.keyboard.press('Escape')
        page.mouse.move(0, 0)
        actions.focus()
        expect(bar).to_have_css('opacity', '1')
        check(engine + ': keyboard actions and simplified menu with developer tools enabled')
        page.locator('[data-editable-name="RoomInput"]').click()
        pill = page.locator('[data-mention-group="ui-group"]')
        pill.hover()
        expect(pill).to_have_css('cursor', 'pointer')
        assert 'underline' in computed(pill, 'textDecorationLine')
        assert 'Startup user' in pill.get_attribute('title')
        check(engine + ': group mention cursor, underline and member tooltip')
        # Font faces must load successfully for both scripts and multiple weights.
        fonts = page.evaluate('''async () => {
            const text = 'Съешь ещё этих мягких булок Matrix Inter 290';
            const result = [];
            for (const weight of [400, 500, 600]) {
                const faces = await document.fonts.load(`${weight} 16px InterVariable`, text);
                result.push({weight, faces: faces.map(f => ({family:f.family,status:f.status}))});
            }
            return result;
        }''')
        assert all(item['faces'] and all(f['status'] == 'loaded' for f in item['faces']) for item in fonts), fonts
        (OUT / (engine + '-fonts.json')).write_text(json.dumps(fonts, indent=2))
        check(engine + ': Cyrillic and Latin Inter font files load at 400, 500 and 600')
        page.get_by_role('button', name='Показать участников').click()
        expect(page.get_by_placeholder('Введите имя…')).to_be_visible()
        for text in ['Вступившие', 'А → Я', 'Администратор', 'Участник']:
            expect(page.get_by_text(text, exact=True)).to_be_visible()
        page.screenshot(path=str(OUT / (engine + '-members.png')))
        page.get_by_role('button', name='Закрыть', exact=True).last.click()
        check(engine + ': translated member drawer and default role labels')
        page.get_by_role('img', name='visual-test.png', exact=True).click()
        expect(page.get_by_role('button', name='Скачать', exact=True)).to_be_visible()
        expect(page.get_by_text('Download', exact=True)).to_have_count(0)
        page.screenshot(path=str(OUT / (engine + '-image-viewer.png')))
        page.get_by_role('button', name='Назад', exact=True).click()
        check(engine + ': image viewer download label is translated')
        page.get_by_role('button', name='Стикеры', exact=True).click()
        expect(page.get_by_role('button', name='Стикеры', exact=True)).to_have_count(2)
        search = page.get_by_placeholder('Поиск', exact=True)
        expect(search).to_be_visible()
        assert search.evaluate('(node) => document.activeElement !== node')
        assert not search.evaluate('(node) => node.matches(":focus-visible")')
        page.screenshot(path=str(OUT / (engine + '-stickers.png')))
        search.click()
        search.fill('кот')
        page.keyboard.press('Escape')
        check(engine + ': translated stickers and no autofocus outline on open; search remains usable')
        page.get_by_role('button', name='Открыть тред: 1 ответ', exact=True).click()
        thread_message = page.get_by_text('Ответ в треде для проверки', exact=True)
        expect(thread_message).to_be_visible()
        page.mouse.move(0, 0)
        thread_actions = action_bar(thread_message)
        thread_bar = thread_actions.locator('xpath=ancestor::div[@data-visible][1]')
        expect(thread_bar).to_have_css('opacity', '0')
        thread_message.hover()
        expect(thread_bar).to_have_css('opacity', '1')
        assert thread_actions.bounding_box()['width'] <= 32
        page.screenshot(path=str(OUT / (engine + '-thread.png')))
        check(engine + ': compact thread actions hidden until hover')
        page.locator('button[data-id="' + SPACE + '"]').click()
        page.get_by_role('button', name='Действия', exact=True).first.click()
        for text in ['Пригласить', 'Настройки пространства', 'Лента событий', 'Покинуть пространство']:
            expect(page.get_by_text(text, exact=True)).to_be_visible()
        settings_label = page.get_by_text('Настройки пространства', exact=True)
        assert settings_label.evaluate('(node) => node.scrollWidth <= node.clientWidth')
        page.screenshot(path=str(OUT / (engine + '-space-menu.png')))
        page.keyboard.press('Escape')
        check(engine + ': space menu translated without clipped settings text')
        page.get_by_role('button', name='Личные сообщения', exact=True).click()
        expect(page.get_by_text('Создать чат', exact=True)).to_be_visible()
        expect(page.get_by_text('Чаты', exact=True)).to_be_visible()
        page.get_by_role('button', name='Создать или вступить', exact=True).hover()
        expect(page.get_by_text('Добавить пространство', exact=True)).to_be_visible()
        check(engine + ': direct chat controls and Add Space tooltip translated')
        assert not errors, errors
        context.close()
        # Coarse-pointer behavior uses a separate context, independent of viewport width.
        context = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, service_workers='block')
        page = context.new_page()
        install_session_fixture(page)
        page.goto(APP + '/config.json')
        seed_session(page)
        page.goto(APP + '/#/home/' + ROOM + '/')
        assert_session_ready(page)
        actions = action_bar(page.get_by_text(MESSAGE, exact=True))
        expect(actions.locator('xpath=ancestor::div[@data-visible][1]')).to_have_css('opacity', '1')
        assert actions.bounding_box()['width'] >= 44
        actions.click()
        expect(page.get_by_text('Скопировать текст', exact=True)).to_be_visible()
        check(engine + ': touch actions remain visible with a usable touch target')
        context.close()
        browser.close()

(OUT / 'summary.json').write_text(json.dumps({'passed':len(checks), 'checks':checks}, ensure_ascii=False, indent=2))
