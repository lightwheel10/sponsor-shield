/* Gets AI-found sponsor parts for one video, used when SponsorBlock has none.
 *
 *   1. Ask our server whether it already knows the video (instant, free).
 *   2. If not, read the captions from the page and send them to the server.
 *   3. Wait for the server's AI check to finish, asking every few seconds.
 *
 * Kept free of DOM and Chrome details so it can be tested on its own; the
 * content script passes those in as `deps`.
 */
(function (root) {
  "use strict";
  const MAX_WAIT_MS = 3 * 60 * 1000;
  // Even when the server already has a shared answer, now and then send our
  // own transcript too. This keeps confirming real answers and lets a
  // planted fake be outvoted by real viewers.
  const CONFIRM_CHANCE = 0.2;
  const GRAB_TIMEOUT_MS = 4 * 60 * 1000;

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  /**
   * deps:
   *   ask(message)            -> Promise<answer> (a message to the service worker)
   *   grabTranscript(videoId) -> Promise<transcript>, rejects if captions are unavailable
   *   isCurrent()             -> false once the viewer has moved to another video
   *   wait(ms), now(), random()
   * Resolves to {status: "ready", segments} | {status: "unavailable", reason} | {status: "stale"}.
   */
  async function findAiSegments(videoId, deps) {
    const known = await deps.ask({type: "AI_LOOKUP", videoId});
    if (known.status === "ready") {
      if (deps.random() < CONFIRM_CHANCE) confirmQuietly(videoId, deps);
      return known;
    }
    if (known.status !== "unknown") return known;

    const transcript = await deps.grabTranscript(videoId);
    if (!deps.isCurrent()) return {status: "stale"};
    let answer = await deps.ask({type: "AI_SUBMIT", videoId, transcript});

    const started = deps.now();
    while (answer.status === "working") {
      if (deps.now() - started > MAX_WAIT_MS) return {status: "unavailable", reason: "timeout"};
      await deps.wait(clamp(answer.retryAfter * 1000, 2000, 15000));
      if (!deps.isCurrent()) return {status: "stale"};
      answer = await deps.ask({type: "AI_LOOKUP", videoId, transcriptHash: answer.transcript});
    }
    return answer;
  }

  function confirmQuietly(videoId, deps) {
    deps.grabTranscript(videoId)
      .then(transcript => deps.isCurrent() && deps.ask({type: "AI_SUBMIT", videoId, transcript}))
      .catch(() => { /* A missed confirmation changes nothing for the viewer. */ });
  }

  /* Asks transcript-grabber.js (running in the page) for the transcript. */
  function createPageBridge(win, makeId = () => Math.random().toString(36).slice(2)) {
    const waiting = new Map(); // request id -> {resolve, reject, timer}
    win.addEventListener("message", event => {
      const data = event.data;
      if (event.source !== win || data?.source !== "sponsor-shield-page") return;
      const request = waiting.get(data.requestId);
      if (!request) return;
      waiting.delete(data.requestId);
      clearTimeout(request.timer);
      if (data.ok && data.videoId === request.videoId && data.transcript) request.resolve(data.transcript);
      else request.reject(new Error(data.error || "transcript unavailable"));
    });
    return function grabTranscript(videoId) {
      return new Promise((resolve, reject) => {
        const requestId = makeId();
        const timer = setTimeout(() => {
          waiting.delete(requestId);
          reject(new Error("transcript request timed out"));
        }, GRAB_TIMEOUT_MS);
        waiting.set(requestId, {resolve, reject, timer, videoId});
        win.postMessage({source: "sponsor-shield-content", type: "GRAB_TRANSCRIPT", requestId, videoId}, win.location.origin);
      });
    };
  }

  const api = {findAiSegments, createPageBridge, CONFIRM_CHANCE, MAX_WAIT_MS};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShieldAI = api;
})(globalThis);
