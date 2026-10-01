const view = new URLSearchParams(location.search).get("view") || "shield";
document.body.dataset.view = view;
const content = document.querySelector("#content");
const player = mode => `<iframe class="player" title="Illustrative player" src="player.html?mode=${mode}"></iframe>`;
const popup = (state, theme = "dark") => `<iframe class="popup ${theme}" title="${theme} popup: ${state}" src="../../popup.html?demo=${state}&theme=${theme}"></iframe>`;
const title = (headline, sub) => `<h1>${headline}</h1><p>${sub}</p>`;
const views = {
  shield: title("Mute the sponsor. Blur the picture.", "Playback continues. Sound and picture return when the segment ends.") + player("active"),
  marks: title("See where sponsors are marked.", "Amber marks show the segments. The toolbar badge shows the count.") + player("ready") + '<div class="badge-note"><span class="badge-icon"><img src="../../icons/shield-32.png" width="32" height="32" alt="Sponsor Shield"><b>2</b></span>Toolbar badge · 2 marked segments in this sample</div>',
  choice: title("Want to watch? Show anyway.", "Your choice is remembered for this segment until you leave or reload the video.") + `<div class="split">${player("override")}${popup("override")}</div>`,
  themes: title("A quick look at what is ahead.", "Current status, a segment timeline and settings. Light or dark, following your system.") + `<div class="popup-set"><div class="popup-item"><p>Dark · shielding a segment</p>${popup("active")}</div><div class="popup-item"><p>Light · two sponsors ahead</p><img class="popup light popup-image" src="popup-light.png" alt="Actual light popup with two sample sponsors ahead"></div></div>`,
  states: title("Clear status, even when data is missing.", "Community coverage varies. You can pause the shield or retry a failed lookup.") + `<div class="gallery"><div><p>No segments marked</p>${popup("clear")}</div><div><p>Connection unavailable</p>${popup("error")}</div><div><p>Shield switched off</p>${popup("off")}</div></div>`,
  tile: '<h1 class="tile-line">Mute &amp; blur<br>sponsor segments.</h1><p class="tile-sub">Community data from SponsorBlock</p><div class="tile-accent"></div>',
  marquee: title("Sponsor segments,<br>muted and blurred.", "Keep playback moving.<br>Choose Show anyway when you want to watch.") + player("active")
};
content.innerHTML = views[view] || views.shield;
