"""Exercise the production CSP with actual embedded Call and PDF.js assets.
Serves existing package artifacts directly; never invokes a compiler or bundler.
"""
import base64
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
POLICY=subprocess.check_output(['node','--input-type=module','-e',"import {productionCsp} from './security/csp.mjs';process.stdout.write(productionCsp());"],cwd=ROOT,text=True)
BOOTSTRAP='\n      window.global ||= window;\n    '
PAGE=f'<!doctype html><script>{BOOTSTRAP}</script><script type="module" src="/probe.js"></script><canvas id="pdf"></canvas><iframe title="Call" src="/call/index.html?intent=join_existing_voice"></iframe>'
PROBE="""
window.violations=[];
document.addEventListener('securitypolicyviolation',event=>violations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));
window.probe={bootstrap:window.global===window};
try {new Function('window.dynamicScriptRan=true')();probe.evalBlocked=false;}catch{probe.evalBlocked=true;}
const injected=document.createElement('script');injected.textContent='window.inlineScriptRan=true';document.head.append(injected);
const external=document.createElement('script');external.src=location.origin.replace('127.0.0.1','localhost')+'/forbidden.js';document.head.append(external);
try {await WebAssembly.instantiate(new Uint8Array([0,97,115,109,1,0,0,0]));probe.wasm=true;}catch(error){probe.wasm=String(error);}
try {
 const worker=new Worker(URL.createObjectURL(new Blob(['postMessage("ready")'],{type:'text/javascript'})));
 probe.worker=await new Promise(resolve=>{worker.onmessage=event=>resolve(event.data==='ready');worker.onerror=()=>resolve(false);});worker.terminate();
 const pdf=await import('/node_modules/pdfjs-dist/build/pdf.mjs');
 pdf.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
 const doc=await pdf.getDocument({url:'/sample.pdf',isEvalSupported:false,standardFontDataUrl:'/node_modules/pdfjs-dist/standard_fonts/',wasmUrl:'/node_modules/pdfjs-dist/wasm/'}).promise;
 const page=await doc.getPage(1);const canvas=document.querySelector('#pdf');
 await page.render({canvas,viewport:page.getViewport({scale:1})}).promise;
 probe.pdf=doc.numPages===1 && canvas.width>0;await doc.destroy();
} catch(error){probe.error=String(error);}
window.ready=true;
"""
def pdf_bytes():
    stream=b'BT /F1 12 Tf 20 60 Td (Cinny P1 PDF) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(data));data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets:data+=f'{offset:010} 00000 n \n'.encode()
    return data+f'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n{xref}\n%%EOF'.encode()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  route=urlsplit(self.path).path
  mime='text/javascript'
  if route=='/':body=PAGE.encode();mime='text/html'
  elif route=='/probe.js':body=PROBE.encode()
  elif route=='/sample.pdf':body=pdf_bytes();mime='application/pdf'
  elif route=='/forbidden.js':body=b'window.remoteScriptRan=true;'
  else:
   if route.startswith('/call/'):path=(ROOT/'node_modules/@element-hq/element-call-embedded/dist'/route[len('/call/'):]).resolve()
   else:path=(ROOT/route.lstrip('/')).resolve()
   if not path.is_relative_to(ROOT) or not path.is_file():self.send_error(404);return
   body=path.read_bytes();mime=mimetypes.guess_type(path)[0] or 'application/octet-stream'
   if path.suffix=='.mjs':mime='text/javascript'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Security-Policy',POLICY);self.end_headers();self.wfile.write(body)
def wait(frame, expression):
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  if frame.evaluate(expression):return
  time.sleep(.1)
 raise AssertionError('Timed out: '+expression)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  for engine in os.environ.get('AUDIT_BROWSERS','chromium,firefox,webkit').split(','):
   options={}
   if engine=='webkit' and os.environ.get('AUDIT_WEBKIT_EXECUTABLE'):options['executable_path']=os.environ['AUDIT_WEBKIT_EXECUTABLE']
   browser=getattr(p,engine).launch(**options);page=browser.new_page();page.goto(f'http://127.0.0.1:{server.server_port}');wait(page,'() => Boolean(window.ready)')
   result=page.evaluate('({probe,violations,inlineScriptRan:!!window.inlineScriptRan,remoteScriptRan:!!window.remoteScriptRan})')
   assert result['probe'].get('bootstrap') and result['probe'].get('evalBlocked') and result['probe'].get('wasm') is True and result['probe'].get('worker') and result['probe'].get('pdf'),json.dumps(result)
   assert not result['inlineScriptRan'] and not result['remoteScriptRan'],json.dumps(result)
   call=page.frames[1];wait(call,"() => document.querySelector('#root')?.childNodes.length>0")
   # Both known inline polyfills are permitted by hashes, without unsafe-inline.
   assert call.evaluate('window.global===window && typeof Promise.withResolvers==="function"')
   print('PASS '+engine+': CSP rejects injected inline, remote and eval scripts; permits known bootstraps, WASM, blob worker, actual PDF rendering and embedded Call startup',flush=True)
   page.close();browser.close()
finally:server.shutdown();server.server_close()
