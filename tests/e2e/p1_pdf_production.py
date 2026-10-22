"""Render an uploaded PDF using production chunks, worker and enforced CSP."""
import json, os, urllib.request, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

APP=os.environ['APP_URL'];HS=os.environ['HS_URL']
OUT=Path(os.environ.get('TEST_OUTPUT','/tmp/cinny-pdf-production'));OUT.mkdir(exist_ok=True,parents=True)
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(method,path,token=None,body=None):
    req=urllib.request.Request(HS+path,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
    with opener.open(req,json.dumps(body).encode() if body is not None else None,timeout=30) as response:return json.load(response)
def pdf_bytes():
    stream=b'BT /F1 12 Tf 20 60 Td (Cinny production PDF) Tj ET'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):offsets.append(len(data));data+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets:data+=f'{offset:010} 00000 n \n'.encode()
    return data+f'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n{xref}\n%%EOF'.encode()
with sync_playwright() as p:
    for engine in os.environ.get('BROWSERS','chromium,firefox,webkit').split(','):
        session=api('POST','/_matrix/client/v3/register',body={'username':'pdf'+uuid.uuid4().hex[:8],'password':'pass123','auth':{'type':'m.login.dummy'}})
        token=session['access_token'];room=api('POST','/_matrix/client/v3/createRoom',token,{'name':'PDF production'})['room_id']
        pdf=pdf_bytes()
        request=urllib.request.Request(HS+'/_matrix/media/v3/upload?filename=production.pdf',data=pdf,method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/pdf'})
        with opener.open(request,timeout=30) as response:mxc=json.load(response)['content_uri']
        api('PUT',f'/_matrix/client/v3/rooms/{room}/send/m.room.message/{uuid.uuid4().hex}',token,{'body':'production.pdf','msgtype':'m.file','url':mxc,'info':{'mimetype':'application/pdf','size':len(pdf)}})
        options={'args':['--no-sandbox','--no-proxy-server']} if engine=='chromium' else {}
        if engine=='webkit' and os.environ.get('WEBKIT_EXECUTABLE'):options['executable_path']=os.environ['WEBKIT_EXECUTABLE']
        browser=getattr(p,engine).launch(**options);context=browser.new_context();page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script("window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push({directive:e.effectiveDirective,blocked:e.blockedURI}));")
        page.route('**/config.json',lambda route:route.fulfill(json={'homeserverList':[HS],'allowCustomHomeservers':True,'hashRouter':{'enabled':False,'basename':'/'}}))
        try:
            page.goto(APP+'/config.json');page.evaluate("s=>{for(const [k,v] of Object.entries(s))localStorage.setItem('cinny_'+k,v)}",{'access_token':token,'device_id':session['device_id'],'user_id':session['user_id'],'hs_base_url':HS})
            page.goto(APP+'/home/'+room+'/');page.get_by_role('button',name='Открыть PDF',exact=True).click(timeout=45000)
            page.locator('canvas').wait_for(timeout=30000)
            page.wait_for_function("()=>{const c=document.querySelector('canvas');if(!c?.width)return false;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<d.length;i+=4)if(d[i+3]&&d[i]<150&&d[i+1]<150&&d[i+2]<150)return true;return false;}")
            width=page.locator('canvas').evaluate('(c)=>c.width')
            page.get_by_role('button',name='Увеличить',exact=True).click()
            page.wait_for_function('(width)=>document.querySelector("canvas")?.width>width',arg=width)
            assert not errors,errors
            assert not page.evaluate('window.__csp'),page.evaluate('window.__csp')
            page.screenshot(path=str(OUT/(engine+'.png')))
            print('PASS '+engine+' actual production PDF upload, lazy chunk, authenticated load, worker, fonts, render and zoom under CSP',flush=True)
        except Exception:
            print(page.locator('body').inner_text()[-2000:],flush=True);print('ERRORS',errors,flush=True);page.screenshot(path=str(OUT/(engine+'-failure.png')));raise
        finally:context.close();browser.close()
