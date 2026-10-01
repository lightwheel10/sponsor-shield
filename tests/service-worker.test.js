"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const {webcrypto,createHash}=require("node:crypto");
const ID="9lx11dy9J30";
const record={segment:[5,10],category:"sponsor",actionType:"skip",UUID:"original-test"};
function harness(fetcher, timeout=false){
  let listener, now=0;
  const timers=new Set();
  const context=vm.createContext({
    ShieldLogic:require("../segment-logic.js"),importScripts(){},
    crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,URL,AbortController,
    Date:{now:()=>now,parse:Date.parse},fetch:fetcher,
    setTimeout(fn,ms){if(timeout){queueMicrotask(fn);return 1;} const t=setTimeout(fn,ms);timers.add(t);return t;},
    clearTimeout(t){clearTimeout(t);timers.delete(t);},
    chrome:{runtime:{id:"our-extension",onMessage:{addListener(fn){listener=fn;}},onInstalled:{addListener(){}}}}
  });
  vm.runInContext(fs.readFileSync(require.resolve("../service-worker.js"),"utf8"),context);
  return {
    send(id=ID,sender={id:"our-extension",url:"https://www.youtube.com/watch?v="+id},refresh=false){
      return new Promise(resolve=>listener({type:"GET_SEGMENTS",videoId:id,refresh},sender,resolve));
    },
    advance(ms){now+=ms;},
    close(){for(const t of timers)clearTimeout(t);}
  };
}
const json=data=>new Response(JSON.stringify(data),{headers:{"content-type":"application/json"}});
test("worker requests hash prefix without full ID and validates API",async()=>{
  let url,options;
  const h=harness(async(u,o)=>{url=new URL(u);options=o;return json([{videoID:ID,segments:[record]}]);});
  const result=await h.send();
  assert.equal(result.ok,true); assert.equal(result.segments[0].segment[0],5);
  assert.equal(url.pathname,"/api/skipSegments/"+createHash("sha256").update(ID).digest("hex").slice(0,4));
  assert.equal(url.href.includes(ID),false); assert.equal(options.credentials,"omit");
  assert.deepEqual(JSON.parse(url.searchParams.get("categories")),["sponsor","selfpromo"]);h.close();
});
test("worker rejects invalid ID, untrusted origins, frames and external sender",async()=>{
  let calls=0; const h=harness(async()=>{calls++;return json([]);});
  for(const [id,sender] of [["bad",{id:"our-extension",url:"https://youtube.com/watch?v=bad"}],[ID,{id:"other",url:"https://youtube.com/watch?v="+ID}],[ID,{id:"our-extension",url:"https://youtube.com.evil.test/watch?v="+ID}],[ID,{id:"our-extension",url:"http://youtube.com/watch?v="+ID}],[ID,{id:"our-extension",url:"https://youtube.com/watch?v="+ID,frameId:2}]]){
    assert.equal((await h.send(id,sender)).ok,false);
  }
  assert.equal(calls,0);h.close();
});
test("worker cache expires after ten minutes",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return json([]);});
  await h.send();await h.send();assert.equal(calls,1);
  h.advance(600001);await h.send();assert.equal(calls,2);h.close();
});
test("worker deduplicates simultaneous lookups",async()=>{
  let calls=0,release,started;const ready=new Promise(r=>started=r);const h=harness(async()=>{calls++;started();await new Promise(r=>release=r);return json([]);});
  const a=h.send(),b=h.send();
  await ready;assert.equal(calls,1);release();
  assert.equal((await a).ok,true);assert.equal((await b).ok,true);h.close();
});
test("worker cache evicts beyond 48 videos",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return json([]);});
  const ids=Array.from({length:49},(_,n)=>"video"+String(n).padStart(6,"0"));
  for(const id of ids)assert.equal((await h.send(id)).ok,true);
  assert.equal(calls,49);await h.send(ids[0]);assert.equal(calls,50);h.close();
});
test("404 is an empty result; API failures are not cached",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return new Response("",{status:404});});
  assert.equal((await h.send()).segments.length,0);await h.send();assert.equal(calls,1);h.close();
  const bad=harness(async()=>new Response("",{status:503}));
  assert.match((await bad.send()).error,/503/);bad.close();
  let errors=0;const malformed=harness(async()=>{errors++;return json([{videoID:ID,segments:[{...record,segment:[10,5]}]}]);});
  assert.equal((await malformed.send()).ok,false);await malformed.send();assert.equal(errors,2);malformed.close();
});
test("worker aborts request at timeout",async()=>{
  const h=harness(async(_url,{signal})=>new Promise((_resolve,reject)=>{
    const fail=()=>reject(Object.assign(new Error("Aborted"),{name:"AbortError"}));
    if(signal.aborted)fail();else signal.addEventListener("abort",fail);
  }),true);
  assert.match((await h.send()).error,/timed out/);h.close();
});
test("worker enforces response byte limit for headers and streaming body",async()=>{
  for(const response of [
    new Response("",{headers:{"content-length":"1048577"}}),
    new Response("x".repeat(1048577))
  ]){
    const h=harness(async()=>response);
    assert.match((await h.send()).error,/too large/);h.close();
  }
});


test("worker accepts trusted SPA frame with an older URL or initial home page",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return json([]);});
  assert.equal((await h.send("abcdefghijk",{id:"our-extension",url:"https://www.youtube.com/watch?v="+ID,frameId:0})).ok,true);
  assert.equal((await h.send(ID,{id:"our-extension",url:"https://www.youtube.com/",frameId:0})).ok,true);
  assert.equal(calls,2);h.close();
});

test("refresh bypasses a fresh cache while concurrent refreshes share one request",async()=>{
  let calls=0,resolve;
  const h=harness(async()=>{calls++;if(calls===2)await new Promise(r=>resolve=r);return json([]);});
  await h.send();await h.send();assert.equal(calls,1);
  const a=h.send(ID,undefined,true),b=h.send(ID,undefined,true);
  for(let i=0;i<20&&!resolve;i++)await new Promise(r=>setImmediate(r));
  assert.equal(calls,2);resolve();assert.equal((await a).ok,true);assert.equal((await b).ok,true);
  await h.send();assert.equal(calls,2);h.close();
});
test("429 honors Retry-After and prevents repeated requests during cooldown",async()=>{
  let calls=0;const h=harness(async()=>{calls++;return new Response("",{status:429,headers:{"retry-after":"120"}});});
  const first=await h.send();assert.equal(first.ok,false);assert.equal(first.retryAfterMs,120000);
  await h.send(ID,undefined,true);assert.equal(calls,1);
  h.advance(120001);await h.send(ID,undefined,true);assert.equal(calls,2);h.close();
});
