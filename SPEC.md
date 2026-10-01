# YT Sponsor Shield — Chrome extension (MV3)

Build a Chrome extension in this directory that, on YouTube watch pages, mutes the video and
blurs the player during in-video sponsor segments, then restores audio/visuals when the segment ends.

## Hard rules
- **Original code only.** Do not copy, adapt, or consult the source of SponsorBlock's extension or any
  other existing extension. You may use SponsorBlock's *public API documentation* (https://wiki.sponsor.ajay.app/w/API_Docs) as a data source only.
- No build step, no npm runtime dependencies in the extension itself. Plain JS/CSS/HTML.
- Work only inside this directory. Put test tooling, browser downloads (set `PLAYWRIGHT_BROWSERS_PATH`),
  profiles, and artifacts under `./.test-env/` and add a `.gitignore` for it.

## Behaviour (follow your own consultation plan)
- Scope v1: regular `youtube.com/watch` pages incl. SPA navigation between videos. Shorts/embeds out of scope (note in README).
- Detection: SponsorBlock API, category `sponsor` (also accept `selfpromo` behind a popup toggle, off by default).
  Prefer the hash-prefix endpoint (`/api/skipSegments/<first 4 hex of sha256(videoID)>`). Fetch in the service worker, validate
  video ID + response schema, timeout, small bounded cache.
- Content script: timing driven by `video.currentTime` (+ timeupdate/seeking/ratechange/play/pause and a boundary timer),
  merge overlapping segments, handle seeking into/out of segments, pausing, video changes, discard stale responses.
- Mute only if not already muted; restore only what the extension changed. If the user unmutes during a segment, treat it
  as an override for that segment. Show a small overlay on the blurred player: "Sponsor segment — ends in Ns" with a
  "Show anyway" button. Controls must remain usable.
- Suspend while a YouTube ad is playing (player has `ad-showing` class) — do not treat ads as sponsor segments.
- Popup: on/off toggle, selfpromo toggle, current video status (segments found / active), and attribution:
  "Segment data from SponsorBlock (sponsor.ajay.app), CC BY-NC-SA 4.0."
- Include simple icons (generate PNGs yourself; plain shapes are fine).

## Testing (required)
1. Unit tests for pure segment logic (node:test, run with `node --test`).
2. End-to-end: Python Playwright (already installed) with a **headed persistent Chromium context** from Playwright's bundled
   browser, loading the unpacked extension. Find a real YouTube video that currently has sponsor segments in the SponsorBlock API
   (query the API to confirm). Seek to ~3s before a segment start, let it play across the start and across the end.
   Assert: video muted + blur applied inside the segment, restored after. Also test: seek into middle of a segment, pause inside,
   "Show anyway", navigating to another video. Save screenshots to `./.test-env/artifacts/`. Handle cookie-consent pages.
   If YouTube blocks automated playback, report exactly what happened rather than faking results.
3. Write `TESTING.md` with what was run and the real results.

## Deliverables
manifest.json, content script(s), service worker, CSS, popup, icons, tests, README.md (install via chrome://extensions →
Developer mode → Load unpacked; limitations; data licence), TESTING.md.
Final reply: short summary, test results (pass/fail with numbers), known limitations.
