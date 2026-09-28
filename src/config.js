export const SAKAI_BASE_URL = "https://sakai.luc.edu";

export const CALENDAR_NAME = "Sakai Assignments";
export const CALENDAR_DESCRIPTION = "Assignments synced automatically from Sakai by the Calendar Sync for Sakai extension.";

// Sakai items with these titles are never put on the calendar.
export const SKIP_TITLE_PATTERNS = [/^late pass\b/i];

export const SYNC_ALARM = "sync";
export const SYNC_PERIOD_MINUTES = 60;

// Any single Sakai or Google request that takes longer than this is abandoned, so a hung
// request can't stall the whole sync.
export const REQUEST_TIMEOUT_MS = 20 * 1000;

// Course site titles rarely change, so they're cached. A sync still refetches early if an
// assignment belongs to a site that isn't in the cache yet (e.g. a newly added course).
export const SITE_TITLES_TTL_MS = 24 * 60 * 60 * 1000;

// An event is only deleted once its assignment has been missing from Sakai for this long,
// so a temporary Sakai glitch can't wipe the calendar.
export const REMOVAL_GRACE_MS = 12 * 60 * 60 * 1000;

// Minimum gap between syncs triggered by Sakai page loads while logged out. Kept short: the
// login page itself is on sakai.luc.edu, and a long throttle could swallow the post-login load.
export const LOGIN_SYNC_THROTTLE_MS = 5 * 1000;

// A "syncing" status older than this means the service worker was killed mid-sync; the popup
// shows it as interrupted instead of leaving Sync now disabled.
export const SYNC_STALE_AFTER_MS = 5 * 60 * 1000;

// Events are timed blocks that end at the due time.
export const EVENT_DURATION_MINUTES = 30;
export const REMINDERS = [
  { method: "popup", minutes: 24 * 60 },
  { method: "popup", minutes: 2 * 60 },
];
