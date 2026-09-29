// PURE: builds the popup's status headline and detail line from the stored sync status.
// Kept free of chrome.* and the DOM so it can be unit-tested.
import { State } from "../src/storage.js";

const MESSAGES = {
  [State.NEVER_SYNCED]: "Not synced yet",
  [State.SYNCING]: "Syncing…",
  [State.OK]: "Up to date",
  [State.SAKAI_LOGGED_OUT]: "Log into Sakai to sync",
  [State.GOOGLE_AUTH_NEEDED]: "Connect Google Calendar to start syncing",
  [State.ERROR]: "Sync failed",
};

export function timeAgo(ms, now = Date.now()) {
  if (!ms) return "never";
  const minutes = Math.round((now - ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(ms).toLocaleString();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// `syncing` is true while a sync is actually running; `interrupted` means the status says
// "syncing" but it's too old to be real (the service worker died mid-sync).
// `googleConnected` is false until the user has clicked Connect once.
export function describeStatus(status, { syncing, interrupted, googleConnected = true, now = Date.now() }) {
  const state = interrupted ? State.ERROR : status.state;
  const reconnect = status.state === State.GOOGLE_AUTH_NEEDED && googleConnected;
  const text = interrupted ? "Last sync was interrupted"
    : reconnect ? "Reconnect Google Calendar to keep syncing"
    : MESSAGES[status.state] ?? status.state;

  const details = [];
  if (syncing) {
    // The previous run's error and counts are stale while a new sync runs.
  } else if (status.state === State.OK) {
    details.push(`${plural(status.itemCount, "item")} on your calendar`);
    const c = status.lastChanges;
    if (c && c.created + c.updated + c.removed > 0) {
      details.push(`last sync: +${c.created} new, ${c.updated} updated, ${c.removed} removed`);
    }
  } else {
    // Sakai may have been read even though nothing reached the calendar (e.g. Google not
    // connected yet), so don't claim the items are on the calendar.
    if (status.itemCount && status.state === State.GOOGLE_AUTH_NEEDED) {
      details.push(`${plural(status.itemCount, "assignment")} ready to sync`);
    }
    // Before the first Connect, Chrome's raw auth error ("OAuth2 not granted or revoked")
    // just repeats the headline in jargon.
    const notConnectedYet = status.state === State.GOOGLE_AUTH_NEEDED && !googleConnected;
    if (status.lastError && !interrupted && !notConnectedYet) details.push(status.lastError);
  }
  details.push(`Last successful sync: ${timeAgo(status.lastSuccess, now)}`);

  return { state, text, detail: details.join(" · ") };
}
