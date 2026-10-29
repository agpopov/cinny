"""Exercise thread creation in every supported theme, on desktop and narrow screens."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from new_threads import assert_new_thread

THEMES = ['light-theme', 'silver-theme', 'telegram-theme', 'dark-theme', 'butter-theme', 'telegram-dark-theme']
APP = os.environ.get('APP_URL', 'http://127.0.0.1:18085')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/thread-themes-20261029'))
OUT.mkdir(exist_ok=True, parents=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])
    for theme in THEMES:
        context = browser.new_context(viewport={'width':1400,'height':950}, service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(APP + '/config.json')
        assert_new_thread(page, OUT / theme, check_mobile=True, theme_id=theme)
        assert not errors, errors
        print('PASS theme ' + theme + ': desktop/mobile creation, retry and reload', flush=True)
        context.close()
    browser.close()
(OUT / 'summary.json').write_text(json.dumps({'themes': THEMES, 'desktop_width':1400, 'mobile_width':390, 'passed':True}, indent=2))
