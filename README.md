# Sponsor Shield 1.5.0

Sponsor Shield mutes audio and blurs the video during community-marked sponsor segments on regular YouTube watch pages. Playback continues at its normal position. YouTube’s controls stay usable, and **Show anyway** lets you watch the current segment.

Version 1.5.0 uses the Sponsor Shield name and activates already-open supported tabs on install/update, with a duplicate-instance guard and invalidated-context cleanup. The existing overlay and popup design is retained. It never seeks, changes playback speed, or starts playback. Automatic skipping, Skip, Undo and the playback mode setting have been removed. Sponsor chapters are not detected.

## Install

1. Download or copy [sponsor-shield-1.5.0.zip](release/sponsor-shield-1.5.0.zip) and extract it to a permanent folder.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Already-open, loaded YouTube tabs activate automatically when site access is allowed. Discarded tabs receive the regular content script when Chrome loads them. No page reload is needed for a fresh install.
5. Open a regular YouTube watch page. Open the extension’s toolbar popup to change settings or see the current video’s status.

You can also load this project directory directly. No build step or runtime dependencies are required. The ZIP contains only the extension’s 13 runtime files.

To update an existing installation, replace its files and click **Reload** on its extension card. Running 1.5.0 instances retire their observers, timers, event listeners and owned mute/blur when their extension context is invalidated. Duplicate injection preserves a single instance. **One-time legacy migration:** when upgrading from 1.4.0 or older, reload open YouTube tabs once; those already-running versions lack the disposal hook, and new code cannot retroactively add it to their closures. The enabled and self-promotion preferences remain supported. The old `playbackMode` preference is ignored, even if it says automatic skipping; there is no mode setting in this release.

## Using the shield

- **Shield sponsor segments** is on by default. **Include self promotion** is off by default. Both settings are saved locally.
- Overlapping or touching supported segments are combined. Inside a segment, a card over the blurred picture shows a live countdown (m:ss), a progress bar and **Show anyway**. Small players get a compact one-row card. YouTube’s control bar stays above the blur. After its end, the video becomes clear and audio is restored if the extension muted it.
- **Show anyway**, or unmuting through YouTube’s own control, overrides the current combined segment for this video session. Seeking back into that segment keeps your choice. Overrides reset on another video or a page reload.
- A mute that existed before segment entry remains in place afterward. The extension never changes volume. If you use Show anyway on an already-muted video, it stays muted.
- Seeking with YouTube’s controls into a segment applies the shield once the media is ready, including while paused. Pausing freezes the countdown. The extension releases its changes during an unsettled seek or unloaded stream.
- Turning the shield off immediately releases its changes; turning it on checks the current position. The self-promotion setting also applies immediately.
- Shielding pauses while YouTube’s player reports an ad through its `ad-showing` class. Ads are not sponsor segments.
- Navigation between YouTube watch pages clears old data and choices. Late responses for a previous video are discarded. Leaving a watch page restores the extension’s changes.
- Sponsor segments are marked in amber on YouTube’s own progress bar, and the toolbar icon shows a badge with the number of segments on the current video.
- The popup shows the current status in plain language (for example **Back in 0:24** or **2 sponsors ahead**), a mini timeline of the video with its sponsor segments, and the total sponsor time shielded on this device. An initial lookup failure leaves playback available and offers **Try again**. The popup follows the system light or dark theme.

## Updated segment data

While the video is playing in a visible tab, the extension rechecks SponsorBlock about every three minutes, with ±10% timing jitter. If the first successful lookup finds no supported segments, one earlier recheck runs at about 60 seconds. Scheduled refreshes bypass the cache and share any existing request for that video.

Pausing, hiding the tab, ending playback, disabling the shield, ads or leaving the watch page stop scheduled requests. An existing request can finish; obsolete results are discarded. After a long pause, an overdue refresh waits about 15 seconds on resume. Failures back off exponentially from about three minutes to about 30 minutes plus jitter. HTTP 429 also respects a bounded Retry-After cooldown.

New records are combined with the last good data; matching UUIDs use the newer record. Refresh failures preserve previous ranges. If a new range covers the current position, mute and blur applies normally. A refreshed range overlapping an overridden segment preserves that choice; a larger merged range can therefore also remain unshielded.

## Privacy and permissions

The service worker requests data from SponsorBlock’s [public API](https://wiki.sponsor.ajay.app/w/API_Docs) using only the first four hexadecimal characters of the video ID’s SHA-256 hash in `/api/skipSegments/<prefix>`. It chooses the exact video locally. SponsorBlock can see the hash prefix, request timing and ordinary connection information, including your IP address. Hash prefixes reduce disclosure but do not guarantee anonymity.

Both sponsor and self-promotion data are requested; the self-promotion toggle filters locally. The provider’s `skip` and `mute` action labels identify supported records; both are handled using mute and blur. The API endpoint name does not cause playback to skip.

The extension sends no votes, submissions, account information, playback positions, viewing reports or telemetry. Requests omit credentials. It stores the two preferences and a running total of shielded sponsor time locally and keeps a small segment cache in the worker’s memory: at most 48 videos for ten minutes. Empty/404 results are cached; errors are not. The cache disappears when Chrome stops the worker. Requests time out after eight seconds, responses are capped at 1 MiB, and IDs and response schemas are validated.

Permissions:

- `storage` saves the two local preferences and the shielded-time total.
- `activeTab` is retained for the user-initiated popup?s access to the current tab. Its YouTube access overlaps the explicit hosts below.
- `https://sponsor.ajay.app/*` permits segment lookups.
- YouTube content-script matches permit shielding and responding to YouTube’s navigation without a full page load.

This is independently written original JavaScript, CSS and HTML. No existing extension source was consulted, copied or adapted. SponsorBlock provides data; this is not its official extension. Icons are original generated shapes.

## Data licence

**Segment data from SponsorBlock (sponsor.ajay.app), CC BY-NC-SA 4.0.**

The [CC BY-NC-SA 4.0 data licence](https://creativecommons.org/licenses/by-nc-sa/4.0/) requires attribution, noncommercial use and ShareAlike for adaptations of that data. The popup includes the attribution and licence link. The data licence is separate from the original extension code.

## Limitations

- Supports regular HTTPS `youtube.com/watch` and `www.youtube.com/watch` pages, including navigation between videos. Shorts, embeds, mobile YouTube and other sites are outside this release.
- Coverage and timing depend on community submissions. Missing or incorrect segments cannot be identified reliably. Chapter titles are not used for detection.
- A sponsor at the beginning can be visible or audible before the initial API request finishes. A network failure can leave content unshielded. Cached data can be up to ten minutes old before a playback refresh.
- YouTube’s DOM and player behavior can change. Ad suspension depends on its `ad-showing` class and does not identify server-inserted ads without that signal.
- YouTube’s mute icon can show its own player-level state even when the extension has muted the actual media element. The overlay and popup indicate shielding.
- Background-tab throttling can delay boundary checks. Checks always use actual playback time.
- Blur is a viewing preference, not an access restriction; the underlying video remains accessible.
- The real E2E uses Playwright’s bundled Chromium. It does not establish compatibility with every installed Chrome version, account, region or YouTube layout. This package has not been submitted to the Chrome Web Store. See [TESTING.md](TESTING.md) for verified results and remaining gaps.

## Testing and release verification

```powershell
node --test
python store/tools/package_release.py
python store/tools/check_permissions.py
python store/tools/check_lifecycle.py
python store/compose/capture.py
python -u store/tools/run_e2e.py
```

Current results: **59 unit tests passed, 0 failed**; **19 live YouTube E2E checks passed, 1 failed**; **5 Chromium lifecycle checks passed, 0 failed** with a separately labeled synthetic player. The live run loaded the extracted ZIP only after the real watch page was open and confirmed natural mute/blur and restoration without reloading that document. A later harness backward-seek buffer precondition timed out, before issuing the seek; later live checks were not reached. See [TESTING.md](TESTING.md) for exact evidence and limits.

`tests/no-seeking.test.js` contains the grep-able **NO_EXTENSION_SEEKS** contract, scanning all runtime JavaScript. Content tests make playback time read-only to the extension.

The package script creates `release/sponsor-shield-1.5.0.zip` and verifies its 13 runtime files, CRCs, references and source bytes, then extracts to `.test-env/release-unpacked-v150`. Browser downloads, profiles, temporary files and logs remain under `.test-env`. The existing bundled Chromium and Python Playwright setup is described in `.test-env/setup.ps1`; the scripts use that local browser installation. Pillow is used only to inspect captured PNGs. No tooling ships in the runtime ZIP.

## Chrome Web Store kit

[store/listing.md](store/listing.md) contains listing text, single purpose, all permission justifications and privacy-form answers. [store/privacy.html](store/privacy.html) is a standalone light/dark, mobile-friendly policy with no external resource requests. **CONTACT_EMAIL must be replaced and the policy hosted before submission.**

The seven opaque images in `store/images/` reuse the current UI, icons and colors. Five are 1280 ? 800 screenshots; the promo tile is 440 ? 280 and marquee is 1400 ? 560. The composition uses an original locally generated SVG landscape and explicitly mocked segment data, with the actual runtime overlay and popup. It contains no real creator, YouTube page or YouTube UI chrome. Reproduction and provenance: [store/compose/README.md](store/compose/README.md).

Follow [store/SUBMISSION_CHECKLIST.md](store/SUBMISSION_CHECKLIST.md) to upload the ZIP, fill each dashboard field, host the policy and finish human browser checks. The kit is prepared; the policy is not hosted and the package is not submitted or approved. Nothing was committed or pushed by this task.
