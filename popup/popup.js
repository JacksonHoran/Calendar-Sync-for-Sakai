import { SAKAI_BASE_URL, SYNC_LOCK_TTL_MS } from "../src/config.js";
import { State, getStatus, getGoogleConnected, getCalendarId } from "../src/storage.js";

const el = {
  status: document.getElementById("status"),
  text: document.getElementById("status-text"),
  detail: document.getElementById("status-detail"),
  connect: document.getElementById("connect"),
  openSakai: document.getElementById("open-sakai"),
  openCalendar: document.getElementById("open-calendar"),
  account: document.getElementById("account"),
  syncNow: document.getElementById("sync-now"),
};

// cid opens (or offers to add) our calendar; authuser picks the right Google account
// when the browser is signed into several.
function calendarUrl(calendarId, account) {
  const params = new URLSearchParams({ cid: calendarId });
  if (account) params.set("authuser", account);
  return `https://calendar.google.com/calendar/r?${params}`;
}

const MESSAGES = {
  [State.NEVER_SYNCED]: "Not synced yet",
  [State.SYNCING]: "Syncing…",
  [State.OK]: "Up to date",
  [State.SAKAI_LOGGED_OUT]: "Log into Sakai to sync",
  [State.GOOGLE_AUTH_NEEDED]: "Connect Google Calendar to start syncing",
  [State.ERROR]: "Sync failed",
};

function timeAgo(ms) {
  if (!ms) return "never";
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(ms).toLocaleString();
}

async function render() {
  const [status, googleConnected, calendarId] = await Promise.all([
    getStatus(),
    getGoogleConnected(),
    getCalendarId(),
  ]);

  // A "syncing" status older than the lock TTL means the service worker died mid-sync and
  // never recorded a result. Don't leave the user stuck with a disabled button.
  const syncing = status.state === State.SYNCING && Date.now() - (status.lastAttempt ?? 0) < SYNC_LOCK_TTL_MS;
  const interrupted = status.state === State.SYNCING && !syncing;

  el.status.dataset.state = interrupted ? State.ERROR : status.state;
  el.text.textContent = interrupted ? "Last sync was interrupted" : MESSAGES[status.state] ?? status.state;

  const details = [];
  if (status.itemCount) details.push(`${status.itemCount} items on your calendar`);
  const changes = status.lastChanges;
  if (status.state === State.OK && changes && changes.created + changes.updated + changes.removed > 0) {
    details.push(`last sync: +${changes.created} new, ${changes.updated} updated, ${changes.removed} removed`);
  }
  if (status.lastError && status.state !== State.OK) details.push(status.lastError);
  details.push(`Last successful sync: ${timeAgo(status.lastSuccess)}`);
  el.detail.textContent = details.join(" · ");

  el.connect.hidden = googleConnected && status.state !== State.GOOGLE_AUTH_NEEDED;
  el.connect.textContent = googleConnected ? "Reconnect Google Calendar" : "Connect Google Calendar";
  el.openSakai.hidden = status.state !== State.SAKAI_LOGGED_OUT;
  el.syncNow.disabled = syncing;

  el.account.hidden = !status.googleAccount;
  el.account.textContent = `Syncing to ${status.googleAccount}`;
  el.openCalendar.hidden = !calendarId;
  el.openCalendar.onclick = () => chrome.tabs.create({ url: calendarUrl(calendarId, status.googleAccount) });
}

async function send(type, button) {
  button.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type });
    if (res?.error) el.detail.textContent = res.error;
  } finally {
    button.disabled = false;
    await render();
  }
}

el.connect.addEventListener("click", () => send("connect", el.connect));
el.syncNow.addEventListener("click", () => send("sync", el.syncNow));
el.openSakai.addEventListener("click", () => chrome.tabs.create({ url: SAKAI_BASE_URL + "/portal" }));

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") render();
});

render();
