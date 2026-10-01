"""Render unchanged extension UI with explicit fixtures; never a live-product test."""
import functools, http.server, json, os, sys, threading
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
ENV = ROOT / '.test-env'
os.environ['TEMP'] = os.environ['TMP'] = str(ENV)
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = str(ENV / 'browsers')
sys.path.insert(0, str(ENV / 'python-tools'))
from playwright.sync_api import sync_playwright
from PIL import Image
ART = ENV / 'artifacts/v150'
ART.mkdir(parents=True, exist_ok=True)
OUT = ROOT / 'store/images'
OUT.mkdir(exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f'http://127.0.0.1:{server.server_port}'
mock = """if(location.pathname==='/popup.html') {
 const state=new URLSearchParams(location.search).get('demo')||'active';
 const values={enabled:state!=='off',includeSelfpromo:false,shieldedSeconds:96};
 const ranges=[{start:38,end:72,key:'38:72'},{start:156,end:184,key:'156:184'}];
 const status={videoId:'demoVideo01',enabled:values.enabled,load:state==='checking'?'loading':state==='error'?'error':'loaded',
   adPlaying:state==='ad',ranges:state==='clear'?[]:ranges,time:state==='past'?230:state==='ready'?10:48,duration:240,active:state==='active',activeRange:{start:38,end:72},overridden:state==='override'};
 window.chrome={storage:{local:{get:async defaults=>({...defaults,...values}),set:async change=>Object.assign(values,change)},onChanged:{addListener(){}}},
  tabs:{query:async()=>[{id:1}],sendMessage:async()=>state==='idle'?null:status}};
}"""
shots = [('01-shield','shield',1280,800),('02-marks-and-badge','marks',1280,800),
         ('03-show-anyway','choice',1280,800),('04-light-and-dark','themes',1280,800),
         ('05-popup-states','states',1280,800),('promo-small','tile',440,280),('promo-marquee','marquee',1400,560)]
report={'kind':'Illustrative store compositions, real runtime CSS/JS with mock data','images':[],'errors':[],'externalRequests':[],'checks':[]}
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(headless=True)
  report['browser']=browser.version
  context=browser.new_context(device_scale_factor=1, color_scheme='dark', reduced_motion='reduce')
  context.add_init_script(mock)
  context.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  def route_local(route):
   if route.request.url.startswith(base+'/'): route.continue_()
   else:
    report['externalRequests'].append(route.request.url);route.abort()
  context.route('**/*',route_local)
  # Last registered route takes precedence.
  context.route('**/favicon.ico',lambda route:route.fulfill(status=204))
  # Capture the actual popup under light system-theme emulation before composing
  # it beside the dark iframe; context theme emulation applies to all iframes.
  light_page=context.new_page();light_page.set_viewport_size({'width':340,'height':450})
  light_page.emulate_media(color_scheme='light')
  light_page.goto(base+'/popup.html?demo=ready',wait_until='networkidle')
  assert light_page.evaluate("getComputedStyle(document.body).backgroundColor")=='rgb(246, 246, 248)'
  light_page.locator('body').screenshot(path=str(ROOT/'store/compose/popup-light.png'))
  light_page.close()
  for name,view,width,height in shots:
   page=context.new_page();page.set_viewport_size({'width':width,'height':height})
   page.on('pageerror',lambda error:report['errors'].append(str(error)))
   page.on('console',lambda message:report['errors'].append(message.text) if message.type=='error' else None)
   page.goto(base+'/store/compose/index.html?view='+view,wait_until='networkidle')
   page.wait_for_timeout(350)
   for frame in page.frames:
    if '/popup.html' in frame.url:
     frame.wait_for_function("document.querySelector('#hero').dataset.state!=='idle'")
     height_needed=frame.evaluate('document.body.scrollHeight')
     frame.frame_element().evaluate('(e,h)=>e.style.height=h+"px"',height_needed)
    if '/player.html' in frame.url:
     if view=='choice':
      frame.wait_for_selector('body[data-ready="true"]')
      assert not frame.locator('video').evaluate("v=>v.classList.contains('ytss-blurred')")
     elif view in ['shield','marquee']:
      assert frame.locator('.ytss-overlay').is_visible()
      assert frame.locator('.ytss-count').inner_text()=='0:24'
     assert frame.locator('.ytss-mark').count()==2
   page.wait_for_timeout(100)
   assert page.evaluate('document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight')
   file=OUT/(name+'.png');page.screenshot(path=str(file),omit_background=False)
   with Image.open(file) as im:
    assert im.size==(width,height)
    opaque=im.mode=='RGB' or ('A' in im.getbands() and im.getchannel('A').getextrema()==(255,255))
    assert opaque
    report['images'].append({'file':file.relative_to(ROOT).as_posix(),'width':width,'height':height,'mode':im.mode,'opaque':opaque})
   report['checks'].append({'name':name,'status':'pass'})
   page.close()
  # Every popup state in both themes, including states not selected for store images.
  for scheme in ['light','dark']:
   for state in ['active','ready','clear','error','off','idle','checking','override','ad','past']:
    page=context.new_page();page.set_viewport_size({'width':340,'height':450});page.emulate_media(color_scheme=scheme)
    page.on('pageerror',lambda error:report['errors'].append(str(error)))
    page.on('console',lambda message:report['errors'].append(message.text) if message.type=='error' else None)
    page.goto(base+'/popup.html?demo='+state,wait_until='networkidle')
    expected='ready' if state=='past' else state
    assert page.locator('#hero').get_attribute('data-state')==expected
    if state=='past': assert 'marked in this video' in page.locator('#sub').inner_text()
    assert page.evaluate('document.body.scrollWidth<=340')
    report['checks'].append({'name':f'popup-{scheme}-{state}','status':'pass'})
    page.close()
  # Standalone policy: no external requests, both themes, narrow and wide layouts.
  for scheme in ['light','dark']:
   for width in [360,1280]:
    page=context.new_page();page.set_viewport_size({'width':width,'height':800});page.emulate_media(color_scheme=scheme)
    page.on('pageerror',lambda error:report['errors'].append(str(error)))
    page.on('console',lambda message:report['errors'].append(message.text) if message.type=='error' else None)
    page.goto(base+'/store/privacy.html',wait_until='networkidle')
    assert page.locator('h1').inner_text()=='Sponsor Shield privacy policy'
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ART/f'privacy-{scheme}-{width}.png'),full_page=True)
    report['checks'].append({'name':f'privacy-{scheme}-{width}','status':'pass'})
    page.close()
  assert not report['errors'],report['errors']
  assert not report['externalRequests'],report['externalRequests']
  browser.close()
finally:
 server.shutdown();server.server_close()
 report['pass']=sum(c['status']=='pass' for c in report['checks'])
 (ART/'store-visuals.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
