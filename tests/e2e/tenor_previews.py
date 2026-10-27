"""Check the reported localized Tenor link in a real client/WebView2."""
import json
import struct
import time
from pathlib import Path

from playwright.sync_api import expect
from session_fixture import ROOM, USER, install_session_fixture, seed_session, assert_session_ready

SHARE = 'https://tenor.com/ru/view/craving-break-me-if-you-can-gif-12802980'
MEDIA = 'https://tenor.com/view/12802980.gif'


def assert_tenor_preview(page, output):
    output = Path(output)
    origin = page.evaluate('location.origin')
    page.goto(origin + '/config.json')
    requests = install_session_fixture(page, room_events=[{
        'type': 'm.room.message', 'event_id': '$localized-tenor', 'sender': USER,
        'origin_server_ts': int(time.time() * 1000),
        'content': {'msgtype': 'm.text', 'body': SHARE},
    }])
    # A real looping, two-frame GIF. Only provider bytes and Matrix HTTP are
    # fixtures; link parsing, message rendering and image decoding are real.
    gif = b'GIF89a' + struct.pack('<HH', 2, 1) + b'\x80\0\0\xff\x60\x60\x60\x60\xff'
    gif += b'!\xff\x0bNETSCAPE2.0\x03\x01\0\0\0'
    for data in (b'\x44\x0a', b'\x0c\x0a'):
        gif += b'!\xf9\x04\0\x14\0\0\0,' + struct.pack('<HHHH', 0, 0, 2, 1)
        gif += b'\0\x02\x02' + data + b'\0'
    gif += b';'
    media_requests = []

    def provider(route):
        media_requests.append(route.request.url)
        route.fulfill(content_type='image/gif', body=gif)

    page.route(MEDIA, provider)
    seed_session(page)
    page.goto(origin + '/#/home/' + ROOM + '/')
    assert_session_ready(page)
    row = page.locator('[data-message-id="$localized-tenor"]')
    image = row.locator('img[src="' + MEDIA + '"]')
    expect(image).to_be_visible(timeout=30000)
    image.evaluate('(img) => img.decode()')
    assert image.evaluate('(img) => img.naturalWidth') == 2
    expect(row.locator('a[href="' + SHARE + '"]').first).to_be_visible()
    first = image.screenshot()
    animated = False
    for delay in [170, 310, 530, 790]:
        page.wait_for_timeout(delay)
        if image.screenshot() != first:
            animated = True
            break
    assert animated, 'Tenor preview remained static'
    assert media_requests, 'Provider media was not requested'
    assert not any('preview_url' in item['path'] for item in requests), requests
    page.screenshot(path=str(output / 'localized-tenor.png'))
    (output / 'localized-tenor.json').write_text(json.dumps({
        'share': SHARE, 'media': MEDIA, 'animated': animated,
        'matrix_preview_requests': 0, 'fixture': 'two-frame GIF',
    }, indent=2))
    print('PASS localized Tenor: original link retained, GIF decodes and animates without Matrix preview API', flush=True)
