import {
  SAKAI_BASE_URL,
  SKIP_TITLE_PATTERNS,
  EVENT_DURATION_MINUTES,
  REMINDERS,
  SITE_TITLES_TTL_MS,
  REMOVAL_GRACE_MS,
} from "./config.js";
import { checkSession, fetchAssignments, fetchSites, SakaiLoggedOutError } from "./sakai.js";
import { normalizeAssignments, siteTitleMap, PAST_WINDOW_DAYS } from "./normalize.js";
import { buildEvent, indexExistingEvents, planSync } from "./events.js";
import {
  GoogleAuthError,
  getToken,
  ensureCalendar,
  forgetCalendar,
  isGone,
  ensureCalendarListed,
  listEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
} from "./gcal.js";
import {
  State,
  updateStatus,
  getGoogleConnected,
  getSiteTitleCache,
  setSiteTitleCache,
  getMissingSince,
  setMissingSince,
} from "./storage.js";
import { showBadgeForState } from "./badge.js";

// Every sync runs in this one service worker, so an in-memory promise is an atomic lock:
// a sync requested while one is running (e.g. startup + a Sakai page load) waits for and
// shares the running one's result. A storage-based lock can race (two callers both read
// "unlocked" before either writes), which created duplicate calendars and events. If the
// worker is killed mid-sync, the lock dies with it, which is correct.
let running = null;

export function sync(options) {
  running ??= runSync(options).finally(() => {
    running = null;
  });
  return running;
}

// Site titles only improve event labels (e.g. for sites with UUID ids), so they're cached for
// a day and a failure here doesn't fail the sync. The cache is refreshed early if an assignment
// belongs to a site it doesn't know yet (e.g. a newly added course).
async function loadSiteTitles(siteIds) {
  const cache = await getSiteTitleCache();
  const fresh = cache && Date.now() - cache.fetchedAt < SITE_TITLES_TTL_MS;
  if (fresh && siteIds.every((id) => id in cache.titles)) return cache.titles;

  try {
    const titles = siteTitleMap(await fetchSites());
    await setSiteTitleCache({ fetchedAt: Date.now(), titles });
    return titles;
  } catch (e) {
    if (e instanceof SakaiLoggedOutError) throw e;
    console.warn("[sync] could not load site titles:", e);
    return cache?.titles ?? {};
  }
}

async function fetchSakaiItems() {
  console.log("[sync] checking Sakai session");
  await checkSession();
  const rawAssignments = await fetchAssignments();
  const siteIds = [...new Set(rawAssignments.map((a) => a.context).filter(Boolean))];
  const siteTitles = await loadSiteTitles(siteIds);
  const items = normalizeAssignments(rawAssignments, {
    siteTitles,
    baseUrl: SAKAI_BASE_URL,
    skipTitles: SKIP_TITLE_PATTERNS,
  });
  console.log(`[sync] ${items.length} items to sync (of ${rawAssignments.length} from Sakai)`, items);
  return items;
}

// Lists our calendar's recent and future events, recreating the calendar if the user
// deleted it. Events older than the Sakai window (plus a day of slack) can never change,
// so they're not fetched.
async function loadCalendarEvents() {
  const timeMin = Date.now() - (PAST_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000;
  let calendarId = await ensureCalendar();
  try {
    return { calendarId, events: await listEvents(calendarId, { timeMin }) };
  } catch (e) {
    if (!isGone(e)) throw e;
    console.log("[sync] stored calendar is gone, creating a new one");
    await forgetCalendar();
    calendarId = await ensureCalendar();
    return { calendarId, events: [] };
  }
}

// Google Calendar is the source of truth for what's already synced: every event we create
// carries its Sakai key in extendedProperties, so a reinstall can't produce duplicates.
async function writeToCalendar(items) {
  console.log("[sync] writing to Google Calendar");
  const { calendarId, events } = await loadCalendarEvents();
  await ensureCalendarListed(calendarId);
  const existing = indexExistingEvents(events);
  // Google stamps each event with the account that created it, which tells the user which
  // account to look in without needing the identity.email permission.
  let account = events.find((e) => e.creator?.email)?.creator.email ?? null;
  const plan = planSync(items, existing, { missingSince: await getMissingSince(), graceMs: REMOVAL_GRACE_MS });
  const pending = Object.keys(plan.missingSince).length;
  if (pending) console.log(`[sync] ${pending} event(s) missing from Sakai, waiting out the grace period`, plan.missingSince);
  const eventOptions = {
    durationMinutes: EVENT_DURATION_MINUTES,
    reminders: REMINDERS,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  // Sequential on purpose: keeps well under Calendar API rate limits, and an interrupted
  // sync just leaves the remaining work for the next run.
  for (const item of plan.create) {
    const created = await insertEvent(calendarId, buildEvent(item, eventOptions));
    account ??= created?.creator?.email ?? null;
  }
  for (const { eventId, item } of plan.update) await updateEvent(calendarId, eventId, buildEvent(item, eventOptions));
  for (const eventId of plan.remove) await deleteEvent(calendarId, eventId);
  await setMissingSince(plan.missingSince);

  return {
    account,
    changes: { created: plan.create.length, updated: plan.update.length, removed: plan.remove.length },
  };
}

async function runSync({ reason }) {
  console.log(`[sync] start (${reason})`);
  await updateStatus({ state: State.SYNCING, lastAttempt: Date.now() });

  let status;
  try {
    const items = await fetchSakaiItems();
    await updateStatus({ itemCount: items.length });

    if (!(await getGoogleConnected())) {
      throw new GoogleAuthError("Google Calendar not connected");
    }
    await getToken(false);

    const { account, changes } = await writeToCalendar(items);
    console.log("[sync] done", { account, ...changes });

    status = await updateStatus({
      state: State.OK,
      lastSuccess: Date.now(),
      lastError: null,
      lastChanges: changes,
      googleAccount: account,
    });
  } catch (e) {
    console.warn("[sync] failed:", e);
    const state =
      e instanceof SakaiLoggedOutError ? State.SAKAI_LOGGED_OUT
      : e instanceof GoogleAuthError ? State.GOOGLE_AUTH_NEEDED
      : State.ERROR;
    status = await updateStatus({ state, lastError: e.message });
  }

  await showBadgeForState(status.state);
  return status;
}
