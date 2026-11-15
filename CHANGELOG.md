# Changelog

## 1.6.0 — 2026-11-15

- AI fallback: when SponsorBlock has no sponsor segment for a video, the extension asks the new Sponsor Shield server (`server/`). If the server has no answer yet, the extension reads the video's captions invisibly in the page (`transcript-grabber.js`, page world) and sends them; the server finds paid sponsor parts with DeepSeek using the 3-step method tested on 14 Nov 2026. AI parts are muted and blurred like any other, and the overlay says "found by AI".
- Security: the AI key lives only on the server. The server enforces a daily budget, per-video and per-network limits, and one AI check per transcript, and checks with YouTube that the video exists. Answers are tied to the exact captions, description and paid label they came from, and are shared with other viewers only after 2 different installs on 2 different networks sent the same ones. Answers covering over 40% of a video are never shared. Every server reply is validated in the extension.
- The viewer's caption setting, including YouTube's remembered choice, is restored after reading. Captions and YouTube's track-change notice stay hidden while reading. The extension waits for YouTube ads to end before reading.
- The popup shows "AI is reading this video…" while checking. The footer credits AI checks. The privacy policy draft is updated for the server.
- New permission: `https://sponsor-shield.spectrumailabs.com/*`. Minimum Chrome 111, for the page-world script.
- AI checks are off until the viewer turns them on, as Chrome's user-data policy requires in-product disclosure and consent. A welcome page opens on first install and explains what is sent; the popup has an **AI checks** switch. While off, the service worker refuses every AI request before any network call.
- Code is now MIT-licensed (`LICENSE`); SponsorBlock data keeps its CC BY-NC-SA 4.0 licence.

## 1.5.0 ? 2026-10-01

- Rename the extension to Sponsor Shield; set the popup subtitle to ?Mute & blur sponsors?. Keep the existing amber shield icons, overlay and light/dark popup design.
- Inject packaged styles/scripts into already-open supported YouTube tabs on install/update. Add scripting and explicit YouTube host permissions; the tested Chromium warning list is unchanged from 1.4.0.
- Guard against duplicate injection. Dispose invalidated 1.5.0 instances, restoring owned mute/blur and removing observers, timers and listeners; discard late async results. Legacy pre-1.5.0 pages need a one-time reload because their old code has no disposal hook.
- Change the popup?s completed-video count to ?segments marked? rather than claiming all segments were shielded, since Show anyway and disabled shielding can leave them visible.
- Add store listing/privacy disclosures, a standalone policy, original illustrative store images, composition/capture sources, submission instructions and a runtime-only sponsor-shield-1.5.0.zip.
- Add install and lifecycle unit coverage. The single live YouTube E2E passed 19 checks and failed one later harness buffer precondition; existing-tab activation and natural mute/blur passed. Full evidence and remaining human work are in TESTING.md.
- Behaviour stays mute and blur only; NO_EXTENSION_SEEKS continues to pass.

## 1.4.0 — 2026-10-01

- Redesign the in-video overlay: a frosted card with a shield mark, a large m:ss countdown, a progress bar that fills as the segment plays, **Show anyway** and a SponsorBlock credit. The picture is blurred and dimmed with a soft transition; YouTube's control bar stays usable. A compact layout is used for small players, and a larger one for fullscreen and big theater players. Animations respect reduced-motion settings.
- Screen readers hear one announcement when a segment starts instead of a per-second countdown.
- Mark sponsor segments on YouTube's progress bar (skipped silently if the bar is not found; hidden during ads).
- Show the segment count as a badge on the toolbar icon.
- Redesign the popup: plain-language status for every state, a mini timeline with sponsor segments and the current position, a prominent on/off switch, light and dark themes, a local "sponsors shielded" total and a one-line data credit. The raw video ID is no longer shown.
- New icons.
- Behaviour is unchanged: mute and blur only, no seeking.

## 1.3.0 — 2026-10-01

- Release mute and blur as the only sponsor-handling behavior. Playback continues through sponsor segments.
- Remove automatic skipping, manual Skip, Undo notifications and the playback mode popup setting. Remove all extension playback-time writes and player seek calls. Legacy mode preferences are ignored.
- Keep the countdown overlay and Show anyway, native user-unmute overrides, mute ownership, ad suspension, YouTube SPA navigation, self-promotion preference and SponsorBlock attribution.
- Retain playback refreshes with jitter, cache bypass, request coalescing, exponential backoff and HTTP 429 cooldowns.
- Add the NO_EXTENSION_SEEKS source contract and read-only playback-time content tests. Replace skip-specific tests with mute and blur coverage.
- Prepare a runtime-only ZIP and test its extracted contents against real YouTube. See TESTING.md for actual results and verification boundaries.

## 1.2.1 — 2026-10-01

- Remove chapter detection after review.
- Document YouTube long-seek failures observed both with and without the extension in bundled Chromium. Those findings motivated the mute and blur release in 1.3.0.

## 1.2.0

- Add SponsorBlock rechecks during playback, with polite scheduling and live segment updates.
- Add experimental chapter detection, subsequently removed in 1.2.1.

## 1.1.0

- Add automatic and manual skipping with Undo, subsequently removed in 1.3.0.

## 1.0.0

- Implement the original SponsorBlock-backed mute and blur behavior, popup controls, attribution and tests.
