# Sponsor Shield — store listing for 1.5.0

Prepared copy, not a published or approved listing. Fields below describe the packaged code. Publisher identity, contact address, policy hosting and dashboard certification remain with the human publisher.

## Name

Sponsor Shield

## Short description

Mute and blur community-marked sponsor segments on YouTube. Choose Show anyway to watch a segment.

This is also the manifest description (98 characters, including spaces and punctuation; maximum 132).

## Long description — paste this section’s text

Sponsor Shield mutes audio and blurs the picture during community-marked sponsor segments on regular YouTube watch pages. Playback continues at its normal position. When a segment ends, the picture clears and the extension restores audio if it muted it.

During a sponsor segment, a small card shows the time remaining and a Show anyway button. Choose Show anyway to watch the current segment. That choice is remembered for the segment until you switch videos or reload the page. An existing mute stays in place. The extension does not skip, seek, change playback speed or start playback.

Amber marks show sponsor segments on the video’s progress bar when the supported controls are present. The toolbar badge shows the number of marked segments, capped at 99. The popup shows the current shielding status, a small segment timeline and the accumulated sponsor time shielded on this device. It follows your system’s light or dark theme. You can turn shielding off or include creators’ self-promotion, which is off by default.

Segment coverage and timing depend on community submissions to SponsorBlock. Some videos have no marked sponsors; some marks may be missing or inaccurate. The extension checks for updates while you watch. If a lookup fails, playback remains available; an initial failure offers Try again. A sponsor can be visible or audible before the first lookup completes.

This release supports regular HTTPS watch pages on youtube.com and www.youtube.com. It does not support Shorts, embeds or mobile YouTube. It does not block YouTube ads; shielding pauses when the player reports an ad. Changes to YouTube’s player may affect compatibility.

Privacy: the video ID is hashed on your device. Only the first four hexadecimal characters of that SHA-256 hash are sent to sponsor.ajay.app for a segment lookup, together with fixed request filters. SponsorBlock can see your IP address, request timing and ordinary connection information. The full video ID, full URL and playback position are not sent by the extension. Short prefixes reduce disclosure but do not guarantee anonymity. Preferences and the shielded-time total stay in Chrome’s local extension storage. There is no telemetry, data sale or remote executable code.

Segment data from SponsorBlock (sponsor.ajay.app), licensed under CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/. The data licence is separate from the original extension code. Its attribution, noncommercial and ShareAlike conditions apply to the segment data.

Sponsor Shield is an independent extension and is not affiliated with YouTube or SponsorBlock.

## Suggested category and language

- Category: **Functionality & UI**, under **Productivity** if the dashboard groups categories. Select the nearest available label if the dashboard changes.
- Language: **English** (the interface and listing are English).
- Distribution: free; human selects countries and visibility. Do not add commercial use of SponsorBlock data without resolving its noncommercial licence conditions.

## Single purpose — Privacy practices

Mute and blur community-marked sponsor segments on regular YouTube watch pages, with controls and status for that shielding.

## Permission justifications — Privacy practices

| Permission / scope | Text to use |
| --- | --- |
| storage | Save the enabled preference, optional self-promotion preference and accumulated shielded-time total in chrome.storage.local on this device. No sync storage is used. |
| activeTab | Retained for the user-initiated popup’s access to the current tab when the toolbar action is opened. The popup queries that tab and asks its content script for shielding status. No general browsing-history API is used. |
| scripting | Insert the extension’s packaged content.css, segment-logic.js, refresh-scheduler.js and content.js into already-open supported YouTube tabs on installation or update, so activation does not require a page reload. No remote script is injected. |
| https://www.youtube.com/* | Find the player on supported watch pages, read timing and mute state locally, apply mute/blur and the overlay/marks, and handle YouTube navigation within an existing document. Also permits injection into already-open tabs. |
| https://youtube.com/* | The same functionality for the supported bare-domain variant. Watch-page scope is checked in the content script; Shorts and embeds are not shielded. |
| https://sponsor.ajay.app/* | Fetch community segment data over HTTPS from the hash-prefix API. Only the first four hexadecimal characters of the SHA-256 video-ID hash and fixed category/action filters are sent as application data. |

The two explicit YouTube hosts match the pre-existing content-script hosts. The bundled Chromium permission-warning API returned identical warning lists for the 1.4.0 and 1.5.0 manifests; see TESTING.md. `scripting` itself has no additional warning. This is not a claim that an actual Web Store upgrade prompt was tested. The retained activeTab permission overlaps the existing YouTube host access; it does not authorize collection beyond the described purpose.

## Data usage — Privacy practices

Use the following conservative disclosure mapping. The form concerns data **handled**, including local processing, not only a developer’s database. Do not select “no user data” merely because there is no telemetry. Confirm the dashboard’s wording when submitting.

| Data type | Answer | Scope and reason |
| --- | --- | --- |
| Personally identifiable information | No | The extension does not request names, email addresses, account IDs or personal identifiers. Incidental IP exposure is disclosed under Location below. |
| Health information | No | Not accessed. |
| Financial and payment information | No | Not accessed. |
| Authentication information | No | No credentials are read or sent; API requests omit credentials. |
| Personal communications | No | Not accessed. |
| Location | Yes, limited to IP exposure | SponsorBlock receives the network IP address needed for the HTTPS connection, which can imply approximate location. No geolocation, GPS or location tracking is used. |
| Web history | Yes, limited to supported current video | The current watch URL/video ID is processed locally and a four-character hash prefix is transmitted for lookup. There is no general browser-history access or persistent list of watched URLs. |
| User activity | Yes, local only | Playback/mute state, the current segment override, settings and the accumulated shielded-time total are handled to provide the feature. No click, keystroke or interaction stream is sent out. |
| Website content | Yes, local player metadata only | The current video identifier, player timing/duration and ad-state DOM signal are read locally. No video/audio, page text, comments or screenshots are uploaded. |

**Remote code:** No, I am not using remote code. All executable JS/CSS ships in the ZIP. SponsorBlock responses are JSON data, validated and parsed without execution.

**Use:** Provide the single-purpose sponsor shielding, related status/settings and local time total. **Recipient:** SponsorBlock at sponsor.ajay.app receives the lookup prefix and ordinary connection metadata. **Sale:** None. **Advertising:** None. **Other transfers:** None implemented.

**Local retention:** Two preferences and a time total remain until local extension data is cleared or the extension is uninstalled. Old installations may retain unused legacy keys. Segment overrides last for the current video session. The bounded worker cache has a ten-minute reuse limit and disappears on worker shutdown. SponsorBlock’s server-log retention is controlled by that service; no unverified retention promise is made.

The publisher should check the three limited-use certifications only after reviewing these facts: no data sale or transfer outside permitted uses; no use or transfer unrelated to the single purpose; no use for creditworthiness or lending. No certification has been submitted by this task.

**Privacy-policy URL:** pending hosting of `store/privacy.html` after replacing `CONTACT_EMAIL`. No URL or contact identity has been invented.

## Sources for the publisher

- [Chrome privacy form guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): single purpose, permission justification, remote code and certifications.
- [Chrome User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing also requires disclosure.
- [Chrome permission list](https://developer.chrome.com/docs/extensions/reference/permissions-list) and [permission warning guidance](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings).
- [Chrome image requirements](https://developer.chrome.com/docs/webstore/images): screenshot and promotional dimensions.

These public pages were checked on 1 October 2026. The live publisher dashboard was not opened; the human must review its current labels and declarations.
