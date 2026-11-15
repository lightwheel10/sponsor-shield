"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const logic=require("../segment-logic.js");
const source=fs.readFileSync(require.resolve("../content.js"),"utf8");
class Element {
  constructor(tag="div") {
    this.tag=tag; this.children=[]; this.listeners={}; this.hidden=false; this.isConnected=true;
    this.classes=new Set(); this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),contains:k=>this.classes.has(k)};
  }
  append(...children) { for(const child of children){child.parentElement=this;this.children.push(child);} }
  remove() { if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;this.isConnected=false; }
  setAttribute(){}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  removeEventListener(k,fn){this.listeners[k]=(this.listeners[k]||[]).filter(f=>f!==fn);}
  emit(k,event={}){for(const fn of this.listeners[k]||[])fn(event);}
  dispatchEvent(event){this.emit(event.type,event);}
  contains(node){return node===this||this.children.some(c=>c.contains(node));}
}
async function setup({mode="legacy-value",duration=100,end=20,muted=false,fetcher=null,pageTranscript={language:"en",lines:[[0,"hi"],[30,"sponsored by Acme"]],description:"",paidLabel:false}}={}) {
  const video=new Element("video"),player=new Element(),doc=new Element(),win=new Element();
  let time=0;
  Object.assign(video,{duration,paused:true,ended:false,readyState:4,seeking:false,playbackRate:1,muted});
  video.timeWrites=0;
  Object.defineProperty(video,"currentTime",{get:()=>time,set:()=>{
    video.timeWrites++; throw new Error("NO_EXTENSION_SEEKS: currentTime is read-only to the extension");
  }});
  video.play=()=>{video.paused=false;video.emit("play");return Promise.resolve();};
  player.append(video);player.querySelector=()=>video;
  doc.documentElement=new Element();
  doc.querySelector=()=>player;
  doc.createElement=tag=>new Element(tag);
  const timers=new Map(),intervals=new Map(),badges=[],observers=[];let timerId=0,settingsListener,messageListener,refreshFn;
  const location={href:"https://www.youtube.com/watch?v=abcdefghijk"};
  const values={enabled:true,includeSelfpromo:false,playbackMode:mode};
  const chrome={
    runtime:{id:"our-extension",onMessage:{addListener:fn=>messageListener=fn,removeListener:fn=>{if(messageListener===fn)messageListener=null;}},sendMessage:async message=>{if(message?.type==="BADGE"){badges.push(message.count);return;}return (fetcher || (async()=>({ok:true,videoId:"abcdefghijk",segments:[{segment:[10,end],category:"sponsor",actionType:"skip",UUID:"original-test"}]})))(message);}},
    storage:{local:{get:async()=>values},onChanged:{addListener:fn=>settingsListener=fn,removeListener:fn=>{if(settingsListener===fn)settingsListener=null;}}}
  };
  const context=vm.createContext({ShieldLogic:logic,ShieldRefresh:{createRefreshScheduler:opts=>{refreshFn=opts.refresh;return require("../refresh-scheduler.js").createRefreshScheduler({...opts,setTimer:()=>0,clearTimer(){}});}},document:doc,window:win,location,chrome,queueMicrotask,URL,Event,
    MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(target){target.observer=this.fn;this.connected=true;}disconnect(){this.connected=false;}},
    setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{intervals.set(++timerId,{fn,ms});return timerId;},clearInterval:id=>intervals.delete(id)});
  // The AI helper runs inside the same fake world, and a fake page-world caption
  // reader answers transcript requests (pass pageTranscript: null to setup for "no captions").
  vm.runInContext(fs.readFileSync(require.resolve("../ai-flow.js"),"utf8"),context);
  win.location={origin:"https://www.youtube.com"};
  win.pageTranscript=pageTranscript;
  win.postMessage=data=>{if(data?.type!=="GRAB_TRANSCRIPT")return;queueMicrotask(()=>win.emit("message",{source:win,data:{
    source:"sponsor-shield-page",requestId:data.requestId,videoId:data.videoId,ok:Boolean(win.pageTranscript),transcript:win.pageTranscript,error:"no captions"}}));};
  const inject=()=>vm.runInContext(source,context);
  inject();
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  await flush();
  const at=async(value,paused=true)=>{time=value;video.paused=paused;video.emit("timeupdate");await flush();};
  const status=()=>{let result;messageListener({type:"GET_STATUS"},null,r=>result=r);return result;};
  const find=(predicate,node=player)=>node.children.flatMap(c=>[c,...find(predicate,c)]).filter(predicate);
  const button=text=>find(e=>e.tag==="button"&&e.textContent===text)[0];
  const byClass=name=>find(e=>e.className===name)[0];
  const toast=()=>find(e=>e.className==="ytss-toast")[0];
  const blurred=()=>video.classList.contains("ytss-blurred");
  const change=async(key,value)=>{settingsListener({[key]:{newValue:value}},"local");await flush();};
  return {byClass,badges,video,player,doc,win,location,timers,intervals,observers,chrome,context,inject,at,status,button,toast,blurred,flush,change,refresh:()=>refreshFn()};
}

test("natural playback mutes and blurs inside, then restores after the boundary",async()=>{
 const h=await setup();await h.at(9,false);assert.equal(h.blurred(),false);
 await h.at(11,false);assert.equal(h.blurred(),true);assert.equal(h.video.muted,true);
 assert.equal(h.video.currentTime,11);assert.equal(h.video.timeWrites,0);
 assert.equal(h.byClass("ytss-count").textContent,"0:09");
 assert.equal(h.byClass("ytss-sr").textContent,"Sponsor segment muted and blurred, ends in 9 seconds");
 assert.ok(h.button("Show anyway"));assert.deepEqual(h.badges.at(-1),1);
 assert.equal(h.button("Skip"),undefined);assert.equal(h.button("Undo"),undefined);
 await h.at(20,false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
});
test("paused entry and resume preserve time and shielding",async()=>{
 const h=await setup();await h.at(12,true);assert.equal(h.blurred(),true);
 await h.video.play();await h.flush();assert.equal(h.blurred(),true);assert.equal(h.video.currentTime,12);assert.equal(h.video.timeWrites,0);
});
test("a pre-existing mute is preserved on exit and Show anyway",async()=>{
 const h=await setup({muted:true});await h.at(11);await h.at(21);assert.equal(h.video.muted,true);
 await h.at(11);h.button("Show anyway").emit("click");assert.equal(h.video.muted,true);assert.equal(h.blurred(),false);
});
test("Show anyway overrides the current merged segment including seek-back",async()=>{
 const h=await setup();await h.at(11);h.button("Show anyway").emit("click");await h.flush();
 assert.equal(h.video.muted,false);assert.equal(h.blurred(),false);await h.at(22);await h.at(12);
 assert.equal(h.status().overridden,true);assert.equal(h.blurred(),false);assert.equal(h.video.timeWrites,0);
});
test("user unmute is an override without changing the user's volume",async()=>{
 const h=await setup();h.video.volume=.4;await h.at(11);h.video.muted=false;h.video.emit("volumechange");
 assert.equal(h.blurred(),false);assert.equal(h.status().overridden,true);assert.equal(h.video.volume,.4);await h.at(13);assert.equal(h.video.muted,false);
});
test("ad class changes suspend shielding and refresh, then restore both",async()=>{
 const h=await setup();await h.at(11,false);assert.equal(h.status().refresh.active,true);
 h.player.classList.add("ad-showing");h.player.observer();assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);assert.equal(h.status().refresh.active,false);
 h.player.classList.remove("ad-showing");h.player.observer();assert.equal(h.blurred(),true);assert.equal(h.status().refresh.active,true);
});
test("enable setting applies live and releases only an owned mute",async()=>{
 const h=await setup();await h.at(11);await h.change("enabled",false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
 await h.change("enabled",true);assert.equal(h.blurred(),true);assert.equal(h.video.muted,true);
});
test("navigation releases media, clears overrides and disposes refresh",async()=>{
 const h=await setup();await h.at(11);h.location.href="https://www.youtube.com/";const s=h.status();
 assert.equal(s.videoId,null);assert.equal(s.refresh,null);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
});
test("refresh changed boundaries preserve an overlapping Show anyway override",async()=>{
 let calls=0;const h=await setup({fetcher:async()=>({ok:true,videoId:"abcdefghijk",segments:[{segment:calls++?[9,21]:[10,20],category:"sponsor",actionType:"skip",UUID:"same"}]})});
 await h.at(11);h.button("Show anyway").emit("click");await h.refresh();await h.at(12);
 assert.equal(h.status().refreshCount,1);assert.equal(h.status().overridden,true);assert.equal(h.blurred(),false);
});
test("refresh failure retains previous data; a newly covering segment applies normally",async()=>{
 let calls=0;const h=await setup({fetcher:async()=>{calls++;if(calls===2)return {ok:false,error:"HTTP 429",retryAfterMs:60000};return {ok:true,videoId:"abcdefghijk",segments:[{segment:calls===1?[10,20]:[30,40],category:"sponsor",actionType:"skip",UUID:String(calls)}]};}});
 await h.at(12);await h.refresh();assert.equal(h.status().load,"loaded");assert.equal(h.blurred(),true);assert.match(h.status().refreshError,/429/);
 await h.at(32);assert.equal(h.blurred(),false);await h.refresh();assert.equal(h.blurred(),true);assert.equal(h.status().segmentsFound,2);
});
test("in-flight refresh is coalesced and stale results cannot change a new page",async()=>{
 // Counts SponsorBlock lookups only; the AI fallback (asked because this video has none) is answered "unavailable".
 let calls=0,resolve;const h=await setup({fetcher:async message=>{if(message.type!=="GET_SEGMENTS")return {ok:true,status:"unavailable",reason:"test"};if(calls++)return new Promise(r=>resolve=r);return {ok:true,videoId:"abcdefghijk",segments:[]};}});
 const pending=h.refresh();await h.refresh();assert.equal(calls,2);h.location.href="https://www.youtube.com/";h.status();
 resolve({ok:true,videoId:"abcdefghijk",segments:[{segment:[10,20],category:"sponsor",actionType:"skip",UUID:"late"}]});await pending;
 assert.equal(h.status().segmentsFound,0);assert.equal(h.status().videoId,null);
});
test("empty and failed lookups leave playback unchanged",async()=>{
 for(const result of [{ok:true,videoId:"abcdefghijk",segments:[]},{ok:false,error:"Failed to fetch"}]){
 const h=await setup({fetcher:async()=>result});await h.at(11,false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);assert.equal(h.video.timeWrites,0);}
});
test("unready media and unsettled seeks release shielding until ready",async()=>{
 const h=await setup();h.video.readyState=1;await h.at(11);assert.equal(h.blurred(),false);
 h.video.readyState=4;h.video.seeking=true;await h.at(11);assert.equal(h.blurred(),false);
 h.video.seeking=false;await h.at(11);assert.equal(h.blurred(),true);assert.equal(h.video.timeWrites,0);
});
test("self promotion is opt-in and its setting applies live",async()=>{
 const h=await setup({fetcher:async()=>({ok:true,videoId:"abcdefghijk",segments:[{segment:[10,20],category:"selfpromo",actionType:"skip",UUID:"self"}]})});
 await h.at(11);assert.equal(h.blurred(),false);await h.change("includeSelfpromo",true);assert.equal(h.blurred(),true);
 await h.change("includeSelfpromo",false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
});
test("legacy stored modes are ignored, including live changes",async()=>{
 for(const mode of ["auto-skip","mute-blur","invalid"]){const h=await setup({mode});await h.at(11,false);assert.equal(h.blurred(),true);await h.change("playbackMode","auto-skip");assert.equal(h.blurred(),true);assert.equal(h.video.timeWrites,0);assert.equal(h.status().playbackMode,undefined);}
});
test("refresh stops while paused, hidden or ended",async()=>{
 const h=await setup();await h.at(5,false);assert.equal(h.status().refresh.active,true);
 await h.at(5,true);assert.equal(h.status().refresh.active,false);
 h.doc.visibilityState="hidden";await h.at(5,false);assert.equal(h.status().refresh.active,false);
 h.doc.visibilityState="visible";h.doc.emit("visibilitychange");assert.equal(h.status().refresh.active,true);
 h.video.ended=true;await h.at(5,false);assert.equal(h.status().refresh.active,false);
});


test("duplicate injection preserves one instance, listeners, overlay and override",async()=>{
 const h=await setup();await h.at(11);const instance=h.context.__sponsorShield,card=h.byClass("ytss-card");
 h.inject();await h.flush();assert.equal(h.context.__sponsorShield,instance);assert.equal(h.byClass("ytss-card"),card);
 assert.equal(h.intervals.size,1);assert.equal(h.video.listeners.timeupdate.length,1);assert.equal(h.observers.length,2);
 h.button("Show anyway").emit("click");h.inject();await h.at(12);assert.equal(h.status().overridden,true);
});
test("invalidated runtime id releases owned media and disposes all activity on the fallback tick",async()=>{
 const h=await setup();await h.at(11,false);const tick=[...h.intervals.values()][0].fn;
 h.chrome.runtime.id=undefined;tick();await h.flush();
 assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);assert.equal(h.byClass("ytss-overlay"),undefined);
 assert.equal(h.timers.size,0);assert.equal(h.intervals.size,0);assert.equal(h.context.__sponsorShield,undefined);
 assert.ok(h.observers.every(o=>!o.connected));assert.equal(h.video.listeners.timeupdate.length,0);
 assert.ok(Object.values(h.win.listeners).every(list=>list.length===0));
 await h.at(12);assert.equal(h.blurred(),false);assert.equal(h.video.timeWrites,0);
});
test("synchronous Extension context invalidated errors retire the instance safely",async()=>{
 const h=await setup();await h.at(11);h.chrome.runtime.sendMessage=()=>{throw new Error("Extension context invalidated.");};
 await h.change("enabled",false);assert.equal(h.context.__sponsorShield,undefined);assert.equal(h.intervals.size,0);assert.equal(h.video.muted,false);
});
test("rejected invalidation and late lookup responses cannot resurrect a disposed instance",async()=>{
 for(const reject of [false,true]){
  let settle;const h=await setup({fetcher:()=>new Promise((resolve,rejectPromise)=>settle=reject?rejectPromise:resolve)});
  if(!reject){h.chrome.runtime.id=undefined;[...h.intervals.values()][0].fn();}
  settle(reject?new Error("Extension context invalidated."):{ok:true,videoId:"abcdefghijk",segments:[]});await h.flush();
  assert.equal(h.context.__sponsorShield,undefined);assert.equal(h.intervals.size,0);assert.equal(h.blurred(),false);
 }
});
test("replacement handoff retires the old instance and preserves a pre-existing mute",async()=>{
 const h=await setup({muted:true});await h.at(11);h.win.dispatchEvent(new Event("sponsor-shield:dispose"));
 assert.equal(h.video.muted,true);assert.equal(h.blurred(),false);assert.equal(h.intervals.size,0);
 h.inject();await h.flush();await h.at(11);assert.equal(h.blurred(),true);assert.equal(h.intervals.size,1);
 assert.equal(h.video.listeners.timeupdate.length,1);await h.at(21);assert.equal(h.video.muted,true);
});

/* ---------- AI fallback (used only when SponsorBlock has no sponsor parts) ---------- */
const AI_ITEM={segment:[30,50],category:"sponsor",actionType:"mute",UUID:"ai:30-50"};
function aiServer(answers){
 const asked=[];
 const fetcher=async message=>{
  asked.push(message);
  if(message.type==="GET_SEGMENTS")return {ok:true,videoId:"abcdefghijk",segments:[]};
  const next=answers[message.type+(message.transcriptHash?"+hash":"")];
  return typeof next==="function"?next(message):next;
 };
 return {asked,fetcher};
}
const settle=async h=>{for(let i=0;i<6;i++)await h.flush();};
test("no SponsorBlock sponsor: AI answer is applied and labelled as found by AI",async()=>{
 const server=aiServer({AI_LOOKUP:{ok:true,status:"unknown"},AI_SUBMIT:{ok:true,status:"ready",segments:[AI_ITEM]}});
 const h=await setup({fetcher:server.fetcher,duration:100});await settle(h);
 assert.deepEqual(server.asked.map(m=>m.type),["GET_SEGMENTS","AI_LOOKUP","AI_SUBMIT"]);
 assert.deepEqual(server.asked[2].transcript.lines,[[0,"hi"],[30,"sponsored by Acme"]]);
 assert.equal(h.status().ai,"done");assert.deepEqual({...h.status().sources},{sponsorblock:0,ai:1});
 await h.at(31,false);assert.equal(h.blurred(),true);assert.equal(h.video.muted,true);
 assert.equal(h.byClass("ytss-source").textContent,"found by AI");
 await h.at(50,false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
});
test("SponsorBlock sponsor found: the AI is never asked",async()=>{
 const asked=[];
 const h=await setup({fetcher:async message=>{asked.push(message.type);return {ok:true,videoId:"abcdefghijk",segments:[{segment:[10,20],category:"sponsor",actionType:"skip",UUID:"sb"}]};}});
 await settle(h);assert.deepEqual(asked,["GET_SEGMENTS"]);assert.equal(h.status().ai,"idle");
});
test("AI answer that is still being worked on is polled until ready",async()=>{
 const hash="b".repeat(64);
 const server=aiServer({AI_LOOKUP:{ok:true,status:"unknown"},AI_SUBMIT:{ok:true,status:"working",transcript:hash,retryAfter:4},
  "AI_LOOKUP+hash":{ok:true,status:"ready",segments:[AI_ITEM]}});
 const h=await setup({fetcher:server.fetcher});await settle(h);
 assert.equal(h.status().ai,"checking");
 const poll=[...h.timers.entries()].find(([,t])=>t.ms===4000);assert.ok(poll,"a 4 second poll timer is waiting");
 h.timers.delete(poll[0]);poll[1].fn();await settle(h);
 assert.equal(server.asked.at(-1).transcriptHash,hash);assert.equal(h.status().ai,"done");assert.equal(h.status().ranges.length,1);
});
test("a late AI answer for a video the viewer already left is ignored",async()=>{
 let release;
 const server=aiServer({AI_LOOKUP:{ok:true,status:"unknown"},AI_SUBMIT:()=>new Promise(r=>release=r)});
 const h=await setup({fetcher:server.fetcher});await settle(h);
 h.location.href="https://www.youtube.com/watch?v=zzzzzzzzzzz";h.win.emit("yt-navigate-finish");await settle(h);
 release({ok:true,status:"ready",segments:[AI_ITEM]});await settle(h);
 assert.equal(h.status().videoId,"zzzzzzzzzzz");assert.equal(h.status().ranges.length,0);
});
test("no captions or server limits leave playback untouched",async()=>{
 const noCaptions=aiServer({AI_LOOKUP:{ok:true,status:"unknown"}});
 const h=await setup({fetcher:noCaptions.fetcher,pageTranscript:null});await settle(h);
 assert.equal(h.status().ai,"unavailable");assert.deepEqual(noCaptions.asked.map(m=>m.type),["GET_SEGMENTS","AI_LOOKUP"]);
 await h.at(31,false);assert.equal(h.blurred(),false);assert.equal(h.video.muted,false);
 const limited=aiServer({AI_LOOKUP:{ok:true,status:"unavailable",reason:"budget"}});
 const g=await setup({fetcher:limited.fetcher});await settle(g);assert.equal(g.status().ai,"unavailable");
});
test("a malformed AI segment from a compromised worker reply is dropped",async()=>{
 const server=aiServer({AI_LOOKUP:{ok:true,status:"ready",segments:[AI_ITEM,{segment:[60,40],category:"sponsor",actionType:"mute",UUID:"ai:bad"},{...AI_ITEM,segment:[70,80],UUID:"not-ai"}]}});
 const h=await setup({fetcher:server.fetcher});await settle(h);
 assert.deepEqual(h.status().ranges.map(r=>[r.start,r.end]),[[30,50]]);
});
test("AI checks off: no captions are read; turning them on checks the current video",async()=>{
 let aiOn=false;
 const server=aiServer({AI_LOOKUP:()=>aiOn?{ok:true,status:"unknown"}:{ok:true,status:"unavailable",reason:"off"},
  AI_SUBMIT:{ok:true,status:"ready",segments:[AI_ITEM]}});
 const h=await setup({fetcher:server.fetcher});await settle(h);
 assert.equal(h.status().ai,"off");assert.deepEqual(server.asked.map(m=>m.type),["GET_SEGMENTS","AI_LOOKUP"]);
 aiOn=true;await h.change("aiChecks",true);await settle(h);
 assert.deepEqual(server.asked.map(m=>m.type),["GET_SEGMENTS","AI_LOOKUP","AI_LOOKUP","AI_SUBMIT"]);
 assert.equal(h.status().ai,"done");assert.equal(h.status().ranges.length,1);
});
