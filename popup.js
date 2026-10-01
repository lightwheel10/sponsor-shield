"use strict";
const $ = selector => document.querySelector(selector);
const enabled = $("#enabled");
const selfpromo = $("#includeSelfpromo");
const hero = $("#hero");
const kicker = $("#kicker");
const headline = $("#headline");
const sub = $("#sub");
const timeline = $("#timeline");
const track = $("#track");
const playhead = $("#playhead");
const timeNow = $("#time-now");
const timeTotal = $("#time-total");
const retry = $("#retry");
const stat = $("#stat");
const saveError = $("#save-error");

function clock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
function plural(count, word) { return `${count} ${word}${count === 1 ? "" : "s"}`; }

function show(state, k, h, s) {
  hero.dataset.state = state;
  if (kicker.textContent !== k) kicker.textContent = k;
  if (headline.textContent !== h) headline.textContent = h;
  if (sub.textContent !== s) sub.textContent = s;
}

let timelineKey = "";
function drawTimeline(status) {
  const {duration, time, ranges = []} = status;
  if (!duration || time === null || !ranges.length) { timeline.hidden = true; timelineKey = ""; return; }
  timeline.hidden = false;
  const key = `${duration}|${ranges.map(r => `${r.start}:${r.end}`).join(",")}`;
  if (key !== timelineKey) {
    track.querySelectorAll(".seg").forEach(seg => seg.remove());
    for (const range of ranges) {
      const seg = document.createElement("span");
      seg.className = "seg";
      seg.style.left = `${range.start / duration * 100}%`;
      seg.style.width = `${(range.end - range.start) / duration * 100}%`;
      seg.dataset.start = range.start;
      seg.dataset.end = range.end;
      track.append(seg);
    }
    timelineKey = key;
  }
  for (const seg of track.querySelectorAll(".seg")) {
    seg.classList.toggle("past", time >= Number(seg.dataset.end));
    seg.classList.toggle("now", time >= Number(seg.dataset.start) && time < Number(seg.dataset.end));
  }
  playhead.style.left = `${Math.min(100, time / duration * 100)}%`;
  timeNow.textContent = clock(time);
  timeTotal.textContent = clock(duration);
}

function render(status) {
  retry.hidden = true;
  if (!status?.videoId) {
    timeline.hidden = true;
    return show("idle", "Standing by", "Open a YouTube video", "Sponsor segments will be muted and blurred automatically.");
  }
  if (!enabled.checked) {
    timeline.hidden = true;
    return show("off", "Paused", "Shield is off", "Turn it on to mute and blur sponsor segments.");
  }
  if (status.load === "error") {
    timeline.hidden = true;
    retry.hidden = false;
    return show("error", "Couldn’t connect", "SponsorBlock didn’t respond", "The video keeps playing normally. Try again in a moment.");
  }
  if (status.load !== "loaded") {
    timeline.hidden = true;
    return show("checking", "Checking", "Looking up this video…", "The video keeps playing while we check.");
  }
  drawTimeline(status);
  const ranges = status.ranges || [];
  if (status.adPlaying) return show("ad", "YouTube ad", "Waiting for the ad to end", "The shield picks up again once the video resumes.");
  if (status.active && status.activeRange && status.time !== null) {
    return show("active", "Shielding now", `Back in ${clock(Math.ceil(status.activeRange.end - status.time))}`, "Sound and picture return automatically.");
  }
  if (status.overridden) return show("override", "Your call", "Showing this segment", "The next sponsor will be shielded as usual.");
  if (!ranges.length) {
    return show("clear", "Watching", "No sponsors marked yet", "We re-check every few minutes while you watch.");
  }
  const ahead = status.time === null ? ranges : ranges.filter(range => range.start > status.time);
  if (!ahead.length) return show("ready", "Protected", "All sponsors are behind you", `${plural(ranges.length, "segment")} marked in this video.`);
  const next = status.time === null ? "" : `Next one in ${clock(ahead[0].start - status.time)}.`;
  return show("ready", "Protected", `${plural(ahead.length, "sponsor")} ahead`, next || "Ready when they play.");
}

async function refresh(type = "GET_STATUS") {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    render(await chrome.tabs.sendMessage(tab.id, {type}));
  } catch {
    render(null);
  }
}

function renderStat(seconds) {
  const total = Number(seconds) || 0;
  const minutes = Math.floor(total / 60);
  stat.parentElement.hidden = total < 1;
  if (minutes < 1) { stat.textContent = "Under 1 min"; return; }
  stat.textContent = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

async function save(input, key) {
  input.disabled = true;
  saveError.hidden = true;
  try {
    await chrome.storage.local.set({[key]: input.checked});
    await refresh();
  } catch {
    input.checked = !input.checked;
    saveError.textContent = "Couldn’t save this setting. Please try again.";
    saveError.hidden = false;
  } finally { input.disabled = false; }
}

enabled.addEventListener("change", () => save(enabled, "enabled"));
selfpromo.addEventListener("change", () => save(selfpromo, "includeSelfpromo"));
retry.addEventListener("click", () => refresh("RETRY_SEGMENTS"));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.shieldedSeconds) renderStat(changes.shieldedSeconds.newValue);
});
chrome.storage.local.get({enabled: true, includeSelfpromo: false, shieldedSeconds: 0}).then(values => {
  enabled.checked = values.enabled !== false;
  selfpromo.checked = values.includeSelfpromo === true;
  renderStat(values.shieldedSeconds);
  void refresh();
}).catch(() => {
  saveError.textContent = "Couldn’t load settings. Close and reopen this popup.";
  saveError.hidden = false;
});
setInterval(refresh, 1000);
