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
        expect(page.get_by_label('Сервер Matrix', exact=True)).to_be_visible()
        expect(page.get_by_label('Имя пользователя', exact=True)).to_be_visible()
        password = page.get_by_label('Пароль', exact=True)
        expect(password).to_have_attribute('type', 'password')
        page.get_by_role('button', name='Показать пароль', exact=True).click()
        expect(password).to_have_attribute('type', 'text')
        page.get_by_role('button', name='Скрыть пароль', exact=True).click()
        expect(password).to_have_attribute('type', 'password')
        results.append(engine + ': named login fields and password visibility toggle')
        if os.environ.get('AXE_SCRIPT_URL'):
            page.add_script_tag(url=os.environ['AXE_SCRIPT_URL'])
            audit = page.evaluate("async () => await axe.run(document, {runOnly:{type:'rule',values:['button-name','label','aria-allowed-attr','color-contrast']}, resultTypes:['violations']})")
            (OUT / (engine + '-login-accessibility.json')).write_text(json.dumps(audit, ensure_ascii=False, indent=2))
            assert not audit['violations'], [(v['id'], [n['target'] for n in v['nodes']]) for v in audit['violations']]
            results.append(engine + ': login axe names, labels, ARIA and contrast')
        reset_href = page.get_by_role('link', name='Забыли пароль?', exact=True).get_attribute('href')
        providers = None
        page.reload()
        expect(page.get_by_role('link', name='Войти через SSO', exact=True)).to_be_visible(timeout=30000)
        results.append(engine + ': generic SSO has Russian visible and accessible label')
        page.get_by_role('link', name='Зарегистрироваться', exact=True).click()
        expect(page.get_by_label('Имя пользователя', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_label('Пароль', exact=True)).to_be_visible()
        expect(page.get_by_label('Подтвердите пароль', exact=True)).to_be_visible()
        results.append(engine + ': registration fields have distinct visible labels')
        page.goto(APP + reset_href)
        expect(page.get_by_label('Почта', exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_label('Новый пароль', exact=True)).to_be_visible()
        expect(page.get_by_label('Подтвердите пароль', exact=True)).to_be_visible()
        results.append(engine + ': password reset fields have distinct visible labels')
        context.close()
        browser.close()
for result in results: print('PASS ' + result, flush=True)
(OUT / 'summary.json').write_text(json.dumps({'passed': len(results), 'checks': results}, ensure_ascii=False, indent=2))
