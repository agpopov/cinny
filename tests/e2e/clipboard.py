"""Clipboard attachments through the real room editor, with Matrix HTTP fixtures."""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from session_fixture import ROOM, DIRECT, install_session_fixture, seed_session, assert_session_ready

APP = os.environ.get('APP_URL', 'http://127.0.0.1:18102')
OUT = Path(os.environ.get('TEST_OUTPUT', 'artifacts/linux-clipboard'))
OUT.mkdir(parents=True, exist_ok=True)
png = base64.b64encode(Path('public/res/apple/apple-touch-icon-57x57.png').read_bytes()).decode()
checks = []

with sync_playwright() as p:
    for engine in ['chromium', 'firefox']:
        browser = getattr(p, engine).launch()
        page = browser.new_page()
        install_session_fixture(page)
        page.goto(APP + '/config.json')
        seed_session(page)
        page.goto(APP + '/#/home/' + ROOM + '/')
        assert_session_ready(page)
        editor = page.locator('[data-editable-name="RoomInput"]')
        page.evaluate("""() => {window.pasteData=(node,data)=>{
          const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true});
          // Firefox ignores clipboardData in the synthetic event constructor.
          Object.defineProperty(event,'clipboardData',{value:data});node.dispatchEvent(event);
        };}""")
        editor.click()
        editor.evaluate('''(node,png)=>{
          const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
          const data=new DataTransfer();data.items.add(new File([bytes],'clipboard.png',{type:'image/png'}));
          pasteData(node,data);
        }''', png)
        expect(page.get_by_alt_text('clipboard.png', exact=True)).to_have_count(1)
        expect(editor.locator('img')).to_have_count(0)
        checks.append(engine + ': standard pasted screenshot attaches once outside the message text')
        page.get_by_label('Отменить загрузку', exact=True).click()
        expect(page.get_by_alt_text('clipboard.png', exact=True)).to_have_count(0)

        # Enable the Linux bridge after startup, then mount a fresh room input.
        # Native system clipboard and PNG encoding are separately tested in linux_clipboard.py.
        page.evaluate('''() => {
          window.isTauri=true;window.clipboardCalls=[];window.holdClipboard=false;
          window.__TAURI_INTERNALS__={invoke:async(command,payload)=>{
            clipboardCalls.push(command);
            if(command==='plugin:clipboard-manager|read_image') {
              if(holdClipboard) await new Promise(resolve=>window.releaseClipboard=resolve);
              return 7;
            }
            if(command==='plugin:image|size')return {width:2,height:1};
            if(command==='plugin:image|rgba')return new Uint8Array([255,0,0,255,0,255,0,255]);
            if(command==='plugin:resources|close')return;
            throw new Error(command);
          }};
        }''')
        page.evaluate('(room)=>{location.hash="/direct/"+room+"/"}', DIRECT)
        expect(page.get_by_text('Direct conversation is open', exact=True)).to_be_visible()
        expect(editor).to_have_attribute('contenteditable', 'true')
        editor.click()
        editor.evaluate('''node=>pasteData(node,new DataTransfer())''')
        expect(page.locator('img[alt^="screenshot-"]')).to_have_count(1)
        expect(editor.locator('img')).to_have_count(0)
        assert page.evaluate('clipboardCalls.filter(c=>c==="plugin:clipboard-manager|read_image").length') == 1
        checks.append(engine + ': empty Linux WebView paste reaches native bridge and adds one PNG to the real upload queue')
        page.get_by_label('Отменить загрузку', exact=True).click()
        expect(page.locator('img[alt^="screenshot-"]')).to_have_count(0)

        editor.click()
        editor.evaluate('''node=>{const data=new DataTransfer();data.setData('text/plain','Clipboard text');pasteData(node,data);}''')
        expect(editor).to_contain_text('Clipboard text')
        assert page.evaluate('clipboardCalls.filter(c=>c==="plugin:clipboard-manager|read_image").length') == 1
        checks.append(engine + ': Linux fallback preserves ordinary text paste')

        page.evaluate('holdClipboard=true')
        editor.evaluate('''node=>pasteData(node,new DataTransfer())''')
        page.wait_for_function('typeof releaseClipboard === "function"')
        page.evaluate('(room)=>{location.hash="/home/"+room+"/"}', ROOM)
        expect(page.get_by_text('Saved session restored with real Matrix SDK and Rust crypto', exact=True)).to_be_visible()
        page.evaluate('releaseClipboard()')
        page.wait_for_timeout(200)
        expect(page.locator('img[alt^="screenshot-"]')).to_have_count(0)
        checks.append(engine + ': switching rooms discards a pending native screenshot')
        page.screenshot(path=str(OUT / (engine + '-clipboard.png')))
        browser.close()
        for check in checks[-4:]: print('PASS ' + check, flush=True)
(OUT / 'editor-e2e.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2)+'\n')
