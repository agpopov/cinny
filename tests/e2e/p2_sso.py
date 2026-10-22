"""Russian SSO labels on production assets; only the server login-flow response is a fixture."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

APP = os.environ['APP_URL'].rstrip('/')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/p2-2026-10-22/sso'))
OUT.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    for engine in ['chromium', 'firefox', 'webkit']:
        options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit': options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**options)
        # Keep server-flow fixtures visible to Playwright; SW behavior is tested separately.
        context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
        page = context.new_page()
        providers = [{'id': 'authentik', 'name': 'authentik'}]
        context.route(re.compile(r'/_matrix/client/(v3|r0)/login$'), lambda route: route.fulfill(json={'flows': [
            {'type': 'm.login.password'}, {'type': 'm.login.sso', **({'identity_providers': providers} if providers is not None else {})},
        ]}))
        page.goto(APP + '/login')
        link = page.get_by_role('link', name='Войти через authentik', exact=True)
        expect(link).to_be_visible(timeout=30000)
        assert 'authentik' in link.get_attribute('href')
        assert page.get_by_text('Continue with authentik', exact=True).count() == 0
        results.append(engine + ': provider SSO has Russian visible and accessible label')
        page.screenshot(path=str(OUT / (engine + '-sso.png')))
        providers = None
        page.reload()
        expect(page.get_by_role('link', name='Войти через SSO', exact=True)).to_be_visible(timeout=30000)
        results.append(engine + ': generic SSO has Russian visible and accessible label')
        context.close()
        browser.close()
for result in results: print('PASS ' + result, flush=True)
(OUT / 'summary.json').write_text(json.dumps({'passed': len(results), 'checks': results}, ensure_ascii=False, indent=2))
