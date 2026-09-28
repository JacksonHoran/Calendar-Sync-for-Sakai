import { SAKAI_BASE_URL, SYNC_ALARM, SYNC_PERIOD_MINUTES, LOGIN_SYNC_THROTTLE_MS } from "./config.js";
import { sync } from "./sync.js";
import { connectGoogle } from "./gcal.js";
import { State, getStatus, setGoogleConnected, updateStatus } from "./storage.js";

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

// While logged out of Sakai, sync as soon as a Sakai page finishes loading instead of waiting
// for the hourly alarm, so the "!" badge clears right after the user logs back in. tab.url is
// only visible for sakai.luc.edu tabs (via host_permissions), so no "tabs" permission is needed.
// Throttled, since every page load during login would otherwise start a sync.
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url?.startsWith(SAKAI_BASE_URL)) return;
  if ((await getStatus()).state !== State.SAKAI_LOGGED_OUT) return;

  const { lastLoginSync } = await chrome.storage.session.get("lastLoginSync");
  if (lastLoginSync && Date.now() - lastLoginSync < LOGIN_SYNC_THROTTLE_MS) return;
  await chrome.storage.session.set({ lastLoginSync: Date.now() });
  sync({ reason: "sakai page loaded while logged out" });
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
