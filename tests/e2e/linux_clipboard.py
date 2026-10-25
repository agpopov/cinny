"""Real X11 clipboard regression test against the packaged Linux WebView.

Build tests/fixtures/clipboard-probe.ts with esbuild to CLIPBOARD_PROBE.
Set CINNY_BINARY, CINNY_RUNTIME, LD_LIBRARY_PATH and GSETTINGS_SCHEMA_DIR for
the package under test. Run with dbus-run-session -- python3 this_file.py.
The GTK provider owns only the isolated X11 test display clipboard.
"""
from pathlib import Path
import os,subprocess,time,urllib.request,json,select,shutil
out=Path(os.environ.get('TEST_OUTPUT','artifacts/linux-clipboard')).resolve();out.mkdir(parents=True,exist_ok=True)
env={**os.environ,'DISPLAY':os.environ.get('CLIPBOARD_DISPLAY',':96'),'GDK_BACKEND':'x11','TAURI_WEBVIEW_AUTOMATION':'true','WEBKIT_DISABLE_COMPOSITING_MODE':'1','XDG_CONFIG_HOME':str(out/'profile/config'),'XDG_DATA_HOME':str(out/'profile/data'),'XDG_CACHE_HOME':str(out/'profile/cache')}
procs=[];base='http://127.0.0.1:4462'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def req(path,body=None,method=None):
 r=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'},method=method)
 try:
  with opener.open(r,timeout=40) as res:return json.load(res)['value']
 except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode()) from e
try:
 procs.append(subprocess.Popen([os.environ.get('XVFB_BINARY',shutil.which('Xvfb') or '/tmp/cinny-Xvfb'),env['DISPLAY'],'-screen','0','1280x900x24'],env=env,stdout=(out/'xvfb.log').open('w'),stderr=subprocess.STDOUT));time.sleep(1)
 subprocess.run(['xmodmap','-e','keycode 55 = v V','-e','keycode 37 = Control_L','-e','add Control = Control_L'],env=env,check=True)
 procs.append(subprocess.Popen([os.environ.get('WEBKIT_WEBDRIVER',shutil.which('WebKitWebDriver') or '/tmp/cinny-platform-libs/root/usr/bin/WebKitWebDriver'),'--port=4462','--host=127.0.0.1'],cwd=os.environ.get('CINNY_RUNTIME',str(Path.cwd())),env=env,stdout=(out/'driver.log').open('w'),stderr=subprocess.STDOUT));time.sleep(1)
 session=req('/session',{'capabilities':{'alwaysMatch':{'webkitgtk:browserOptions':{'binary':os.environ.get('CINNY_BINARY','/tmp/cinny-linux-clipboard/Cinny.AppDir/usr/bin/cinny')}}}})['sessionId'];p='/session/'+session
 def js(script):return req(p+'/execute/sync',{'script':script,'args':[]})
 for _ in range(30):
  if js('return !!window.__TAURI_INTERNALS__'):break
  time.sleep(.5)
 js(Path(os.environ.get('CLIPBOARD_PROBE','/tmp/cinny-clipboard-probe.js')).read_text())
 import struct,zlib
 def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
 png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',2,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\0\0\xff\0\xff\0\xff'))+chunk(b'IEND',b'')
 screenshot=out/'clipboard-source.png';screenshot.write_bytes(png)
 results=[]
 for kind,value in [('text','Clipboard text probe'),('text','https://example.org/clipboard'),('image',str(screenshot))]:
  owner=subprocess.Popen(['python3',str(Path(__file__).resolve().parents[1]/'fixtures/clipboard_owner.py'),kind,value],env=env,stdout=subprocess.PIPE,stderr=(out/(kind+'-owner.log')).open('w'),text=True);procs.append(owner)
  assert select.select([owner.stdout],[],[],5)[0] and owner.stdout.readline().strip()=='ready'
  js("clipboardProbe.input.textContent='';clipboardProbe.events.length=0;clipboardProbe.results.length=0;clipboardProbe.input.focus()")
  before=js('return clipboardProbe.reads()')
  req(p+'/actions',{'actions':[{'type':'key','id':'keyboard','actions':[{'type':'keyDown','value':'\ue009'},{'type':'keyDown','value':'v'},{'type':'keyUp','value':'v'},{'type':'keyUp','value':'\ue009'}]}]})
  for _ in range(50):
   if kind=='text' or js('return clipboardProbe.results.length'):break
   time.sleep(.1)
  time.sleep(.2)
  result=js("return {events:clipboardProbe.events,files:clipboardProbe.results,reads:clipboardProbe.reads(),content:clipboardProbe.input.innerHTML}")
  result['kind']=kind
  if kind=='text':
   assert result['content']==value,result
   assert result['reads']==before and result['files']==[],result
  else:
   assert result['content']=='',result
   assert result['reads']==before+1,result
   assert len(result['files'])==1,result
   file=result['files'][0]
   assert file['type']=='image/png' and file['width']==2 and file['height']==1,file
   assert file['bytes']==[137,80,78,71,13,10,26,10],file
   assert file['pixels']==[255,0,0,255,0,255,0,255],file
   # Explicitly exercise WebKitGTK versions which emit no paste event for images.
   js("clipboardProbe.results.length=0;clipboardProbe.input.dispatchEvent(new KeyboardEvent('keydown',{key:'v',ctrlKey:true}))")
   for _ in range(50):
    if js('return clipboardProbe.results.length'):break
    time.sleep(.1)
   assert js('return clipboardProbe.results.length')==1
  results.append(result)
  print('PASS native Linux clipboard: '+kind+' '+('text unchanged' if kind=='text' else 'one PNG attachment, exact pixels, no duplicate HTML image, no-event Ctrl+V fallback'),flush=True)
  owner.terminate();owner.wait(timeout=5)
 (out/'native-e2e.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
 req(p,method='DELETE')
finally:
 for proc in reversed(procs):
  if proc.poll() is None:
   proc.terminate()
   try:proc.wait(timeout=5)
   except subprocess.TimeoutExpired:proc.kill()
