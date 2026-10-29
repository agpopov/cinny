"""Check the reported localized Tenor link in a real client/WebView2."""
import json
import struct
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import expect
from session_fixture import ROOM, USER, install_session_fixture, seed_session, assert_session_ready

SHARE = 'https://tenor.com/ru/view/ну-и-пожалуйста-ну-и-не-нужно-котёнок-gif-9559614367641425665'
ENCODED_SHARE = quote(SHARE, safe=':/')
MEDIA = 'https://tenor.com/view/9559614367641425665.gif'


def assert_tenor_preview(page, output):
    output = Path(output)
    origin = page.evaluate('location.origin')
    page.goto(origin + '/config.json')
    requests = install_session_fixture(page, room_events=[{
        'type': 'm.room.message', 'event_id': '$localized-tenor', 'sender': USER,
        'origin_server_ts': int(time.time() * 1000),
        'content': {'msgtype': 'm.text', 'body': '[' + SHARE + '](' + SHARE + ')',
                    'format': 'org.matrix.custom.html',
                    'formatted_body': '<a href="' + SHARE + '">' + SHARE + '</a>'},
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
    page.evaluate('localStorage.setItem("settings", JSON.stringify({...JSON.parse(localStorage.getItem("settings")), messageLayout:2, urlPreview:true, encUrlPreview:true, mediaAutoLoad:true, isPeopleDrawer:false}))')
    page.goto(origin + '/#/home/' + ROOM + '/')
    assert_session_ready(page)
    row = page.locator('[data-message-id="$localized-tenor"]')
    image = row.locator('img[src="' + MEDIA + '"]')
    expect(image).to_be_visible(timeout=30000)
    image.evaluate('(img) => img.decode()')
    assert image.evaluate('(img) => img.naturalWidth') == 2
    expect(row.locator('a[href="' + SHARE + '"]')).to_have_count(0)
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
    print('PASS formatted Tenor in bubble layout: original link retained, GIF decodes and animates without Matrix preview API', flush=True)

    # Send through the actual editor as a formatted hyperlink, rather than only
    # displaying a synthetic plain-text event. This is the reported failure path.
    from urllib.parse import unquote, urlsplit
    sent = []

    def send(route):
        content = route.request.post_data_json
        remote = {'type': 'm.room.message', 'event_id': '$tenor-editor-sent',
                  'sender': USER, 'origin_server_ts': int(time.time() * 1000),
                  'content': content, 'unsigned': {'transaction_id': unquote(urlsplit(route.request.url).path).rsplit('/', 1)[-1]}}
        sent.append(remote)
        route.fulfill(json={'event_id': remote['event_id']})

    page.route('**/send/m.room.message/*', send)
    editor = page.locator('[data-editable-name="RoomInput"]')
    editor.click()
    page.keyboard.insert_text(SHARE)
    editor.press('Control+A')
    page.wait_for_function('text => getSelection().toString() === text', arg=SHARE)
    editor.evaluate('''(node, url) => {
        const data = new DataTransfer(); data.setData('text/plain', url);
        const event = new ClipboardEvent('paste', {bubbles:true, cancelable:true});
        Object.defineProperty(event, 'clipboardData', {value:data}); node.dispatchEvent(event);
    }''', SHARE)
    expect(editor.locator('a')).to_have_attribute('href', ENCODED_SHARE)
    editor.press('Enter')
    sent_row = page.locator('[data-message-id="$tenor-editor-sent"]')
    sent_image = sent_row.locator('img[src="' + MEDIA + '"]')
    expect(sent_image).to_be_visible(timeout=30000)
    sent_image.evaluate('(img) => img.decode()')
    assert sent[0]['content']['body'] == '[' + SHARE + '](' + ENCODED_SHARE + ')', sent
    assert ENCODED_SHARE in sent[0]['content']['formatted_body'], sent
    assert not any('preview_url' in item['path'] for item in requests), requests
    (output / 'tenor-editor-message.json').write_text(json.dumps(sent[0]['content'], ensure_ascii=False, indent=2), encoding='utf-8')
    page.screenshot(path=str(output / 'tenor-editor-sent.png'))
    print('PASS actual editor hyperlink send: serialized Markdown fallback, correct GIF preview after server acknowledgement', flush=True)
