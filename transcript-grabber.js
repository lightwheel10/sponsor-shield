/* Runs inside the YouTube page itself (manifest "world": "MAIN"), because only
 * the page can see the captions YouTube's own player downloads.
 *
 * It does two things:
 * 1. Quietly keeps a copy of caption files the player downloads.
 * 2. When our content script asks for a video's transcript, it makes the
 *    player download the right caption track (hidden from view), reads it,
 *    and puts the viewer's caption setting back exactly as it was.
 *
 * It sends nothing anywhere itself; it only answers our content script.
 */
(() => {
  "use strict";
  if (window.__sponsorShieldGrabber) return;
  window.__sponsorShieldGrabber = true;

  const FROM_CONTENT = "sponsor-shield-content";
  const FROM_PAGE = "sponsor-shield-page";
  const HIDE_CLASS = "ytss-hide-captions";
  const KEEP_CAPTURES = 6;
  const AD_WAIT_MS = 3 * 60 * 1000;
  const CAPTION_WAIT_MS = 8000;
  const NOTICE_FADE_MS = 3500;
  const MAX_DESCRIPTION = 5000;
  const STICKY_CAPTION_KEY = "yt-player-sticky-caption";

  const captured = []; // Most recent caption downloads: {url, text}
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // --- 1. Keep copies of caption downloads -------------------------------
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ytssUrl = String(url);
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__ytssUrl?.includes("/api/timedtext")) {
      const url = this.__ytssUrl;
      this.addEventListener("load", () => {
        if (typeof this.responseText !== "string" || this.responseText.length < 50) return;
        captured.push({url, text: this.responseText});
        if (captured.length > KEEP_CAPTURES) captured.shift();
      });
    }
    return originalSend.apply(this, arguments);
  };

  // --- 2. Answer transcript requests -------------------------------------
  const baseLanguage = code => String(code || "").split(/[-.]/)[0];

  /* Many videos have AI-dubbed audio, and the "first" caption track can be a
   * machine translation. Use the language of the ORIGINAL audio, and prefer
   * human captions in that language over automatic ones. Every viewer gets
   * the same choice, so their transcripts match exactly. */
  function chooseTrack(response) {
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) return null;
    const originalAudio = (response.streamingData?.adaptiveFormats || [])
      .find(format => format.audioTrack && /original/i.test(format.audioTrack.displayName || ""));
    const original = originalAudio ? baseLanguage(originalAudio.audioTrack.id) : null;
    const automatic = original
      ? tracks.find(track => track.kind === "asr" && baseLanguage(track.languageCode) === original)
      : tracks.find(track => track.kind === "asr");
    const language = automatic ? baseLanguage(automatic.languageCode) : original;
    const human = language && tracks.find(track => track.kind !== "asr" && baseLanguage(track.languageCode) === language);
    return human || automatic || tracks[0];
  }

  function findCaptured(videoId, track) {
    for (let index = captured.length - 1; index >= 0; index--) {
      const params = new URL(captured[index].url, location.href).searchParams;
      if (params.get("v") === videoId && params.get("lang") === track.languageCode && !params.get("tlang")
          && (params.get("kind") || "") === (track.kind || "")) {
        return captured[index].text;
      }
    }
    return null;
  }

  function toLines(text) {
    const events = JSON.parse(text).events || [];
    return events
      .filter(event => Array.isArray(event.segs) && Number.isFinite(event.tStartMs))
      .map(event => [Math.round(event.tStartMs / 100) / 10,
        event.segs.map(seg => seg.utf8 || "").join("").replace(/\s+/g, " ").trim()])
      .filter(line => line[1]);
  }

  function currentVideo(player) {
    return player?.getPlayerResponse?.()?.videoDetails?.videoId || null;
  }

  async function waitForAdToEnd(player, videoId) {
    const deadline = Date.now() + AD_WAIT_MS;
    while (player.classList.contains("ad-showing")) {
      if (Date.now() > deadline) throw new Error("ad did not end");
      await sleep(500);
      if (currentVideo(player) !== videoId) throw new Error("video changed");
    }
  }

  /* Turns the chosen captions on (invisibly) so the player downloads them,
   * then restores the viewer's own caption choice, including the setting
   * YouTube remembers for future videos. */
  async function downloadCaptions(player, videoId, track) {
    const before = player.getOption?.("captions", "track") || {};
    let sticky = null;
    try { sticky = localStorage.getItem(STICKY_CAPTION_KEY); } catch { /* Storage blocked. */ }
    player.classList.add(HIDE_CLASS);
    try {
      const request = {languageCode: track.languageCode, kind: track.kind || ""};
      player.loadModule?.("captions");
      player.setOption?.("captions", "track", request);
      const deadline = Date.now() + CAPTION_WAIT_MS;
      let retried = false;
      while (Date.now() < deadline) {
        const text = findCaptured(videoId, track);
        if (text) return text;
        await sleep(100);
        // The first request sometimes never fires; asking again fixes it.
        if (!retried && Date.now() > deadline - CAPTION_WAIT_MS / 2) {
          retried = true;
          player.unloadModule?.("captions");
          player.loadModule?.("captions");
          player.setOption?.("captions", "track", request);
        }
      }
      throw new Error("captions did not load");
    } finally {
      if (before.languageCode) {
        player.setOption?.("captions", "track", before);
      } else {
        player.setOption?.("captions", "track", {});
        player.unloadModule?.("captions");
      }
      try {
        if (sticky === null) localStorage.removeItem(STICKY_CAPTION_KEY);
        else localStorage.setItem(STICKY_CAPTION_KEY, sticky);
      } catch { /* Storage blocked. */ }
      // Switching tracks makes YouTube flash a "<language> - click for settings"
      // notice for about 3 seconds when captions are showing. Stay hidden until it fades.
      setTimeout(() => player.classList.remove(HIDE_CLASS), before.languageCode ? NOTICE_FADE_MS : 400);
    }
  }

  async function grab(videoId) {
    const player = document.getElementById("movie_player");
    if (!player || currentVideo(player) !== videoId) throw new Error("player not ready");
    await waitForAdToEnd(player, videoId);
    const response = player.getPlayerResponse();
    const track = chooseTrack(response);
    if (!track) throw new Error("no captions");
    const text = findCaptured(videoId, track) || await downloadCaptions(player, videoId, track);
    if (currentVideo(player) !== videoId) throw new Error("video changed");
    const lines = toLines(text);
    if (!lines.length) throw new Error("captions were empty");
    return {
      language: track.languageCode,
      lines,
      description: String(response.videoDetails?.shortDescription || "").slice(0, MAX_DESCRIPTION),
      paidLabel: Boolean(response.paidContentOverlay)
    };
  }

  let busy = false;
  window.addEventListener("message", async event => {
    const message = event.data;
    if (event.source !== window || message?.source !== FROM_CONTENT || message.type !== "GRAB_TRANSCRIPT") return;
    const reply = body => window.postMessage({source: FROM_PAGE, requestId: message.requestId, ...body}, location.origin);
    if (busy) return reply({ok: false, error: "busy"});
    busy = true;
    try {
      reply({ok: true, videoId: message.videoId, transcript: await grab(message.videoId)});
    } catch (error) {
      reply({ok: false, error: String(error?.message || error).slice(0, 100)});
    } finally {
      busy = false;
    }
  });
})();
