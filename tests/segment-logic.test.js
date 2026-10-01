"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const L = require("../segment-logic.js");
const ID = "9lx11dy9J30";
const seg = (a,b,category="sponsor",actionType="skip") => ({segment:[a,b],category,actionType,UUID:`${a}-${b}`});
test("exact video ID validation",()=>{ assert.equal(L.isVideoId(ID),true); for(const id of [null,123,"short",ID+"x","abc defghij"]) assert.equal(L.isVideoId(id),false); });
test("secure regular watch pages only",()=>{
  assert.equal(L.videoIdFromUrl("https://www.youtube.com/watch?v="+ID+"&t=7"),ID);
  assert.equal(L.videoIdFromUrl("https://youtube.com/watch?v="+ID),ID);
  for(const url of ["https://www.youtube.com/shorts/"+ID,"https://youtube.com/embed/"+ID,"https://youtube.com.evil.test/watch?v="+ID,"http://youtube.com/watch?v="+ID,"invalid","https://youtube.com/watch?v=abc"]) assert.equal(L.videoIdFromUrl(url),null);
});
test("select exact video from hash bucket; copy supported fields",()=>{
  const response=[{videoID:"abcdefghijk",segments:[seg(1,2)]},{videoID:ID,segments:[seg(5,10),seg(10,12,"intro"),seg(12,14,"sponsor","full")]}];
  const result=L.extractSegments(response,ID); assert.deepEqual(result,[seg(5,10)]);
  result[0].segment[0]=0; assert.equal(response[1].segments[0].segment[0],5);
});
test("missing exact video yields empty list",()=>{
  assert.deepEqual(L.extractSegments([{videoID:"abcdefghijk",segments:[seg(0,1)]}],ID),[]);
  assert.deepEqual(L.extractSegments([],ID),[]);
});
test("reject malformed envelopes and duplicate videos",()=>{
  for(const response of [null,{},[null],[{videoID:ID,segments:"bad"}],[{videoID:"bad",segments:[]}],[{videoID:ID,segments:[]},{videoID:ID,segments:[]}]]) assert.throws(()=>L.extractSegments(response,ID));
  assert.throws(()=>L.extractSegments([],"bad"));
});
test("bounded response record counts",()=>{
  assert.throws(()=>L.extractSegments(Array(4097).fill({videoID:ID,segments:[]}),ID));
  assert.throws(()=>L.extractSegments([{videoID:ID,segments:Array(1001).fill(seg(0,1))}],ID));
});
test("reject invalid numeric and structural ranges",()=>{
  for(const item of [seg(-1,2),seg(3,2),seg(2,2),seg(0,Infinity),seg(NaN,4),seg(0,604801),{...seg(1,2),segment:["1",2]},{...seg(1,2),UUID:""},{...seg(1,2),segment:[1,2,3]}]){
    assert.equal(L.validSegment(item),false); assert.throws(()=>L.extractSegments([{videoID:ID,segments:[item]}],ID));
  }
});
test("merge overlapping, nested and touching ranges",()=>{
  assert.deepEqual(L.mergeSegments([seg(18,25),seg(5,20),seg(8,12),seg(25,30)]),[{start:5,end:30,key:"5:30"}]);
});
test("sort disjoint ranges without mutating input",()=>{
  const items=[seg(30,40),seg(5,10)];
  assert.deepEqual(L.mergeSegments(items),[{start:5,end:10,key:"5:10"},{start:30,end:40,key:"30:40"}]);
  assert.equal(items[0].segment[0],30);
});
test("self promotion is opt-in and overlaps combine",()=>{
  const items=[seg(5,10),seg(8,15,"selfpromo"),seg(0,3,"intro")];
  assert.deepEqual(L.mergeSegments(items),[{start:5,end:10,key:"5:10"}]);
  assert.deepEqual(L.mergeSegments(items,true),[{start:5,end:15,key:"5:15"}]);
});
test("include mute actions, exclude full-video/chapter actions",()=>{
  assert.equal(L.mergeSegments([seg(2,4,"sponsor","mute")]).length,1);
  assert.deepEqual(L.mergeSegments([seg(0,4,"sponsor","full"),seg(2,5,"sponsor","chapter")]),[]);
});
test("start inclusive, end exclusive",()=>{
  const ranges=L.mergeSegments([seg(5,10)]);
  assert.equal(L.segmentAt(ranges,4.999),null); assert.equal(L.segmentAt(ranges,5).key,"5:10");
  assert.equal(L.segmentAt(ranges,9.999).key,"5:10"); assert.equal(L.segmentAt(ranges,10),null);
});
test("seeking recomputes segment from current time",()=>{
  const ranges=L.mergeSegments([seg(5,10),seg(20,30)]);
  for(const [time,key] of [[25,"20:30"],[15,null],[7,"5:10"],[31,null],[0,null]]) assert.equal(L.segmentAt(ranges,time)?.key||null,key);
  assert.equal(L.segmentAt(ranges,NaN),null);
});
test("next boundary before, within, between and after segments",()=>{
  const ranges=L.mergeSegments([seg(5,10),seg(20,30)]);
  for(const [time,b] of [[0,5],[5,10],[9,10],[10,20],[25,30],[30,null]]) assert.equal(L.nextBoundary(ranges,time),b);
  assert.equal(L.nextBoundary(ranges,NaN),null);
});
test("boundary timer scales with playback rate and is bounded",()=>{
  const ranges=L.mergeSegments([seg(5,10)]);
  assert.equal(L.boundaryDelay(ranges,4,2,false),500);
  assert.equal(L.boundaryDelay(ranges,4.5,.5,false),1000);
  assert.equal(L.boundaryDelay(ranges,4.999,1,false),20);
});
test("paused, invalid rate or no future boundary means no timer",()=>{
  const r=L.mergeSegments([seg(5,10)]);
  assert.equal(L.boundaryDelay(r,7,1,true),null); assert.equal(L.boundaryDelay(r,7,0,false),null);
  assert.equal(L.boundaryDelay(r,7,NaN,false),null); assert.equal(L.boundaryDelay(r,11,1,false),null);
});


test("refresh boundaries preserve remembered overrides by overlap",()=>{
 assert.equal(L.rememberedRange([{start:10,end:20}],{start:9,end:21}),true);
 assert.equal(L.rememberedRange([{start:10,end:20}],{start:20,end:30}),false);
 assert.equal(L.rememberedRange([],null),false);
});

