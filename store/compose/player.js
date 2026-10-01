// Composition-only media and Chrome fixtures. Runtime files are loaded unchanged.
const mode = new URLSearchParams(location.search).get("mode") || "active";
const demoTime = mode === "ready" ? 10 : 48;
const demoVideo = document.querySelector("video");
for (const [key, value] of Object.entries({currentTime: demoTime, duration: 240, readyState: 4, paused: true, seeking: false})) {
  Object.defineProperty(demoVideo, key, {get: () => value});
}
document.querySelector("#clock").textContent = mode === "ready" ? "0:10 / 4:00" : "0:48 / 4:00";
ShieldLogic.videoIdFromUrl = () => "demoVideo01";
window.chrome = {
  runtime: {id: "composition-only", onMessage: {addListener() {}, removeListener() {}}, sendMessage: async message => message.type === "BADGE" ? undefined : {
    ok: true, videoId: "demoVideo01", segments: [
      {segment: [38, 72], category: "sponsor", actionType: "skip", UUID: "sample-one"},
      {segment: [156, 184], category: "sponsor", actionType: "mute", UUID: "sample-two"}
    ]
  }},
  storage: {local: {get: async defaults => defaults}, onChanged: {addListener() {}, removeListener() {}}}
};
if (mode === "override") {
  const wait = setInterval(() => {
    const button = document.querySelector(".ytss-button");
    if (button) { button.click(); clearInterval(wait); document.body.dataset.ready = "true"; }
  }, 10);
}
