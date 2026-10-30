"""P1 source regressions in actual browser IndexedDB/WebCrypto/Slate.
No build or TS compiler: Node only strips erasable type annotations.
Run with the same Playwright environment as platform_audit.py.
"""
import json
import os
from pathlib import Path
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PAGE = """<!doctype html><div id="root"></div>
<script src="/node_modules/react/umd/react.development.js"></script>
<script src="/node_modules/react-dom/umd/react-dom.development.js"></script>
<script type="importmap">{"imports":{"react":"/react.mjs","slate":"/node_modules/slate/dist/index.es.js","matrix-js-sdk":"/sdk.mjs","/src/app/hooks/useLocalSearch":"/src/app/hooks/useLocalSearch.ts","/src/app/utils/localSearch":"/src/app/utils/localSearch.ts","/src/app/utils/privateStorage":"/src/app/utils/privateStorage.ts"}}</script>
<script type="module">
import {PrivateStorage, privateAccountKey, clearPrivateStorage, clearPrivateSearchStorage} from '/src/app/utils/privateStorage.ts';
import {LocalSearchIndex} from '/src/app/utils/localSearch.ts';
import {usePersistentDraft} from '/src/app/hooks/usePersistentDraft.ts';
import {useMessageSearch} from '/src/app/features/message-search/useMessageSearch.ts';
import {getLocalSearchIndex, loadSearchHistory} from '/src/app/hooks/useLocalSearch.ts';
import {createEditor} from 'slate';
window.mx = {baseUrl:'https://matrix.test',getSafeUserId:()=>'@me:test',getDeviceId:()=>'DEVICE'};
Object.assign(window,{PrivateStorage,privateAccountKey,clearPrivateStorage,clearPrivateSearchStorage,LocalSearchIndex,getLocalSearchIndex,loadSearchHistory});
window.account = privateAccountKey(mx.baseUrl,mx.getSafeUserId(),mx.getDeviceId());
const root=ReactDOM.createRoot(document.querySelector('#root'));
function Probe({draftKey}) {
 const editor=React.useMemo(()=>{const e=createEditor();e.children=[{type:'paragraph',children:[{text:''}]}];return e;},[]);
 const restore=React.useCallback(reply=>{window.reply=reply;},[]);
 const draft=usePersistentDraft(editor,draftKey,restore);
 React.useEffect(()=>()=>{editor.children=[{type:'paragraph',children:[{text:''}]}];},[editor,draftKey]);
 Object.assign(window,{editor,draft});
 return React.createElement('output',{id:'ready'},String(draft.ready));
}
window.mountDraft=key=>ReactDOM.flushSync(()=>root.render(React.createElement(Probe,{key,draftKey:key})));
window.switchDraft=key=>ReactDOM.flushSync(()=>root.render(React.createElement(Probe,{draftKey:key})));
window.unmountDraft=()=>ReactDOM.flushSync(()=>root.render(null));
function SearchProbe({params}){window.search=useMessageSearch(params);return null;}
window.mountSearch=params=>ReactDOM.flushSync(()=>root.render(React.createElement(SearchProbe,{params})));
window.ready=true;
</script>"""
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        route=urlsplit(self.path).path
        if route=='/': body=PAGE.encode()
        elif route=='/sdk.mjs': body=b"export const ClientEvent={Room:'Room'},Direction={Backward:'b'},MatrixEventEvent={Decrypted:'Event.decrypted'},RoomEvent={Timeline:'Room.timeline',Redaction:'Room.redaction'},Method={Get:'GET'},EventStatus={SENT:'sent'},SearchOrderBy={Recent:'recent',Rank:'rank'};"
        elif route=='/react.mjs': body=b'export const {useState,useEffect,useMemo,useRef,useCallback}=window.React;'
        elif route in ['/src/app/hooks/useMatrixClient','/src/app/hooks/useMatrixClient.ts']:
            body=b'export const useMatrixClient=()=>window.mx;'
        else:
            path=(ROOT/route.lstrip('/')).resolve()
            if not path.is_file() and path.with_suffix('.ts').is_file():
                self.send_response(302);self.send_header('Location',route+'.ts');self.end_headers();return
            if not path.is_relative_to(ROOT) or not path.is_file():self.send_error(404);return
            body=path.read_bytes()
            if path.suffix=='.ts':
                body=subprocess.run(['node','--input-type=module','-e',"import{stripTypeScriptTypes}from'node:module';import{readFileSync}from'node:fs';process.stdout.write(stripTypeScriptTypes(readFileSync(0,'utf8')));"],input=body,capture_output=True,check=True).stdout
        self.send_response(200)
        self.send_header('Content-Type','text/html' if route=='/' else 'text/javascript')
        self.end_headers();self.wfile.write(body)

def check(page,label,expression):
    assert page.evaluate(expression),label
    print('PASS '+label,flush=True)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  for engine in os.environ.get('AUDIT_BROWSERS','chromium,firefox,webkit').split(','):
   options={}
   if engine=='webkit' and os.environ.get('AUDIT_WEBKIT_EXECUTABLE'):options['executable_path']=os.environ['AUDIT_WEBKIT_EXECUTABLE']
   browser=getattr(p,engine).launch(**options)
   page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.add_init_script("""(() => {
    const get=IDBObjectStore.prototype.get,put=IDBObjectStore.prototype.put;
    window.keyAccess={reads:0,writes:0,deny:false};
    IDBObjectStore.prototype.get=function(...args){
     if(this.name==='keys'){
      keyAccess.reads++;
      if(keyAccess.deny)throw new DOMException('Keychain access denied','UnknownError');
     }
     return get.apply(this,args);
    };
    IDBObjectStore.prototype.put=function(...args){
     if(this.name==='keys')keyAccess.writes++;
     return put.apply(this,args);
    };
   })();""")
   page.goto(origin);page.wait_for_function('window.ready')
   check(page,engine+' navigating empty rooms and removing drafts never accesses a crypto key',"""async()=>{
    const before={...keyAccess};
    await Promise.all(['!room-a','!room-b','!room#thread'].map(async room=>{
     const storage=new PrivateStorage(account,'drafts');
     if(await storage.get(room))throw Error('Unexpected draft');
     await storage.set(room,undefined);
    }));
    return keyAccess.reads===before.reads && keyAccess.writes===before.writes;
   }""")
   check(page,engine+' concurrent room, thread and search stores load one key per account',"""async()=>{
    const key=privateAccountKey(mx.baseUrl,'@shared:test','DEVICE');
    const kinds=['drafts','search','send-attempts','thread-creation'];
    const before={...keyAccess};
    await Promise.all(kinds.map(kind=>new PrivateStorage(key,kind).set('!room-a',{text:kind})));
    const reads=keyAccess.reads,writes=keyAccess.writes;
    for(const kind of kinds){
     const storage=new PrivateStorage(key,kind);
     if((await storage.get('!room-a')).text!==kind)return false;
     await storage.set('!room-b',{text:kind});
     if((await new PrivateStorage(key,kind).values()).length!==2)return false;
    }
    return reads-before.reads===2 && writes-before.writes===1 && keyAccess.reads===reads && keyAccess.writes===writes;
   }""")
   check(page,engine+' encrypts records and isolates account/device/thread',"""async()=>{
    const a=new PrivateStorage(account,'drafts');
    await a.set('!room',{message:'PRIVATE E2EE SECRET'});
    await a.set('!room#thread#root',{message:'THREAD SECRET'});
    const other=new PrivateStorage(privateAccountKey(mx.baseUrl,'@other:test','DEVICE'),'drafts');
    const device=new PrivateStorage(privateAccountKey(mx.baseUrl,'@me:test','OTHER'),'drafts');
    const rows=await new Promise((resolve,reject)=>{const r=indexedDB.open('cinny-private-v1');r.onsuccess=()=>{const db=r.result;const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>{db.close();resolve(request.result);};};r.onerror=()=>reject(r.error);});
    return (await a.get('!room')).message==='PRIVATE E2EE SECRET' && (await a.get('!room#thread#root')).message==='THREAD SECRET' && !(await other.get('!room')) && !(await device.get('!room')) && rows.every(row=>row.data instanceof ArrayBuffer && !JSON.stringify(row).includes('SECRET') && !new TextDecoder().decode(row.data).includes('SECRET'));
   }""")
   check(page,engine+' concurrent writers share a nonexportable key',"""async()=>{
    const key=privateAccountKey(mx.baseUrl,'@concurrent:test','DEVICE');
    const a=new PrivateStorage(key,'drafts'),b=new PrivateStorage(key,'drafts');
    await Promise.all([a.set('a',{text:'first'}),b.set('b',{text:'second'})]);
    const stored=await new Promise((resolve,reject)=>{const r=indexedDB.open('cinny-private-v1');r.onsuccess=()=>{const db=r.result;const request=db.transaction('keys').objectStore('keys').get(key);request.onsuccess=()=>{db.close();resolve(request.result);};};r.onerror=()=>reject(r.error);});
    return stored instanceof CryptoKey && !stored.extractable && (await b.get('a')).text==='first' && (await a.get('b')).text==='second';
   }""")
   page.reload();page.wait_for_function('window.ready')
   check(page,engine+' after restart all rooms share one persisted key load',"""async()=>{
    const before={...keyAccess};
    const values=await Promise.all(['!room','!room#thread#root'].map(room=>new PrivateStorage(account,'drafts').get(room)));
    await new PrivateStorage(account,'search').set('event',{body:'search text'});
    return values.every(Boolean) && keyAccess.reads-before.reads===1 && keyAccess.writes===before.writes;
   }""")
   check(page,engine+' encrypted records survive a process/page restart',"""async()=> (await new PrivateStorage(account,'drafts').get('!room')).message==='PRIVATE E2EE SECRET'""")
   page.evaluate("""async()=>{
    await new PrivateStorage(account,'drafts').set('draft-room',{message:[{type:'paragraph',children:[{text:'Сохранённый текст',bold:true}]}],reply:{eventId:'$reply',userId:'@author:test',body:'Ответ'}});
    mountDraft('draft-room');
   }""")
   page.wait_for_function("document.querySelector('#ready')?.textContent==='true'")
   check(page,engine+' Slate draft restores rich text and reply context',"""()=> editor.children[0].children[0].text==='Сохранённый текст' && editor.children[0].children[0].bold && reply.eventId==='$reply'""")
   page.evaluate("""()=>{editor.children=[{type:'paragraph',children:[{text:'Новый текст'}]}];draft.save(editor.children);unmountDraft();}""")
   page.reload();page.wait_for_function('window.ready');page.evaluate("mountDraft('draft-room')")
   page.wait_for_function("document.querySelector('#ready')?.textContent==='true'")
   check(page,engine+' unmount flushes last keystrokes before restart',"()=>editor.children[0].children[0].text==='Новый текст'")
   check(page,engine+' successful send removes persistent draft',"""async()=>{draft.save([{type:'paragraph',children:[{text:''}]}]);await draft.flush();return !(await new PrivateStorage(account,'drafts').get('draft-room'));}""")
   page.evaluate("""async()=>{
    await new PrivateStorage(account,'drafts').set('scope-a',{message:[{type:'paragraph',children:[{text:'Room A'}]}]});
    await new PrivateStorage(account,'drafts').set('scope-b',{message:[{type:'paragraph',children:[{text:'Thread B'}]}]});
    switchDraft('scope-a');
   }""")
   page.wait_for_function("document.querySelector('#ready')?.textContent==='true'")
   page.evaluate("switchDraft('scope-b')")
   page.wait_for_function("document.querySelector('#ready')?.textContent==='true'")
   check(page,engine+' switching drafts in a reused editor restores the new room/thread',"()=>editor.children[0].children[0].text==='Thread B'")
   check(page,engine+' clearing cache removes search but preserves drafts and pending sends',"""async()=>{
    const drafts=new PrivateStorage(account,'drafts');await drafts.set('keep',{text:'draft'});
    const attempts=new PrivateStorage(account,'send-attempts');await attempts.set('keep',{txnId:'stable'});
    const search=new PrivateStorage(account,'search');await search.set('old',{body:'indexed'});
    const cursor=new PrivateStorage(account,'search-cursors');await cursor.set('room',{token:'page'});
    await clearPrivateSearchStorage(account);await search.set('late',{body:'must not return'});
    return (await new PrivateStorage(account,'search').values()).length===0 && (await new PrivateStorage(account,'search-cursors').values()).length===0 && (await drafts.get('keep')).text==='draft' && (await attempts.get('keep')).txnId==='stable';
   }""")
   check(page,engine+' local search never sends plaintext query to Matrix and server excludes encrypted rooms',"""async()=>{
    const rooms=[{roomId:'!encrypted',getMyMembership:()=>'join'},{roomId:'!plain',getMyMembership:()=>'join'}];
    mx.getRooms=()=>rooms;mx.getRoom=id=>rooms.find(r=>r.roomId===id);mx.isRoomEncrypted=id=>id==='!encrypted';
    let requests=[];mx.search=async request=>{requests.push(request);return {search_categories:{room_events:{results:[]}}};};
    await getLocalSearchIndex(mx).add({event_id:'$one',room_id:'!encrypted',sender:'@me:test',type:'m.room.message',origin_server_ts:1,content:{body:'secret phrase',msgtype:'m.text'}});
    mountSearch({source:'local',term:'secret phrase'});const local=await search();
    if(requests.length || local.groups.length!==1)throw Error(JSON.stringify({step:'local',requests,local,indexCount:getLocalSearchIndex(mx).events.size}));
    mountSearch({source:'server',term:'ordinary',rooms:['!plain','!encrypted']});await search();
    if(requests.length!==1 || requests[0].body.search_categories.room_events.filter.rooms.join()!=='!plain')throw Error(JSON.stringify({step:'server',requests}));
    mountSearch({source:'server',term:'secret phrase',rooms:['!encrypted']});await search();return requests.length===1;
   }""")
   check(page,engine+' logout during key generation cannot recreate an old key or private records',"""async()=>{
    const original=crypto.subtle.generateKey;
    let release,started;
    const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
    crypto.subtle.generateKey=async function(...args){
     const key=await original.apply(this,args);started();await gate;return key;
    };
    try{
     const key=privateAccountKey(mx.baseUrl,'@logout-race:test','DEVICE');
     const pending=new PrivateStorage(key,'drafts').set('!room',{text:'old session'});
     await ready;await clearPrivateStorage();release();await Promise.allSettled([pending]);
     const rows=await new Promise((resolve,reject)=>{const r=indexedDB.open('cinny-private-v1');r.onsuccess=()=>{const db=r.result;const request=db.transaction('keys').objectStore('keys').getAllKeys();request.onsuccess=()=>{db.close();resolve(request.result);};};r.onerror=()=>reject(r.error);});
     return !rows.length && !(await new PrivateStorage(key,'drafts').get('!room'));
    }finally{release();crypto.subtle.generateKey=original;}
   }""")
   check(page,engine+' denied key access is not retried on each room and logout resets the key cache',"""async()=>{
    const key=privateAccountKey(mx.baseUrl,'@denied:test','DEVICE');
    const before={...keyAccess};
    keyAccess.deny=true;
    try{
     const results=await Promise.allSettled(['drafts','search','send-attempts'].map(kind=>new PrivateStorage(key,kind).set('!room',{text:'secret'})));
     const later=await Promise.allSettled([new PrivateStorage(key,'drafts').set('!other',{text:'later'})]);
     if(![...results,...later].every(result=>result.status==='rejected') || keyAccess.reads-before.reads!==1)return false;
    }finally{keyAccess.deny=false;}
    await clearPrivateStorage();
    await new PrivateStorage(key,'drafts').set('!room',{text:'after logout'});
    const reads=keyAccess.reads;
    const saved=await new PrivateStorage(key,'drafts').get('!room');
    await clearPrivateStorage();
    await new PrivateStorage(key,'drafts').set('!room',{text:'new session'});
    return saved.text==='after logout' && keyAccess.reads===reads+2 && (await new PrivateStorage(key,'drafts').get('!room')).text==='new session';
   }""")
   check(page,engine+' logout blocks old queued writes and clears private history',"""async()=>{
    const old=new PrivateStorage(account,'drafts');
    const pending=old.set('race',{text:'must not return'});
    await clearPrivateStorage();await pending;await old.set('late',{text:'must not return'});
    return (await new PrivateStorage(account,'drafts').values()).length===0;
   }""")
   assert not errors,json.dumps(errors,ensure_ascii=False)
   page.close();browser.close()
finally:
 server.shutdown();server.server_close()
