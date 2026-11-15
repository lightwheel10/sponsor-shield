# Sponsor Shield 1.6.0 submission checklist

Steps marked [x] are done. The rest need the publisher (a human with the Chrome Web Store account).

## 1. Package and checks

- [x] Version 1.6.0; 106-character short description; MIT licence for the code.
- [x] Build `release/sponsor-shield-1.6.0.zip` with `store/tools/package_release.py`: 19 runtime files (adds the caption reader, AI flow, server address and welcome page); valid CRCs; byte match with source.
- [x] AI checks are off until the viewer agrees on the welcome page or in the popup (Chrome's in-product disclosure and consent rule). Browser test: 9 of 9 passed, including no server request while off. See [TESTING.md](../TESTING.md).
- [ ] Install 1.6.0 in an everyday browser and watch a few videos (see TESTING.md).
- [ ] Review the screenshots below. They show 1.5.0 screens; they are still accurate, but none shows AI checks or the welcome page. Optional: add one.

## 2. Privacy policy

- [x] Contact email set in [privacy.html](privacy.html): paras@spectrumailabs.com.
- [x] Hosted at **https://sponsor-shield.spectrumailabs.com/privacy** (nginx on the VPS, HTTPS, no scripts). Enter this URL in the Privacy practices tab.
- [ ] Review the policy and [listing.md](listing.md), including data recipients (SponsorBlock, the Sponsor Shield server, DeepSeek) and the Limited Use certifications.

## 3. Prepare the developer account

- [ ] Sign in to the intended publisher account at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] Register if needed, accept the developer agreement and pay the dashboard’s one-time registration fee. The human must choose the account and make any payment. See [official account registration](https://developer.chrome.com/docs/webstore/register).
- [ ] Complete the dashboard’s publisher/contact verification, account security and any applicable identity/trader declarations. Use actual details; none are supplied or invented in this kit.

## 4. Upload and fill the fields

Click **Add new item → Choose file → Upload**, selecting **`release/sponsor-shield-1.6.0.zip`**. Do not upload the repository, store folder, old ZIPs, test fixtures, screenshots as runtime files, or `.test-env`.

| Dashboard destination | Value / source |
| --- | --- |
| Package | Verify Sponsor Shield, 1.6.0, Manifest V3 and the expected permissions (adds sponsor-shield.spectrumailabs.com). |
| Store listing: name | Sponsor Shield (manifest). |
| Store listing: summary | Short description in `listing.md` (matches manifest, 106 characters). |
| Store listing: detailed description | Copy only the “Long description” section of `listing.md`, without the internal preparation notes. |
| Store listing: language/category | English; suggested Functionality & UI under Productivity, using the closest actual dashboard label. |
| Store listing: icon | `../icons/shield-128.png` (the same icon is in the ZIP). |
| Store listing: screenshots | Upload the five numbered PNGs listed below, in order. |
| Store listing: small promotional tile | `images/promo-small.png`. |
| Store listing: marquee | `images/promo-marquee.png` (optional store placement; supplied). |
| Store listing: support/homepage links | Human supplies real maintained URLs if used; leave optional fields blank rather than inventing links. |
| Privacy practices: single purpose | `listing.md` → Single purpose. |
| Privacy practices: each permission and host | `listing.md` → Permission justifications. |
| Privacy practices: data usage | `listing.md` → Data usage mapping. Includes locally handled data and unavoidable IP exposure. |
| Privacy practices: remote code | No; use the supplied explanation in `listing.md`. |
| Privacy practices: Limited Use certifications | Human reviews and checks the three certifications described in `listing.md`. |
| Privacy practices: policy URL | https://sponsor-shield.spectrumailabs.com/privacy |
| Distribution | Human chooses countries and public/unlisted/private visibility. Suggested free distribution; respect the data licence’s noncommercial terms. |
| Test instructions | Use the reviewer note below; no account or credentials are required by the extension. |

### Images to upload

| File | Exact pixels | Role |
| --- | --- | --- |
| `images/01-shield.png` | 1280 × 800 | Mute/blur with actual overlay and countdown |
| `images/02-marks-and-badge.png` | 1280 × 800 | Progress marks and illustrative toolbar badge |
| `images/03-show-anyway.png` | 1280 × 800 | Show anyway and actual override popup |
| `images/04-light-and-dark.png` | 1280 × 800 | Actual dark/light popups with sample data |
| `images/05-popup-states.png` | 1280 × 800 | Empty, lookup-error and disabled states |
| `images/promo-small.png` | 440 × 280 | Required small promotional tile |
| `images/promo-marquee.png` | 1400 × 560 | Optional marquee |

All seven are opaque RGB PNGs. They show the real packaged UI with explicit sample data and original generated SVG scenery, not a real creator or a YouTube screenshot. The amber shield icon is reused unchanged. Dimensions follow [Chrome’s image requirements](https://developer.chrome.com/docs/webstore/images).

### Reviewer test note — paste if helpful

No extension account is required. A welcome page opens on install; AI checks are optional and off until you press Turn on AI checks there or use the switch in the popup. Open a regular YouTube watch page with community-marked sponsor segments and allow access to youtube.com, www.youtube.com, sponsor.ajay.app and sponsor-shield.spectrumailabs.com. The popup reports whether segments were found. Playback should continue normally while audio is muted and the picture blurred inside a segment; sound and picture should return at its end. Show anyway restores the current segment without moving the playhead. Self-promotion is off by default. Shorts and embeds are not supported. Community data can change. On 1 October 2026, video g1f7iZehQ2A had a SponsorBlock segment at 28.855–31.355 seconds and the natural mute/blur transition passed in our live test. The extension never seeks. Our automated browser’s later backward-seek setup timed out waiting for buffering; see TESTING.md for the exact partial result.

## 5. Submit, then verify the reviewed build

- [ ] Preview every field and image. Check contact and privacy links again. Resolve dashboard validation errors.
- [ ] Click **Submit for Review**. If the human wants a final release decision after approval, turn off automatic publishing in the confirmation dialog; otherwise make that publication choice deliberately. [Official submission steps](https://developer.chrome.com/docs/webstore/publish).
- [ ] Review any feedback from Chrome. No approval date, placement or acceptance is guaranteed.
- [ ] After approval, install the store-distributed build in ordinary Chrome, confirm its name/version and test activation with an already-open watch tab. Test an actual store-delivered update when one exists.

Public Chrome documentation was checked on 1 October 2026. Dashboard field labels can change. The publisher must verify them in the live account; no dashboard or payment actions were performed here.
