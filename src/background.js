import { SYNC_ALARM, SYNC_PERIOD_MINUTES } from "./config.js";
import { sync } from "./sync.js";
import { connectGoogle } from "./gcal.js";
import { setGoogleConnected, updateStatus } from "./storage.js";

// Listeners must be registered synchronously at the top level so Chrome can
// wake the service worker for them.

async function ensureAlarm() {
  // alarms.create resets the timer, so only create it if it's missing.
  if (!(await chrome.alarms.get(SYNC_ALARM))) {
    await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  await sync({ reason: "installed" });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await sync({ reason: "startup" });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) sync({ reason: "alarm" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e.message }));
  return true; // keep the channel open for the async response
});

async function handleMessage(message) {
  switch (message?.type) {
    case "sync":
      return sync({ reason: "manual" });
    case "connect":
      try {
        await connectGoogle();
      } catch (e) {
        await updateStatus({ lastError: e.message });
        throw e;
      }
      await setGoogleConnected(true);
      return sync({ reason: "connected" });
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}
