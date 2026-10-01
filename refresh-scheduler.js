/* Original playback refresh scheduler; production intervals are fixed here. */
(function(root) {
  "use strict";
  const NORMAL_MS=180000, EARLY_MS=60000;
  function createRefreshScheduler({refresh, now=()=>Date.now(), random=Math.random, setTimer=setTimeout, clearTimer=clearTimeout}) {
    let active=false, disposed=false, inFlight=false, failures=0, seeded=false, due=0, timer=null;
    const jitter=ms=>Math.round(ms*(0.9+random()*0.2));
    function clear(){if(timer!==null)clearTimer(timer);timer=null;}
    function arm(){
      clear();
      if(!active||disposed||inFlight||!due)return;
      timer=setTimer(run,Math.max(1000,due-now()));
    }
    function settle(result={}) {
      if(disposed)return;
      if(result.error){
        failures=Math.min(failures+1,8);
        due=now()+Math.max(result.retryAfterMs||0,jitter(Math.min(1800000,NORMAL_MS*2**(failures-1))));
      } else {
        failures=0;
        due=now()+jitter(!seeded&&result.count===0 ? EARLY_MS : NORMAL_MS);
      }
      seeded=true;arm();
    }
    async function run(){
      timer=null;
      if(!active||disposed||inFlight)return;
      inFlight=true;
      try { settle(await refresh()); }
      catch { settle({error:true}); }
      finally {inFlight=false;arm();}
    }
    return {
      settle,
      setActive(value){
        if(disposed)return;
        if(active===Boolean(value))return;
        active=Boolean(value);
        // A long pause/hidden tab resumes politely, with no burst of overdue requests.
        if(active&&due&&due<now())due=now()+jitter(15000);
        arm();
      },
      dispose(){disposed=true;clear();},
      status:()=>({active,inFlight,failures,nextDue:due||null})
    };
  }
  const api={createRefreshScheduler,NORMAL_MS,EARLY_MS};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.ShieldRefresh=api;
})(globalThis);

