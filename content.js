(() => {
  "use strict";
  // This global belongs to the extension's isolated world, not the website.
  if (globalThis.__sponsorShield?.alive()) return;
  const logic = ShieldLogic;
  const state = {
    videoId: null, raw: [], ranges: [], load: "idle", error: null, refreshError: null, refreshCount: 0,
    settings: {enabled: true, includeSelfpromo: false}, ready: false
  };
  let generation = 0;
  let video = null;
  let player = null;
  let timer = null;
  let overlay = null;
  let label = null;
  let ui = null;
  let marks = null;
  let marksKey = "";
  let lastBadge = null;
  let lastTick = null;
  let pendingSeconds = 0;
  let disposed = false;
  let fallbackTimer = null;
  let active = null;
  let changedMute = false;
  let queued = false;
  let refreshScheduler = null;
  let inFlight = null;
  const overrideRanges = [];
  function rememberOverride(range) {
    if (!overrideRanges.some(saved => saved.key === range.key)) overrideRanges.push({...range});
  }
  function rebuildRanges() {
    state.ranges = logic.mergeSegments(state.raw, state.settings.includeSelfpromo)
      .map(range => ({...range, source: "sponsorblock"}));
  }
  function refreshActivity() {
    if (!contextAlive()) return;
    refreshScheduler?.setActive(Boolean(state.ready && state.settings.enabled && state.videoId && video?.isConnected
      && !video.paused && !video.ended && document.visibilityState !== "hidden"
      && !player?.classList.contains("ad-showing")));
  }
  const events = ["timeupdate", "seeking", "seeked", "ratechange", "play", "playing", "pause", "ended", "loadedmetadata", "emptied"];
  const adObserver = new MutationObserver(() => { refreshActivity(); update(); });
  const documentObserver = new MutationObserver(queueSync);
  const navigationEvents = ["yt-navigate-finish", "yt-page-data-updated", "popstate"];
  const disposeEvent = "sponsor-shield:dispose";
  const instance = {alive: contextAlive};

  function contextAlive() {
    if (disposed) return false;
    try { if (chrome.runtime.id) return true; } catch { /* Invalidated context. */ }
    dispose();
    return false;
  }
  function apiFailure(error) {
    if (/Extension context invalidated/i.test(error?.message || "") || !contextAlive()) dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++; // Any late lookup/storage continuation becomes obsolete.
    refreshScheduler?.dispose();
    clearInterval(fallbackTimer);
    adObserver.disconnect();
    documentObserver.disconnect();
    if (video) {
      events.forEach(event => video.removeEventListener(event, onTiming));
      video.removeEventListener("volumechange", onVolume);
    }
    release();
    overlay?.remove();
    marks?.remove();
    document.removeEventListener("visibilitychange", refreshActivity);
    navigationEvents.forEach(event => window.removeEventListener(event, queueSync));
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", queueSync);
    window.removeEventListener(disposeEvent, dispose);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* Already invalidated. */ }
    try { chrome.storage.onChanged.removeListener(onSettingsChanged); } catch { /* Already invalidated. */ }
    if (globalThis.__sponsorShield === instance) delete globalThis.__sponsorShield;
  }

  function release() {
    clearTimeout(timer);
    timer = null;
    if (video) {
      video.classList.remove("ytss-blurred");
      // A mute that existed before entry belongs to the user.
      if (changedMute && video.muted) video.muted = false;
    }
    changedMute = false;
    active = null;
    lastTick = null;
    flushStats();
    if (overlay) overlay.hidden = true;
  }
  function clock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
  }
  // Local-only tally of sponsor playback time the shield covered; read by the popup.
  function tallyStats() {
    if (!active || !video || video.paused) { lastTick = null; return; }
    const now = video.currentTime;
    if (lastTick !== null && now > lastTick && now - lastTick < 2) pendingSeconds += now - lastTick;
    lastTick = now;
    if (pendingSeconds >= 15) flushStats();
  }
  function flushStats() {
    if (!contextAlive()) return;
    const seconds = pendingSeconds;
    if (seconds < 1 || !chrome.storage.local.set) return;
    pendingSeconds = 0;
    try {
      chrome.storage.local.get({shieldedSeconds: 0})
        .then(values => { if (contextAlive()) return chrome.storage.local.set({shieldedSeconds: (Number(values.shieldedSeconds) || 0) + seconds}); })
        .catch(error => { pendingSeconds += seconds; apiFailure(error); });
    } catch (error) { pendingSeconds += seconds; apiFailure(error); }
  }
  function sendBadge(count) {
    if (!contextAlive()) return;
    if (count === lastBadge) return;
    lastBadge = count;
    try { chrome.runtime.sendMessage({type: "BADGE", count}).catch(apiFailure); }
    catch (error) { apiFailure(error); }
  }
  // Paint segments onto YouTube's own progress bar; silently skipped if the bar is not where we expect.
  function paintMarks() {
    const list = player?.querySelector?.(".ytp-progress-bar .ytp-progress-list");
    const duration = video?.duration;
    const show = Boolean(list?.classList?.contains?.("ytp-progress-list") && state.settings.enabled
      && state.ranges.length && Number.isFinite(duration) && duration > 0);
    const key = show ? `${duration}|${state.ranges.map(range => range.key).join(",")}` : "";
    if (!show) { marks?.remove(); marks = null; marksKey = ""; return; }
    if (marks?.parentElement === list && key === marksKey) return;
    marks?.remove();
    marks = document.createElement("div");
    marks.className = "ytss-marks";
    marks.setAttribute("aria-hidden", "true");
    for (const range of state.ranges) {
      const mark = document.createElement("span");
      mark.className = "ytss-mark";
      mark.style.left = `${Math.min(100, range.start / duration * 100)}%`;
      mark.style.width = `${Math.max(0.35, Math.min(100, (range.end - range.start) / duration * 100))}%`;
      marks.append(mark);
    }
    list.append(marks);
    marksKey = key;
  }
  function showAnyway() {
    if (!contextAlive()) return;
    if (active) rememberOverride(active);
    release();
    update();
  }
  function onVolume() {
    if (!contextAlive()) return;
    if (active && video && !video.muted) {
      rememberOverride(active);
      changedMute = false;
      release();
      update();
    }
  }
  function createOverlay() {
    if (overlay?.parentElement === player) return;
    overlay?.remove();
    const make = (tag, className, text) => {
      const element = document.createElement(tag);
      element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    overlay = make("div", "ytss-overlay");
    overlay.hidden = true;
    const card = make("div", "ytss-card");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "Sponsor segment");
    const head = make("div", "ytss-head");
    const icon = make("span", "ytss-icon");
    icon.setAttribute("aria-hidden", "true");
    head.append(icon, make("span", "ytss-eyebrow", "Sponsor segment"));
    const count = make("div", "ytss-count", "0:00");
    count.setAttribute("aria-hidden", "true");
    const caption = make("div", "ytss-caption", "Sound and picture return when it ends");
    const track = make("div", "ytss-track");
    track.setAttribute("aria-hidden", "true");
    const fill = make("div", "ytss-fill");
    track.append(fill);
    const foot = make("div", "ytss-foot");
    const button = make("button", "ytss-button", "Show anyway");
    button.type = "button";
    button.addEventListener("click", showAnyway);
    foot.append(button, make("span", "ytss-source", "via SponsorBlock"));
    card.append(head, count, caption, track, foot);
    label = make("span", "ytss-sr");
    label.setAttribute("role", "status");
    overlay.append(card, label);
    player.append(overlay);
    ui = {count, fill};
  }
  function bind(nextVideo, nextPlayer) {
    if (nextVideo === video && nextPlayer === player) return;
    release();
    if (video) {
      events.forEach(event => video.removeEventListener(event, onTiming));
      video.removeEventListener("volumechange", onVolume);
    }
    adObserver.disconnect();
    overlay?.remove();
    overlay = null;
    video = nextVideo;
    player = nextPlayer;
    if (video) {
      events.forEach(event => video.addEventListener(event, onTiming));
      video.addEventListener("volumechange", onVolume);
    }
    if (player) adObserver.observe(player, {attributes: true, attributeFilter: ["class"]});
  }
  function onTiming() { sync(); }
  function update() {
    if (!contextAlive()) return;
    clearTimeout(timer);
    timer = null;
    const current = video && logic.segmentAt(state.ranges, video.currentTime);
    const eligible = state.ready && state.settings.enabled && state.videoId
      && state.videoId === logic.videoIdFromUrl(location.href) && video?.isConnected && player?.isConnected
      && video.readyState >= 2 && !video.seeking && !player.classList.contains("ad-showing");
    if (!eligible || !current || logic.rememberedRange(overrideRanges, current)) {
      release();
    } else {
      if (active?.key !== current.key) {
        release();
        active = current;
        if (!video.muted) { changedMute = true; video.muted = true; }
      }
      video.classList.add("ytss-blurred");
      const entering = overlay?.hidden !== false || overlay.parentElement !== player;
      createOverlay();
      const remaining = Math.max(1, Math.ceil(current.end - video.currentTime));
      const countText = clock(remaining);
      if (ui.count.textContent !== countText) ui.count.textContent = countText;
      const progress = Math.min(1, Math.max(0, (video.currentTime - current.start) / (current.end - current.start)));
      ui.fill.style?.setProperty("--ytss-progress", progress.toFixed(4));
      // Announce once on entry; a per-second countdown would flood screen readers.
      if (entering) label.textContent = `Sponsor segment muted and blurred, ends in ${remaining} ${remaining === 1 ? "second" : "seconds"}`;
      overlay.hidden = false;
      tallyStats();
    }
    paintMarks();
    sendBadge(state.settings.enabled && state.videoId && state.load === "loaded" ? state.ranges.length : 0);
    // currentTime remains the authority: a timer merely asks for another check.
    if (eligible && !disposed) {
      const delay = logic.boundaryDelay(state.ranges, video.currentTime, video.playbackRate, video.paused || video.ended);
      if (delay !== null) timer = setTimeout(sync, delay);
    }
  }
  async function loadSegments(refresh = false) {
    if (!contextAlive()) return {error: true};
    if (inFlight?.generation === generation) return {error: true};
    const requestGeneration = generation;
    const videoId = state.videoId;
    const token = {generation: requestGeneration};
    inFlight = token;
    if (!refresh) { state.load = "loading"; state.error = null; }
    let outcome;
    try {
      const result = await chrome.runtime.sendMessage({type: "GET_SEGMENTS", videoId, refresh});
      if (!contextAlive()) return {error: true};
      if (generation !== requestGeneration || state.videoId !== videoId
          || logic.videoIdFromUrl(location.href) !== videoId) return {error: true};
      if (!result?.ok || result.videoId !== videoId) throw Object.assign(new Error(result?.error || "Segment lookup failed"), {retryAfterMs: result?.retryAfterMs || 0});
      const incoming = logic.extractSegments([{videoID: videoId, segments: result.segments}], videoId);
      if (refresh) {
        const byId = new Map(incoming.map(item => [item.UUID, item]));
        for (const old of state.raw) if (!byId.has(old.UUID)) byId.set(old.UUID, old);
        state.raw = [...byId.values()].slice(0, 1000);
        state.refreshCount++;
      } else state.raw = incoming;
      rebuildRanges();
      state.load = "loaded";
      state.error = null;
      state.refreshError = null;
      outcome = {count: incoming.length};
    } catch (error) {
      apiFailure(error);
      if (disposed) return {error: true};
      if (generation !== requestGeneration || state.videoId !== videoId) return {error: true};
      if (refresh && state.load === "loaded") state.refreshError = error.message;
      else { state.load = "error"; state.error = error.message; }
      outcome = {error: true, retryAfterMs: error.retryAfterMs || 0};
    } finally { if (inFlight === token) inFlight = null; }
    if (!refresh) refreshScheduler?.settle(outcome);
    sync();
    return outcome;
  }
  function sync() {
    if (!contextAlive()) return;
    const id = logic.videoIdFromUrl(location.href);
    if (id !== state.videoId) {
      generation++;
      refreshScheduler?.dispose();
      refreshScheduler = null;
      release();
      state.videoId = id;
      state.raw = [];
      state.ranges = [];
      state.refreshError = null;
      state.refreshCount = 0;
      state.load = "idle";
      state.error = null;
      overrideRanges.length = 0;
      if (id) refreshScheduler = ShieldRefresh.createRefreshScheduler({refresh: () => loadSegments(true)});
    }
    const nextPlayer = id ? document.querySelector("#movie_player") : null;
    bind(nextPlayer?.querySelector("video.html5-main-video") || nextPlayer?.querySelector("video") || null, nextPlayer);
    refreshActivity();
    if (id && state.ready && state.settings.enabled && state.load === "idle") void loadSegments();
    update();
  }
  function queueSync() {
    if (!contextAlive()) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  }
  function status() {
    sync();
    return {
      videoId: state.videoId, enabled: state.settings.enabled,
      includeSelfpromo: state.settings.includeSelfpromo, load: state.load, error: state.error,
      sources: {sponsorblock: state.ranges.length},
      ranges: state.ranges.map(r => ({...r})),
      refreshCount: state.refreshCount, refreshError: state.refreshError, refresh: refreshScheduler?.status() || null,
      segmentsFound: state.ranges.length, active: Boolean(active),
      activeRange: active ? {start: active.start, end: active.end} : null,
      time: video && Number.isFinite(video.currentTime) ? video.currentTime : null,
      duration: video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      overridden: Boolean(video && logic.rememberedRange(overrideRanges, logic.segmentAt(state.ranges, video.currentTime))),
      adPlaying: Boolean(player?.classList.contains("ad-showing"))
    };
  }
  function onMessage(message, _sender, reply) {
    if (!contextAlive()) return;
    if (message?.type === "GET_STATUS") reply(status());
    if (message?.type === "RETRY_SEGMENTS" && state.videoId && state.load === "error") {
      state.load = "idle";
      sync();
      reply(status());
    }
  }
  function setSettings(values) {
    if (!contextAlive()) return;
    state.settings = {enabled: values.enabled !== false, includeSelfpromo: values.includeSelfpromo === true};
    state.ready = true;
    rebuildRanges();
    sync();
  }
  function onSettingsChanged(changes, area) {
    if (!contextAlive()) return;
    if (area !== "local") return;
    const values = {...state.settings};
    for (const key of ["enabled", "includeSelfpromo"]) {
      if (changes[key]) values[key] = changes[key].newValue;
    }
    setSettings(values);
  }
  function onPageHide() { release(); refreshScheduler?.setActive(false); }
  // DOM events cross isolated worlds: a newly updated instance retires a v1.5+
  // instance immediately, even before its next media event or fallback tick.
  window.dispatchEvent(new Event(disposeEvent));
  globalThis.__sponsorShield = instance;
  window.addEventListener(disposeEvent, dispose);
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onSettingsChanged);
  try {
    chrome.storage.local.get({enabled: true, includeSelfpromo: false}).then(setSettings)
      .catch(error => { apiFailure(error); setSettings({enabled: false, includeSelfpromo: false}); });
  } catch (error) { apiFailure(error); }
  if (disposed) return;
  document.addEventListener("visibilitychange", refreshActivity);
  documentObserver.observe(document.documentElement, {childList: true, subtree: true});
  navigationEvents.forEach(event => window.addEventListener(event, queueSync));
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", queueSync);
  // URL fallback for history changes with no corresponding DOM/navigation event.
  fallbackTimer = setInterval(() => { if (contextAlive() && logic.videoIdFromUrl(location.href) !== state.videoId) sync(); }, 1000);
  sync();
})();
