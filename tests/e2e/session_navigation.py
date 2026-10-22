"""Use the actual room/space/direct navigation, including legacy saved URLs."""
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import expect
from session_fixture import ROOM, SPACE, CHANNEL, DIRECT, ALIAS, MESSAGE, assert_session_ready


def assert_client_navigation(page, output):
    checks = []
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)

    def passed(label):
        checks.append(label)
        print('PASS ' + label, flush=True)

    room_link = page.get_by_role('link').filter(has_text='Saved session startup').first
    assert '%253A' not in room_link.get_attribute('href')
    room_link.click()
    assert_session_ready(page)
    passed('actual home room link opens a joined room with exact Matrix ID')

    page.locator('button[data-id="' + SPACE + '"]').click()
    channel_link = page.get_by_role('link').filter(has_text='Workspace channel').first
    expect(channel_link).to_be_visible(timeout=30000)
    assert '%253A' not in channel_link.get_attribute('href')
    channel_link.click()
    expect(page.get_by_text('Workspace channel is open', exact=True)).to_be_visible(timeout=30000)
    expect(page.locator('[data-editable-name="RoomInput"]')).to_be_visible()
    passed('actual workspace button and channel link open the existing workspace channel')
    page.reload()
    expect(page.get_by_text('Workspace channel is open', exact=True)).to_be_visible(timeout=60000)
    page.screenshot(path=str(output / 'workspace-channel-reload.png'))
    passed('workspace/channel address survives reload')
    page.wait_for_timeout(1500)

    page.get_by_role('button', name='Личные сообщения', exact=True).click()
    direct_link = page.get_by_role('link').filter(has_text='Saved direct conversation').first
    expect(direct_link).to_be_visible(timeout=30000)
    direct_link.click()
    expect(page.get_by_text('Direct conversation is open', exact=True)).to_be_visible(timeout=30000)
    passed('actual direct-message link opens the joined direct conversation')

    # Legacy Cinny URLs encoded route parameters twice. Saved addresses and
    # persisted space destinations must be repaired without changing membership.
    base = page.url.split('/#', 1)[0].split('/direct/', 1)[0]
    if '/#' in page.url:
        prefix = base + '/#'
    else:
        prefix = page.evaluate('location.origin')
    def legacy(value):
        return quote(quote(value, safe='!'), safe='!')
    page.goto(prefix + '/' + legacy(SPACE))
    expect(page.get_by_role('link').filter(has_text='Workspace channel').first).to_be_visible(timeout=60000)
    expect(page.get_by_role('button', name='Join', exact=True)).to_have_count(0)
    assert '%253A' not in page.url, page.url
    passed('legacy saved workspace address restores its real channel list')
    page.wait_for_timeout(1500)
    for path, text, name in [
        ('/home/' + legacy(ROOM), MESSAGE, 'home'),
        ('/home/' + legacy(ALIAS), MESSAGE, 'alias'),
        ('/' + legacy(SPACE) + '/' + legacy(CHANNEL), 'Workspace channel is open', 'workspace'),
        ('/direct/' + legacy(DIRECT), 'Direct conversation is open', 'direct'),
    ]:
        page.goto(prefix + path + '?viaServers=session.cinny.test')
        expect(page.get_by_text(text, exact=True)).to_be_visible(timeout=60000)
        assert '%253A' not in page.url, page.url
        assert 'viaServers=session.cinny.test' in page.url, page.url
        expect(page.locator('[data-editable-name="RoomInput"]')).to_be_visible()
        page.screenshot(path=str(output / ('legacy-' + name + '.png')))
        passed('legacy double-encoded ' + name + ' destination is restored and canonicalized')
        page.wait_for_timeout(1500)

    page.goto(prefix + '/home/' + quote(ROOM, safe='!'))
    assert_session_ready(page)
    page.get_by_role('button', name='Действия сообщения', exact=True).first.click()
    page.get_by_role('button', name='Ответить в треде', exact=True).last.click()
    expect(page.locator('[data-editable-name="ThreadInput"]')).to_be_visible(timeout=30000)
    passed('actual message action opens its thread after navigation')
    page.wait_for_timeout(1500)
    return checks
