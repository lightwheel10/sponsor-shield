"use strict";
importScripts("segment-logic.js");

const cache = new Map();
const pending = new Map();
const cooldowns = new Map();
const CACHE_LIMIT = 48;
const CACHE_TTL = 10 * 60 * 1000;
const MAX_BYTES = 1024 * 1024;

async function lookup(videoId, refresh = false) {
  if (pending.has(videoId)) return pending.get(videoId);
  const retryAt = cooldowns.get(videoId) || 0;
  if (retryAt > Date.now()) throw Object.assign(new Error("Segment API rate limited; waiting before retry"), {retryAfterMs: retryAt - Date.now()});
  const cached = cache.get(videoId);
  if (!refresh && cached && cached.expires > Date.now()) {
    cache.delete(videoId);
    cache.set(videoId, cached);
    return cached.segments;
  }
  if (!refresh) cache.delete(videoId);
  // Bound concurrent requests as well as cached data. Errors are never cached.
  if (pending.size >= 8) throw new Error("Too many segment requests; try again shortly");
  const request = fetchSegments(videoId);
  pending.set(videoId, request);
  try {
    const segments = await request;
    cooldowns.delete(videoId);
    cache.set(videoId, {segments, expires: Date.now() + CACHE_TTL});
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return segments;
  } catch (error) {
    if (error.retryAfterMs) {
      cooldowns.set(videoId, Date.now() + error.retryAfterMs);
      while (cooldowns.size > CACHE_LIMIT) cooldowns.delete(cooldowns.keys().next().value);
    }
    throw error;
  } finally { pending.delete(videoId); }
}

async function fetchSegments(videoId) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(videoId));
  const prefix = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 4);
  const url = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
  url.searchParams.set("categories", JSON.stringify(["sponsor", "selfpromo"]));
  url.searchParams.set("actionTypes", JSON.stringify(["skip", "mute"]));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url.href, {signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error"});
    if (response.status === 404) return [];
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = Number(header);
      const delay = header && Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(header) - Date.now());
      throw Object.assign(new Error("Segment API returned HTTP 429"), {retryAfterMs: Math.min(3600000, Math.max(30000, Number.isFinite(delay) ? delay : 180000))});
    }
    if (!response.ok) throw new Error(`Segment API returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Segment response too large");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Segment response too large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return ShieldLogic.extractSegments(JSON.parse(new TextDecoder().decode(bytes)), videoId);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Segment request timed out (8 seconds)");
    throw error;
  } finally { clearTimeout(timeout); }
}

function setBadge(tabId, count) {
  const text = Number.isInteger(count) && count > 0 ? String(Math.min(count, 99)) : "";
  chrome.action?.setBadgeText({tabId, text}).catch(() => {});
  if (!text) return;
  chrome.action.setBadgeBackgroundColor({tabId, color: "#FFB224"}).catch(() => {});
  chrome.action.setBadgeTextColor?.({tabId, color: "#141418"}).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "BADGE") {
    if (sender.id === chrome.runtime.id && Number.isInteger(sender.tab?.id)) setBadge(sender.tab.id, message.count);
    return;
  }
  if (message?.type !== "GET_SEGMENTS") return;
  const id = message.videoId;
  // Chrome can retain the injecting frame's URL through YouTube SPA navigation.
  // Authorize the isolated content-script origin, not that URL's old video ID.
  let trustedOrigin = false;
  try {
    trustedOrigin = ["https://www.youtube.com", "https://youtube.com"].includes(new URL(sender.url).origin);
  } catch { /* Missing or malformed sender URL is not authorized. */ }
  if (sender.id !== chrome.runtime.id || !ShieldLogic.isVideoId(id)
      || !trustedOrigin || (sender.frameId !== undefined && sender.frameId !== 0)) {
    reply({ok: false, error: "Invalid watch page or video ID"});
    return;
  }
  lookup(id, message.refresh === true).then(segments => reply({ok: true, videoId: id, segments}))
    .catch(error => reply({ok: false, videoId: id, error: error.message || "Segment lookup failed", retryAfterMs: error.retryAfterMs || 0}));
  return true;
});
