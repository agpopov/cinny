"""Check the actual Folds Input and source focus rules without building the app."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

fixture = json.loads(Path('/tmp/cinny-thread-title-source.json').read_text())
output = Path(os.environ.get('TEST_OUTPUT', 'artifacts/thread-content-source-20261029'))
output.mkdir(parents=True, exist_ok=True)


def rule(selector, styles):
    declarations, nested = [], []
    for key, value in styles.items():
        if key == 'selectors':
            nested.extend(rule(child.replace('&', selector), row) for child, row in value.items())
        else:
            prop = key if key.startswith('--') else ''.join('-' + char.lower() if char.isupper() else char for char in key)
            declarations.append(prop + ':' + str(value))
    return selector + '{' + ';'.join(declarations) + '}' + ''.join(nested)


css = fixture['folds'] + fixture['global'] + ''.join(rule(row['selector'], row['styles']) for row in fixture['rules'])
css += 'body{padding:24px;font:16px sans-serif}label{display:block;margin-bottom:8px}input{font-family:inherit}'
checks = []
with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        for theme, class_name in fixture['themes'].items():
            page = browser.new_page(viewport={'width': 390, 'height': 350})
            page.set_content('<html class="' + theme + ' ' + class_name + '"><head><style>' + css + '</style></head><body class="' + fixture['bodyClass'] + '">' + fixture['html'] + '</body></html>')
            # Keyboard focus must lose only the title outline; the shared rule
            # remains active for unrelated inputs, including in dark themes.
            page.keyboard.press('Tab')
            assert page.locator('#title').evaluate('(el) => el === document.activeElement')
            focus = page.locator('#title').evaluate('(el) => ({outline:getComputedStyle(el).outlineStyle, border:getComputedStyle(el.parentElement).boxShadow, color:getComputedStyle(el).color, background:getComputedStyle(el.parentElement).backgroundColor})')
            assert focus['outline'] == 'none', focus
            assert focus['border'] != 'none', focus
            assert focus['color'] != focus['background'], focus
            page.screenshot(path=str(output / (engine + '-' + theme + '-title.png')))
            page.keyboard.press('Tab')
            assert page.locator('#control').evaluate('(el) => getComputedStyle(el).outlineStyle') == 'solid'
            checks.append({'browser': engine, 'theme': theme, 'title_focus': focus, 'other_focus_preserved': True})
            page.close()
        browser.close()
(output / 'focus-checks.json').write_text(json.dumps({'scope': 'installed Input and source CSS, without an application build', 'checks': checks}, indent=2))
print('PASS: title focus and unaffected keyboard navigation in 6 themes × 2 browsers')
