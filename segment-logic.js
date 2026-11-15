/* Original, dependency-free segment math shared by the worker, content script and tests. */
(function (root) {
  "use strict";
  const MAX_TIME = 7 * 24 * 60 * 60;
  function isVideoId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
  }
  function videoIdFromUrl(value) {
    try {
      const url = new URL(value);
      const id = url.searchParams.get("v");
      return url.protocol === "https:" && ["youtube.com", "www.youtube.com"].includes(url.hostname)
        && url.pathname === "/watch" && isVideoId(id) ? id : null;
    } catch { return null; }
  }
  function validSegment(item) {
    return item && typeof item === "object" && Array.isArray(item.segment)
      && item.segment.length === 2 && item.segment.every(Number.isFinite)
      && item.segment[0] >= 0 && item.segment[1] > item.segment[0]
      && item.segment[1] <= MAX_TIME && typeof item.category === "string"
      && typeof item.actionType === "string" && typeof item.UUID === "string"
      && item.UUID.length > 0 && item.UUID.length <= 128;
  }
  function extractSegments(response, videoId) {
    if (!isVideoId(videoId)) throw new Error("Invalid video ID");
    if (!Array.isArray(response) || response.length > 4096) throw new Error("Invalid API response");
    let found = null;
    for (const entry of response) {
      if (!entry || !isVideoId(entry.videoID) || !Array.isArray(entry.segments)
          || entry.segments.length > 1000 || !entry.segments.every(validSegment)) {
        throw new Error("Invalid API response schema");
      }
      if (entry.videoID === videoId) {
        if (found) throw new Error("Duplicate video in API response");
        found = entry.segments;
      }
    }
    return (found || []).filter(item => ["sponsor", "selfpromo"].includes(item.category)
      && ["skip", "mute"].includes(item.actionType))
      .map(item => ({segment: [...item.segment], category: item.category, actionType: item.actionType, UUID: item.UUID}));
  }
  function isTranscriptHash(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  }
  /* Turns our server's AI answer into the same shape as SponsorBlock items,
   * so the rest of the extension treats both alike. "ai:" marks the source. */
  function aiItems(segments) {
    if (!Array.isArray(segments) || segments.length > 40) throw new Error("Invalid AI answer");
    return segments.map(part => {
      const item = {segment: [part?.start, part?.end], category: "sponsor", actionType: "mute",
        UUID: `ai:${part?.start}-${part?.end}`};
      if (!validSegment(item)) throw new Error("Invalid AI answer");
      return item;
    });
  }
  function isAiItem(item) {
    return typeof item?.UUID === "string" && item.UUID.startsWith("ai:");
  }
  function mergeSegments(items, includeSelfpromo = false) {
    const ranges = items.filter(validSegment)
      .filter(item => item.category === "sponsor" || (includeSelfpromo && item.category === "selfpromo"))
      .filter(item => ["skip", "mute"].includes(item.actionType))
      .map(item => ({start: item.segment[0], end: item.segment[1]}))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({...range});
    }
    return merged.map(range => ({...range, key: `${range.start}:${range.end}`}));
  }
  function segmentAt(ranges, time) {
    return Number.isFinite(time) ? ranges.find(range => time >= range.start && time < range.end) || null : null;
  }
  function nextBoundary(ranges, time) {
    if (!Number.isFinite(time)) return null;
    for (const range of ranges) {
      if (time < range.start) return range.start;
      if (time < range.end) return range.end;
    }
    return null;
  }
  function boundaryDelay(ranges, time, rate, paused) {
    const boundary = nextBoundary(ranges, time);
    if (paused || !Number.isFinite(rate) || rate <= 0 || boundary === null) return null;
    return Math.max(20, Math.min(1000, (boundary - time) * 1000 / rate));
  }
  function rememberedRange(ranges, current) {
    return Boolean(current && ranges.some(r=>r.start<current.end&&current.start<r.end));
  }
  const api = {isVideoId, videoIdFromUrl, validSegment, extractSegments, isTranscriptHash, aiItems, isAiItem,
    mergeSegments, segmentAt, nextBoundary, boundaryDelay, rememberedRange};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShieldLogic = api;
})(globalThis);
