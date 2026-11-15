"use strict";
importScripts("segment-logic.js", "shield-config.js");

const cache = new Map();
const pending = new Map();
const cooldowns = new Map();
const CACHE_LIMIT = 48;
const CACHE_TTL = 10 * 60 * 1000;
const MAX_BYTES = 1024 * 1024;

// Static content scripts cover future navigations. This also covers pages that
// were already open when Chrome installed or updated this extension.
async function injectExistingTabs(details) {
  if (!["install", "update"].includes(details.reason)) return [];
  const tabs = await chrome.tabs.query({url: ["https://www.youtube.com/*", "https://youtube.com/*"]});
  return Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id) && !tab.discarded).map(async tab => {
    const target = {tabId: tab.id}; // Main frame only; a closed/navigating tab may reject.
    await chrome.scripting.insertCSS({target, files: ["content.css"]});
    await chrome.scripting.executeScript({target, files: ["transcript-grabber.js"], world: "MAIN"});
    await chrome.scripting.executeScript({target, files: ["segment-logic.js", "refresh-scheduler.js", "ai-flow.js", "content.js"]});
  }));
}
chrome.runtime.onInstalled.addListener(details => {
  // Tab closure, site access restrictions and shutdown must not abort other tabs.
  void injectExistingTabs(details).catch(() => {});
  // A new install opens the welcome page, where the viewer can choose AI checks.
  if (details.reason === "install") chrome.tabs.create({url: chrome.runtime.getURL("welcome.html")}).catch(() => {});
});

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
    const text = await readLimitedText(response, MAX_BYTES, "Segment");
    return ShieldLogic.extractSegments(JSON.parse(text), videoId);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Segment request timed out (8 seconds)");
    throw error;
  } finally { clearTimeout(timeout); }
}

// Reads a response body, refusing anything larger than maxBytes (even while streaming).
async function readLimitedText(response, maxBytes, label) {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error(`${label} response too large`);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error(`${label} response too large`); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

/* ---------- Our own server: AI-found sponsor parts ----------
 * The server holds the AI key; this extension holds no secrets at all.
 * Everything the server sends back is checked before it is used. */
const AI_TIMEOUT_MS = 15000;
const AI_MAX_RESPONSE_BYTES = 64 * 1024;
const aiAnswers = new Map(); // videoId -> {answer, expires}: shared answers only
let aiPausedUntil = 0; // While the server is over its limits, stop asking it.

// AI checks send captions off the device, so they stay off until the viewer
// turns them on (welcome page or popup). Checked here, before any request.
async function aiChecksOn() {
  const {aiChecks} = await chrome.storage.local.get({aiChecks: false});
  return aiChecks === true;
}

function pauseAi(ms) {
  aiPausedUntil = Math.max(aiPausedUntil, Date.now() + ms);
}

async function installId() {
  // A random ID made on first use. It identifies nothing about the viewer;
  // the server only uses it to tell different viewers apart.
  const {installId: saved} = await chrome.storage.local.get({installId: ""});
  if (/^[A-Za-z0-9-]{16,64}$/.test(saved)) return saved;
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({installId: fresh});
  return fresh;
}

async function callServer(path, options = {}) {
  if (aiPausedUntil > Date.now()) return {status: "unavailable", reason: "paused"};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(SHIELD_SERVER + path, {
      ...options, signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error"
    });
    if (response.status === 429) {
      pauseAi(Math.min(3600, Math.max(60, Number(response.headers.get("retry-after")) || 600)) * 1000);
      return {status: "unavailable", reason: "rate_limited"};
    }
    if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
    return JSON.parse(await readLimitedText(response, AI_MAX_RESPONSE_BYTES, "Server"));
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Server request timed out");
    throw error;
  } finally { clearTimeout(timeout); }
}

// Accepts only the answer shapes we expect, with every value checked.
function checkAnswer(raw) {
  switch (raw?.status) {
    case "ready":
      return {status: "ready", segments: ShieldLogic.aiItems(raw.segments)};
    case "working":
      if (!ShieldLogic.isTranscriptHash(raw.transcript)) throw new Error("Invalid server answer");
      return {status: "working", transcript: raw.transcript,
        retryAfter: Math.min(15, Math.max(2, Number(raw.retryAfter) || 4))};
    case "unknown":
      return {status: "unknown"};
    case "unavailable": {
      const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 40) : "unknown";
      // The server is out of budget or switched off: no point asking again soon.
      if (["budget", "ai_off"].includes(reason)) pauseAi(30 * 60 * 1000);
      if (reason === "busy") pauseAi(2 * 60 * 1000);
      return {status: "unavailable", reason};
    }
    default:
      throw new Error("Invalid server answer");
  }
}

async function aiLookup(videoId, transcriptHash) {
  if (transcriptHash !== undefined && !ShieldLogic.isTranscriptHash(transcriptHash)) throw new Error("Invalid transcript hash");
  const cached = aiAnswers.get(videoId);
  if (!transcriptHash && cached && cached.expires > Date.now()) return cached.answer;
  const query = transcriptHash ? `?transcript=${transcriptHash}` : "";
  const answer = checkAnswer(await callServer(`/v1/segments/${videoId}${query}`));
  if (!transcriptHash && answer.status === "ready") {
    aiAnswers.set(videoId, {answer, expires: Date.now() + CACHE_TTL});
    while (aiAnswers.size > CACHE_LIMIT) aiAnswers.delete(aiAnswers.keys().next().value);
  }
  return answer;
}

async function aiSubmit(videoId, transcript) {
  const lines = transcript?.lines;
  if (!Array.isArray(lines) || !lines.length || lines.length > 30000) throw new Error("Invalid transcript");
  const body = JSON.stringify({
    videoId,
    installId: await installId(),
    language: String(transcript.language || ""),
    lines,
    description: String(transcript.description || "").slice(0, 5000),
    paidLabel: transcript.paidLabel === true
  });
  return checkAnswer(await callServer("/v1/transcripts", {
    method: "POST", headers: {"Content-Type": "application/json"}, body
  }));
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
  if (!["GET_SEGMENTS", "AI_LOOKUP", "AI_SUBMIT"].includes(message?.type)) return;
  const id = message.videoId;
  if (!trustedSender(sender) || !ShieldLogic.isVideoId(id)) {
    reply({ok: false, error: "Invalid watch page or video ID"});
    return;
  }
  if (message.type === "AI_LOOKUP" || message.type === "AI_SUBMIT") {
    const work = aiChecksOn().then(on => {
      if (!on) return {status: "unavailable", reason: "off"};
      return message.type === "AI_LOOKUP" ? aiLookup(id, message.transcriptHash) : aiSubmit(id, message.transcript);
    });
    work.then(answer => reply({ok: true, videoId: id, ...answer}))
      .catch(error => reply({ok: false, videoId: id, status: "error", error: error.message || "Server request failed"}));
    return true;
  }
  lookup(id, message.refresh === true).then(segments => reply({ok: true, videoId: id, segments}))
    .catch(error => reply({ok: false, videoId: id, error: error.message || "Segment lookup failed", retryAfterMs: error.retryAfterMs || 0}));
  return true;
});

// Only our own content script, in the top frame of a YouTube page, may ask.
function trustedSender(sender) {
  // Chrome can retain the injecting frame's URL through YouTube SPA navigation.
  // Authorize the isolated content-script origin, not that URL's old video ID.
  let trustedOrigin = false;
  try {
    trustedOrigin = ["https://www.youtube.com", "https://youtube.com"].includes(new URL(sender.url).origin);
  } catch { /* Missing or malformed sender URL is not authorized. */ }
  return sender.id === chrome.runtime.id && trustedOrigin && (sender.frameId === undefined || sender.frameId === 0);
}
