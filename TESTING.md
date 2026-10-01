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
