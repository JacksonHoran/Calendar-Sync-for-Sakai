// Guards the manifest against accidental permission creep. Adding a permission or scope makes
// Chrome disable the extension until users re-approve it, re-triggers Web Store review, and
// may require a new Google OAuth verification, so it should only ever change on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url)));

test("manifest is MV3 with a module service worker", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.equal(manifest.background.type, "module");
});

test("version is a Chrome-valid dotted number", () => {
  assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
});

test("description fits the Web Store's 132-character limit", () => {
  assert.ok(manifest.description.length <= 132, `${manifest.description.length} chars`);
});

test("permissions are exactly the approved set", () => {
  assert.deepEqual([...manifest.permissions].sort(), ["alarms", "identity", "storage"]);
  assert.deepEqual([...manifest.host_permissions].sort(), ["https://sakai.luc.edu/*", "https://www.googleapis.com/*"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
});

test("OAuth scopes are exactly the approved set", () => {
  assert.deepEqual([...manifest.oauth2.scopes].sort(), [
    "https://www.googleapis.com/auth/calendar.app.created",
    "https://www.googleapis.com/auth/calendar.calendarlist",
  ]);
  assert.match(manifest.oauth2.client_id, /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
});

test("every file the manifest references exists", () => {
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const path of paths) readFileSync(new URL(`../${path}`, import.meta.url));
});
