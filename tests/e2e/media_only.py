"""Hide a sole URL only after its media loads; preserve captions and failure fallbacks."""
import base64
import json
import time
from pathlib import Path

from playwright.sync_api import expect
from session_fixture import ROOM, USER, install_session_fixture, seed_session

IMAGE = 'https://media.cinny.test/image.png'
GIF = 'https://media.cinny.test/animation.gif'
VIDEO = 'https://media.cinny.test/clip.webm'
FAILED = 'https://media.cinny.test/broken.png'
PAGE = 'https://example.org/article'
YOUTUBE = 'https://youtu.be/M7lc1UVf-VE'
PLAYER = 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0&playsinline=1&hl=ru'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=')
GIF_BYTES = base64.b64decode('R0lGODlhAgABAIAAAO5PTwAAACH5BAAAAAAALAAAAAACAAEAAAICBAoAOw==')


def assert_media_only(page, output, theme_id=None):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    origin = page.evaluate('location.origin')
    page.goto(origin + '/config.json')
    events = []
    for key, body in [('gif', GIF), ('image', IMAGE), ('video', VIDEO),
                      ('player', YOUTUBE), ('caption', 'Посмотрите: ' + GIF),
                      ('failed', FAILED), ('page', PAGE)]:
        events.append({'type': 'm.room.message', 'event_id': '$media-' + key,
                       'sender': USER, 'origin_server_ts': int(time.time() * 1000),
                       'content': {'msgtype': 'm.text', 'body': body}})
    events.append({'type':'m.room.message','event_id':'$media-attached-caption','sender':USER,
                   'origin_server_ts':int(time.time()*1000),'content':{'msgtype':'m.image','body':GIF,
                   'filename':'photo.png','url':IMAGE,'info':{'mimetype':'image/png','w':1,'h':1,'size':len(PNG)}}})
    install_session_fixture(page, room_events=events)
    webm = Path(__file__).parents[1].joinpath('fixtures/preview.webm').read_bytes()
    page.route(IMAGE, lambda route: route.fulfill(content_type='image/png', body=PNG))
    page.route(GIF, lambda route: route.fulfill(content_type='image/gif', body=GIF_BYTES))
    page.route(VIDEO, lambda route: route.fulfill(content_type='video/webm', body=webm))
    page.route(FAILED, lambda route: route.fulfill(status=404))
    page.route(PLAYER, lambda route: route.fulfill(content_type='text/html', body='<html><body>Provider fixture</body></html>'))
    page.route('**/preview_url*', lambda route: route.fulfill(json={'og:title': 'Обычная страница'}))
    seed_session(page)
    page.evaluate('theme => localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings")),urlPreview:true,encUrlPreview:true,mediaAutoLoad:true,isPeopleDrawer:false,messageLayout:2,...(theme ? {themeId:theme,useSystemTheme:false} : {})}))', theme_id)
    page.goto(origin + '/#/home/' + ROOM + '/')

    for key, url, selector in [('gif', GIF, 'img'), ('image', IMAGE, 'img'),
                               ('video', VIDEO, 'video'), ('player', YOUTUBE, 'iframe')]:
        row = page.locator('[data-message-id="$media-' + key + '"]')
        media = row.locator(selector).first
        expect(media).to_be_attached(timeout=30000)
        media.scroll_into_view_if_needed()
        if selector == 'img':
            media.evaluate('(img) => img.decode()')
        if selector == 'video':
            page.wait_for_function('(video)=>video.readyState>=2', arg=media.element_handle(), timeout=20000)
        expect(row.locator('a[href="' + url + '"]')).to_have_count(0, timeout=10000)
    caption = page.locator('[data-message-id="$media-caption"]')
    expect(caption).to_contain_text('Посмотрите:')
    expect(caption.locator('a[href="' + GIF + '"]').first).to_be_attached()
    failed = page.locator('[data-message-id="$media-failed"]')
    expect(failed.locator('a[href="' + FAILED + '"]').first).to_be_attached()
    expect(failed.get_by_role('button', name='Повторить загрузку медиа')).to_be_attached()
    ordinary = page.locator('[data-message-id="$media-page"]')
    expect(ordinary.locator('a[href="' + PAGE + '"]').first).to_be_attached()
    attached = page.locator('[data-message-id="$media-attached-caption"]')
    expect(attached.locator('a[href="' + GIF + '"]').first).to_be_attached()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    (output / 'media-only.json').write_text(json.dumps({'image': True, 'gif': True, 'video': True, 'player': True, 'caption_retained': True, 'failure_link_retained': True, 'ordinary_link_retained': True}, indent=2))
    page.screenshot(path=str(output / 'media-only.png'))
    # Manual loading must retain the address until the user chooses to load it.
    page.evaluate('localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings")),mediaAutoLoad:false}))')
    page.reload()
    row = page.locator('[data-message-id="$media-gif"]')
    manual = row.get_by_role('button', name='Загрузить предпросмотр медиа')
    expect(manual).to_be_attached(timeout=30000)
    expect(row.locator('a[href="' + GIF + '"]').first).to_be_attached()
    manual.click()
    row.locator('img').evaluate('(img) => img.decode()')
    expect(row.locator('a[href="' + GIF + '"]')).to_have_count(0)
    print('PASS media-only messages: image, GIF, video and player hide raw URL after load; captions, failed media and ordinary URLs remain accessible', flush=True)


if __name__ == '__main__':
    import os
    from playwright.sync_api import sync_playwright
    app = os.environ.get('APP_URL', 'http://127.0.0.1:18085')
    out = Path(os.environ.get('TEST_OUTPUT', 'artifacts/media-only-20261029'))
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1400,'height':1200}, service_workers='block')
        page.on('pageerror', lambda error: print('PAGEERROR', str(error), flush=True))
        page.goto(app + '/config.json')
        try:
            assert_media_only(page, out)
        except Exception:
            out.mkdir(exist_ok=True, parents=True)
            page.screenshot(path=str(out / 'failure.png'))
            raise
        finally:
            browser.close()
