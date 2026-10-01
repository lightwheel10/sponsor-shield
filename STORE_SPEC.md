# Store launch kit — v1.5.0

Goal: make this extension ready to submit to the Chrome Web Store. Behaviour stays mute & blur only
(no seeking; the NO_EXTENSION_SEEKS test must keep passing). Original work only.

## 1. Rename (trademark-safe)
- Extension name: **Sponsor Shield**. Do not use "YouTube" or "YT" in the name, and no YouTube logo or red play-button styling anywhere.
- Manifest description (≤132 chars) may say it works on YouTube, e.g. "Mutes and blurs sponsor segments in YouTube videos, using community data from SponsorBlock."
- Popup subtitle: replace "for YouTube" with "Mute & blur sponsors". Update README/CHANGELOG/TESTING references
  (keep history entries as they were). The release zip becomes `release/sponsor-shield-1.5.0.zip`.

## 2. Work in tabs that were already open at install/update
- On `chrome.runtime.onInstalled` (install and update), inject `content.css` and the content scripts into existing
  `https://www.youtube.com/*` and `https://youtube.com/*` tabs with `chrome.scripting`. Add the `scripting` permission and the
  two YouTube host permissions (these add no new install warning because the content-script matches already cover YouTube —
  confirm this and note it in README).
- Guard against double injection (a page-level flag checked at the top of content.js; an orphaned old instance after an
  extension update must not keep running — handle `chrome.runtime.id` becoming undefined / "Extension context invalidated").
- Unit-test the guard and the install handler (fake chrome). Real-browser test: open a YouTube watch page first, then load the
  extension, trigger onInstalled, and confirm shielding works in that tab without a reload.

## 3. Store listing text — `store/listing.md`
- Name, short description (≤132 chars), long description (plain, honest, no hype claims; explain: what it does, Show anyway,
  progress-bar marks, badge, privacy, that it depends on community-marked segments, data credit + CC BY-NC-SA 4.0, not affiliated
  with YouTube or SponsorBlock), category suggestion, language.
- Single-purpose statement; justification for every permission (storage, activeTab, scripting, host permissions).
- Data-usage disclosure answers for the Chrome Web Store privacy form (what is collected/transmitted: only a 4-hex-char SHA-256
  prefix of the video ID sent to sponsor.ajay.app; nothing sold; no remote code; local storage of preferences + shielded-time total).

## 4. Privacy policy — `store/privacy.html`
- A standalone, readable, single-file HTML page (light/dark, mobile-friendly, no external requests) suitable for hosting on
  GitHub Pages or any static host. Plain English. Contact placeholder: `CONTACT_EMAIL` (do not invent an address).

## 5. Store images — `store/images/`
- Visual design: REUSE the extension's existing design exactly (content.css overlay card, popup.html/popup.css, icons, the
  amber #FFB224 accent, dark #141418 surfaces). Do not invent a new visual style.
- Build an HTML composition page (`store/compose/`) that renders: a mock video player with ORIGINAL generated artwork (no real
  YouTube pages, no real creators, no brands/logos, no YouTube UI chrome — a neutral generic player is fine) showing the real
  overlay CSS; and the real popup (load popup.html with mocked chrome data) in its states. Capture with Playwright (bundled
  Chromium in .test-env/browsers) at exact sizes:
  - 3–5 screenshots at **1280×800** (e.g. overlay during a sponsor; progress-bar marks + badge; popup states; Show anyway; light/dark popup)
    each with a short headline caption in the image.
  - Small promo tile **440×280**, marquee **1400×560**.
  - Verify exact pixel dimensions, no transparency where the store forbids it (use opaque PNG/JPEG), no console errors.

## 6. Ship
- Bump to 1.5.0, update CHANGELOG/README, run `node --test`, run the real E2E once (reuse/adapt .test-env/run_e2e_v140.py; note
  YouTube robot-browser seek errors honestly), build `release/sponsor-shield-1.5.0.zip` (runtime files only) and verify it loads.
- Write `store/SUBMISSION_CHECKLIST.md`: exact steps to submit (developer account, upload zip, fields → where each answer lives,
  images to upload, privacy URL to fill once hosted).
- Do NOT commit or push; the reviewer will.
