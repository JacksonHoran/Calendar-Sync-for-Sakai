import {
  SAKAI_BASE_URL,
  SYNC_LOCK_TTL_MS,
  SKIP_TITLE_PATTERNS,
  EVENT_DURATION_MINUTES,
  REMINDERS,
} from "./config.js";
import { checkSession, fetchAssignments, fetchSites, SakaiLoggedOutError } from "./sakai.js";
import { normalizeAssignments, siteTitleMap } from "./normalize.js";
import { buildEvent, indexExistingEvents, planSync } from "./events.js";
import {
  GoogleAuthError,
  getToken,
  ensureCalendar,
  ensureCalendarListed,
  listEvents,
  insertEvent,
  updateEvent,
  deleteEvent,
} from "./gcal.js";
import { State, getStatus, updateStatus, getGoogleConnected } from "./storage.js";
import { showBadgeForState } from "./badge.js";

// chrome.storage.session survives service worker restarts but not browser restarts,
// which is the right lifetime for a lock.
async function acquireLock() {
  const { syncLock } = await chrome.storage.session.get("syncLock");
  if (syncLock && Date.now() - syncLock < SYNC_LOCK_TTL_MS) return false;
  await chrome.storage.session.set({ syncLock: Date.now() });
  return true;
}

async function releaseLock() {
  await chrome.storage.session.remove("syncLock");
}

// Site titles only improve event labels (e.g. for sites with UUID ids), so a failure here
// shouldn't fail the sync.
async function loadSiteTitles() {
  try {
    return siteTitleMap(await fetchSites());
  } catch (e) {
    if (e instanceof SakaiLoggedOutError) throw e;
    console.warn("[sync] could not load site titles:", e);
    return {};
  }
}

async function fetchSakaiItems() {
  await checkSession();
  const [rawAssignments, siteTitles] = await Promise.all([fetchAssignments(), loadSiteTitles()]);
  const items = normalizeAssignments(rawAssignments, {
    siteTitles,
    baseUrl: SAKAI_BASE_URL,
    skipTitles: SKIP_TITLE_PATTERNS,
  });
  console.log(`[sync] ${items.length} items to sync (of ${rawAssignments.length} from Sakai)`, items);
  return items;
}

// Google Calendar is the source of truth for what's already synced: every event we create
// carries its Sakai key in extendedProperties, so a reinstall can't produce duplicates.
async function writeToCalendar(items) {
  const calendarId = await ensureCalendar();
  await ensureCalendarListed(calendarId);
  const events = await listEvents(calendarId);
  const existing = indexExistingEvents(events);
  // Google stamps each event with the account that created it, which tells the user which
  // account to look in without needing the identity.email permission.
  let account = events.find((e) => e.creator?.email)?.creator.email ?? null;
  const plan = planSync(items, existing);
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

  return {
    account,
    changes: { created: plan.create.length, updated: plan.update.length, removed: plan.remove.length },
  };
}

export async function sync({ reason }) {
  if (!(await acquireLock())) {
    console.log(`[sync] skipped (${reason}): already running`);
    return getStatus();
  }

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
  } finally {
    await releaseLock();
  }

  await showBadgeForState(status.state);
  return status;
}
