import os,sys,json,zipfile
from pathlib import Path
r=Path(__file__).resolve().parents[2];e=r/'.test-env'
os.environ['TEMP']=os.environ['TMP']=str(e);os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(e/'browsers');sys.path.insert(0,str(e/'python-tools'))
from playwright.sync_api import sync_playwright
print('Starting bundled Chromium permission probe',flush=True)
with sync_playwright() as p:
 c=p.chromium.launch_persistent_context(str(e/'profiles/permission-probe-v150b'),headless=False,timeout=30000,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging','--disable-breakpad','--disable-crash-reporter'])
 print('Browser launched',flush=True)
 pg=c.pages[0];cdp=c.browser.new_browser_cdp_session();result=cdp.send('Extensions.loadUnpacked',{'path':str(e/'release-unpacked-v150')})
 print('Extension loaded',result,flush=True)
 pg.goto('chrome-extension://'+result['id']+'/popup.html')
 old=json.loads(zipfile.ZipFile(r/'release/yt-sponsor-shield-1.4.0.zip').read('manifest.json'))
 new=json.loads((r/'manifest.json').read_text())
 warnings=pg.evaluate('''async manifests=>{const out=[];for(const m of manifests)out.push(await chrome.management.getPermissionWarningsByManifest(JSON.stringify(m)));return out;}''',[old,new])
 print(json.dumps({'browser':c.browser.version,'warnings':warnings}),flush=True)
 (e/'artifacts/v150/permission-warnings.json').write_text(json.dumps({'browser':c.browser.version,'old':warnings[0],'new':warnings[1],'equal':warnings[0]==warnings[1]},indent=2))
 assert warnings[0]==warnings[1]
 c.close()
