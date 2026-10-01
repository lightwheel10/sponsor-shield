"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
// NO_EXTENSION_SEEKS: grep-able release contract. Runtime code may READ currentTime.
const forbidden=[
 /\bcurrentTime\s*(?:=(?!=)|[+\-*/%]=|\+\+|--)/,
 /\[\s*["']currentTime["']\s*\]\s*(?:=(?!=)|[+\-*/%]=|\+\+|--)/,
 /(?:\+\+|--)\s*[\w$.]+\.currentTime\b/,
 /\b(?:seekTo|fastSeek)\b/,
 /\b(?:defineProperty|set)\s*\([^\n]*["']currentTime["']/
];
function assertNoSeeking(source,filename){
 for(const pattern of forbidden)assert.doesNotMatch(source,pattern,"NO_EXTENSION_SEEKS: "+filename);
}
test("NO_EXTENSION_SEEKS: all extension JavaScript has no currentTime writes or seekTo calls",()=>{
 const files=fs.readdirSync(root).filter(file=>file.endsWith(".js"));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
 for(const file of [manifest.background.service_worker,...manifest.content_scripts.flatMap(s=>s.js)])assert.ok(files.includes(file),"Runtime file omitted: "+file);
 assert.ok(files.includes("popup.js"));
 for(const file of files)assertNoSeeking(fs.readFileSync(path.join(root,file),"utf8"),file);
});
test("NO_EXTENSION_SEEKS assertion rejects representative writes and seek APIs",()=>{
 for(const source of ["v.currentTime = 20","v.currentTime += 1","v.currentTime++","++v.currentTime","v['currentTime'] = 20","p.seekTo(20)","v.fastSeek(20)","Reflect.set(v, 'currentTime', 20)"])assert.throws(()=>assertNoSeeking(source,"fixture"));
 assertNoSeeking("const time = video.currentTime; if (video.currentTime === 20) update();","read fixture");
});
