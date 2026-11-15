"use strict";
/* The welcome page: explains AI checks and records the viewer's choice.
 * AI checks stay off until the viewer presses "Turn on AI checks". */
const turnOn = document.getElementById("turn-on");
const notNow = document.getElementById("not-now");
const result = document.getElementById("result");

function showChoice(on) {
  turnOn.textContent = on ? "AI checks are on" : "Turn on AI checks";
  turnOn.setAttribute("aria-pressed", String(on));
  notNow.textContent = on ? "Turn off" : "Not now";
}

async function choose(on) {
  turnOn.disabled = notNow.disabled = true;
  try {
    await chrome.storage.local.set({aiChecks: on});
    showChoice(on);
    result.textContent = on
      ? "Done. Videos without SponsorBlock data will now be checked by AI."
      : "AI checks are off. Only SponsorBlock data is used.";
  } catch {
    result.textContent = "Couldn’t save your choice. Please try again.";
  } finally {
    turnOn.disabled = notNow.disabled = false;
  }
}

turnOn.addEventListener("click", () => choose(true));
notNow.addEventListener("click", () => choose(false));
chrome.storage.local.get({aiChecks: false}).then(values => showChoice(values.aiChecks === true)).catch(() => {});
