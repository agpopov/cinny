"""Real Matrix messages and production UI; provider documents are explicit fixtures.

All engines exercise sandboxed frames with actual inline WebM playback. This does
not assert that restricted/removed videos are playable on the public providers.
"""
import base64
import json
import os
import re
import time
import urllib.request
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18085').rstrip('/')
HS = os.environ.get('HS_URL', 'http://127.0.0.1:18008').rstrip('/')
BROWSER_HS = os.environ.get('BROWSER_HS_URL', HS).rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/p2-2026-10-22/video'))
OUT.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
results = []


def api(method, path, token=None, body=None):
    req = urllib.request.Request(HS + path, method=method, headers={
        'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {}),
    })
    with opener.open(req, json.dumps(body).encode() if body is not None else None, timeout=40) as response:
        return json.loads(response.read() or b'{}')


def check(label, condition=True):
    assert condition, label
    results.append(label)
    print('PASS ' + label, flush=True)


def send(token, room, body, extra=None):
    return api('PUT', f'/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}', token,
               {'msgtype': 'm.text', 'body': body, **(extra or {})})['event_id']


clip = base64.b64encode(Path(os.environ['VIDEO_FIXTURE']).read_bytes()).decode()
fixture = '''<!doctype html><html lang="ru"><meta charset="utf-8"><title>Provider fixture</title>
<style>html,body{margin:0;background:#111;color:white}video{display:block;width:100%;height:140px}button{font-size:18px}</style>
<video controls playsinline src="data:video/webm;base64,''' + clip + '''"></video>
<button onclick="document.querySelector('video').play()">Воспроизвести тестовое видео</button>
<script>try { parent.document.body; document.body.dataset.isolated='false'; }
catch { document.body.dataset.isolated='true'; }</script></html>'''
links = [
    ('YouTube', 'https://youtu.be/M7lc1UVf-VE?t=1m23s&si=tracking'),
    ('Vimeo', 'https://vimeo.com/76979871'),
    ('Rutube', 'https://rutube.ru/video/7716bd3e665725c3c008ae7ab4ff02e2/'),
    ('VK Видео', 'https://vkvideo.ru/video-31805219_456244301'),
    ('Dailymotion', 'https://www.dailymotion.com/video/x84sh87'),
    ('Twitch', 'https://twitch.tv/videos/40464143'),
]

with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        launch = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit': launch['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**launch)
        for width in [int(value) for value in os.environ.get('WIDTHS', '390,1400').split(',')]:
            label = f'{engine}/{width}'
            run = uuid.uuid4().hex[:9]
            session = api('POST', '/_matrix/client/v3/register', body={
                'username': 'video' + run, 'password': 'pass123', 'auth': {'type': 'm.login.dummy'},
            })
            token = session['access_token']
            name = 'Канал ' + run
            room = api('POST', '/_matrix/client/v3/createRoom', token, {'name': name})['room_id']
            root = send(token, room, 'Название треда ' + run)
            send(token, room, 'Ответ в треде', {'m.relates_to': {'rel_type': 'm.thread', 'event_id': root,
                'is_falling_back': True, 'm.in_reply_to': {'event_id': root}}})
            context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block', ignore_https_errors=True)
            page = context.new_page()
            errors, requests, matrix_previews = [], [], []
            page.on('pageerror', lambda error, sink=errors: sink.append({'message':str(error),'stack':error.stack}))
            def player_fixture(route):
                requests.append({'url': route.request.url, 'referer': route.request.headers.get('referer')})
                route.fulfill(content_type='text/html', body=fixture)
            context.route(re.compile(r'^https://(www\.youtube-nocookie\.com/embed/|player\.vimeo\.com/video/|rutube\.ru/play/embed/|vkvideo\.ru/video_ext.php|www\.dailymotion\.com/embed/video/|player\.twitch\.tv/|clips\.twitch\.tv/embed)'), player_fixture)
            def preview_error(route):
                matrix_previews.append(route.request.url)
                route.fulfill(status=404, json={'errcode': 'M_UNRECOGNIZED', 'error': 'Preview disabled'})
            context.route(re.compile(r'/_matrix/.*/preview_url'), preview_error)
            context.route('https://localhost/.well-known/matrix/client', lambda route: route.fulfill(json={'m.homeserver':{'base_url':BROWSER_HS}}))
            try:
                page.goto(APP.split('/#', 1)[0] + '/config.json')
                page.evaluate('s => {for (const [k,v] of Object.entries(s)) localStorage.setItem("cinny_"+k,v)}', {
                    'access_token': token, 'device_id': session['device_id'], 'user_id': session['user_id'], 'hs_base_url': BROWSER_HS,
                })
                page.evaluate('localStorage.setItem("settings",JSON.stringify({urlPreview:true,mediaAutoLoad:true,isNotificationSounds:false,useSystemTheme:false,themeId:"dark-theme"}))')
                room_url = APP + '/home/' + room + '/'
                page.goto(room_url)
                editor = page.locator('[data-editable-name="RoomInput"]')
                editor.wait_for(timeout=45000)
                page.keyboard.press('Escape')
                if width == 390:
                    page.get_by_role('button', name='Назад', exact=True).first.click()
                nav = page.get_by_role('group', name='Активные треды', exact=True)
                expect(nav).to_be_visible(timeout=30000)
                room_name = page.get_by_role('link').filter(has_text=name).first.get_by_text(name, exact=True)
                thread_name = nav.get_by_text('Название треда ' + run, exact=True)
                room_style = room_name.evaluate('(e)=>({weight:+getComputedStyle(e).fontWeight,size:parseFloat(getComputedStyle(e).fontSize)})')
                thread_style = thread_name.evaluate('(e)=>({weight:+getComputedStyle(e).fontWeight,size:parseFloat(getComputedStyle(e).fontSize)})')
                check(label + ' room names are heavier and larger than thread names', room_style['weight'] > thread_style['weight'] and room_style['size'] > thread_style['size'])
                check(label + ' thread guide is visible', nav.evaluate('(e)=>getComputedStyle(e,"::before").content') == '""')
                page.screenshot(path=str(OUT / (label.replace('/', '-') + '-sidebar.png')))
                if width == 390: page.get_by_role('link').filter(has_text=name).first.click()
                def change_settings(switches=None, theme=None):
                    page.evaluate('document.documentElement.style.fontSize=""')
                    settings = page.get_by_role('button', name='Настройки пользователя', exact=True)
                    if not settings.is_visible():
                        page.get_by_role('button', name='Назад', exact=True).first.click()
                    settings.click()
                    if width == 390: page.get_by_text('Основные', exact=True).click()
                    for title, enabled in (switches or {}).items():
                        switch = page.get_by_role('switch', name=title, exact=True)
                        if switch.get_attribute('aria-checked') != str(enabled).lower(): switch.click()
                    if theme:
                        current = json.loads(page.evaluate('localStorage.getItem("settings")'))['themeId']
                        labels = {'dark-theme':'Тёмная','light-theme':'Светлая'}
                        page.get_by_role('button', name=labels[current], exact=True).click()
                        page.get_by_text(labels[theme], exact=True).last.click()
                    page.get_by_role('button', name='Закрыть', exact=True).last.click()
                    if width == 390:
                        page.get_by_role('button', name='Закрыть', exact=True).last.click()
                        page.get_by_role('link').filter(has_text=name).first.click()
                    editor.wait_for(timeout=30000)
                for provider, link in links:
                    event = send(token, room, link)
                    page.wait_for_timeout(350)
                    latest = page.get_by_role('button', name='К последним сообщениям', exact=True)
                    if latest.count(): latest.click()
                    row = page.locator(f'[data-message-id="{event}"]')
                    row.wait_for(timeout=30000)
                    if provider == 'Twitch' and not APP.startswith('https:'):
                        expect(row.get_by_text(re.compile('доступен на HTTPS'))).to_be_visible()
                        check(label + ' Twitch shows original link when HTTPS is unavailable', row.locator('iframe').count() == 0 and row.locator(f'a[href="{link}"]').count() >= 1)
                        continue
                    if provider == 'Rutube' and width == 390:
                        expect(row.get_by_text(re.compile('более широкое окно'))).to_be_visible()
                        check(label + ' Rutube keeps a fallback link below its minimum player width', row.locator('iframe').count() == 0)
                        continue
                    frame = row.locator('iframe')
                    expect(frame).to_have_attribute('title', 'Видеоплеер ' + provider)
                    expect(frame).to_have_attribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
                    expect(frame).to_have_attribute('referrerpolicy', 'strict-origin')
                    expect(row.frame_locator('iframe').locator('body')).to_have_attribute('data-isolated', 'true')
                    check(label + ' ' + provider + ' local preview with isolated player and fallback link', row.locator(f'a[href="{link}"]').count() >= 1)
                    player = row.frame_locator('iframe')
                    player.get_by_role('button', name='Воспроизвести тестовое видео').click()
                    player.locator('video').evaluate('(v)=>new Promise((resolve,reject)=>{if(v.currentTime>0)return resolve();const t=setTimeout(()=>reject(Error("No playback")),15000);v.addEventListener("timeupdate",()=>{if(v.currentTime>0){clearTimeout(t);resolve();}},{once:true})})')
                    check(label + ' ' + provider + ' real inline video plays without autoplay permission')
                check(label + ' known providers need no Matrix preview API', not matrix_previews)
                (OUT / (label.replace('/', '-') + '-requests.json')).write_text(json.dumps(requests, indent=2))
                check(label + ' Referer contains only app origin', all(r['referer'] == APP.split('/#', 1)[0] + '/' for r in requests))
                page.screenshot(path=str(OUT / (label.replace('/', '-') + '-videos.png')))
                change_settings({'Отключить автозагрузку медиа':True})
                event = send(token, room, links[0][1] + '&manual=' + run)
                row = page.locator(f'[data-message-id="{event}"]')
                load = row.get_by_role('button', name='Загрузить видеоплеер YouTube', exact=True)
                expect(load).to_be_visible(timeout=30000)
                check(label + ' manual loading makes no player request', row.locator('iframe').count() == 0)
                load.click()
                expect(row.frame_locator('iframe').locator('body')).to_have_attribute('data-isolated', 'true')
                check(label + ' explicit action loads a disabled automatic preview')
                change_settings({'Предпросмотр ссылок':False,'Отключить автозагрузку медиа':False})
                expect(row).to_be_visible(timeout=30000)
                check(label + ' disabling previews leaves only message links', page.locator('iframe[title^="Видеоплеер"]').count() == 0)
                for theme in ['dark-theme', 'light-theme']:
                    change_settings({'Предпросмотр ссылок':True}, theme)
                    page.evaluate('document.documentElement.style.fontSize="200%"')
                    check(label + ' ' + theme + ' 200% font has no page overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'))
                check(label + ' no unhandled script errors', not errors)
            except Exception:
                page.screenshot(path=str(OUT / (label.replace('/', '-') + '-failure.png')))
                (OUT / (label.replace('/', '-') + '-failure.txt')).write_text(page.locator('body').inner_text() + '\n' + repr(errors))
                raise
            finally:
                context.close()
        browser.close()
(OUT / 'summary.json').write_text(json.dumps({'passed':len(results),'checks':results}, ensure_ascii=False, indent=2))
