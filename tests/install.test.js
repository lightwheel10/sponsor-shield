"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const source=fs.readFileSync(require.resolve("../service-worker.js"),"utf8");
function harness({tabs=[],failTab=null,queryFails=false}={}) {
 const calls=[];const opened=[];let installed;
 const context=vm.createContext({importScripts(){},chrome:{
  runtime:{getURL:path=>`chrome-extension://ext/${path}`,onMessage:{addListener(){}},onInstalled:{addListener(fn){installed=fn;}}},
  tabs:{query:async query=>{calls.push(["query",query]);if(queryFails)throw new Error("Shutdown");return tabs;},
   create:async args=>{opened.push(args.url);}},
  scripting:{insertCSS:async args=>{calls.push(["css",args]);if(args.target.tabId===failTab)throw new Error("Tab closed");},
   executeScript:async args=>{calls.push(["js",args]);}}
 }});
 vm.runInContext(source,context);
 return {calls,opened,installed,run:reason=>context.injectExistingTabs({reason})};
}
test("install and update inject CSS then ordered scripts in both existing YouTube hosts",async()=>{
 for(const reason of ["install","update"]){
  const h=harness({tabs:[{id:1},{id:2}]});const result=await h.run(reason);
  assert.ok(result.every(r=>r.status==="fulfilled"));
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),["query",{url:["https://www.youtube.com/*","https://youtube.com/*"]}]);
  for(const tabId of [1,2]){
   const calls=h.calls.filter(c=>c[1].target?.tabId===tabId);
   assert.deepEqual(JSON.parse(JSON.stringify(calls)),[
    ["css",{target:{tabId},files:["content.css"]}],
    // The caption reader must run in the page's own world to see the player.
    ["js",{target:{tabId},files:["transcript-grabber.js"],world:"MAIN"}],
    ["js",{target:{tabId},files:["segment-logic.js","refresh-scheduler.js","ai-flow.js","content.js"]}]
   ]);
  }
 }
});
test("one closed or restricted tab does not prevent other injections; discarded tabs wait for navigation",async()=>{
 const h=harness({tabs:[{id:1},{id:2},{id:3,discarded:true},{}],failTab:1});const result=await h.run("update");
 assert.deepEqual(Array.from(result,r=>r.status),["rejected","fulfilled"]);
 // Only tab 2 gets scripts (two calls: the page-world caption reader, then the content scripts).
 assert.equal(h.calls.filter(c=>c[0]==="js").length,2);assert.equal(h.calls.at(-1)[1].target.tabId,2);
});
test("browser-only updates do not inject, empty tabs are harmless, onInstalled handles query rejection",async()=>{
 const h=harness();await h.run("chrome_update");assert.equal(h.calls.length,0);
 assert.equal((await h.run("install")).length,0);
 const failing=harness({queryFails:true});failing.installed({reason:"install"});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(failing.calls.length,1);
});
test("a new install opens the welcome page once; updates do not",async()=>{
 const h=harness();h.installed({reason:"install"});h.installed({reason:"update"});h.installed({reason:"chrome_update"});
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.opened,["chrome-extension://ext/welcome.html"]);
});
