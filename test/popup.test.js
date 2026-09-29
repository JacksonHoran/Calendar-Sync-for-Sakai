import { test } from "node:test";
import assert from "node:assert/strict";
import { describeStatus, timeAgo } from "../popup/status-text.js";

const NOW = Date.parse("2026-09-28T20:00:00Z");
const MIN = 60 * 1000;
const idle = { syncing: false, interrupted: false, googleConnected: true, now: NOW };

test("up to date: item count on the calendar and last sync time", () => {
  const status = { state: "ok", itemCount: 41, lastSuccess: NOW - 5 * MIN, lastChanges: { created: 0, updated: 0, removed: 0 } };
  assert.deepEqual(describeStatus(status, idle), {
    state: "ok",
    text: "Up to date",
    detail: "41 items on your calendar · Last successful sync: 5 min ago",
  });
});

test("up to date after changes lists them", () => {
  const status = { state: "ok", itemCount: 1, lastSuccess: NOW, lastChanges: { created: 1, updated: 0, removed: 0 } };
  assert.equal(describeStatus(status, idle).detail, "1 item on your calendar · last sync: +1 new, 0 updated, 0 removed · Last successful sync: just now");
});

test("while syncing, the previous error and counts are hidden", () => {
  const status = { state: "syncing", itemCount: 41, lastError: "OAuth2 not granted or revoked.", lastSuccess: null };
  assert.deepEqual(describeStatus(status, { ...idle, syncing: true }), {
    state: "syncing",
    text: "Syncing…",
    detail: "Last successful sync: never",
  });
});

test("not connected yet: says assignments are ready, without Chrome's raw auth error", () => {
  const status = { state: "google_auth_needed", itemCount: 41, lastError: "OAuth2 not granted or revoked.", lastSuccess: null };
  const { text, detail } = describeStatus(status, { ...idle, googleConnected: false });
  assert.equal(text, "Connect Google Calendar to start syncing");
  assert.equal(detail, "41 assignments ready to sync · Last successful sync: never");
  assert.doesNotMatch(detail, /on your calendar/);
});

test("connected but access lost: the error explains what to do", () => {
  const status = { state: "google_auth_needed", itemCount: 0, lastError: "New permission needed. Reconnect Google Calendar.", lastSuccess: NOW - 2 * 60 * MIN };
  const { text, detail } = describeStatus(status, idle);
  assert.equal(text, "Reconnect Google Calendar to keep syncing");
  assert.equal(detail, "New permission needed. Reconnect Google Calendar. · Last successful sync: 2 hr ago");
});

test("access removed in the Google account: reconnect headline, plain reason", () => {
  const status = { state: "google_auth_needed", itemCount: 41, lastError: "Google access was removed from your Google Account.", lastSuccess: NOW - 60 * MIN };
  assert.deepEqual(describeStatus(status, idle), {
    state: "google_auth_needed",
    text: "Reconnect Google Calendar to keep syncing",
    detail: "41 assignments ready to sync · Google access was removed from your Google Account. · Last successful sync: 1 hr ago",
  });
});

test("logged out of Sakai never claims items are on the calendar", () => {
  const status = { state: "sakai_logged_out", itemCount: 41, lastError: "Not logged into Sakai", lastSuccess: NOW - 90 * MIN };
  const { text, detail } = describeStatus(status, idle);
  assert.equal(text, "Log into Sakai to sync");
  assert.equal(detail, "Not logged into Sakai · Last successful sync: 2 hr ago");
});

test("an interrupted sync shows as an error without stale details", () => {
  const status = { state: "syncing", itemCount: 41, lastError: "old", lastSuccess: null };
  assert.deepEqual(describeStatus(status, { ...idle, interrupted: true }), {
    state: "error",
    text: "Last sync was interrupted",
    detail: "Last successful sync: never",
  });
});

test("timeAgo", () => {
  assert.equal(timeAgo(null, NOW), "never");
  assert.equal(timeAgo(NOW - 20 * 1000, NOW), "just now");
  assert.equal(timeAgo(NOW - 59 * MIN, NOW), "59 min ago");
  assert.equal(timeAgo(NOW - 3 * 60 * MIN, NOW), "3 hr ago");
});
