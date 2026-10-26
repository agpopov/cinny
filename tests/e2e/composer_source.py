"""Browser regression probe of source callbacks, Slate and message action styles.

Prepare with `node tests/fixtures/composer-browser.mjs`. This fixture uses native
TS stripping and installed JS dependencies; no app compilation/build is needed.
This is an isolated source probe, not an end-to-end test of a rebuilt app.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

FIXTURE = json.loads(Path(os.environ.get('COMPOSER_FIXTURE', '/tmp/cinny-composer-fixture.json')).read_text())
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/composer-source'))
OUT.mkdir(parents=True, exist_ok=True)
checks = []


def css_rules(selector, styles):
    declarations = []
    result = []
    for name, value in styles.items():
        if name == 'selectors':
            for child, rule in value.items():
                result.append(css_rules(child.replace('&', selector), rule))
        elif name in ('@media', '@container'):
            for query, rule in value.items():
                result.append(name + ' ' + query + '{' + css_rules(selector, rule) + '}')
        else:
            prop = ''.join('-' + char.lower() if char.isupper() else char for char in name)
            declarations.append(prop + ':' + str(value) + ('px' if isinstance(value, (float, int)) and name not in ('opacity', 'zIndex', 'gridColumn', 'gridRow') else ''))
    return selector + '{' + ';'.join(declarations) + '}' + ''.join(result)


CSS = ':root{' + ';'.join(key + ':' + value for key, value in FIXTURE['variables'].items()) + '}'
CSS += ''.join(css_rules(row['selector'], row['styles']) for row in FIXTURE['rules'])
CSS += '''body {margin:0;font:16px sans-serif} * {box-sizing:border-box}
.message {padding:4px 8px 4px 16px;border:1px solid #ddd;margin:12px 0}
.layout {display:flex;gap:12px;min-width:0}.content {flex:1;min-width:0}
.header {display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline}
.username {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
time {flex-shrink:0;font-size:12px}.text {overflow-wrap:anywhere}
.actions {display:flex;gap:4px}.actions button {width:32px;height:32px;border:0;flex-shrink:0}
.avatar {width:36px;flex-shrink:0}.bubble {border-radius:12px;background:#ddd;padding:8px;max-width:800px}
.compact .header {width:170px;max-width:100%;flex-shrink:0;align-self:start}
'''


def intersects(a, b):
    return a['x'] < b['x'] + b['width'] and b['x'] < a['x'] + a['width'] and a['y'] < b['y'] + b['height'] and b['y'] < a['y'] + a['height']


def layout_html():
    styles = FIXTURE['styles']
    actions = '<div class="' + styles['MessageOptionsBase'] + '" data-visible="false"><div class="' + styles['MessageOptionsBar'] + '"><div class="actions">'
    actions += ''.join('<button>+</button>' for _ in range(4))
    actions += '<button data-message-actions aria-label="Действия сообщения">⋮</button></div></div></div>'
    result = ''
    for layout in ['modern', 'bubble', 'compact']:
        for collapsed in [False, True]:
            header = '<div class="header"><b class="username">Александр с длинным именем</b><time>26 окт. 2026 17:49</time></div>' if not collapsed else ''
            text = '<div class="text">Сообщение с длинной строкой ' + 'x' * 180 + '</div>'
            if layout == 'compact':
                content = header + '<div class="content">' + text + '</div>'
            else:
                content = '<div class="avatar">AT</div><div class="content">' + header + '<div class="' + ('bubble' if layout == 'bubble' else '') + '">' + text + '</div></div>'
            result += '<div class="message ' + styles['MessageBase'] + ' ' + layout + '">' + actions + '<div class="layout">' + content + '</div></div>'
    return result


with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        browser = getattr(p, engine).launch(**({'args': ['--no-sandbox']} if engine == 'chromium' else {}))
        for touch in [False, True]:
            context = browser.new_context(has_touch=touch, viewport={'width': 1280, 'height': 900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.set_content('<div id="composer"></div><div id="timeline"></div>')
            page.add_script_tag(content=FIXTURE['runtime'])
            editor = page.get_by_test_id('editor')
            expect(editor).to_be_visible()
            editor.click()
            # Both keyboard typing (native Latin insertion) and Cyrillic insertion.
            for first, second in [('first message', 'next message'), ('Первое сообщение', 'Следующее сообщение')]:
                initial_requests = page.evaluate('probe.requests.length')
                page.evaluate('probe.holdPreparation = true')
                page.keyboard.type(first) if first.isascii() else page.keyboard.insert_text(first)
                editor.press('Enter')
                expect(editor).to_have_text('')
                expect(editor).to_be_focused()
                page.keyboard.type(second) if second.isascii() else page.keyboard.insert_text(second)
                expect(editor).to_have_text(second)
                page.evaluate('probe.releasePreparation()')
                page.wait_for_function('(count) => probe.requests.length > count', arg=initial_requests)
                page.evaluate('probe.requests.at(-1).resolve({event_id:"$sent"})')
                expect(page.get_by_test_id('send')).to_be_enabled()
                expect(editor).to_have_text(second)
                editor.press('Control+a')
                page.keyboard.press('Backspace')
            checks.append(f'{engine} touch={touch}: immediate typing and focus while preparation/HTTP are pending, Latin and Cyrillic')

            page.evaluate('probe.holdPreparation = false; probe.setEnterForNewline(true)')
            page.wait_for_function('probe.enterForNewline === true')
            page.keyboard.insert_text('строка 1')
            editor.press('Enter')
            page.keyboard.insert_text('строка 2')
            assert page.evaluate('probe.editor.children.length') == 2, page.evaluate('probe.editor.children')
            editor.press('Control+Enter')
            expect(editor).to_have_text('')
            expect(editor).to_be_focused()
            page.keyboard.insert_text('новый текст')
            page.evaluate('probe.requests.at(-1).reject(new Error("Send denied"))')
            expect(page.get_by_test_id('error')).to_contain_text('Send denied')
            expect(editor).to_have_text('новый текст')
            initial_requests = page.evaluate('probe.requests.length')
            page.get_by_test_id('retry').click()
            page.wait_for_function('(count) => probe.requests.length > count', arg=initial_requests)
            expect(page.get_by_test_id('error')).to_have_text('')
            page.evaluate('probe.requests.at(-1).resolve({event_id:"$retry"})')
            expect(page.get_by_test_id('send')).to_be_enabled()
            expect(editor).to_have_text('новый текст')
            checks.append(f'{engine} touch={touch}: multiline Enter, Ctrl+Enter and failed-message retry preserve the next draft')

            editor.click()
            editor.press('Control+a')
            page.keyboard.insert_text('Отправка кнопкой')
            initial_requests = page.evaluate('probe.requests.length')
            page.get_by_test_id('send').click()
            expect(editor).to_be_focused()
            expect(editor).to_have_text('')
            page.keyboard.insert_text('Продолжение после кнопки')
            page.wait_for_function('(count) => probe.requests.length > count', arg=initial_requests)
            page.evaluate('probe.requests.at(-1).resolve({event_id:"$button"})')
            expect(page.get_by_test_id('send')).to_be_enabled()
            expect(editor).to_have_text('Продолжение после кнопки')
            checks.append(f'{engine} touch={touch}: send button retains composer focus and permits typing during HTTP')

            page.locator('#timeline').evaluate('(node, html) => node.innerHTML = html', layout_html())
            page.add_style_tag(content=CSS)
            for width in [320, 360, 390, 768, 1024, 1920]:
                page.set_viewport_size({'width': width, 'height': 1000})
                for message in page.locator('.message').all():
                    bar = message.locator('[data-visible]')
                    action = message.locator('[data-message-actions]')
                    bar.evaluate('node => node.style.display = "none"')
                    without_actions = message.locator('.layout').bounding_box()
                    bar.evaluate('node => node.style.display = ""')
                    before = message.locator('.layout').bounding_box()
                    assert before == without_actions, (engine, width, 'actions reserve message width', before, without_actions)
                    bar.evaluate('node => node.dataset.visible = "true"')
                    bar.evaluate('node => window.positionMessageOptions(node)')
                    after = message.locator('.layout').bounding_box()
                    assert before == after, (engine, width, 'hover reflow', before, after)
                    for time in message.locator('time').all():
                        assert not intersects(time.bounding_box(), bar.bounding_box()), (engine, width, message.get_attribute('class'), time.bounding_box(), bar.bounding_box(), 'date/action overlap')
                    rect = action.bounding_box()
                    assert rect['x'] >= 0 and rect['x'] + rect['width'] <= width, (engine, width, rect)
                    if width <= 600 or touch:
                        assert message.locator('.actions button:visible').count() == 1
                    bar.evaluate('node => node.dataset.visible = "false"')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (engine, width, 'horizontal overflow')
                page.screenshot(path=str(OUT / f'{engine}-{touch}-{width}.png'), full_page=True)
            checks.append(f'{engine} touch={touch}: floating actions preserve full message width and avoid date overlap at 320,360,390,768,1024,1920px in modern,bubble,compact layouts')
            assert not errors, errors
            context.close()
        browser.close()
        print('\n'.join(checks[-8:]), flush=True)
(OUT / 'summary.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2))
