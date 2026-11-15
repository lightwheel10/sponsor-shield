# Sponsor Shield — store listing for 1.6.0

Prepared copy, not a published or approved listing. Fields below describe the packaged code. Publisher identity, dashboard certification and submission remain with the human publisher.

## Name

Sponsor Shield

## Short description

Mute and blur sponsor segments on YouTube, from SponsorBlock or AI. Choose Show anyway to watch a segment.

This is also the manifest description (106 characters, including spaces and punctuation; maximum 132).

## Long description — paste this section’s text

Sponsor Shield mutes audio and blurs the picture during sponsor segments on regular YouTube watch pages. Playback continues at its normal position. When a segment ends, the picture clears and the extension restores audio if it muted it.

During a sponsor segment, a small card shows the time remaining and a Show anyway button. Choose Show anyway to watch the current segment. That choice is remembered for the segment until you switch videos or reload the page. An existing mute stays in place. The extension does not skip, seek, change playback speed or start playback.

Sponsor times come from the SponsorBlock community first. Optional AI checks cover videos SponsorBlock has not marked yet: when you turn them on and SponsorBlock has nothing for a video, Sponsor Shield reads that video’s captions and its AI server finds the paid sponsor parts. AI checks are off until you turn them on, on the welcome page or with the switch in the popup. The card under the video says whether a segment came from SponsorBlock or was found by AI.

Amber marks show sponsor segments on the video’s progress bar when the supported controls are present. The toolbar badge shows the number of marked segments, capped at 99. The popup shows the current shielding status, a small segment timeline and the accumulated sponsor time shielded on this device. It follows your system’s light or dark theme. You can turn shielding off, turn AI checks on or off, or include creators’ self-promotion, which is off by default.

Coverage and timing depend on SponsorBlock submissions and, with AI checks, on the video having captions. Some sponsors may be missed or marked slightly early or late. The first viewer of a new video can see or hear the start of a sponsor before the AI check finishes; later viewers get the saved answer straight away. If a lookup fails, playback remains available.

This release supports regular HTTPS watch pages on youtube.com and www.youtube.com. It does not support Shorts, embeds or mobile YouTube. It does not block YouTube ads; shielding pauses when the player reports an ad. Changes to YouTube’s player may affect compatibility.

Privacy: for SponsorBlock lookups, only the first four characters of a hash of the video ID are sent to sponsor.ajay.app. With AI checks on, and only for videos SponsorBlock has not marked, the video ID, its captions, its public description, YouTube’s paid-promotion label and a random install ID are sent to the Sponsor Shield server, which uses DeepSeek’s AI to find sponsors. The server keeps the sponsor times it found, not the captions or IP addresses. There is no account, telemetry, advertising, data sale or remote executable code. Full policy: https://sponsor-shield.spectrumailabs.com/privacy

Segment data from SponsorBlock (sponsor.ajay.app), licensed under CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/. The data licence is separate from the extension’s MIT-licensed code. Its attribution, noncommercial and ShareAlike conditions apply to the segment data.

Sponsor Shield is an independent, free extension and is not affiliated with YouTube, SponsorBlock or DeepSeek.

## Suggested category and language

- Category: **Functionality & UI**, under **Productivity** if the dashboard groups categories. Select the nearest available label if the dashboard changes.
- Language: **English** (the interface and listing are English).
- Distribution: free; human selects countries and visibility. Do not add commercial use of SponsorBlock data without resolving its noncommercial licence conditions.

## Single purpose — Privacy practices

Mute and blur sponsor segments on regular YouTube watch pages, using SponsorBlock data and optional AI checks of a video’s captions, with controls and status for that shielding.

## Permission justifications — Privacy practices

| Permission / scope | Text to use |
| --- | --- |
| storage | Save the enabled preference, the optional self-promotion and AI-checks choices, a random install ID used only for AI checks, and the accumulated shielded-time total in chrome.storage.local on this device. No sync storage is used. |
| activeTab | Retained for the user-initiated popup’s access to the current tab when the toolbar action is opened. The popup queries that tab and asks its content script for shielding status. No general browsing-history API is used. |
| scripting | Insert the extension’s packaged content.css, transcript-grabber.js, segment-logic.js, refresh-scheduler.js, ai-flow.js and content.js into already-open supported YouTube tabs on installation or update, so activation does not require a page reload. No remote script is injected. |
| https://www.youtube.com/* | Find the player on supported watch pages, read timing and mute state locally, apply mute/blur and the overlay/marks, handle YouTube navigation within an existing document, and, with AI checks on, read the current video’s captions from YouTube’s own player. Also permits injection into already-open tabs. |
| https://youtube.com/* | The same functionality for the supported bare-domain variant. Watch-page scope is checked in the content script; Shorts and embeds are not shielded. |
| https://sponsor.ajay.app/* | Fetch community segment data over HTTPS from the hash-prefix API. Only the first four hexadecimal characters of the SHA-256 video-ID hash and fixed category/action filters are sent as application data. |
| https://sponsor-shield.spectrumailabs.com/* | The developer’s own AI server. Used only when AI checks are on and SponsorBlock has no sponsor segment for the video: look up a saved answer, or send the captions for an AI check. |

## In-product disclosure and consent

Chrome requires the disclosure and consent inside the extension, not only in this listing or the policy. Sponsor Shield does this as follows:

- On first install it opens `welcome.html`, which says what AI checks send, to whom (the Sponsor Shield server and DeepSeek), and what is not sent or kept. AI checks turn on only when the viewer presses **Turn on AI checks**.
- The popup’s **AI checks** switch is off by default and repeats the disclosure in one line, with a link to the welcome page.
- While AI checks are off, the service worker refuses every AI request before any network call (tested).

## Data usage — Privacy practices

Use the following conservative disclosure mapping. The form concerns data **handled**, including local processing, not only a developer’s database. Confirm the dashboard’s wording when submitting.

| Data type | Answer | Scope and reason |
| --- | --- | --- |
| Personally identifiable information | Yes, limited to a random install ID | A random ID made by the extension is sent with AI checks so the server can tell installations apart. It is not linked to a name, email or account. The server stores only a one-way code made from it. |
| Health information | No | Not accessed. |
| Financial and payment information | No | Not accessed. |
| Authentication information | No | No credentials are read or sent; API requests omit credentials. |
| Personal communications | No | Not accessed. |
| Location | Yes, limited to IP exposure | SponsorBlock and the Sponsor Shield server receive the network IP address needed for the HTTPS connection, which can imply approximate location. The Sponsor Shield server stores only a one-way code of the network (IPv4 /24 or IPv6 /48), not the address. No geolocation is used. |
| Web history | Yes, limited to the current video | A four-character hash prefix goes to SponsorBlock. With AI checks on, the current video ID goes to the Sponsor Shield server for videos SponsorBlock has not marked. There is no general browser-history access or persistent list of watched videos. |
| User activity | Yes, local only | Playback/mute state, the current segment override, settings and the accumulated shielded-time total are handled to provide the feature. No click, keystroke or interaction stream is sent out. |
| Website content | Yes | With AI checks on, the current video’s captions, public description and YouTube’s paid-promotion label are sent to the Sponsor Shield server and the captions and description on to DeepSeek, only to find sponsor segments. The server does not keep caption text. No video, audio, comments or screenshots are uploaded. |

**Remote code:** No, I am not using remote code. All executable JS/CSS ships in the ZIP. SponsorBlock and Sponsor Shield server responses are JSON data, validated and parsed without execution.

**Use:** Provide the single-purpose sponsor shielding, related status/settings and local time total. **Recipients:** SponsorBlock (sponsor.ajay.app) receives the lookup prefix and ordinary connection metadata. With AI checks on, the developer’s Sponsor Shield server receives the data listed above, and DeepSeek receives the captions, title and description to find sponsors. **Sale:** None. **Advertising:** None. **Other transfers:** None.

**Retention:** Local preferences, the install ID and the time total remain until local extension data is cleared or the extension is uninstalled. The Sponsor Shield server keeps sponsor times, brand names, a one-way fingerprint of the captions and one-way confirmation codes; it does not keep caption text, IP addresses or install IDs, and its logs hold only the route, result and timing. SponsorBlock’s and DeepSeek’s own retention are controlled by those services.

The publisher should check the three limited-use certifications only after reviewing these facts: no data sale or transfer outside permitted uses; no use or transfer unrelated to the single purpose; no use for creditworthiness or lending.

**Privacy-policy URL:** https://sponsor-shield.spectrumailabs.com/privacy (contact: paras@spectrumailabs.com).

## Sources for the publisher

- [Chrome privacy form guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): single purpose, permission justification, remote code and certifications.
- [Chrome User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing also requires disclosure; in-product disclosure and consent (Q10).
- [Chrome disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements) and [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
- [Chrome permission list](https://developer.chrome.com/docs/extensions/reference/permissions-list) and [permission warning guidance](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings).
- [Chrome image requirements](https://developer.chrome.com/docs/webstore/images): screenshot and promotional dimensions.

The policy pages were checked on 15 November 2026. The live publisher dashboard was not opened; the human must review its current labels and declarations.
