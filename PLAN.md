# Plan: Calendar Sync for Sakai

Status tracker for the build. `CLAUDE.md` has the decisions and architecture, and `PUBLISHING.md` has the launch checklist.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Sakai endpoint discovery | ✅ `my.json` and `site.json` work at Loyola. ⏳ Logged-out behavior, Samigo, and calendar endpoints not probed yet. |
| 2 | MV3 scaffold (manifest, service worker, popup, pinned dev ID) | ✅ |
| 3 | Sakai fetch + normalize (`normalize.js`, unit tests) | ✅ |
| 4 | Google auth, calendar, idempotent sync (`events.js`, `gcal.js`) | ✅ Verified live on 2026-09-28 (40 events) |
| 5 | Background automation + status UX (hourly alarm, startup sync, badges, lock, sync-on-Sakai-login) | ✅ Logged-out flow tested 2026-09-28. Fixed the stuck-sync bug (no-store, request timeouts, interrupted state). |
| 6 | Google Cloud setup guide (README) | ✅ |
| 7 | Publishing: packaging, privacy policy, store listing, OAuth verification | 🟡 In progress. See `PUBLISHING.md`. |
| 8 | Quizzes/tests (Samigo) and course calendar items | ⏳ Not started |

## Lessons from testing
- **Calendar not visible (2026-09-25):** a calendar created with only `calendar.app.created` never appeared in Google Calendar. `calendarList.insert` requires `calendar` or `calendar.calendarlist`. Fix: added `calendar.calendarlist`, and on first sync the calendar is inserted into or patched in the list (`selected: true`, `hidden: false`), once per calendar id.
- **Wrong-account confusion:** `chrome.identity` uses the Chrome profile's account. The popup now shows "Syncing to <email>" (read from event `creator.email`, no extra permission) and has an "Open in Google Calendar" button.
- **Loyola data:** `my.json` returns every assignment from every term, so a 14-day past window is applied. Titles need entity decoding. Some site ids are UUIDs, so course names come from `site.json`.

## Before a public launch
1. ~~Verify the logged-out flow~~: done, and it now re-syncs as soon as a Sakai page loads after login.
2. ~~Decide on the listing name~~: decided, "Calendar Sync for Sakai".
3. Optional but recommended: a Disconnect button that removes the synced calendar and revokes the token.
4. Everything in `PUBLISHING.md`.
5. Talk to Loyola IT before the LinkedIn post.

## Optimizations done (2026-09-28)
- Deletion safety: 12h grace period before deleting an event whose assignment vanished, and no deletes when Sakai returns nothing.
- `events.list` limited with `timeMin` and a `fields` mask, so sync cost stays flat as semesters accumulate.
- Site titles cached 24h (refreshed early for unknown sites), and the per-sync calendar existence GET was dropped.
- Sync-on-login via `tabs.onUpdated` (no new permission).
- Not done: concurrent event writes (only speeds up the very first sync).

## Testing and CI (2026-09-28)
- 39 tests: pure logic, end-to-end `sync()` against in-memory Chrome/Sakai/Google fakes, and a manifest permission guard.
- ESLint (dev-only). GitHub Actions CI runs lint, tests, and a package build on push/PR. Pushing a `v*` tag builds a GitHub release with the zip.
- The concurrency test caught a real race (the storage-based lock let two syncs create duplicate calendars and events), now fixed with an in-memory lock.
- Not covered by automation: real Chrome, real Sakai, real Google. The manual pre-flight list in `PUBLISHING.md` covers those before each release.

## Later ideas
- Samigo quizzes/tests, and exam dates from the course Schedule tool (or its iCal feed).
- Settings page: reminder times, all-day vs. timed, which courses and item types to sync.
- Multi-school support via an options page and `optional_host_permissions`.
- Deep links to the specific assignment instead of the course site.
