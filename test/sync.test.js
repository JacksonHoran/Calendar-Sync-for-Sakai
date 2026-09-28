// End-to-end tests of sync() against in-memory Chrome, Sakai, and Google Calendar fakes.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { createFakeSakai, createFakeGoogle, installFetch, sakaiAssignment } from "./helpers/fake-servers.js";
import { sync } from "../src/sync.js";
import { REMOVAL_GRACE_MS } from "../src/config.js";

let chromeState, sakai, google, restoreFetch;

beforeEach(async () => {
  // The extension logs every sync step; keep test output readable.
  mock.method(console, "log", () => {});
  mock.method(console, "warn", () => {});
  chromeState = installChromeMock();
  sakai = createFakeSakai();
  google = createFakeGoogle(chromeState);
  restoreFetch = installFetch({ sakai, google });
  await chrome.storage.local.set({ googleConnected: true });
  sakai.assignments = [sakaiAssignment("a1", { days: 3 }), sakaiAssignment("a2", { days: 10, submitted: true })];
});

afterEach(() => {
  restoreFetch();
  mock.restoreAll();
});

const summaries = () => google.allEvents().map((e) => e.summary).sort();

test("first sync creates the calendar, lists it once, and creates one event per assignment", async () => {
  const status = await sync({ reason: "test" });

  assert.equal(status.state, "ok");
  assert.deepEqual(status.lastChanges, { created: 2, updated: 0, removed: 0 });
  assert.equal(status.googleAccount, "student@example.com");
  assert.equal(google.calendars.size, 1);
  const [calendarId] = google.calendars.keys();
  assert.deepEqual(google.calendarList.get(calendarId), { id: calendarId, selected: true, hidden: false });
  assert.deepEqual(summaries(), ["[COMP 371] Assignment a1", "✓ [COMP 371] Assignment a2"]);
  assert.equal(chromeState.badge.text, "");
});

test("second sync is a no-op and makes only the minimal requests", async () => {
  await sync({ reason: "test" });
  sakai.requests.length = 0;
  google.requests.length = 0;

  const status = await sync({ reason: "test" });

  assert.deepEqual(status.lastChanges, { created: 0, updated: 0, removed: 0 });
  // Site titles are cached, the calendar isn't re-checked, and it isn't re-listed.
  assert.deepEqual(sakai.requests, ["/direct/session/current.json", "/direct/assignment/my.json"]);
  assert.equal(google.requests.length, 1);
  assert.match(google.requests[0], /^GET \/calendars\/.+\/events$/);
});

test("a changed due date updates the existing event instead of duplicating it", async () => {
  await sync({ reason: "test" });
  sakai.assignments[0] = sakaiAssignment("a1", { days: 5 });

  const status = await sync({ reason: "test" });

  assert.deepEqual(status.lastChanges, { created: 0, updated: 1, removed: 0 });
  assert.equal(google.allEvents().length, 2);
});

test("a removed assignment is kept through the grace period, then deleted", async () => {
  await sync({ reason: "test" });
  sakai.assignments = [sakai.assignments[0]];

  let status = await sync({ reason: "test" });
  assert.equal(status.lastChanges.removed, 0);
  const { missingSince } = await chrome.storage.local.get("missingSince");
  assert.deepEqual(Object.keys(missingSince), ["assignment:a2"]);

  // Pretend it went missing long enough ago.
  await chrome.storage.local.set({ missingSince: { "assignment:a2": Date.now() - REMOVAL_GRACE_MS - 1 } });
  status = await sync({ reason: "test" });
  assert.equal(status.lastChanges.removed, 1);
  assert.deepEqual(summaries(), ["[COMP 371] Assignment a1"]);
});

test("an empty Sakai response never deletes anything", async () => {
  await sync({ reason: "test" });
  sakai.assignments = [];
  await chrome.storage.local.set({ missingSince: { "assignment:a1": 0, "assignment:a2": 0 } });

  const status = await sync({ reason: "test" });

  assert.equal(status.lastChanges.removed, 0);
  assert.equal(google.allEvents().length, 2);
});

test("late passes and assignments older than the window are skipped", async () => {
  sakai.assignments.push(sakaiAssignment("lp", { title: "Late Pass 1" }), sakaiAssignment("old", { days: -30 }));

  const status = await sync({ reason: "test" });

  assert.equal(status.itemCount, 2);
  assert.equal(google.allEvents().length, 2);
});

test("if the user deleted the calendar, the next sync recreates it and re-lists it", async () => {
  await sync({ reason: "test" });
  google.calendars.clear();
  google.calendarList.clear();

  const status = await sync({ reason: "test" });

  assert.equal(status.state, "ok");
  assert.equal(status.lastChanges.created, 2);
  assert.equal(google.calendars.size, 1);
  assert.equal(google.calendarList.size, 1);
});

test("logged out of Sakai: amber badge, no Google calls, then recovers after login", async () => {
  sakai.loggedIn = false;

  let status = await sync({ reason: "test" });
  assert.equal(status.state, "sakai_logged_out");
  assert.equal(chromeState.badge.text, "!");
  assert.match(chromeState.badge.title, /Log into Sakai/);
  assert.equal(google.requests.length, 0);

  sakai.loggedIn = true;
  status = await sync({ reason: "test" });
  assert.equal(status.state, "ok");
  assert.equal(chromeState.badge.text, "");
});

for (const style of ["redirect", "html"]) {
  test(`logged-out detection when Sakai responds with a login ${style}`, async () => {
    sakai.loggedIn = false;
    sakai.loggedOutStyle = style;
    const status = await sync({ reason: "test" });
    assert.equal(status.state, "sakai_logged_out");
  });
}

test("Google not connected yet: Sakai is read but nothing is written", async () => {
  await chrome.storage.local.set({ googleConnected: false });

  const status = await sync({ reason: "test" });

  assert.equal(status.state, "google_auth_needed");
  assert.equal(status.itemCount, 2);
  assert.equal(google.requests.length, 0);
});

test("a stale token is dropped and the request retried once", async () => {
  await sync({ reason: "test" });
  // Google now only accepts token-2, but Chrome still has token-1 cached.
  chromeState.token = "token-2";

  const status = await sync({ reason: "test" });

  assert.equal(status.state, "ok");
  assert.deepEqual(chromeState.removedTokens, ["token-1"]);
});

test("a missing OAuth scope asks the user to reconnect", async () => {
  google.failNext.push({ status: 403, reason: "insufficientPermissions" });

  const status = await sync({ reason: "test" });

  assert.equal(status.state, "google_auth_needed");
  assert.match(status.lastError, /Reconnect/);
});

test("concurrent syncs share one run instead of racing", async () => {
  const [a, b] = await Promise.all([sync({ reason: "a" }), sync({ reason: "b" })]);

  assert.equal(a.state, "ok");
  assert.deepEqual(a, b);
  assert.equal(google.calendars.size, 1);
  assert.equal(google.allEvents().length, 2);
});

test("Google rate limits are retried with backoff", async () => {
  google.failNext.push({ status: 429 });

  const status = await sync({ reason: "test" });

  assert.equal(status.state, "ok");
  assert.equal(google.allEvents().length, 2);
});
