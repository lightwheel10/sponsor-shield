# Sponsor Shield — v1.5.0 testing

Test date: **1 October 2026**. All created/changed files, browser profiles, temporary files, generated art and screenshots are inside this project. No commit, push, store upload or publication was performed.

## Current results

| Suite / check | Passed | Failed | Scope |
| --- | ---: | ---: | --- |
| `node --test` | 59 | 0 | 0 skipped; original 51 tests plus 5 content lifecycle and 3 install-handler tests |
| Live YouTube E2E, one run | 19 | 1 | Actual pre-install watch tab, real playback and live SponsorBlock; later scenarios not reached |
| Chromium lifecycle fixture | 5 | 0 | Actual install/reload/duplicate injection/uninstall; synthetic page/media |
| Store presentation checks | 31 | 0 | 7 exact-size opaque images, 20 popup scenarios, 4 policy layouts; sample data |
| Permission-warning comparison | 1 | 0 | Actual Chromium warning API comparing archived 1.4.0 with 1.5.0 |

The release kit is prepared and the extracted package loads, but the live E2E is **partial, not all green**. A contact address, hosted privacy policy, publisher declarations and remaining ordinary-Chrome checks are still needed before human submission.

## Code and unit coverage

Run `node --test` from the repository root. Log: `.test-env/artifacts/v150/unit-tests.txt`. Totals: **59 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo**.

- Segment logic: 17; content state/lifecycle: 21; no-seeking contract: 2; refresh scheduler: 5; service worker: 11; install handler: 3.
- Added coverage checks one instance after repeated injection, retained Show anyway overrides, owned mute/blur cleanup, timer/listener/observer disposal when runtime.id disappears, synchronous and rejected “Extension context invalidated” failures, late lookup responses, handoff to a replacement instance, and preservation of pre-existing mute.
- Fake Chrome install/update tests check both URL patterns, main-frame injection, CSS before the ordered scripts, independent failure of closed/restricted tabs, discarded tabs, ignored browser-only updates, empty queries and query rejection.
- **NO_EXTENSION_SEEKS** passes against all runtime JavaScript. Fake media time throws on any extension write. The extension does not seek, change playback speed or start playback.

One intermediate unit run preceded the fake Chrome API updates and failed because the fixtures lacked the new event/runtime interfaces. The final run uses the completed fixtures and production code. The log-writing wrapper later hit a Windows console Unicode-print error after the Node run and log write succeeded; that was not a test failure.

## One live YouTube run: 19 passed, 1 failed

Command: `python -u store/tools/run_e2e.py`. Started **10:02:24 UTC**, finished **10:03:12 UTC**, 1 October 2026. Headed persistent Playwright bundled Chromium **145.0.7632.6**, fresh local profile, loaded `.test-env/release-unpacked-v150` extracted from `release/sponsor-shield-1.5.0.zip`. No provider response, playback media or production refresh interval was mocked.

The harness opened `https://www.youtube.com/watch?v=g1f7iZehQ2A&t=20s` before loading the extension. Then the browser-level CDP `Extensions.loadUnpacked` command loaded the extracted package and Chrome fired its actual onInstalled event. The popup reported Sponsor Shield 1.5.0 and the content script returned live data. A document marker survived through natural shielding; no page reload occurred. An additional actual scripting injection left the tab responsive and only one overlay appeared.

A fresh independent SponsorBlock hash-prefix lookup confirmed **28.855–31.355 seconds**. The extension independently fetched the same interval. After a buffered harness setup seek to 25.855 seconds, real playback crossed both boundaries naturally:

- At **29.099689 s**: playing, muted, blur applied, countdown card visible.
- At **31.547105 s**: playing, unmuted, blur class removed, overlay hidden. The computed filter was still partway through the existing 350 ms CSS fade-out; later snapshots show `none`. The first exit capture did not yet have zero computed blur.
- **0 seeking events** during the natural crossing. No extension playback-time write, removed Skip/Undo UI or visible player error was observed.

Other passing checks covered release loading, live lookup, popup defaults/attribution, paused entry, frozen pause/time, popup active status/timeline, native controls remaining clickable, restoration on seek-out, Show anyway and its memory on re-entry. The six completed setup seeks were harness calls to the native player, between 25.855 and 34.355 seconds; each target was checked for buffering.

### Exact failure and what was not reached

The harness next tried to prepare native-unmute testing in the earlier 0–15.444 s sponsor. Its target was **7.722 s**, while paused at **30.105 s**. Waiting for the target to be buffered timed out after 20 seconds:

```text
Page.wait_for_function: Timeout 20000ms exceeded.
```

**No seek to 7.722 s was issued.** This is a buffer-precondition failure, not an observed rejected seek or extension failure. At capture the video was paused, readyState 4, not seeking, unmuted and unblurred; the Show anyway override remained. Player text was `0:30 / 29:09` and `Intro`; native player data reported isPlayable=true and errorCode=null, and video.error was null. **0 JavaScript page errors** were recorded. YouTube emitted console/network diagnostics retained in the JSON; those are not covered by the zero-page-errors statement.

The robot-browser seek limitations from earlier releases remain relevant context, but this run did not show a “Something went wrong” player error. The single live run was not retried or changed to obtain a green result.

Not reached in the current live run: native unmute override, pre-existing mute preservation, live on/off changes, ad suspension simulation, real watch-to-watch SPA navigation, self-promotion opt-in, popup reload persistence, and the three-minute scheduled refresh. No naturally served ad was observed. These are not counted as passed because historical results or unit tests exist.

Evidence: `.test-env/artifacts/v150/e2e-results.json`, `e2e-console.txt`, `01-before-segment.png` through `06-show-anyway.png`, and `failure.png`. Real YouTube screenshots are evidence only and are not store images.

## Chromium lifecycle and permission checks

`python store/tools/check_lifecycle.py`: **5 passed, 0 failed**, **0 page errors**. This uses an intercepted synthetic watch document and explicit media-property shims in the extension’s isolated world, plus real SponsorBlock lookup. Actual installation activates the existing document; `chrome.runtime.reload()` retires the old 1.5.0 instance and triggers unpacked update injection in the same document; repeated scripting injection leaves one overlay; uninstall invalidates the context and restores its mute/blur without reload. This tests browser lifecycle plumbing, not real playback or a Web Store-delivered update.

Two initial lifecycle fixture attempts failed before product assertions: main-world media-property shims were invisible to the isolated extension world, then a canvas fixture did not reach readiness. The corrected harness and final results are retained with an explanation in `lifecycle-harness-notes.md`. Those were synthetic harness attempts, not additional live E2E runs.

`python store/tools/check_permissions.py`: **1 comparison passed**. Chromium’s `chrome.management.getPermissionWarningsByManifest` returned the same single warning for the archived 1.4.0 manifest and the current manifest:

> Read and change your data on sponsor.ajay.app, www.youtube.com, and youtube.com

Thus adding scripting and explicit hosts already covered by content-script matches produces no additional warning in this browser. A first probe used a page-level CDP session and was rejected with “Method not available”; the final harness uses the correct browser-level session. No management permission was added. See `permission-warnings.json` and [Chrome permission documentation](https://developer.chrome.com/docs/extensions/reference/permissions-list).

Legacy limitation: already-running 1.4.0 and older code has no disposal hook. New code cannot retrofit cleanup into those closures, so existing developer installations need a one-time page reload when migrating to 1.5.0. Fresh install into an open tab and cleanup of 1.5.0 instances are verified above. An actual legacy-to-current live-browser upgrade was not tested.

## Store images and policy

`python store/compose/capture.py`: **31 checks passed, 0 failed**, **0 recorded console/page errors**, **0 external requests**. Seven captures are opaque RGB PNGs: five at exactly **1280 × 800**, one **440 × 280**, one **1400 × 560**. Other checks cover ten popup scenarios in each system theme (including ad, override and completed-video copy) and policy layout in both themes at 360 px and 1280 px. No horizontal overflow was observed.

All seven final images were visually reviewed. The real overlay CSS/JS and actual popup HTML/CSS/JS were used with mock Chrome/player data. The light popup is a separate actual Playwright capture embedded beside the dark popup because context-wide media emulation affected both iframes. An initial capture-harness API mismatch was fixed; an initial side-by-side image incorrectly showed both popups dark and was replaced after visual review. Final images, not those drafts, are in `store/images/`.

Original generated scenery is local SVG code in `store/compose/artwork.svg`; it uses no fetched art or real creator/brand. The existing icon and amber/dark design are reused unchanged. The mock player is generic and the toolbar-badge representation is labeled illustrative. These images prove presentation only, not real YouTube behavior. No external image generator was used.

The policy is standalone HTML with inline CSS, no scripts and no external resource requests. The required `CONTACT_EMAIL` placeholder remains for the human publisher. It is not hosted. Logs and policy captures: `.test-env/artifacts/v150/store-visuals.json`, `store-visuals-console.txt`, `privacy-*.png`.

## Release archive verification

`python store/tools/package_release.py` builds **release/sponsor-shield-1.5.0.zip**, **27,589 bytes**, with manifest at the ZIP root and exactly **13 runtime files**. Tests, docs, composition assets and tooling are excluded. CRCs, resource references, PNG signatures and every archived source byte were verified. Source and extracted bytes were rechecked after testing; no runtime files changed after the package used in the live test was built.

SHA-256:

```text
c8ce4d382acb55fe50aa6f95863c763a5cab40ac7331c3aa85df7d2d4867c8d0
```

Files: manifest.json, content.js, content.css, segment-logic.js, refresh-scheduler.js, service-worker.js, popup.html, popup.js, popup.css, icons/shield-16.png, icons/shield-32.png, icons/shield-48.png and icons/shield-128.png. The extracted ZIP loaded as Sponsor Shield 1.5.0 in actual Chromium.

The current short description is **98 characters**. Historical CHANGELOG entries, prior archives and the historical testing report below are retained. Current human work is in [store/SUBMISSION_CHECKLIST.md](store/SUBMISSION_CHECKLIST.md).

---

## Historical reports (unchanged below; not current v1.5.0 verification)

# Testing — v1.3.0

Test date: **1 October 2026**. All edits, tooling, downloads, profiles, temporary files and artifacts stayed inside this project directory. Original extension code was used.

## 1.4.0 UI redesign — 2026-10-01

UI-only release: overlay card, progress-bar marks, toolbar badge, popup redesign and new icons. Sponsor handling is unchanged (mute and blur, no seeking).

- Unit tests (`node --test`): **51 passed, 0 failed**, including `NO_EXTENSION_SEEKS`. The content test now checks the m:ss countdown, the one-time screen-reader announcement and the badge message.
- Visual review: popup rendered in every state (active, ready, no segments, idle, checking, error, off) in light and dark themes with mocked status data, and the overlay at 854×480, 1600×900, 560×315 and 400×225 player sizes with a mock player (`.test-env/ui/`, screenshots in `.test-env/ui/shots/`). No console errors.
- Real headed Chromium on live YouTube, extracted `release/yt-sponsor-shield-1.4.0.zip` (`.test-env/run_e2e_v140.py`): **17 passed, 1 failed**. Passed: ZIP loads as 1.4.0, live lookup, popup defaults and attribution, natural sponsor entry (muted, blurred, new card with countdown and Show anyway, segment marks on YouTube's progress bar), natural exit, zero seeks, paused seek-in, pause, popup "Shielding now / Back in m:ss" with timeline, YouTube controls usable, seek-out restore, Show anyway and its memory. Failed: the harness's backward setup seek into the 0–15 s segment timed out (the same YouTube robot-browser seek problem documented above); native unmute, mute ownership after reload, SPA navigation, ads and self-promotion were not reached in this run. Their logic is unchanged from 1.3.0 and covered by unit tests.
- Screenshots: `.test-env/artifacts/v140/`.

## Results

- **Unit tests: 51 passed, 0 failed, 0 skipped.**
- **Real YouTube E2E: 17 checks passed, 1 failed.** One full run, no retry or second browser attempt. The natural mute/blur flow passed; a harness buffer-readiness timeout prevented later checks.
- **Release archive verified:** MV3 version 1.3.0, exactly 13 runtime files, valid ZIP CRCs, all referenced resources present, all archived bytes identical to the current source. The extracted archive loaded and was the package used for the E2E.

This is a prepared release package with a **partial browser suite**, not an all-green E2E result.

## Unit run

```powershell
node --test tests/*.test.js
```

Run once after the v1.3.0 changes, using Node’s built-in runner. Log: `.test-env/artifacts/v130/unit-tests.txt`.

| Area | Passed | Coverage |
| --- | ---: | --- |
| Segment logic | 17 | URL scope, schema and bounds, filtering, merge/sort, boundaries, rate-adjusted checks, override overlap |
| Content state | 16 | Entry/exit, pause/resume, mute ownership, Show anyway, user unmute, ads, enable/selfpromo settings, navigation, refresh updates/errors/deduplication/staleness, readiness, legacy modes and activity gates |
| No seeking contract | 2 | Runtime source scan and forbidden/allowed fixtures |
| Refresh scheduler | 5 | Fake-clock cadence, early empty-result recheck, stop/resume, backoff, jitter/cap, single flight and disposal |
| Service worker | 11 | Hash-prefix API, sender/schema validation, bounded cache, deduplication, errors/404, timeout/size, SPA sender handling, cache bypass and 429 cooldown |
| **Total** | **51** | **0 failures** |

`tests/no-seeking.test.js` contains the grep-able **NO_EXTENSION_SEEKS** assertion. It scans all root runtime JavaScript and checks that manifest scripts and popup.js are included. It rejects currentTime assignments, compound/increment writes, bracket writes, seekTo/fastSeek identifiers and common property-set APIs. Forbidden fixtures fail; ordinary reads and comparisons pass. Content tests also use a currentTime setter that throws if extension code writes to it. Test positioning changes an internal fake clock directly.

The runtime has no automatic-skip logic, Skip handler, Undo toast, mode control, playback-time write or player seek call. The API’s `skip` action label and `/api/skipSegments/` endpoint remain data inputs. Legacy playbackMode values are ignored, including live storage changes.

## Real browser run

```powershell
python -u .test-env/run_e2e_v130.py
```

Started **05:25:24 UTC**, finished **05:26:14 UTC**, on 1 October 2026. Headed persistent Playwright bundled Chromium **145.0.7632.6**, with a fresh workspace-local profile. The loaded extension was `.test-env/release-unpacked-v130`, extracted from the release ZIP; its popup runtime confirmed version 1.3.0. Browser and temporary paths were inside `.test-env`.

Real video: [The UNSCAMMABLE PC - Feat. Kitboga](https://www.youtube.com/watch?v=g1f7iZehQ2A), Linus Tech Tips. An independent live SponsorBlock hash-prefix query confirmed **28.855–31.355s** immediately before the run; the extension independently fetched the same data. No media, API response or production interval was substituted.

The page started near 20 seconds. The harness positioned playback at **25.855s**, three seconds before the segment, after checking that the target was buffered. Playback crossed both boundaries naturally at normal speed:

- **29.056704s:** playing, muted, CSS `blur(24px)`, required countdown overlay visible.
- **31.542367s:** playing, unmuted, no blur, overlay hidden.
- **Zero seeking events** during the crossing, even with an old automatic-skip preference stored. No Skip button or Undo toast existed.

All six completed setup seeks were native YouTube calls by the harness, to buffered targets between **25.855s and 34.355s**. The largest jump was about 4.25 seconds. The extension did not seek.

The 17 passing checks verified live API confirmation, the extracted ZIP loading, the worker’s real lookup, popup defaults and attribution, real playback readiness, clear/audible playback before the segment, natural shielding at entry, restoration at exit, zero seeks/removed UI/player errors during the crossing, paused middle entry, frozen pause/countdown, popup active status, usable native controls, restoration on seeking out, Show anyway, and remembering Show anyway on re-entry.

### Exact failure and checks not reached

The next setup was for native user-unmute, using the first sponsor range **0–15.444s**. Its target was **7.722s**, with playback paused at **30.105s**. The harness waited 20 seconds for the earlier target to appear in the buffered ranges. It never did. Playwright reported:

```text
Page.wait_for_function: Timeout 20000ms exceeded.
```

**No seek to 7.722s was issued.** This failed buffer precondition is not an observed rejected player seek. At capture, media stayed paused at 30.105s, readyState 4, not seeking, unmuted and unblurred, with the Show anyway override retained. The visible player text was `0:30 / 29:09` and `Intro`; it did **not** show “Something went wrong.” Native getVideoData reported isPlayable=true and errorCode=null. video.error was null. No JavaScript page errors were recorded.

Not verified in this v1.3.0 browser run: native-control unmute override, pre-existing mute preservation, live on/off settings, ad suspension, actual YouTube SPA navigation, live self-promotion opt-in, popup reload persistence or scheduled refresh after three minutes. These state/scheduler behaviors passed unit tests. Earlier-version browser results are not counted as current verification. No naturally served ad was observed; the planned ad DOM-class simulation was not reached. Actual live HTTP 429 behavior was not elicited; cooldown handling uses unit fixtures.

The run was not repeated, and the extension was not changed to make it pass. This run does not establish compatibility across installed Chrome versions, accounts, regions or future YouTube layouts.

## Release verification

```powershell
python .test-env/package_release.py
```

Archive: `release/yt-sponsor-shield-1.3.0.zip`, **14,263 bytes**.

SHA-256:

```text
438d05b42c49dd79d65ed45c8de1aff3240b6721e44b41a9510e49afb7b26936
```

The 13 files are manifest.json, content.js, segment-logic.js, refresh-scheduler.js, service-worker.js, content.css, popup.html, popup.js, popup.css and four PNG icons. The manifest is at the ZIP root. Tests, SPEC, README, TESTING, CHANGELOG and .test-env are excluded.

Manifest, popup script/style/image and worker import references were verified. PNG signatures and ZIP integrity were checked. Archive bytes were rechecked against source after the browser run. The actual extracted ZIP loaded as version 1.3.0 in Chromium, and its popup and content script operated on real YouTube. No runtime files changed after packaging/testing.

The package is prepared for unpacked installation. No Chrome Web Store submission or external publication was performed.

## Evidence

All current evidence is under `.test-env/artifacts/v130/`:

- `unit-tests.txt`, `e2e-console.txt`, `e2e-results.json`, `package-verification.json`.
- `01-before-segment.png`, `02-inside-segment.png`, `03-after-segment.png`, `04-seek-middle-paused.png`, `05-popup-active.png`, `06-show-anyway.png`, `failure.png`.
- `previous-v121-review.md` preserves the review read before this work.

Screenshots are actual browser captures. The inside-segment screenshot was visually inspected and shows the required countdown and Show anyway over a blurred video. The popup capture records active shielding and attribution. The JSON includes every individual check, media snapshots, native setup seeks, the exception and the player state at failure.

## Earlier review and release rationale

The v1.2.1 review found long unbuffered jumps failing with and without the extension in this test browser. On one reviewed long-seek sample, five of five native-seek trials and five of five automatic-skip trials showed a YouTube error, while five of five mute/blur trials avoided it. Short buffered seeks worked in that earlier matrix. The upstream cause was not established; these findings do not prove a general Chrome or YouTube limitation.

Version 1.3.0 removes all extension-driven seeks. The earlier review is retained as historical evidence, separate from this release’s 17-pass/1-fail browser result.
