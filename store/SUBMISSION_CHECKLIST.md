# Sponsor Shield 1.5.0 submission checklist

The local kit is prepared. Nothing has been committed, pushed, hosted, uploaded, submitted or published. A human must complete the unchecked steps. A partial live browser suite is documented in [TESTING.md](../TESTING.md); this is not an all-green release certification.

## 1. Review the package and remaining browser checks

- [x] Rename to Sponsor Shield; version 1.5.0; 98-character short description.
- [x] Keep mute/blur only. Node tests: 59 passed, 0 failed, including NO_EXTENSION_SEEKS.
- [x] Build `release/sponsor-shield-1.5.0.zip`: 13 runtime files; valid CRCs; byte match with source; extracted package loaded in Chromium.
- [x] Confirm installation activates an already-open real YouTube watch document without reload; natural sponsor entry and exit work.
- [x] Record one live E2E: 19 passed, 1 failed. The failure was a 20-second buffer precondition timeout, before the proposed backward seek was issued.
- [x] Check actual Chromium install/reload/invalidation using a separate synthetic player: 5 passed, 0 failed.
- [x] Confirm the two manifests produce identical permission-warning lists in Chromium 145.0.7632.6. A real Web Store update prompt remains untested.
- [x] Capture 7 opaque RGB PNG assets; verify dimensions; 31 composition/popup/policy checks pass with 0 console/page errors and 0 external composition requests.
- [ ] In ordinary Chrome, finish the live checks not reached: native unmute override, preserving an existing mute, live setting changes, ad suspension, real watch-to-watch SPA navigation, self-promotion opt-in, preference persistence and the three-minute refresh. Unit tests cover these logic paths, but are not a substitute for this browser check. No naturally served ad was observed in the current run.
- [ ] If upgrading a developer installation from 1.4.0 or older, reload existing YouTube tabs once. Those already-running releases lack the new disposal hook; 1.5.0 cannot retroactively add cleanup to their closures. The new guard is verified for instances running 1.5.0.
- [ ] Review the prepared name, existing original amber shield icon and images. The rename avoids YouTube in the product name; no trademark clearance or store approval is claimed.

## 2. Fill the contact and host the policy

- [x] Contact email set in [privacy.html](privacy.html): paras@spectrumailabs.com.
- [ ] Review the policy and [listing.md](listing.md), including data recipients, local processing, IP exposure and the Limited Use certifications.
- [ ] Host just `privacy.html` on an HTTPS static host. It is a single file with inline CSS, no script and no external resource requests. For GitHub Pages, the human can publish it in a Pages-enabled public repository or existing site. This task did not commit or push anything.
- [ ] Open the resulting public URL in a signed-out browser and on mobile. Confirm it is readable, uses HTTPS and contains the real contact. If the host adds tracking or other behavior, update the policy accordingly.
- [ ] Record the actual privacy URL here: **PENDING_HOSTED_PRIVACY_URL**. Enter it in the item’s Privacy practices tab and wherever the publisher dashboard requires the policy URL. Do not paste a local file path.

## 3. Prepare the developer account

- [ ] Sign in to the intended publisher account at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] Register if needed, accept the developer agreement and pay the dashboard’s one-time registration fee. The human must choose the account and make any payment. See [official account registration](https://developer.chrome.com/docs/webstore/register).
- [ ] Complete the dashboard’s publisher/contact verification, account security and any applicable identity/trader declarations. Use actual details; none are supplied or invented in this kit.

## 4. Upload and fill the fields

Click **Add new item → Choose file → Upload**, selecting **`release/sponsor-shield-1.5.0.zip`**. Do not upload the repository, store folder, old ZIPs, test fixtures, screenshots as runtime files, or `.test-env`.

| Dashboard destination | Value / source |
| --- | --- |
| Package | Verify Sponsor Shield, 1.5.0, Manifest V3 and the expected permissions. |
| Store listing: name | Sponsor Shield (manifest). |
| Store listing: summary | Short description in `listing.md` (matches manifest, 98 characters). |
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
| Privacy practices: policy URL | Actual hosted URL from step 2. |
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

No extension account is required. Open a regular YouTube watch page with community-marked sponsor segments and allow access to youtube.com, www.youtube.com and sponsor.ajay.app. The popup reports whether segments were found. Playback should continue normally while audio is muted and the picture blurred inside a segment; sound and picture should return at its end. Show anyway restores the current segment without moving the playhead. Self-promotion is off by default. Shorts and embeds are not supported. Community data can change. On 1 October 2026, video g1f7iZehQ2A had a SponsorBlock segment at 28.855–31.355 seconds and the natural mute/blur transition passed in our live test. The extension never seeks. Our automated browser’s later backward-seek setup timed out waiting for buffering; see TESTING.md for the exact partial result.

## 5. Submit, then verify the reviewed build

- [ ] Preview every field and image. Check contact and privacy links again. Resolve dashboard validation errors.
- [ ] Click **Submit for Review**. If the human wants a final release decision after approval, turn off automatic publishing in the confirmation dialog; otherwise make that publication choice deliberately. [Official submission steps](https://developer.chrome.com/docs/webstore/publish).
- [ ] Review any feedback from Chrome. No approval date, placement or acceptance is guaranteed.
- [ ] After approval, install the store-distributed build in ordinary Chrome, confirm its name/version and test activation with an already-open watch tab. Test an actual store-delivered update when one exists.

Public Chrome documentation was checked on 1 October 2026. Dashboard field labels can change. The publisher must verify them in the live account; no dashboard or payment actions were performed here.
