// Thin wrappers around chrome.storage.local so the key names live in one place.

export const State = Object.freeze({
  NEVER_SYNCED: "never_synced",
  OK: "ok",
  SYNCING: "syncing",
  SAKAI_LOGGED_OUT: "sakai_logged_out",
  GOOGLE_AUTH_NEEDED: "google_auth_needed",
  ERROR: "error",
});

const DEFAULT_STATUS = {
  state: State.NEVER_SYNCED,
  lastSuccess: null,
  lastAttempt: null,
  lastError: null,
  itemCount: 0,
};

export async function getStatus() {
  const { status } = await chrome.storage.local.get("status");
  return { ...DEFAULT_STATUS, ...status };
}

export async function updateStatus(patch) {
  const next = { ...(await getStatus()), ...patch };
  await chrome.storage.local.set({ status: next });
  return next;
}

export async function getGoogleConnected() {
  const { googleConnected } = await chrome.storage.local.get("googleConnected");
  return Boolean(googleConnected);
}

export async function setGoogleConnected(value) {
  await chrome.storage.local.set({ googleConnected: value });
}

export async function getCalendarId() {
  const { calendarId } = await chrome.storage.local.get("calendarId");
  return calendarId ?? null;
}

export async function setCalendarId(calendarId) {
  await chrome.storage.local.set({ calendarId });
}

// Id of the calendar we last added to the user's calendar list, so we only do it once
// and don't re-show a calendar the user deliberately hid.
export async function getListedCalendarId() {
  const { listedCalendarId } = await chrome.storage.local.get("listedCalendarId");
  return listedCalendarId ?? null;
}

export async function setListedCalendarId(listedCalendarId) {
  await chrome.storage.local.set({ listedCalendarId });
}

// Cached { fetchedAt, titles: { siteId: title } } from /direct/site.json.
export async function getSiteTitleCache() {
  const { siteTitleCache } = await chrome.storage.local.get("siteTitleCache");
  return siteTitleCache ?? null;
}

export async function setSiteTitleCache(siteTitleCache) {
  await chrome.storage.local.set({ siteTitleCache });
}

// Sakai key -> timestamp when its future event was first seen without a matching assignment.
export async function getMissingSince() {
  const { missingSince } = await chrome.storage.local.get("missingSince");
  return missingSince ?? {};
}

export async function setMissingSince(missingSince) {
  await chrome.storage.local.set({ missingSince });
}
