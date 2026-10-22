"""Media, default/custom stickers and thread navigation on a disposable Synapse.

HS_URL=http://127.0.0.1:8008 APP_URL=http://127.0.0.1:18081 \
  python3 tests/e2e/media_stickers.py
Requires Playwright browsers. Never use production accounts.
Set LIVE_GIF_PROVIDERS=1 to check GIFS.RU, Tenor and GIPHY against real providers.
"""
import base64
import http.server
import json
import os
import re
import struct
import threading
import time
import urllib.request
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright

HS = os.environ.get('HS_URL', 'http://127.0.0.1:8008')
APP = os.environ.get('APP_URL', 'http://127.0.0.1:18081')
OUT = Path(os.environ.get('TEST_OUTPUT', '/tmp/cinny-media-shots'))
OUT.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[2]
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def api(method, path, token=None, body=None):
    request = urllib.request.Request(HS + path, method=method, headers={
        'Content-Type': 'application/json',
        **({'Authorization': 'Bearer ' + token} if token else {}),
    })
    with opener.open(request, json.dumps(body).encode() if body is not None else None, timeout=30) as result:
        return json.loads(result.read() or b'{}')


def send(token, room, content):
    return api('PUT', f'/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}', token, content)['event_id']


def events(token, room):
    return api('GET', f'/_matrix/client/v3/rooms/{room}/messages?dir=b&limit=100', token)['chunk']


def wait_event(token, room, predicate):
    for _ in range(80):
        found = next((event for event in events(token, room) if predicate(event)), None)
        if found:
            return found
        time.sleep(.25)
    raise AssertionError('Expected event missing')


def check(name, condition=True):
    assert condition, name
    print('PASS ' + name, flush=True)


def check_animation(label, image, page):
    initial = image.screenshot()
    for delay in [170, 310, 530, 790]:
        page.wait_for_timeout(delay)
        if image.screenshot() != initial:
            check(label + ' animation changes frames')
            return
    raise AssertionError(label + ' animation remained static')


run = uuid.uuid4().hex[:8]
session = api('POST', '/_matrix/client/v3/register', body={
    'username': 'media' + run, 'password': 'pass123', 'auth': {'type': 'm.login.dummy'},
})
token = session['access_token']
room = api('POST', '/_matrix/client/v3/createRoom', token, {'room_version': '10', 'name': 'Media review ' + run})['room_id']
for index in range(5):
    root = send(token, room, {'msgtype': 'm.text', 'body': f'THREAD {index}'})
    send(token, room, {'msgtype': 'm.text', 'body': f'REPLY {index}', 'm.relates_to': {
        'rel_type': 'm.thread', 'event_id': root, 'is_falling_back': True, 'm.in_reply_to': {'event_id': root},
    }})
send(token, room, {'msgtype': 'm.text', 'body': 'MEDIA READY'})

# An actual two-frame looping GIF, generated locally without external fixtures.
gif_header = b'GIF89a' + struct.pack('<HH', 2, 1) + b'\x80\0\0\xff\x60\x60\x60\x60\xff'
gif = gif_header + b'!\xff\x0bNETSCAPE2.0\x03\x01\0\0\0'
for data in (b'\x44\x0a', b'\x0c\x0a'):
    gif += b'!\xf9\x04\0\x14\0\0\0,' + struct.pack('<HHHH', 0, 0, 2, 1) + b'\0\x02\x02' + data + b'\0'
gif += b';'
png = (REPO / 'public/res/stickers/cats/cat_face.png').read_bytes()
request = urllib.request.Request(HS + '/_matrix/media/v3/upload?filename=custom.png', data=png, method='POST', headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'image/png'})
with opener.open(request, timeout=30) as response:
    custom_mxc = json.loads(response.read())['content_uri']

with sync_playwright() as playwright:
    # Produce a real video in Chromium, rather than using a link to a player page.
    producer = playwright.chromium.launch(args=['--no-sandbox', '--no-proxy-server'])
    producer_page = producer.new_page()
    clip = bytes(producer_page.evaluate('''async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const ctx = canvas.getContext('2d'); const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, {mimeType: 'video/webm;codecs=vp8'});
      const chunks = []; recorder.ondataavailable = e => chunks.push(e.data);
      const done = new Promise(resolve => recorder.onstop = resolve); recorder.start();
      for(let i=0;i<12;i++) { ctx.fillStyle=i%2?'#5b6def':'#ef5b6d'; ctx.fillRect(0,0,160,90); await new Promise(r=>setTimeout(r,100)); }
      recorder.stop(); await done; stream.getTracks().forEach(t=>t.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    }'''))
    producer.close()
    (OUT / 'fixture.webm').write_bytes(clip)

    # Serve actual bytes over loopback. WebKit's media stack does not reliably
    # pass service-worker-controlled resource requests through Playwright routes.
    class MediaHandler(http.server.BaseHTTPRequestHandler):
        # WebKit can bypass Playwright routes while a service worker controls the
        # page. Serve Matrix fixtures over HTTP and proxy real media/auth traffic.
        def proxy_matrix(self):
            if 'preview_url' in self.path:
                provider = any(name in self.path for name in ['gifs', 'tenor', 'giphy', 'imgur'])
                data = json.dumps({'errcode': 'M_UNRECOGNIZED', 'error': 'Unrecognized request'} if provider else {
                    'og:title': 'Playable video page', 'og:video': media_base + '/clip.webm',
                    'og:video:type': 'video/webm', 'og:image': media_base + '/loop.gif',
                }).encode()
                self.send_response(404 if provider else 200)
                self.send_header('Content-Type', 'application/json')
            else:
                data = self.rfile.read(int(self.headers.get('Content-Length', 0))) or None
                request = urllib.request.Request(HS + self.path, data=data, method=self.command,
                    headers={key: value for key, value in self.headers.items()
                             if key.lower() not in ['host', 'content-length', 'connection', 'accept-encoding']})
                try:
                    response = opener.open(request, timeout=60)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    data = response.read()
                    self.send_response(response.status)
                    for key in ['Content-Type', 'Content-Range', 'Accept-Ranges']:
                        if response.headers.get(key):
                            self.send_header(key, response.headers[key])
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.end_headers()

        do_POST = proxy_matrix
        do_PUT = proxy_matrix
        do_DELETE = proxy_matrix

        def do_GET(self):
            if self.path.startswith('/_matrix/') or self.path.startswith('/.well-known/'):
                return self.proxy_matrix()
            data, content_type = (clip, 'video/webm') if 'clip' in self.path else (gif, 'image/gif')
            if self.path.startswith('/watch'):
                data = ('<html><head><meta property="og:title" content="Playable video page">'
                        f'<meta property="og:video" content="{media_base}/clip.webm">'
                        '<meta property="og:video:type" content="video/webm">'
                        f'<meta property="og:image" content="{media_base}/loop.gif">'
                        '</head><body>Local video fixture</body></html>').encode()
                content_type = 'text/html'
            match = re.match(r'bytes=(\d+)-(\d*)', self.headers.get('Range', ''))
            status = 200
            full_size = len(data)
            if match:
                start = int(match[1]); end = min(int(match[2]) if match[2] else len(data) - 1, len(data) - 1)
                data = data[start:end + 1]; status = 206
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(len(data)))
            if match:
                self.send_header('Content-Range', f'bytes {start}-{end}/{full_size}')
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    media_server = http.server.ThreadingHTTPServer(('0.0.0.0', 0), MediaHandler)
    threading.Thread(target=media_server.serve_forever, daemon=True).start()
    media_base = f'http://{os.environ.get("MEDIA_HOST", "127.0.0.1")}:{media_server.server_port}'

    for engine in os.environ.get('BROWSERS', 'chromium').split(','):
        launch = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            launch['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(playwright, engine).launch(**launch)
        for width in [1400, 390]:
            label = f'{engine}-{width}'
            current_session = api('POST', '/_matrix/client/v3/login', body={
                'type': 'm.login.password', 'identifier': {'type': 'm.id.user', 'user': session['user_id']},
                'password': 'pass123',
            })
            context = browser.new_context(viewport={'width': width, 'height': 900 if width > 600 else 844})
            page = context.new_page()
            errors = []
            console_errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: console_errors.append(message.text) if message.type == 'error' else None)
            context.route('**/config.json', lambda route: route.fulfill(json={
                'homeserverList': [HS], 'allowCustomHomeservers': True,
                'hashRouter': {'enabled': False, 'basename': '/'},
            }))

            context.route(re.compile(r'/_matrix/.*/preview_url'), lambda route: route.fulfill(json={
                'og:title': 'Playable video page', 'og:video': media_base + '/clip.webm',
                'og:video:type': 'video/webm', 'og:image': media_base + '/loop.gif',
            }))
            provider_requests = []
            def provider_preview_error(route):
                provider_requests.append(route.request.url)
                route.fulfill(status=404, json={'errcode': 'M_UNRECOGNIZED', 'error': 'Unrecognized request'})
            context.route(re.compile(r'/_matrix/.*/preview_url\?.*(gifs|tenor|giphy|imgur)'), provider_preview_error)
            # Mirror the provider's static embed so this regression remains
            # independent of external availability. Live embeds are checked separately.
            if not os.environ.get('LIVE_GIF_PROVIDERS'):
                context.route('https://gifs.ru/embed/4Oib7Z', lambda route: route.fulfill(
                    content_type='text/html', body='<img src="data:image/gif;base64,' + base64.b64encode(gif).decode() + '" alt="Работа Работаю Печатаю">'))
                context.route('https://i.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif', lambda route: route.fulfill(content_type='image/gif', body=gif))
                context.route('https://tenor.com/view/18240062.gif', lambda route: route.fulfill(content_type='image/gif', body=gif))
            # Imgur rate-limits this environment (HTTP 429), so keep its playback
            # coverage deterministic, including in live-provider mode.
            context.route('https://i.imgur.com/llGqCrR.mp4', lambda route: route.fulfill(content_type='video/webm', body=clip))
            context.route('https://i.imgur.com/llGqCrR.gif', lambda route: route.fulfill(content_type='image/gif', body=gif))
            try:
                page.goto(APP + '/config.json')
                page.evaluate('''s => {
                  localStorage.setItem('cinny_access_token', s.access_token);
                  localStorage.setItem('cinny_device_id', s.device_id);
                  localStorage.setItem('cinny_user_id', s.user_id);
                  localStorage.setItem('cinny_hs_base_url', s.hs);
                }''', {**current_session, 'hs': media_base})
                page.goto(APP + '/home/' + room + '/')
                editor = page.locator('[data-editable-name="RoomInput"]')
                editor.wait_for(timeout=30000)
                page.wait_for_timeout(2200); page.keyboard.press('Escape')
                def jump_latest():
                    latest = page.get_by_role('button', name='К последним сообщениям', exact=True)
                    if latest.count():
                        latest.click(); page.wait_for_timeout(300)
                jump_latest()
                page.evaluate('navigator.serviceWorker.ready.then(() => true)')
                check(label + ' authenticated-media service worker ready')
                if width == 1400:
                    assets = json.loads((REPO / 'public/res/stickers/SOURCES.json').read_text())['files']
                    decoded = page.evaluate('''async files => Promise.all(files.map(async file => {
                      const image = new Image();
                      image.src = '/public/stickers/' + file.asset.slice('res/stickers/'.length);
                      await image.decode();
                      if (image.naturalWidth !== file.info.w || image.naturalHeight !== file.info.h)
                        throw new Error('Invalid sticker dimensions: ' + file.asset);
                      return file.asset;
                    }))''', assets)
                    check(label + ' all 144 bundled PNGs decode in browser', len(decoded) == 144)
                # Defaults must be present without any account/room sticker packs.
                def open_stickers():
                    button = page.get_by_role('button', name='Стикеры', exact=True)
                    if button.count():
                        button.click()
                    else:
                        page.get_by_role('button', name='Эмодзи', exact=True).click()
                        page.get_by_text('Sticker', exact=True).click()
                open_stickers()
                page.locator('button[data-emoji-type="sticker"]').first.wait_for()
                check(label + ' all nine default pack icons', all(page.get_by_role('button', name=name, exact=True).count() == 1 for name in ['Коты', 'Реакции', 'Зверята', 'Жесты', 'Настроение', 'Сердечки', 'Перекус', 'За работу', 'Праздник']))
                page.get_by_role('button', name='Коты', exact=True).click()
                sticker = page.locator('button[data-emoji-data="builtin-sticker:cats/cat_face"]')
                sticker.wait_for()
                check(label + ' sticker pixels loaded', sticker.locator('img').evaluate('(el) => el.complete && el.naturalWidth === 256'))
                check(label + ' picker fits viewport', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
                page.screenshot(path=str(OUT / (label + '-picker.png')))
                previous_ids = {event['event_id'] for event in events(token, room)}
                sticker.click()
                event = wait_event(token, room, lambda e: e['event_id'] not in previous_ids and e['type'] == 'm.sticker' and e.get('content', {}).get('body') == 'Котик')
                jump_latest()
                check(label + ' portable MXC sticker with dimensions', event['content']['url'].startswith('mxc://') and event['content']['info']['w'] == 256)
                row = page.locator('[data-message-id="' + event['event_id'] + '"]')
                row.wait_for()
                page.wait_for_function('(row) => Array.from(row.querySelectorAll("img")).some(img => img.complete && img.naturalWidth === 256)', arg=row.element_handle())
                check(label + ' authenticated sticker renders in timeline')
                # Room packs arriving while the picker is open must update live.
                open_stickers()
                pack_name = 'Live pack ' + label
                custom_label = 'Своя картинка ' + label
                api('PUT', f'/_matrix/client/v3/rooms/{room}/state/im.ponies.room_emotes/{label}', token, {
                    'pack': {'display_name': pack_name, 'usage': ['sticker']},
                    'images': {'custom_cat': {'url': custom_mxc, 'body': custom_label, 'usage': ['sticker'], 'info': {'w': 256, 'h': 256, 'mimetype': 'image/png', 'size': len(png)}}},
                })
                page.get_by_role('button', name=pack_name, exact=True).wait_for()
                check(label + ' custom room pack appears without reopening picker')
                page.get_by_placeholder('Поиск', exact=True).fill(custom_label)
                page.get_by_role('button', name=custom_label + ' sticker', exact=True).click()
                custom_event = wait_event(token, room, lambda e: e.get('content', {}).get('body') == custom_label)
                check(label + ' custom sticker preserves existing MXC and metadata', custom_event['type'] == 'm.sticker' and custom_event['content']['url'] == custom_mxc and custom_event['content']['info']['w'] == 256)
                jump_latest()
                # Search matches Cyrillic labels as well as shortcodes.
                open_stickers()
                page.get_by_placeholder('Поиск', exact=True).fill('панда')
                page.get_by_role('button', name='Панда sticker', exact=True).wait_for()
                check(label + ' Cyrillic sticker search')
                check(label + ' search hides unrelated stickers', page.locator('button[data-emoji-type="sticker"]:visible').count() == 1)
                page.get_by_role('button', name='Зверята', exact=True).click()
                page.wait_for_function('() => document.querySelector("input[placeholder=Поиск]")?.value === ""')
                page.get_by_role('button', name='Панда sticker', exact=True).wait_for()
                check(label + ' switching packs clears search')
                page.get_by_placeholder('Поиск', exact=True).fill('no-such-sticker-xyz')
                page.get_by_text('No Results found', exact=True).wait_for()
                check(label + ' no matches do not show unrelated packs', page.locator('button[data-emoji-type="sticker"]:visible').count() == 0)
                page.keyboard.press('Escape')
                page.get_by_placeholder('Поиск', exact=True).wait_for(state='hidden')
                check(label + ' Escape closes picker from its search input')
                for pack_name, sticker_key, sticker_body in [
                    ('Жесты', 'gestures/thumbs_up', 'Одобряю, лайк'),
                    ('Настроение', 'moods/salute', 'Есть, принято'),
                    ('Сердечки', 'hearts/red_heart', 'Красное сердце'),
                    ('Перекус', 'snacks/coffee', 'Кофе и чай'),
                    ('За работу', 'work/laptop', 'За работу, ноутбук'),
                    ('Праздник', 'celebration/balloon', 'Воздушный шарик'),
                ]:
                    open_stickers()
                    page.get_by_role('button', name=pack_name, exact=True).click()
                    new_sticker = page.locator('button[data-emoji-data="builtin-sticker:' + sticker_key + '"]')
                    new_sticker.wait_for()
                    new_sticker.scroll_into_view_if_needed()
                    page.wait_for_function('key => document.querySelector(`button[data-emoji-data="${key}"] img`)?.naturalWidth === 256', arg='builtin-sticker:' + sticker_key)
                    check(label + ' expanded pack loads ' + pack_name, new_sticker.locator('img').evaluate('(el) => el.naturalWidth === 256'))
                    if width == 1400:
                        page.screenshot(path=str(OUT / (label + '-pack-' + sticker_key.split('/')[0] + '.png')))
                    previous_ids = {event['event_id'] for event in events(token, room)}
                    new_sticker.click()
                    new_event = wait_event(token, room, lambda e: e['event_id'] not in previous_ids and e['type'] == 'm.sticker' and e.get('content', {}).get('body') == sticker_body)
                    check(label + ' expanded pack sends portable MXC ' + pack_name, new_event['content']['url'].startswith('mxc://') and new_event['content']['info']['w'] == 256)
                    jump_latest()
                open_stickers()
                page.get_by_placeholder('Поиск', exact=True).fill('спасибо')
                page.get_by_role('button', name='Спасибо, пожалуйста sticker', exact=True).wait_for()
                check(label + ' expanded packs searchable by Russian meaning')
                page.keyboard.press('Escape')
                # Direct GIF/video URLs and provider metadata each render actual media.
                def text_message(body):
                    previous_ids = {event['event_id'] for event in events(token, room)}
                    editor.click(); page.keyboard.insert_text(body); page.keyboard.press('Enter')
                    event = wait_event(token, room, lambda e: e['event_id'] not in previous_ids and e.get('content', {}).get('body') == body)
                    row = page.locator('[data-message-id="' + event['event_id'] + '"]')
                    # Sync and initial/restored scroll can settle after the API
                    # accepts a message. Follow the latest until the new row mounts.
                    for _ in range(40):
                        jump_latest()
                        if row.count():
                            row.scroll_into_view_if_needed()
                            return event
                        page.wait_for_timeout(200)
                    raise AssertionError('Sent message never appeared in the timeline')

                for suffix, tag in [('loop.gif', 'img'), ('clip.webm', 'video'), ('watch', 'video')]:
                    body = media_base + '/' + suffix + '?' + label
                    linked = text_message(body)
                    linked_row = page.locator('[data-message-id="' + linked['event_id'] + '"]')
                    media = linked_row.locator(tag).last
                    media.wait_for()
                    if tag == 'img':
                        page.wait_for_function('(el) => el.complete && el.naturalWidth === 2', arg=media.element_handle())
                    else:
                        check(label + ' inline video controls ' + suffix, media.evaluate('(el) => el.controls && el.hasAttribute("playsinline")'))
                        media.evaluate('(el) => el.play().catch(() => {})')
                        page.wait_for_function('(el) => el.readyState >= 2 && el.videoWidth === 160', arg=media.element_handle())
                        media.evaluate('(el) => el.pause()')
                    check(label + ' media preview loaded ' + suffix)
                    check(label + ' original link retained ' + suffix, linked_row.locator('a[href="' + body + '"]').count() >= 1)
                share_body = 'https://gifs.ru/gifs/rabota-rabotayu-pechatayu-4Oib7Z?utm_source=share&utm_medium=copy_link'
                shared = text_message(share_body)
                shared_row = page.locator('[data-message-id="' + shared['event_id'] + '"]')
                provider_frame = shared_row.locator('iframe[title="GIFS.RU media preview"]')
                provider_frame.wait_for()
                provider_img = shared_row.frame_locator('iframe').locator('img')
                provider_img.wait_for()
                provider_img.evaluate('(el) => el.decode()')
                expected_gif_width = 318 if os.environ.get('LIVE_GIF_PROVIDERS') else 2
                check(label + ' GIFS.RU share animation renders without Matrix preview API', provider_img.evaluate('(el) => el.naturalWidth') == expected_gif_width and not provider_requests)
                check(label + ' provider embed blocks scripts and referrer', provider_frame.get_attribute('sandbox') == '' and provider_frame.get_attribute('referrerpolicy') == 'no-referrer')
                check(label + ' GIFS.RU original share link retained', shared_row.locator('a[href="' + share_body + '"]').count() >= 1)
                check(label + ' provider fits narrow messages', provider_frame.bounding_box()['width'] <= width)
                if os.environ.get('LIVE_GIF_PROVIDERS') and width == 1400:
                    check_animation(label + ' GIFS.RU', provider_img, page)
                for provider, provider_body, provider_src in [
                    ('GIPHY', 'https://giphy.com/gifs/cat-3oriO0OEd9QIDdllqo?utm_source=share', 'https://i.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif'),
                    ('Tenor', 'https://tenor.com/view/cat-typing-gif-18240062', 'https://tenor.com/view/18240062.gif'),
                    ('Tenor short', 'https://tenor.com/boHeI.gif', 'https://tenor.com/view/18240062.gif'),
                    ('Imgur GIFV', 'https://i.imgur.com/llGqCrR.gifv', 'https://i.imgur.com/llGqCrR.mp4'),
                    ('Imgur single image', 'https://imgur.com/llGqCrR', 'https://i.imgur.com/llGqCrR.gif'),
                ]:
                    if engine == 'webkit' and provider.startswith('Imgur'):
                        # WebKit's native media requests bypass Playwright routes.
                        # The real host returns HTTP 429 here; Chromium/Firefox
                        # cover the fixture, not a fabricated live Imgur result.
                        print('SKIP ' + label + ' ' + provider + ': Imgur HTTP 429; native media bypasses test routes', flush=True)
                        continue
                    provider_event = text_message(provider_body)
                    provider_row = page.locator('[data-message-id="' + provider_event['event_id'] + '"]')
                    if provider == 'Imgur GIFV':
                        page.wait_for_function('(row) => row.querySelector("video")?.videoWidth > 0', arg=provider_row.element_handle())
                        check(label + ' GIFV plays as muted looping video', provider_row.locator('video').evaluate('(el) => el.loop && el.muted && el.autoplay'))
                    else:
                        page.wait_for_function('({row, src}) => Array.from(row.querySelectorAll("img")).some(el => el.src === src && el.naturalWidth > 0)', arg={'row': provider_row.element_handle(), 'src': provider_src})
                        if os.environ.get('LIVE_GIF_PROVIDERS') and width == 1400 and provider in ['GIPHY', 'Tenor']:
                            check_animation(label + ' ' + provider, provider_row.locator('img[src="' + provider_src + '"]'), page)
                    check(label + ' ' + provider + ' share renders without Matrix API', not provider_requests)
                    check(label + ' ' + provider + ' original link retained', provider_row.locator('a[href="' + provider_body + '"]').count() >= 1)
                # Real upload through the file picker, with an omitted browser MIME type.
                for filename, data, mime, expected in [('meme.gif', gif, '', 'm.image'), ('clip.webm', clip, 'application/octet-stream', 'm.video')]:
                    unique_name = label + '-' + filename
                    with page.expect_file_chooser() as chosen:
                        page.get_by_role('button', name='Прикрепить', exact=True).click()
                        page.get_by_text('Файл', exact=True).click()
                    chosen.value.set_files({'name': unique_name, 'mimeType': mime, 'buffer': data})
                    page.get_by_role('button', name='Отправить', exact=True).wait_for(timeout=30000)
                    page.get_by_role('button', name='Отправить', exact=True).click()
                    upload = wait_event(token, room, lambda e: e.get('content', {}).get('body') == unique_name)
                    jump_latest()
                    content = upload['content']
                    check(label + ' upload MIME inference ' + filename, content['msgtype'] == expected and content['info']['mimetype'].startswith('image/' if expected == 'm.image' else 'video/'))
                    check(label + ' original upload bytes retained ' + filename, content['info']['size'] == len(data))
                    upload_row = page.locator('[data-message-id="' + upload['event_id'] + '"]')
                    if expected == 'm.video':
                        upload_row.get_by_role('button', name='Watch', exact=True).click()
                        page.wait_for_function('(row) => row.querySelector("video")?.videoWidth === 160', arg=upload_row.element_handle())
                    else:
                        page.wait_for_function('(row) => Array.from(row.querySelectorAll("img")).some(img => img.naturalWidth === 2)', arg=upload_row.element_handle())
                    check(label + ' uploaded media plays ' + filename)
                page.screenshot(path=str(OUT / (label + '-media.png')))
                check(label + ' no viewport overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
                if width > 600:
                    nav = page.get_by_role('group', name='Активные треды', exact=True)
                    nav.wait_for()
                    more = nav.get_by_role('button', name='Показать ещё 2', exact=True)
                    check(label + ' compact more-threads control', more.bounding_box()['height'] <= 25)
                    room_link = page.get_by_role('link').filter(has_text='Media review ' + run).first
                    page.mouse.move(width - 5, 5)
                    check(label + ' thread arrow hidden without hover', page.get_by_role('button', name='Свернуть треды', exact=True).count() == 0)
                    room_link.hover()
                    arrow = page.get_by_role('button', name='Свернуть треды', exact=True)
                    arrow.wait_for()
                    options = arrow.locator('..').get_by_role('button', name='More Options', exact=True)
                    check(label + ' arrow precedes rightmost menu', arrow.bounding_box()['x'] < options.bounding_box()['x'])
                    check(label + ' arrow has no count', arrow.inner_text().strip() == '')
                    more.click(); check(label + ' expands remaining threads', nav.get_by_role('button').filter(has_text='THREAD').count() == 5)
                    room_link.hover(); arrow.click(); check(label + ' collapses all threads', nav.count() == 0)
                    room_link.hover(); page.get_by_role('button', name='Показать треды', exact=True).click()
                    page.screenshot(path=str(OUT / (label + '-navigation.png')))
                if engine == 'chromium' and width == 1400:
                    page.evaluate('localStorage.setItem("settings", JSON.stringify({mediaAutoLoad:false,urlPreview:true}))')
                    page.reload(); editor.wait_for(timeout=30000); jump_latest()
                    manual_body = media_base + '/loop.gif?manual-' + label
                    manual = text_message(manual_body)
                    manual_row = page.locator('[data-message-id="' + manual['event_id'] + '"]')
                    manual_row.get_by_role('button', name='Load media preview', exact=True).wait_for()
                    check(label + ' automatic media disabled leaves a load button', manual_row.locator('img[src^="' + media_base + '"]').count() == 0)
                    manual_row.get_by_role('button', name='Load media preview', exact=True).click()
                    page.wait_for_function('(row) => Array.from(row.querySelectorAll("img")).some(img => img.naturalWidth === 2)', arg=manual_row.element_handle())
                    check(label + ' explicit click loads media when automatic loading is disabled')
                    manual_share = text_message(share_body + '&manual=' + label)
                    manual_share_row = page.locator('[data-message-id="' + manual_share['event_id'] + '"]')
                    manual_share_row.get_by_role('button', name='Load media preview', exact=True).wait_for()
                    check(label + ' provider respects disabled automatic media loading', manual_share_row.locator('iframe').count() == 0)
                    manual_share_row.get_by_role('button', name='Load media preview', exact=True).click()
                    manual_share_row.frame_locator('iframe').locator('img').wait_for()
                    check(label + ' provider loads after explicit click')
                    page.evaluate('localStorage.setItem("settings", JSON.stringify({mediaAutoLoad:false,urlPreview:false}))')
                    page.reload(); editor.wait_for(timeout=30000); jump_latest()
                    manual_row.wait_for()
                    manual_share_row.wait_for()
                    check(label + ' disabling URL previews prevents provider embeds', manual_share_row.locator('iframe').count() == 0 and manual_share_row.get_by_role('button', name='Load media preview', exact=True).count() == 0)
                    check(label + ' disabling URL previews preserves only the original link', manual_row.locator('a[href="' + manual_body + '"]').count() == 1 and manual_row.locator('img[src^="' + media_base + '"]').count() == 0 and manual_row.get_by_role('button', name='Load media preview', exact=True).count() == 0)
                check(label + ' no script errors', not errors)
            except Exception as error:
                print('FAIL', label, repr(error), flush=True)
                try:
                    page.screenshot(path=str(OUT / (label + '-failure.png')))
                    (OUT / (label + '-failure.txt')).write_text(page.locator('body').inner_text() + '\nERRORS ' + repr(errors) + '\nCONSOLE ' + repr(console_errors))
                except Exception:
                    (OUT / (label + '-crash.txt')).write_text(repr(error) + '\nERRORS ' + repr(errors) + '\nCONSOLE ' + repr(console_errors))
                raise
            finally:
                context.close()
        browser.close()
    media_server.shutdown()
