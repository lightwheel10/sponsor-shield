"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const {webcrypto} = require("node:crypto");
const logic = require("../segment-logic.js");
const {findAiSegments, createPageBridge} = require("../ai-flow.js");

const VIDEO = "abcdefghijk";
const HASH = "a".repeat(64);
const PART = {start: 30, end: 50, brand: "Acme"};

/* ---------- segment-logic: AI answers become ordinary segments ---------- */

test("AI parts become mute-only sponsor items marked as AI", () => {
  const items = logic.aiItems([PART]);
  assert.deepEqual(items, [{segment: [30, 50], category: "sponsor", actionType: "mute", UUID: "ai:30-50"}]);
  assert.equal(logic.isAiItem(items[0]), true);
  assert.equal(logic.isAiItem({UUID: "sponsorblock-uuid"}), false);
});

test("malformed AI answers are refused as a whole", () => {
  for (const bad of [null, "x", [{start: 50, end: 30}], [{start: "1", end: 5}], [{start: -1, end: 5}],
    [{start: 0, end: 1e12}], Array.from({length: 41}, (_, n) => ({start: n, end: n + 1}))]) {
    assert.throws(() => logic.aiItems(bad), /Invalid AI answer/);
  }
  assert.equal(logic.isTranscriptHash(HASH), true);
  assert.equal(logic.isTranscriptHash("A".repeat(64)), false);
  assert.equal(logic.isTranscriptHash("../" + "a".repeat(61)), false);
});

/* ---------- ai-flow: lookup, then transcript, then polling ---------- */

function flowDeps(answers, overrides = {}) {
  const asked = [];
  let clock = 0;
  return {
    asked,
    ask: async message => { asked.push(message); return answers.shift(); },
    grabTranscript: async () => ({language: "en", lines: [[0, "hi"]]}),
    isCurrent: () => true,
    wait: async ms => { clock += ms; },
    now: () => clock,
    random: () => 0.99,
    ...overrides
  };
}

test("a shared answer is used straight away, without reading captions", async () => {
  let grabbed = 0;
  const deps = flowDeps([{status: "ready", segments: []}], {grabTranscript: async () => { grabbed++; }});
  assert.equal((await findAiSegments(VIDEO, deps)).status, "ready");
  assert.equal(grabbed, 0);
  assert.equal(deps.asked.length, 1);
});

test("sometimes a viewer with a shared answer also sends their transcript to confirm it", async () => {
  const deps = flowDeps([{status: "ready", segments: []}, {status: "ready", segments: []}], {random: () => 0.1});
  await findAiSegments(VIDEO, deps);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deps.asked.map(message => message.type), ["AI_LOOKUP", "AI_SUBMIT"]);
});

test("unknown video: send transcript, wait while the server works, then use its answer", async () => {
  const deps = flowDeps([
    {status: "unknown"},
    {status: "working", transcript: HASH, retryAfter: 4},
    {status: "working", transcript: HASH, retryAfter: 4},
    {status: "ready", segments: ["done"]}
  ]);
  assert.deepEqual(await findAiSegments(VIDEO, deps), {status: "ready", segments: ["done"]});
  assert.deepEqual(deps.asked.map(message => message.type), ["AI_LOOKUP", "AI_SUBMIT", "AI_LOOKUP", "AI_LOOKUP"]);
  assert.equal(deps.asked[1].transcript.lines.length, 1);
  assert.equal(deps.asked[2].transcriptHash, HASH);
});

test("waiting gives up after three minutes", async () => {
  const working = {status: "working", transcript: HASH, retryAfter: 15};
  const deps = flowDeps([{status: "unknown"}, ...Array(30).fill(working)]);
  assert.deepEqual(await findAiSegments(VIDEO, deps), {status: "unavailable", reason: "timeout"});
});

test("moving to another video stops the check", async () => {
  let current = true;
  const deps = flowDeps([{status: "unknown"}, {status: "working", transcript: HASH, retryAfter: 4}],
    {isCurrent: () => current, wait: async () => { current = false; }});
  assert.deepEqual(await findAiSegments(VIDEO, deps), {status: "stale"});
});

test("server limits and errors are passed through, and missing captions reject", async () => {
  const limited = {status: "unavailable", reason: "budget"};
  assert.deepEqual(await findAiSegments(VIDEO, flowDeps([limited])), limited);
  const noCaptions = flowDeps([{status: "unknown"}], {grabTranscript: async () => { throw new Error("no captions"); }});
  await assert.rejects(findAiSegments(VIDEO, noCaptions), /no captions/);
});

/* ---------- ai-flow: the bridge to the page-world caption reader ---------- */

function fakeWindow() {
  const listeners = [];
  const win = {
    location: {origin: "https://www.youtube.com"},
    sent: [],
    addEventListener: (type, fn) => listeners.push(fn),
    postMessage(data, origin) { win.sent.push({data, origin}); },
    deliver(data, source = win) { for (const fn of listeners) fn({source, data}); }
  };
  return win;
}

test("bridge matches the page's reply to its request and video", async () => {
  const win = fakeWindow();
  const grab = createPageBridge(win, () => "req1");
  const pending = grab(VIDEO);
  assert.deepEqual(win.sent[0], {data: {source: "sponsor-shield-content", type: "GRAB_TRANSCRIPT", requestId: "req1", videoId: VIDEO},
    origin: "https://www.youtube.com"});
  win.deliver({source: "sponsor-shield-page", requestId: "req1", ok: true, videoId: VIDEO, transcript: {lines: [[0, "hi"]]}}, {});  // wrong source window
  win.deliver({source: "someone-else", requestId: "req1", ok: true, videoId: VIDEO, transcript: {}});
  win.deliver({source: "sponsor-shield-page", requestId: "req1", ok: true, videoId: VIDEO, transcript: {lines: [[0, "hi"]]}});
  assert.deepEqual(await pending, {lines: [[0, "hi"]]});
});

test("bridge rejects a reply for a different video or an error", async () => {
  const win = fakeWindow();
  let n = 0;
  const grab = createPageBridge(win, () => `req${++n}`);
  const wrongVideo = grab(VIDEO);
  win.deliver({source: "sponsor-shield-page", requestId: "req1", ok: true, videoId: "zzzzzzzzzzz", transcript: {}});
  await assert.rejects(wrongVideo, /transcript unavailable/);
  const failed = grab(VIDEO);
  win.deliver({source: "sponsor-shield-page", requestId: "req2", ok: false, error: "no captions"});
  await assert.rejects(failed, /no captions/);
});

/* ---------- service worker: talking to our server ---------- */

function worker(serverReply, {aiChecks = true} = {}) {
  let listener, now = 0;
  const requests = [];
  const stored = {aiChecks};
  const context = vm.createContext({
    ShieldLogic: logic, SHIELD_SERVER: "https://server.test", importScripts() {},
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, URL, AbortController, JSON,
    Date: {now: () => now, parse: Date.parse},
    fetch: async (url, options) => { requests.push({url, options}); return serverReply(url, options); },
    setTimeout: () => 0, clearTimeout() {},
    chrome: {
      runtime: {id: "ext", onMessage: {addListener(fn) { listener = fn; }}, onInstalled: {addListener() {}}},
      storage: {local: {get: async defaults => ({...defaults, ...stored}), set: async values => Object.assign(stored, values)}}
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve("../service-worker.js"), "utf8"), context);
  const send = (message, sender = {id: "ext", url: `https://www.youtube.com/watch?v=${VIDEO}`, frameId: 0}) =>
    new Promise(resolve => listener({videoId: VIDEO, ...message}, sender, resolve));
  return {send, requests, stored, advance: ms => { now += ms; }};
}
const reply = (body, init = {}) => new Response(JSON.stringify(body), {headers: {"content-type": "application/json"}, ...init});

test("worker contacts our server only after the viewer turns AI checks on", async () => {
  const w = worker(() => reply({status: "ready", segments: [PART]}), {aiChecks: false});
  for (const message of [{type: "AI_LOOKUP"}, {type: "AI_SUBMIT", transcript: {language: "en", lines: [[0, "hi"]]}}]) {
    const answer = await w.send(message);
    assert.deepEqual({status: answer.status, reason: answer.reason}, {status: "unavailable", reason: "off"});
  }
  assert.equal(w.requests.length, 0);
  w.stored.aiChecks = true;
  assert.equal((await w.send({type: "AI_LOOKUP"})).status, "ready");
  assert.equal(w.requests.length, 1);
});

test("worker looks up a video on our server and caches shared answers only", async () => {
  const w = worker(() => reply({status: "ready", segments: [PART]}));
  const first = await w.send({type: "AI_LOOKUP"});
  assert.equal(first.ok, true);
  assert.deepEqual(first.segments, logic.aiItems([PART]));
  assert.equal(w.requests[0].url, `https://server.test/v1/segments/${VIDEO}`);
  assert.equal(w.requests[0].options.credentials, "omit");
  await w.send({type: "AI_LOOKUP"});
  assert.equal(w.requests.length, 1);
  await w.send({type: "AI_LOOKUP", transcriptHash: HASH});
  assert.equal(w.requests[1].url, `https://server.test/v1/segments/${VIDEO}?transcript=${HASH}`);
});

test("worker sends a transcript with a stable random install ID", async () => {
  const w = worker(() => reply({status: "working", transcript: HASH, retryAfter: 999}));
  const transcript = {language: "en", lines: [[0, "hi"]], description: "d".repeat(6000), paidLabel: true, extra: "dropped"};
  const answer = await w.send({type: "AI_SUBMIT", transcript});
  assert.deepEqual({status: answer.status, retryAfter: answer.retryAfter}, {status: "working", retryAfter: 15});
  const body = JSON.parse(w.requests[0].options.body);
  assert.deepEqual(Object.keys(body).sort(), ["description", "installId", "language", "lines", "paidLabel", "videoId"]);
  assert.equal(body.description.length, 5000);
  assert.match(body.installId, /^[0-9a-f-]{36}$/);
  await w.send({type: "AI_SUBMIT", transcript});
  assert.equal(JSON.parse(w.requests[1].options.body).installId, body.installId);
});

test("worker refuses bad server answers and untrusted senders", async () => {
  for (const bad of [{status: "ready", segments: [{start: 9, end: 1}]}, {status: "working", transcript: "nope"}, {status: "weird"}, ["x"]]) {
    const w = worker(() => reply(bad));
    const answer = await w.send({type: "AI_LOOKUP"});
    assert.equal(answer.ok, false);
    assert.equal(answer.status, "error");
  }
  const w = worker(() => reply({status: "unknown"}));
  assert.equal((await w.send({type: "AI_LOOKUP"}, {id: "other", url: "https://www.youtube.com/"})).ok, false);
  assert.equal((await w.send({type: "AI_LOOKUP"}, {id: "ext", url: "https://evil.test/"})).ok, false);
  assert.equal((await w.send({type: "AI_LOOKUP", videoId: "../../x"})).ok, false);
  assert.equal((await w.send({type: "AI_LOOKUP", transcriptHash: "../x"})).ok, false);
  assert.equal(w.requests.length, 0);
});

test("worker stops asking for a while when the server is over its limits", async () => {
  for (const [response, pausedFor] of [
    [() => reply({error: "too many"}, {status: 429, headers: {"retry-after": "600"}}), 600_000],
    [() => reply({status: "unavailable", reason: "budget"}), 30 * 60_000]
  ]) {
    const w = worker(response);
    assert.equal((await w.send({type: "AI_LOOKUP"})).status, "unavailable");
    assert.equal((await w.send({type: "AI_LOOKUP"})).reason, "paused");
    assert.equal(w.requests.length, 1);
    w.advance(pausedFor + 1);
    await w.send({type: "AI_LOOKUP"});
    assert.equal(w.requests.length, 2);
  }
});

test("worker refuses oversized server replies", async () => {
  const w = worker(() => new Response("x".repeat(70 * 1024)));
  assert.match((await w.send({type: "AI_LOOKUP"})).error, /too large/);
});
