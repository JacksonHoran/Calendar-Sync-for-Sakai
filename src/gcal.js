import { CALENDAR_NAME, CALENDAR_DESCRIPTION, REQUEST_TIMEOUT_MS } from "./config.js";
import { getCalendarId, setCalendarId, getListedCalendarId, setListedCalendarId } from "./storage.js";

const API = "https://www.googleapis.com/calendar/v3";
const MAX_RETRIES = 3;

export class GoogleAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export class GoogleApiError extends Error {
  constructor(status, message) {
    super(`Google Calendar API ${status}: ${message}`);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

// interactive: true shows the Google consent screen, so only call it from a user click.
// Background syncs use interactive: false, which fails instead of prompting.
export async function getToken(interactive) {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive });
    if (!token) throw new GoogleAuthError("No token returned");
    return token;
  } catch (e) {
    const message = e.message ?? String(e);
    if (/bad client id|invalid_client|client_id/i.test(message)) {
      throw new GoogleAuthError("Google OAuth client isn't set up yet (see README: Google Cloud setup)");
    }
    throw new GoogleAuthError(message);
  }
}

export async function connectGoogle() {
  return getToken(true);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const errorReason = (body) => body?.error?.errors?.[0]?.reason ?? "";

function isRateLimited(status, body) {
  return status === 429 || (status === 403 && /rateLimitExceeded/i.test(errorReason(body)));
}

// Happens when the manifest gained a scope the user hasn't approved yet.
function isMissingScope(status, body) {
  return status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
    errorReason(body) + JSON.stringify(body?.error?.details ?? ""),
  );
}

// Calls the Calendar API. A 401 means the cached token went stale, so it's dropped and the
// call retried once with a fresh one. Rate limits are retried with exponential backoff.
async function api(path, { method = "GET", body } = {}) {
  let token = await getToken(false);
  let refreshedToken = false;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    if (res.status === 401 && !refreshedToken) {
      await chrome.identity.removeCachedAuthToken({ token });
      token = await getToken(false);
      refreshedToken = true;
      continue;
    }
    if (isRateLimited(res.status, data) && attempt < MAX_RETRIES) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 401) throw new GoogleAuthError("Google access was revoked. Reconnect Google Calendar.");
    if (isMissingScope(res.status, data)) {
      await chrome.identity.removeCachedAuthToken({ token });
      throw new GoogleAuthError("New permission needed. Reconnect Google Calendar.");
    }
    throw new GoogleApiError(res.status, data?.error?.message ?? res.statusText);
  }
}

const isGone = (e) => e instanceof GoogleApiError && (e.status === 404 || e.status === 410);

// Returns the id of the extension's calendar, creating it if it doesn't exist yet or the
// user deleted it. calendar.app.created can't list other calendars, so the stored id is
// the only way to find it again.
export async function ensureCalendar() {
  const storedId = await getCalendarId();
  if (storedId) {
    try {
      await api(`/calendars/${encodeURIComponent(storedId)}`);
      return storedId;
    } catch (e) {
      if (!isGone(e)) throw e;
      console.log("[gcal] stored calendar is gone, creating a new one");
    }
  }

  const calendar = await api("/calendars", {
    method: "POST",
    body: {
      summary: CALENDAR_NAME,
      description: CALENDAR_DESCRIPTION,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  await setCalendarId(calendar.id);
  return calendar.id;
}

// A calendar created through the API isn't necessarily in the user's calendar list, and list
// entries default to not shown, so the user would never see the events. Add it (checked and
// visible) once per calendar; after that, respect whatever the user does with it.
export async function ensureCalendarListed(calendarId) {
  if ((await getListedCalendarId()) === calendarId) return;

  const path = `/users/me/calendarList/${encodeURIComponent(calendarId)}`;
  try {
    const entry = await api(path);
    if (!entry.selected || entry.hidden) {
      await api(path, { method: "PATCH", body: { selected: true, hidden: false } });
    }
  } catch (e) {
    if (!isGone(e)) throw e;
    await api("/users/me/calendarList", { method: "POST", body: { id: calendarId, selected: true, hidden: false } });
  }
  await setListedCalendarId(calendarId);
}

export async function listEvents(calendarId) {
  const events = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ maxResults: "2500", showDeleted: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

export async function insertEvent(calendarId, event) {
  return api(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: event });
}

export async function updateEvent(calendarId, eventId, event) {
  return api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    body: event,
  });
}

export async function deleteEvent(calendarId, eventId) {
  try {
    await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });
  } catch (e) {
    // Already gone (e.g. the user deleted it by hand) counts as success.
    if (!isGone(e)) throw e;
  }
}
