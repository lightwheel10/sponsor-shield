# Changelog

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
