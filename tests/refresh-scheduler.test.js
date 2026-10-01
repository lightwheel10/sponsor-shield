"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createRefreshScheduler,NORMAL_MS,EARLY_MS}=require("../refresh-scheduler.js");
function clock(){
 let now=0,id=0;const timers=new Map();
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 return {now:()=>now,setTimer:(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimer:id=>timers.delete(id),
 async tick(ms){const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();},timers};
}
function setup(refresh=async()=>({count:1}),random=()=>.5){const c=clock();const s=createRefreshScheduler({...c,refresh,random});return {c,s};}
test("normal cadence is three minutes; empty first lookup has exactly one early recheck",async()=>{
 let calls=0;const {c,s}=setup(async()=>{calls++;return {count:0};});s.settle({count:0});s.setActive(true);
 assert.equal(s.status().nextDue,EARLY_MS);await c.tick(EARLY_MS);assert.equal(calls,1);
 assert.equal(s.status().nextDue,EARLY_MS+NORMAL_MS);await c.tick(NORMAL_MS);assert.equal(calls,2);
});
test("pausing/hidden/ended activity stops timers, then resumes without a burst",async()=>{
 let calls=0;const {c,s}=setup(async()=>{calls++;return {count:1};});s.settle({count:1});s.setActive(true);
 await c.tick(1000);s.setActive(false);assert.equal(c.timers.size,0);await c.tick(500000);assert.equal(calls,0);
 s.setActive(true);assert.equal(s.status().nextDue,c.now()+15000);await c.tick(15000);assert.equal(calls,1);
});
test("errors exponentially back off, honor 429 delay and reset after success",async()=>{
 const {c,s}=setup();s.setActive(true);s.settle({error:true});assert.equal(s.status().nextDue,180000);
 s.settle({error:true});assert.equal(s.status().nextDue,360000);
 s.settle({error:true,retryAfterMs:900000});assert.equal(s.status().nextDue,900000);
 s.settle({count:0});assert.equal(s.status().failures,0);assert.equal(s.status().nextDue,180000);
});
test("jitter bounds and backoff cap are deterministic with injected randomness",()=>{
 for(const [random,expected] of [[()=>0,162000],[()=>1,198000]]){const {s}=setup(undefined,random);s.settle({count:1});assert.equal(s.status().nextDue,expected);}
 const {s}=setup();for(let i=0;i<20;i++)s.settle({error:true});assert.equal(s.status().nextDue,1800000);
});
test("a pending request cannot overlap and disposal rejects rescheduling stale work",async()=>{
 let calls=0,resolve;const {c,s}=setup(()=>{calls++;return new Promise(r=>resolve=r);});
 s.settle({count:1});s.setActive(true);await c.tick(180000);assert.equal(calls,1);assert.equal(s.status().inFlight,true);
 s.setActive(false);s.setActive(true);await c.tick(900000);assert.equal(calls,1);
 s.dispose();resolve({count:1});await c.tick(0);assert.equal(c.timers.size,0);assert.equal(calls,1);
});

