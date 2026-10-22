"""Browser checks of the real P2 hooks, streaming saver and attachment crypto.

The temporary harness compiles source modules, never substitutes their behavior.
"""
import functools
import json
import os
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('TEST_OUTPUT', ROOT / 'artifacts/p2-2026-10-22/sources'))
OUT.mkdir(parents=True, exist_ok=True)
HARNESS = Path('/tmp/cinny-p2-harness')
HARNESS.mkdir(exist_ok=True)
entry = '''
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useUserProfile } from './src/app/hooks/useUserProfile';
import { MatrixClientProvider } from './src/app/hooks/useMatrixClient';
import { useLiveTimelineRefresh } from './src/app/hooks/useLiveTimelineRefresh';
import { useRoomThreads } from './src/app/features/room/thread/useThread';
import { getNotificationAvatar } from './src/app/utils/notificationContent';
import { createClient, Room, MatrixEvent, RoomEvent } from 'matrix-js-sdk';
import { useInterval } from './src/app/hooks/useInterval';
import { useSharedClock } from './src/app/hooks/useSharedClock';
import { useLongPress } from './src/app/hooks/useLongPress';
import { useBackDismiss } from './src/app/hooks/useBackDismiss';
import { ownsNotifications, useNotificationOwner } from './src/app/hooks/useNotificationOwner';
import { streamMediaToDisk } from './src/app/utils/saveMedia';
import { downloadMedia } from './src/app/utils/media';
import { encryptFile, decryptFile } from './src/app/utils/matrix';
const root=createRoot(document.querySelector('#root'));
function Abandoned(){useInterval(()=>{},1000);throw new Promise(()=>{});}
function ProfileProbe({userId}){const profile=useUserProfile(userId);window.profile=profile;return <output id='profile'>{profile.displayName}</output>;}
function ResetProbe({room}){useLiveTimelineRefresh(room,undefined,()=>{window.resetCount++});return null;}
function ThreadProbe({room}){useRoomThreads(room);return null;}
function Clock(){useSharedClock();return null;}
function Probe(){
 const [room,setRoom]=React.useState(false),[thread,setThread]=React.useState(false),[menu,setMenu]=React.useState(false);
 useBackDismiss(room,()=>setRoom(false),0);useBackDismiss(thread,()=>setThread(false),10);useBackDismiss(menu,()=>setMenu(false),30);
 const press=useLongPress(()=>setMenu(true));
 return <div><button id="room" onClick={()=>setRoom(true)}>Room</button><button id="thread" onClick={()=>setThread(true)}>Thread</button><button id="menu" onClick={()=>setMenu(true)}>Menu</button><button id="dismiss" onClick={()=>{setMenu(false);setThread(false);setRoom(false)}}>Dismiss</button><div id="touch" {...press}>Hold<button id="interactive">Interactive</button></div><output id="state">{JSON.stringify({room,thread,menu})}</output></div>
}
function Owner(){const owner=useNotificationOwner('@p2:localhost');return <output id="owner">{String(owner)}</output>;}
Object.assign(window,{getNotificationAvatar,createClient,Room,MatrixEvent,RoomEvent,
 mountProfile:(mx,userId)=>flushSync(()=>root.render(<MatrixClientProvider value={mx}><ProfileProbe userId={userId}/></MatrixClientProvider>)),
 mountReset:room=>{window.resetCount=0;flushSync(()=>root.render(<ResetProbe room={room}/>));},
 mountThread:room=>flushSync(()=>root.render(<ThreadProbe room={room}/>)),flush:flushSync,
 streamMediaToDisk,downloadMedia,encryptFile,decryptFile,ownsNotifications,
 mountAbandoned:()=>flushSync(()=>root.render(<React.Suspense fallback={<span>Waiting</span>}><Abandoned/></React.Suspense>)),
 mountClocks:count=>flushSync(()=>root.render(<>{Array.from({length:count},(_,i)=><Clock key={i}/>)}</>)),
 mountProbe:()=>flushSync(()=>root.render(<Probe/>)),mountOwner:()=>flushSync(()=>root.render(<Owner/>)),unmount:()=>flushSync(()=>root.render(null))});
window.ready=true;
'''
build = 'import { build } from "esbuild"; await build({stdin:{contents:' + json.dumps(entry) + ',resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",define:{"process.env.NODE_ENV":"\\"production\\""},outfile:' + json.dumps(str(HARNESS / 'app.js')) + '});'
subprocess.run(['node', '--input-type=module', '-e', build], cwd=ROOT, check=True)
(HARNESS / 'index.html').write_text('''<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>
window.timers=new Set();const originalInterval=window.setInterval,originalClear=window.clearInterval;
window.setInterval=(...args)=>{const id=originalInterval(...args);timers.add(id);return id};window.clearInterval=id=>{timers.delete(id);originalClear(id)};
</script><script src="/app.js"></script></body></html>''')


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path.startswith('/large'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            if 'unknown' not in self.path:
                self.send_header('Content-Length', str(8 * 1024 * 1024))
            self.end_headers()
            try:
                for _ in range(128): self.wfile.write(bytes(65536))
            except (BrokenPipeError, ConnectionResetError): pass
        else: super().do_GET()


server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(HARNESS)))
threading.Thread(target=server.serve_forever, daemon=True).start()
checks = []
with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS', 'chromium,firefox,webkit').split(','):
        options = {'args': ['--no-sandbox', '--no-proxy-server']} if engine == 'chromium' else {}
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        browser = getattr(p, engine).launch(**options)
        context = browser.new_context()
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function('window.ready')
        def check(name, expression):
            assert page.evaluate(expression), engine + ': ' + name
            checks.append(engine + ': ' + name)
            print('PASS ' + checks[-1], flush=True)
        check('1000 mounted clocks share one timer and release it', '''() => {mountClocks(1000);const one=timers.size===1;unmount();return one&&timers.size===0}''')
        check('abandoned React render never starts an interval', '() => {mountAbandoned();const safe=timers.size===0;unmount();return safe&&timers.size===0}')
        check('receipts update thread badges without re-sorting the list', """() => {
          const mx=createClient({baseUrl:'https://test.invalid',userId:'@me:test',accessToken:'test',timelineSupport:true});
          mx.supportsThreads=()=>true;const room=new Room('!sort:test',mx,'@me:test');
          for(let i=0;i<30;i++){const root=new MatrixEvent({type:'m.room.message',event_id:'$root'+i,room_id:room.roomId,sender:'@me:test',origin_server_ts:i,content:{msgtype:'m.text',body:'root'}});room.createThread(root.getId(),root,[],false);}
          mountThread(room);const original=Array.prototype.sort;let sorts=0;
          Array.prototype.sort=function(...args){sorts++;return original.apply(this,args)};
          try{flush(()=>room.emit(RoomEvent.Receipt,new MatrixEvent({type:'m.receipt',content:{}}),room));return sorts===0;}finally{Array.prototype.sort=original;unmount();}
        }""")
        check('limited room sync refreshes a replaced live timeline', """() => {
          const mx=createClient({baseUrl:'https://test.invalid',userId:'@me:test',accessToken:'test',timelineSupport:true});
          const room=new Room('!reset:test',mx,'@me:test',{timelineSupport:true});mountReset(room);
          const previous=room.getLiveTimeline();room.resetLiveTimeline('back','forward');
          const ok=previous!==room.getLiveTimeline()&&window.resetCount===1;unmount();return ok;
        }""")
        check('profile lookup failure retains cached names without unhandled rejection', """async () => {
          const user={displayName:'Cached',avatarUrl:'mxc://test/cached',on(){},removeListener(){}};
          const mx={getUser:()=>user,getProfileInfo:async()=>{throw Error('offline')}};
          mountProfile(mx,'@cached:test');await new Promise(resolve=>setTimeout(resolve,30));
          const ok=profile.displayName==='Cached'&&profile.avatarUrl==='mxc://test/cached';unmount();return ok;
        }""")
        check('late profile responses cannot overwrite another selected user', """async () => {
          let oldResolve;
          const mx={getUser:id=>({displayName:id,on(){},removeListener(){}}),getProfileInfo:id=>id==='old'?new Promise(resolve=>oldResolve=resolve):Promise.resolve({displayname:'New server'})};
          mountProfile(mx,'old');mountProfile(mx,'new');oldResolve({displayname:'Late old user'});
          await new Promise(resolve=>setTimeout(resolve,30));const ok=profile.displayName==='New server';unmount();return ok;
        }""")
        check('avatar LRU evicts old entries and isolates renamed users and accounts', """async () => {
          const original=document.createElement;let canvases=0;
          document.createElement=function(name,...args){if(name==='canvas')canvases++;return original.call(this,name,...args)};
          const mx={baseUrl:'https://test.invalid',getUserId:()=> '@me:test'};
          try{
            for(let i=0;i<140;i++)await getNotificationAvatar(mx,false,'id'+i,'User '+i);
            const start=canvases;await getNotificationAvatar(mx,false,'id139','User 139');if(canvases!==start)return false;
            await getNotificationAvatar(mx,false,'id0','User 0');if(canvases!==start+1)return false;
            await getNotificationAvatar(mx,false,'id139','Renamed');if(canvases!==start+2)return false;
            await getNotificationAvatar({...mx,getUserId:()=> '@other:test'},false,'id139','Renamed');return canvases===start+3;
          }finally{document.createElement=original;}
        }""")
        page.evaluate('mountProbe()')
        page.locator('#room').click()
        history_depth = page.evaluate('history.length')
        page.reload();page.wait_for_function('window.ready');page.evaluate('mountProbe()');page.locator('#room').click()
        assert page.evaluate('history.length') == history_depth
        page.go_back();page.wait_for_function('!JSON.parse(document.querySelector("#state").textContent).room')
        checks.append(engine + ': reload reuses the room history guard');print('PASS ' + checks[-1], flush=True)
        for index in range(10):
            for id in ['room', 'thread', 'menu']: page.locator('#' + id).click()
            page.go_back()
            page.wait_for_function('!JSON.parse(document.querySelector("#state").textContent).menu')
            assert page.evaluate('JSON.parse(document.querySelector("#state").textContent).thread')
            page.go_back()
            page.wait_for_function('!JSON.parse(document.querySelector("#state").textContent).thread')
            assert page.evaluate('JSON.parse(document.querySelector("#state").textContent).room')
            page.go_back()
            page.wait_for_function('!JSON.parse(document.querySelector("#state").textContent).room')
        check('30 Back operations preserve layer order without orphan history guards', '() => history.length <= 4')
        page.locator('#room').click(); page.locator('#menu').click(); page.locator('#dismiss').click()
        page.wait_for_timeout(100)
        check('programmatic dismissal consumes its guard', '() => !JSON.parse(document.querySelector("#state").textContent).room')
        page.locator('#touch').dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 10, 'clientY': 10})
        page.wait_for_timeout(620)
        check('stationary hold opens menu', '() => JSON.parse(document.querySelector("#state").textContent).menu')
        page.locator('#dismiss').click();page.wait_for_timeout(100)
        page.locator('#touch').dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 10, 'clientY': 10})
        page.locator('#touch').dispatch_event('pointermove', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 10, 'clientY': 30})
        page.wait_for_timeout(620)
        check('scrolling cancels hold', '() => !JSON.parse(document.querySelector("#state").textContent).menu')
        page.locator('#interactive').dispatch_event('pointerdown', {'pointerType': 'touch', 'isPrimary': True, 'clientX': 10, 'clientY': 10})
        page.wait_for_timeout(620)
        check('interactive descendants keep their native long-press behavior', '() => !JSON.parse(document.querySelector("#state").textContent).menu')
        check('oversized file is rejected before arrayBuffer is called', '''async () => {
          let read=false;try{await encryptFile({size:129*1024*1024,arrayBuffer:()=>{read=true;throw Error('read')}})}catch(error){return !read&&error.message.includes('128')};return false;
        }''')
        check('real 32 MiB encrypted file roundtrips byte-exactly', '''async () => {
          const bytes=new Uint8Array(32*1024*1024);for(let i=0;i<bytes.length;i+=4096)bytes[i]=i%251;
          const start=performance.now();const encrypted=await encryptFile(new File([bytes],'memory.bin'));
          const plain=await decryptFile(await encrypted.file.arrayBuffer(),'application/octet-stream',encrypted.encInfo);
          const expected=await crypto.subtle.digest('SHA-256',bytes),actual=await crypto.subtle.digest('SHA-256',await plain.arrayBuffer());
          window.cryptoMeasurement={bytes:bytes.length,elapsedMs:performance.now()-start};
          return new Uint8Array(expected).every((value,index)=>value===new Uint8Array(actual)[index]);
        }''')
        (OUT / f'{engine}-crypto.json').write_text(json.dumps(page.evaluate('window.cryptoMeasurement'), indent=2))
        for suffix in ['known', 'unknown']:
            check('bounded download stops ' + suffix + '-length oversized response', '''async () => {
              try {await downloadMedia('/large-''' + suffix + '''',undefined,1024*1024)}catch(error){return error.message.includes('лимит')||error.message.includes('велик')};return false;
            }''')
        check('streamed save writes 8 MiB without Response.blob', '''async () => {
          let written=0,usedBlob=false;const originalBlob=Response.prototype.blob;
          Response.prototype.blob=function(){usedBlob=true;return originalBlob.call(this)};
          window.showSaveFilePicker=async()=>({createWritable:async()=>new WritableStream({write(chunk){written+=chunk.byteLength}})});
          try{return await streamMediaToDisk('/large','large.bin')==='saved'&&written===8*1024*1024&&!usedBlob}
          finally{Response.prototype.blob=originalBlob;delete window.showSaveFilePicker}
        }''')
        check('save picker cancellation is distinct from successful save', '''async () => {
          window.showSaveFilePicker=async()=>{throw new DOMException('Cancelled','AbortError')};
          try{return await streamMediaToDisk('/large','large.bin')==='cancelled'}finally{delete window.showSaveFilePicker}
        }''')
        check('unsupported picker chooses the bounded fallback', "async () => await streamMediaToDisk('/large','large.bin')==='unsupported'")
        check('corrupted notification lease is replaced', '''() => {
          localStorage.setItem('cinny.notification-owner:@p2:localhost','{bad');
          return ownsNotifications('@p2:localhost')&&!!JSON.parse(localStorage.getItem('cinny.notification-owner:@p2:localhost')).id;
        }''')
        page.evaluate('mountOwner()')
        other = context.new_page();other.goto(page.url);other.wait_for_function('window.ready');other.evaluate('mountOwner()');other.bring_to_front()
        other.wait_for_function('document.querySelector("#owner").textContent==="true"')
        page.wait_for_function('document.querySelector("#owner").textContent==="false"')
        checks.append(engine + ': one local window owns notifications');print('PASS ' + checks[-1], flush=True)
        other.close();page.bring_to_front();page.wait_for_function('document.querySelector("#owner").textContent==="true"')
        check('owner lease and timers are released on unmount', '() => {unmount();return timers.size===0&&!localStorage.getItem("cinny.notification-owner:@p2:localhost")}')
        assert not errors, errors
        browser.close()
server.shutdown()
(OUT / 'summary.json').write_text(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))
print(str(len(checks)) + ' source-browser checks passed', flush=True)
