import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvent, indexExistingEvents, planSync } from "../src/events.js";

const NOW = Date.parse("2026-09-25T20:00:00Z");
const options = {
  durationMinutes: 30,
  reminders: [{ method: "popup", minutes: 1440 }],
  timeZone: "America/Chicago",
};

const item = (id, due, extra = {}) => ({
  key: `assignment:${id}`,
  type: "assignment",
  title: `Item ${id}`,
  course: "COMP 371",
  due,
  url: "https://sakai.luc.edu/portal/site/COMP_371_001_2706_1266",
  submitted: false,
  hash: `h-${id}`,
  ...extra,
});

const apiEvent = (id, key, hash, end) => ({
  id,
  end: { dateTime: end },
  extendedProperties: { private: { sakaiKey: key, sakaiHash: hash } },
});

test("buildEvent: timed block ending at the due time, tagged with the Sakai key", () => {
  const event = buildEvent(item("a", "2026-09-29T04:55:00.000Z"), options);
  assert.equal(event.summary, "[COMP 371] Item a");
  assert.equal(event.end.dateTime, "2026-09-29T04:55:00.000Z");
  assert.equal(event.start.dateTime, "2026-09-29T04:25:00.000Z");
  assert.equal(event.start.timeZone, "America/Chicago");
  assert.equal(event.transparency, "transparent");
  assert.deepEqual(event.reminders, { useDefault: false, overrides: options.reminders });
  assert.deepEqual(event.extendedProperties.private, { sakaiKey: "assignment:a", sakaiHash: "h-a" });
  assert.match(event.description, /sakai\.luc\.edu\/portal\/site/);
});

test("buildEvent: submitted items get a checkmark and no reminders", () => {
  const event = buildEvent(item("a", "2026-09-29T04:55:00.000Z", { submitted: true }), options);
  assert.equal(event.summary, "✓ [COMP 371] Item a");
  assert.deepEqual(event.reminders.overrides, []);
});

test("indexExistingEvents ignores foreign events and flags duplicates", () => {
  const { byKey, duplicates } = indexExistingEvents([
    apiEvent("e1", "assignment:a", "h1", "2026-10-01T00:00:00Z"),
    apiEvent("e2", "assignment:a", "h1", "2026-10-01T00:00:00Z"),
    { id: "manual", end: { dateTime: "2026-10-01T00:00:00Z" } },
  ]);
  assert.equal(byKey.size, 1);
  assert.equal(byKey.get("assignment:a").eventId, "e1");
  assert.deepEqual(duplicates, ["e2"]);
});

test("planSync creates, updates, skips unchanged, and removes vanished future events", () => {
  const items = [
    item("new", "2026-10-01T00:00:00.000Z"),
    item("changed", "2026-10-02T00:00:00.000Z"),
    item("same", "2026-10-03T00:00:00.000Z"),
  ];
  const existing = indexExistingEvents([
    apiEvent("e-changed", "assignment:changed", "old-hash", "2026-10-02T00:00:00Z"),
    apiEvent("e-same", "assignment:same", "h-same", "2026-10-03T00:00:00Z"),
    apiEvent("e-gone-future", "assignment:gone1", "x", "2026-10-10T00:00:00Z"),
    apiEvent("e-gone-past", "assignment:gone2", "x", "2026-09-01T00:00:00Z"),
  ]);

  const plan = planSync(items, existing, { now: NOW });
  assert.deepEqual(plan.create.map((i) => i.key), ["assignment:new"]);
  assert.deepEqual(plan.update.map((u) => u.eventId), ["e-changed"]);
  assert.deepEqual(plan.remove, ["e-gone-future"]);
});

test("planSync is a no-op when everything matches", () => {
  const items = [item("a", "2026-10-01T00:00:00.000Z")];
  const existing = indexExistingEvents([apiEvent("e-a", "assignment:a", "h-a", "2026-10-01T00:00:00Z")]);
  assert.deepEqual(planSync(items, existing, { now: NOW }), { create: [], update: [], remove: [], missingSince: {} });
});

const HOUR = 60 * 60 * 1000;
const guarded = () => ({
  items: [item("kept", "2026-10-01T00:00:00.000Z")],
  existing: indexExistingEvents([
    apiEvent("e-kept", "assignment:kept", "h-kept", "2026-10-01T00:00:00Z"),
    apiEvent("e-gone", "assignment:gone", "x", "2026-10-10T00:00:00Z"),
  ]),
});

test("planSync waits out the grace period before deleting", () => {
  const { items, existing } = guarded();
  const first = planSync(items, existing, { now: NOW, graceMs: 12 * HOUR });
  assert.deepEqual(first.remove, []);
  assert.deepEqual(first.missingSince, { "assignment:gone": NOW });

  const later = planSync(items, existing, { now: NOW + 6 * HOUR, missingSince: first.missingSince, graceMs: 12 * HOUR });
  assert.deepEqual(later.remove, []);
  assert.deepEqual(later.missingSince, { "assignment:gone": NOW });

  const done = planSync(items, existing, { now: NOW + 12 * HOUR, missingSince: first.missingSince, graceMs: 12 * HOUR });
  assert.deepEqual(done.remove, ["e-gone"]);
  assert.deepEqual(done.missingSince, {});
});

test("planSync resets the timer when the item comes back", () => {
  const { existing } = guarded();
  const back = [item("kept", "2026-10-01T00:00:00.000Z"), item("gone", "2026-10-10T00:00:00.000Z", { hash: "x" })];
  const plan = planSync(back, existing, { now: NOW + 6 * HOUR, missingSince: { "assignment:gone": NOW }, graceMs: 12 * HOUR });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.missingSince, {});
});

test("planSync never deletes when Sakai returns nothing", () => {
  const { existing } = guarded();
  const plan = planSync([], existing, { now: NOW + 48 * HOUR, missingSince: { "assignment:gone": NOW }, graceMs: 12 * HOUR });
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(plan.missingSince, { "assignment:gone": NOW });
});

test("planSync still removes duplicates immediately", () => {
  const existing = indexExistingEvents([
    apiEvent("e1", "assignment:a", "h-a", "2026-10-01T00:00:00Z"),
    apiEvent("e2", "assignment:a", "h-a", "2026-10-01T00:00:00Z"),
  ]);
  const plan = planSync([], existing, { now: NOW, graceMs: 12 * HOUR });
  assert.deepEqual(plan.remove, ["e2"]);
});
