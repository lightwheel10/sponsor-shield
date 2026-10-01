"""Real Chromium extension lifecycle, synthetic player; separate from live YouTube E2E."""
import json, os, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];ENV=ROOT/'.test-env';ART=ENV/'artifacts/v150'
os.environ['TEMP']=os.environ['TMP']=str(ENV);os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(ENV/'browsers')
sys.path.insert(0,str(ENV/'python-tools'))
from playwright.sync_api import sync_playwright
report={'kind':'Bundled Chromium lifecycle with synthetic player on intercepted YouTube URL; real SponsorBlock lookup','checks':[],'errors':[]}
def record(name):
 report['checks'].append({'name':name,'status':'pass'});print('PASS',name,flush=True)
fixture='<html><head><link rel="icon" href="data:,"></head><body><div id="movie_player" style="position:relative;width:854px;height:480px"><video class="html5-main-video"></video></div><script>window.documentToken="same-document";</script></body></html>'
def fixture_media(w,tabid):
 # Native property shims must be installed in the extension's isolated world;
 # page-world JS property overrides are deliberately not visible there.
 w.evaluate("""async id=>chrome.scripting.executeScript({target:{tabId:id},func:()=>{
  const v=document.querySelector('video');
  for(const [key,value] of Object.entries({currentTime:30,duration:1749.961,readyState:4,paused:true,seeking:false}))
   Object.defineProperty(v,key,{get:()=>value,configurable:true});
  v.dispatchEvent(new Event('timeupdate'));
 }})""",tabid)
try:
 with sync_playwright() as p:
  ctx=p.chromium.launch_persistent_context(str(ENV/'profiles'/f'lifecycle-{time.time_ns()}'),headless=False,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--disable-breakpad','--disable-crash-reporter'])
  report['browser']=ctx.browser.version
  ctx.route('https://www.youtube.com/**',lambda route:route.fulfill(status=200,content_type='text/html',body=fixture))
  page=ctx.pages[0];page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto('https://www.youtube.com/watch?v=g1f7iZehQ2A')
  cdp=ctx.browser.new_browser_cdp_session()
  extid=cdp.send('Extensions.loadUnpacked',{'path':str(ENV/'release-unpacked-v150')})['id']
  workers=[w for w in ctx.service_workers if extid in w.url]
  initial=workers[0] if workers else ctx.wait_for_event('serviceworker')
  tabid=initial.evaluate("async()=> (await chrome.tabs.query({url:'https://www.youtube.com/*'}))[0].id")
  fixture_media(initial,tabid)
  page.wait_for_selector('.ytss-overlay:not([hidden])',timeout=20000)
  assert page.locator('video').evaluate('v=>v.muted')
  record('Actual install activates the pre-existing synthetic watch document')
  def worker(): return next(w for w in ctx.service_workers if extid in w.url)
  tabid=worker().evaluate("async()=> (await chrome.tabs.query({url:'https://www.youtube.com/*'}))[0].id")
  old_overlay=page.locator('.ytss-overlay').element_handle()
  with ctx.expect_event('serviceworker',timeout=15000) as restarted:
   worker().evaluate('setTimeout(()=>chrome.runtime.reload(),0)')
  fixture_media(restarted.value,tabid)
  page.wait_for_function('e=>!e.isConnected',arg=old_overlay,timeout=15000)
  page.wait_for_selector('.ytss-overlay:not([hidden])',timeout=20000)
  page.wait_for_timeout(1200)
  assert page.evaluate('window.documentToken')=='same-document'
  assert page.locator('.ytss-overlay').count()==1
  assert page.locator('video').evaluate('v=>v.muted')
  record('Unpacked runtime reload fires update injection; one new overlay in the same document')
  worker().evaluate("async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['segment-logic.js','refresh-scheduler.js','content.js']});}",tabid)
  assert page.locator('.ytss-overlay').count()==1
  record('Duplicate actual scripting injection leaves one overlay')
  cdp.send('Extensions.uninstall',{'id':extid})
  page.wait_for_function("!document.querySelector('.ytss-overlay') && !document.querySelector('video').muted && !document.querySelector('video').classList.contains('ytss-blurred')",timeout=10000)
  record('Uninstall invalidates the context and restores owned mute/blur without reload')
  assert not report['errors'],report['errors']
  record('No JavaScript page errors during install, reload, duplicate injection and invalidation')
  ctx.close()
except Exception as exc:
 report['checks'].append({'name':'Lifecycle sequence','status':'fail','detail':str(exc)})
 raise
finally:
 report['pass']=sum(c['status']=='pass' for c in report['checks']);report['fail']=sum(c['status']=='fail' for c in report['checks'])
 (ART/'lifecycle-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
