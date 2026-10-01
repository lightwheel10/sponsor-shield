"""Real YouTube E2E. Baseline uses live API; additional simulations explicitly labelled."""
import os, sys, pathlib, json, time, hashlib, urllib.request, urllib.parse, traceback, re
from datetime import datetime, timezone
ROOT=pathlib.Path(__file__).resolve().parents[2]
ENV=ROOT/".test-env"; EXT=ENV/"release-unpacked-v150"; ART=ENV/"artifacts"/"v150"
sys.path.insert(0,str(ENV/"python-tools"))
os.environ["PLAYWRIGHT_BROWSERS_PATH"]=str(ENV/"browsers")
os.environ["TEMP"]=os.environ["TMP"]=str(ENV)
from playwright.sync_api import sync_playwright
ART.mkdir(parents=True,exist_ok=True)
results=[]; media_errors=[]; snapshots=[]
report={"started":datetime.now(timezone.utc).isoformat(),"mode":"headed persistent bundled Chromium; real YouTube; live SponsorBlock API; mute and blur only; extracted release ZIP; simulated ad DOM flag labelled","tests":results,"snapshots":snapshots,"pageErrors":media_errors}
def persist():
    (ART/"e2e-results.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
def record(name,status="pass",detail=None):
    row={"name":name,"status":status}
    if detail is not None:row["detail"]=detail
    results.append(row);persist();print(status.upper(),name,json.dumps(detail,ensure_ascii=True) if detail else "",flush=True)
def check(name,fn):
    try:
        detail=fn()
        record(name,"pass",detail)
        return True
    except Exception as exc:
        record(name,"fail",str(exc));return False
def api(video):
    prefix=hashlib.sha256(video.encode()).hexdigest()[:4]
    url="https://sponsor.ajay.app/api/skipSegments/"+prefix+"?"+urllib.parse.urlencode({"categories":json.dumps(["sponsor","selfpromo"]),"actionTypes":json.dumps(["skip","mute"])})
    with urllib.request.urlopen(url,timeout=20) as response:
        payload=json.load(response)
    match=next((entry for entry in payload if entry["videoID"]==video),{"videoID":video,"segments":[]})
    return {"videoId":video,"url":url,"confirmed":datetime.now(timezone.utc).isoformat(),"response":match}
VID="g1f7iZehQ2A"
confirmation=api(VID);report["api"]=confirmation
ranges=sorted([s["segment"] for s in confirmation["response"]["segments"] if s["category"]=="sponsor" and s["actionType"] in ["skip","mute"]])
merged=[]
for a,b in ranges:
    if merged and a<=merged[-1][1]:merged[-1][1]=max(merged[-1][1],b)
    else:merged.append([a,b])
start,end=next((a,b) for a,b in merged if a>10 and 2<b-a<30)
report["segment"]={"start":start,"end":end};persist()
record("Live hash-prefix API confirms sponsor segment",detail=report["segment"])
ctx=None
with sync_playwright() as p:
    try:
        print("Launching headed persistent Chromium",flush=True)
        ctx=p.chromium.launch_persistent_context(str(ENV/"profiles"/("e2e-"+datetime.now().strftime("%Y%m%d-%H%M%S"))),headless=False,timeout=45000,ignore_default_args=["--disable-extensions"],
            args=["--enable-unsafe-extension-debugging","--disable-gpu","--disable-breakpad","--disable-crash-reporter","--no-first-run"],
            viewport={"width":1360,"height":900})
        report["browser"]=ctx.browser.version
        page=ctx.pages[0]
        page.on("pageerror",lambda error:media_errors.append(str(error)))
        report["console"]=[]
        report["network"]=[]
        report["mediaCDP"]=[]
        page.on("console",lambda m: report["console"].append({"type":m.type,"text":m.text}) if m.type in ["error","warning"] else None)
        page.on("requestfailed",lambda r:report["network"].append({"url":r.url.split("?")[0],"failure":r.failure}))
        page.on("response",lambda r:report["network"].append({"url":r.url.split("?")[0],"status":r.status}) if "googlevideo.com" in r.url or r.status>=400 else None)
        cdp=ctx.new_cdp_session(page);cdp.send("Media.enable")
        for event in ["playerErrorsRaised","playerMessagesLogged"]:
            cdp.on("Media."+event,lambda data,event=event:report["mediaCDP"].append({"event":event,"data":data}))
        page.goto("https://www.youtube.com/watch?v="+VID+"&t=20s",wait_until="domcontentloaded",timeout=60000)
        consent=[]
        for label in ["Reject all","Accept all","I agree"]:
            try:
                button=page.get_by_role("button",name=label,exact=True)
                if button.count() and button.first.is_visible():
                    button.first.click();consent.append(label);page.wait_for_timeout(2000);break
            except Exception:pass
        report["consent"]=consent or ["No consent interstitial was displayed"]
        page.wait_for_selector("#movie_player video",timeout=30000)
        # Load only AFTER the real watch document exists; Chrome fires onInstalled.
        assert page.locator(".ytss-overlay").count()==0
        page.evaluate("window.__preInstallDocument='same-watch-document'")
        report["install"]={"urlBefore":page.url,"loadedAfterWatchPage":True}
        loaded=ctx.browser.new_browser_cdp_session().send("Extensions.loadUnpacked",{"path":str(EXT)})
        report["install"]["cdp"]=loaded
        workers=[w for w in ctx.service_workers if w.url.startswith("chrome-extension://")]
        if workers:
            extid=workers[0].url.split("/")[2]
            (ENV/"extension-id.txt").write_text(extid,encoding="utf-8")
        else:
            extid=ctx.wait_for_event("serviceworker",timeout=15000).url.split("/")[2]
        report["extensionId"]=extid
        report["extensionVersion"]=__import__("json").loads((EXT/"manifest.json").read_text(encoding="utf-8"))["version"]
        popup=ctx.new_page()
        popup.goto(f"chrome-extension://{extid}/popup.html",wait_until="domcontentloaded",timeout=15000)
        assert popup.evaluate("chrome.runtime.id")==extid
        assert popup.evaluate("chrome.runtime.getManifest().name")=="Sponsor Shield"
        assert popup.evaluate("chrome.runtime.getManifest().version")=="1.5.0"
        record("Extracted release ZIP loads as MV3 v1.5.0 in bundled Chromium")
        page.bring_to_front()
        # Read status through the extension's popup page, with the test watch tab active.
        tabid=popup.evaluate("async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0].id")
        def status():
            return popup.evaluate("async id => chrome.tabs.sendMessage(id,{type:'GET_STATUS'})",tabid)
        def await_status(predicate,timeout=15):
            deadline=time.monotonic()+timeout
            last=None
            while time.monotonic()<deadline:
                try: last=status()
                except Exception as exc:
                    last={"transientError":str(exc)};page.wait_for_timeout(200);continue
                if predicate(last):return last
                page.wait_for_timeout(200)
            raise AssertionError("Status timed out: "+json.dumps(last))
        def media():
            return page.evaluate("""()=>{const v=document.querySelector('#movie_player video');return {time:v.currentTime,duration:v.duration,paused:v.paused,muted:v.muted,readyState:v.readyState,seeking:v.seeking,rate:v.playbackRate,blur:getComputedStyle(v).filter,blurClass:v.classList.contains('ytss-blurred'),overlay:!!document.querySelector('.ytss-overlay:not([hidden])'),ad:document.querySelector('#movie_player').classList.contains('ad-showing'),error:v.error?.code||null}}""")
        def snap(name):
            # Capture actual page pixels; no reconstruction or screenshot editing.
            state=media()
            page.screenshot(path=str(ART/(name+".png")),timeout=15000)
            snapshots.append({"name":name,"media":state});persist();return state
        def player_error():
            text=page.locator("#movie_player").inner_text()
            return text if any(message in text for message in [
                "Something went wrong", "An error occurred", "Video unavailable"
            ]) else None
        def seek(t,muted=None):
            # Harness-only native setup seek; production never seeks. Reject unbuffered targets.
            page.wait_for_function("""t=>{const v=document.querySelector('#movie_player video');
                for(let i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=t&&v.buffered.end(i)>t+.2)return true;
                return false;}""",arg=t,timeout=20000)
            before=media()
            page.evaluate("""args=>{const p=document.querySelector('#movie_player'),v=p.querySelector('video');
                p.pauseVideo();if(args.muted!==null){if(args.muted)p.mute();else p.unMute();v.muted=args.muted;}p.seekTo(args.t,true);}""",{"t":t,"muted":muted})
            page.wait_for_function("""t=>{const p=document.querySelector('#movie_player'),v=p.querySelector('video');
                return ['Something went wrong','An error occurred','Video unavailable'].some(text=>p.innerText.includes(text))
                    || (!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<.7);}""",arg=t,timeout=20000)
            error=player_error()
            report.setdefault("harnessSeeks",[]).append({"from":before["time"],"target":t,"buffered":True,"error":error})
            if error:raise RuntimeError("YouTube harness seek error: "+error)
            page.wait_for_timeout(250)
        def shielded():
            page.wait_for_function("""()=>{const v=document.querySelector('#movie_player video');return v.muted&&v.classList.contains('ytss-blurred')&&getComputedStyle(v).filter.includes('blur')&&!!document.querySelector('.ytss-overlay:not([hidden])')}""",timeout=10000)
            return media()
        def restored(muted=False):
            page.wait_for_function("""muted=>{const v=document.querySelector('#movie_player video');return v.muted===muted&&!v.classList.contains('ytss-blurred')&&!document.querySelector('.ytss-overlay:not([hidden])')}""",arg=muted,timeout=10000)
            return media()
        def play():
            if media()["paused"]:
                page.evaluate("document.querySelector('#movie_player').playVideo()")
            page.wait_for_function("()=>!document.querySelector('#movie_player video').paused",timeout=10000)
        def toggle(key,value):
            popup.locator('#'+key).set_checked(value)
            page.bring_to_front()
            return await_status(lambda s:s.get(key)==value)
        def wait_for_content():
            deadline=time.monotonic()+150
            observed=False
            while time.monotonic()<deadline:
                v=media()
                if v["ad"]:
                    assert not v["blurClass"] and not v["overlay"], "Shield applied to an actual YouTube ad"
                    if not observed:
                        observed=True
                        report.setdefault("realAds",[]).append(v)
                        print("ACTUAL YOUTUBE AD: shield suspended; waiting for content",flush=True)
                    buttons=page.get_by_role("button",name=re.compile(r"^Skip(?: ad| ads)?$",re.I))
                    for i in range(buttons.count()):
                        if buttons.nth(i).is_visible(): buttons.nth(i).click();break
                    if v["paused"]:play()
                elif v["readyState"]>=3 and v["time"]>1:
                    return v
                elif v["paused"]:play()
                page.wait_for_timeout(350)
            raise AssertionError("Content was not ready after 150 seconds: "+json.dumps(media()))
        s=await_status(lambda s:s["load"] in ["loaded","error"],20)
        if s["load"]!="loaded":raise AssertionError("Live extension API request failed: "+json.dumps(s))
        assert s["videoId"]==VID and s["segmentsFound"]>0
        record("Service worker fetches and validates real segment data",detail=s)
        assert page.evaluate("window.__preInstallDocument")=="same-watch-document"
        record("onInstalled injects into the already-open real watch document without reload")
        before=s
        popup.evaluate("async id=>{await chrome.scripting.executeScript({target:{tabId:id},files:['segment-logic.js','refresh-scheduler.js','content.js']});}",tabid)
        assert status()["videoId"]==before["videoId"]
        record("Repeated injection keeps the same live tab responsive")
        assert popup.locator("#enabled").is_checked() and not popup.locator("#includeSelfpromo").is_checked()
        assert popup.locator("#playbackMode").count()==0
        assert "playbackMode" not in s and "skippedCount" not in s
        record("Popup defaults: enabled, self promotion off, no playback mode control")
        assert "SponsorBlock" in popup.locator("footer").inner_text() and popup.locator('footer a[href="https://sponsor.ajay.app"]').count()==1
        assert "CC BY-NC-SA 4.0" in popup.locator("footer").inner_text()
        record("Popup includes SponsorBlock data attribution and licence link")
        # A legacy automatic-skip preference must have no effect in the release.
        popup.evaluate("chrome.storage.local.set({playbackMode:'auto-skip'})")
        page.bring_to_front();play();wait_for_content()
        record("Real YouTube playback progresses before short buffered setup seeks",detail=media())
        seek(start-3,False);restored()
        page.evaluate("window.__ytssNaturalSeeks=0;document.querySelector('#movie_player video').addEventListener('seeking',()=>window.__ytssNaturalSeeks++)")
        record("Seek three seconds before segment: clear and audible",detail=snap("01-before-segment"))
        play()
        page.wait_for_function("t=>document.querySelector('#movie_player video').currentTime>t",arg=start+.15,timeout=45000)
        shielded()
        assert re.search(r"(?is)sponsor segment.*[0-9]+:[0-9]{2}.*show anyway",page.locator(".ytss-card").inner_text())
        assert page.locator(".ytp-progress-list .ytss-mark").count()>=1
        assert start<media()["time"]<end
        assert page.evaluate("window.__preInstallDocument")=="same-watch-document"
        assert page.locator(".ytss-overlay").count()==1
        record("Real playback crosses start: muted and blurred in pre-install tab without reload",detail=snap("02-inside-segment"))
        page.wait_for_function("t=>document.querySelector('#movie_player video').currentTime>t",arg=end+.15,timeout=60000)
        restored()
        record("Real playback crosses end: audio and visuals restored",detail=snap("03-after-segment"))
        assert page.evaluate("window.__ytssNaturalSeeks")==0
        assert not page.locator(".ytss-toast,.ytss-skip").count()
        assert not player_error()
        record("Natural sponsor crossing has zero seeks, no removed skip UI and no player error")
        mid=(start+end)/2
        def test_seek():
            seek(mid,False);shielded();assert media()["paused"];return snap("04-seek-middle-paused")
        check("Seek into middle while paused applies shield",test_seek)
        def test_pause():
            t=media()["time"];page.wait_for_timeout(2000);shielded()
            assert media()["paused"] and abs(media()["time"]-t)<.05
            return media()
        check("Pause inside segment retains shield and frozen media time",test_pause)
        def popup_active():
            s=status();assert s["active"] and s["segmentsFound"]>0
            popup.wait_for_timeout(1200)
            assert "shielding now" in popup.locator("#kicker").inner_text().lower() and "Back in" in popup.locator("#headline").inner_text() and popup.locator("#timeline .seg").count()>=1
            popup.screenshot(path=str(ART/"05-popup-active.png"),timeout=15000)
            return s
        check("Popup reports segments found and active shield",popup_active)
        def usable_controls():
            page.locator(".ytp-play-button").click()
            page.wait_for_function("()=>!document.querySelector('#movie_player video').paused",timeout=10000)
            page.locator(".ytp-play-button").click()
            page.wait_for_function("()=>document.querySelector('#movie_player video').paused",timeout=10000)
            shielded();return "Native play/pause button remains clickable through the shield"
        check("YouTube controls remain usable through blur and overlay",usable_controls)
        def seek_out():
            seek(end+3);return restored()
        check("Seeking out restores extension-owned mute and blur",seek_out)
        seek(mid,False);shielded()
        def show_anyway():
            page.get_by_role("button",name="Show anyway",exact=True).click();restored()
            assert status()["overridden"]
            return snap("06-show-anyway")
        check("Show anyway restores audio and video",show_anyway)
        def remember_choice():
            seek(end+3);seek(mid,False);restored();assert status()["overridden"];return media()
        check("Show anyway is remembered on re-entry into same segment",remember_choice)
        other_a,other_b=merged[0]
        seek((other_a+other_b)/2,False);shielded()
        def user_unmute():
            # This is the same native control a viewer uses, rather than an extension message.
            clicks=0
            while media()["muted"] and clicks<2:
                page.locator(".ytp-mute-button").click();clicks+=1;page.wait_for_timeout(350)
            restored()
            report["nativeUnmuteClicks"]=clicks
            seek(other_b+3);seek((other_a+other_b)/2,False);restored()
            assert status()["overridden"];return snap("07-user-unmute")
        check("User unmute overrides only that segment and survives re-entry",user_unmute)
        # Reload resets the prior per-video override before testing mute ownership.
        page.reload(wait_until="domcontentloaded",timeout=60000)
        page.wait_for_selector("#movie_player video",timeout=30000)
        await_status(lambda s:s["videoId"]==VID and s["load"]=="loaded",20)
        play()
        wait_for_content()
        seek(20);restored();seek(20,True);restored(True);seek(5);shielded()
        def pre_muted():
            seek(20);return restored(True)
        check("Existing user mute is preserved after a segment",pre_muted)
        seek(20,False);seek(5);shielded()
        def disabled():
            toggle("enabled",False);return restored()
        check("Turning shield off restores changes during a segment",disabled)
        def enabled_again():
            toggle("enabled",True);return shielded()
        check("Turning shield on re-evaluates the current paused position",enabled_again)
        def ad_suspension():
            page.evaluate("document.querySelector('#movie_player').classList.add('ad-showing')")
            restored();assert status()["adPlaying"]
            page.evaluate("document.querySelector('#movie_player').classList.remove('ad-showing')")
            shielded();return "Real YouTube page, simulated ad-showing class; no claim of a naturally served ad"
        check("Ad-showing class suspends shield; removing it resumes",ad_suspension)
        # Real YouTube recommended-video link, clicked through its normal SPA router.
        seek(20,False)
        links=page.locator("a[href^='/watch?v=']").evaluate_all("nodes=>nodes.map(n=>n.getAttribute('href'))")
        target=next(link for link in links if urllib.parse.parse_qs(urllib.parse.urlsplit(link).query).get("v",[""])[0]!=VID)
        nextid=urllib.parse.parse_qs(urllib.parse.urlsplit(target).query)["v"][0]
        report["navigation"]={"target":target,"videoId":nextid}
        page.evaluate("window.__ytssE2EDocument='same-document-check'")
        # Return to a protected position immediately before leaving, to check restoration.
        seek(5);shielded()
        old_video=page.locator("#movie_player video").element_handle()
        
        page.locator("a[href="+json.dumps(target)+"]").first.click(timeout=15000)
        page.wait_for_url(lambda url:urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get("v",[""])[0]==nextid,timeout=30000)
        assert page.evaluate("window.__ytssE2EDocument")=="same-document-check"
        s=await_status(lambda s:s["videoId"]==nextid and s["load"] in ["loaded","error"],20)
        assert s["load"]=="loaded" and not s["overridden"]
        old_state=old_video.evaluate("v=>({muted:v.muted,blur:v.classList.contains('ytss-blurred')})")
        assert not old_state["blur"] and not old_state["muted"]
        record("Real SPA navigation discards old segments and restores old video",detail={"status":s,"oldVideo":old_state,"sameDocument":True})
        report["requiredComplete"]=all(row["status"]=="pass" for row in results)
        snap("08-second-video")
        # Exercise the opt-in on a live API-confirmed early selfpromo segment.
        SECOND="wUVWuH9RDGQ";secondapi=api(SECOND);report["selfpromoApi"]=secondapi
        assert any(s["category"]=="selfpromo" for s in secondapi["response"]["segments"])
        page.goto("https://www.youtube.com/watch?v="+SECOND+"&t=8s",wait_until="domcontentloaded",timeout=60000)
        page.wait_for_selector("#movie_player video",timeout=30000)
        s=await_status(lambda s:s["videoId"]==SECOND and s["load"]=="loaded",20)
        play()
        wait_for_content()
        promo=next(s["segment"] for s in secondapi["response"]["segments"] if s["category"]=="selfpromo")
        promo_target=promo[0]+min(1,(promo[1]-promo[0])/2)
        report["selfpromoInterval"]=promo
        report["selfpromoTarget"]=promo_target
        report["selfpromoTitle"]=page.title()
        assert not any(seg["category"]=="sponsor" and seg["segment"][0]<=promo_target<seg["segment"][1]
                       for seg in secondapi["response"]["segments"])
        seek(promo_target,False);restored()
        s=status()
        assert not s["includeSelfpromo"] and not s["active"]
        record("Self promotion stays visible and audible with default setting",detail=s)
        toggle("includeSelfpromo",True);shielded()
        record("Self promotion toggle applies to real API-confirmed segment",detail=snap("09-selfpromo-on"))
        toggle("includeSelfpromo",False);restored()
        record("Turning self promotion off restores audio and visuals")
        popup.reload();page.bring_to_front();popup.wait_for_timeout(1200)
        assert popup.locator("#enabled").is_checked() and not popup.locator("#includeSelfpromo").is_checked()
        assert popup.locator("#playbackMode").count()==0
        assert "playbackMode" not in status()
        record("Both settings persist across popup reload; legacy mode is ignored")
        if report.get("realAds"):
            record("Naturally served YouTube ads stay unshielded",detail={"observations":len(report["realAds"])})
        ctx.close();ctx=None

        report["complete"]=True
    except Exception as exc:
        report["complete"]=False;report["fatal"]=str(exc);report["traceback"]=traceback.format_exc()
        record("Required real-browser sequence completed","fail",str(exc))
        try:
            report["lastStatus"]=status()
            report["lastMedia"]=media()
            report["visiblePlayerText"]=page.locator("#movie_player").inner_text()
            report["nativePlayerData"]=page.evaluate("document.querySelector('#movie_player').getVideoData?.()")
            snap("failure")
        except Exception as capture:
            report["captureError"]=str(capture)
    finally:
        report["finished"]=datetime.now(timezone.utc).isoformat()
        report["summary"]={kind:sum(t["status"]==kind for t in results) for kind in ["pass","fail","blocked"]}
        persist()
        print("SUMMARY",json.dumps(report["summary"]),flush=True)
        if ctx:ctx.close()
sys.exit(0 if report.get("complete") and not report["summary"]["fail"] else 1)

