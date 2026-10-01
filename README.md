# YT Sponsor Shield 1.4.0

YT Sponsor Shield mutes audio and blurs the video during community-marked sponsor segments on regular YouTube watch pages. Playback continues at its normal position. YouTube’s controls stay usable, and **Show anyway** lets you watch the current segment.

Version 1.4.0 is mute and blur only, with a redesigned overlay and popup. It never seeks, changes playback speed, or starts playback. Automatic skipping, Skip, Undo and the playback mode setting have been removed. Sponsor chapters are not detected.

## Install

1. Download or copy [yt-sponsor-shield-1.4.0.zip](release/yt-sponsor-shield-1.4.0.zip) and extract it to a permanent folder.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Reload any YouTube tabs that were already open.
5. Open a regular YouTube watch page. Open the extension’s toolbar popup to change settings or see the current video’s status.

You can also load this project directory directly. No build step or runtime dependencies are required. The ZIP contains only the extension’s 13 runtime files.

To update an existing installation, replace its files, click **Reload** on its extension card, then reload YouTube tabs. The enabled and self-promotion preferences remain supported. The old `playbackMode` preference is ignored, even if it says automatic skipping; there is no mode setting in this release.

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
- `activeTab` lets the popup check the active watch page after you open it.
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

Run the dependency-free Node tests from this directory:

```powershell
node --test tests/*.test.js
```

`tests/no-seeking.test.js` contains the grep-able **NO_EXTENSION_SEEKS** contract, checking every runtime JavaScript file for playback-time writes and seek APIs. Content tests also make playback time read-only to the extension.

In this delivered workspace, test tooling and artifacts stay under the ignored `.test-env` directory:

```powershell
python .test-env/package_release.py
python -u .test-env/run_e2e_v130.py
```

The packaging script creates and verifies the runtime-only ZIP, then extracts it into `.test-env/release-unpacked-v130`. The browser runner loads that exact extracted package in a headed persistent context using bundled Chromium. It independently confirms live SponsorBlock data, uses real YouTube playback, and confines native setup seeks to buffered targets. The ad DOM-class simulation is labelled separately. Production intervals and API responses are unchanged. Logs, JSON results and screenshots are in `.test-env/artifacts/v130`.

Browser tooling, profiles, downloads and temporary paths are confined to `.test-env`. They are not part of the release ZIP. Keep that directory if you want to repeat the browser test in this workspace. Local setup instructions are in `.test-env/setup.ps1`.
