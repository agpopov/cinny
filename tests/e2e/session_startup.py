"""Production-session regression with real SDK, WASM and browser persistence."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from session_fixture import ROOM, install_session_fixture, seed_session, assert_session_ready
from session_navigation import assert_client_navigation

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18088').rstrip('/')
HASH_ROUTER = os.environ.get('ROUTER_MODE', 'hash') == 'hash'
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/hotfix-4.12.18/startup'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []
with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**options)
        context = browser.new_context(service_workers='block')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: print(engine + ' ' + m.type + ': ' + m.text[:500], flush=True) if m.type == 'error' else None)
        requests = install_session_fixture(page, hash_router=HASH_ROUTER)
        print('START ' + engine, flush=True)
        page.goto(APP + '/config.json')
        seed_session(page)
        for phase in ['cold-cache', 'warm-cache-reload']:
            page.goto(APP + ('/#' if HASH_ROUTER else '') + '/home/' + ROOM + '/')
            try:
                assert_session_ready(page)
            except Exception:
                (OUT / (engine + '-failure.json')).write_text(json.dumps({'requests': requests, 'errors': errors, 'body': page.locator('body').inner_text()}, indent=2))
                page.screenshot(path=str(OUT / (engine + '-failure.png')))
                raise
            checks.append(engine + ': ' + phase + ', saved session, IndexedDB, Rust crypto and rendered room without global alias')
            page.screenshot(path=str(OUT / (engine + '-' + phase + '.png')))
            print('PASS ' + checks[-1], flush=True)
            # Let startup key queries finish before navigation aborts the page.
            page.wait_for_timeout(1500)
        checks.extend(engine + ': ' + item for item in assert_client_navigation(page, OUT / engine))
        assert any(r['path'].endswith('/sync') for r in requests), requests
        assert any(r['path'].endswith('/keys/upload') for r in requests), requests
        assert not any('/join/' in r['path'] or r['path'].endswith('/join') for r in requests), requests
        assert not errors, errors
        (OUT / (engine + '-requests.json')).write_text(json.dumps(requests, indent=2))
        context.close()
        browser.close()
(OUT / 'summary.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, indent=2))
