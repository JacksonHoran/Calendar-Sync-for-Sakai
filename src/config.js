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

// A sync that hasn't finished in this long is assumed dead (service worker killed mid-run).
export const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

// Events are timed blocks that end at the due time.
export const EVENT_DURATION_MINUTES = 30;
export const REMINDERS = [
  { method: "popup", minutes: 24 * 60 },
  { method: "popup", minutes: 2 * 60 },
];
