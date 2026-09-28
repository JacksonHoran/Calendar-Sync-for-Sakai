# Plan: Calendar Sync for Sakai

Status tracker for the build. `CLAUDE.md` has the decisions and architecture, and `PUBLISHING.md` has the launch checklist.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Sakai endpoint discovery | ✅ `my.json` and `site.json` work at Loyola. ⏳ Logged-out behavior, Samigo, and calendar endpoints not probed yet. |
| 2 | MV3 scaffold (manifest, service worker, popup, pinned dev ID) | ✅ |
| 3 | Sakai fetch + normalize (`normalize.js`, unit tests) | ✅ |
| 4 | Google auth, calendar, idempotent sync (`events.js`, `gcal.js`) | ✅ Verified live on 2026-09-28 (40 events) |
| 5 | Background automation + status UX (hourly alarm, startup sync, badges, lock) | 🟡 Built. Logged-out badge not yet verified against a real expired session. |
| 6 | Google Cloud setup guide (README) | ✅ |
| 7 | Publishing: packaging, privacy policy, store listing, OAuth verification | 🟡 In progress. See `PUBLISHING.md`. |
| 8 | Quizzes/tests (Samigo) and course calendar items | ⏳ Not started |

## Lessons from testing
- **Calendar not visible (2026-09-25):** a calendar created with only `calendar.app.created` never appeared in Google Calendar. `calendarList.insert` requires `calendar` or `calendar.calendarlist`. Fix: added `calendar.calendarlist`, and on first sync the calendar is inserted into or patched in the list (`selected: true`, `hidden: false`), once per calendar id.
- **Wrong-account confusion:** `chrome.identity` uses the Chrome profile's account. The popup now shows "Syncing to <email>" (read from event `creator.email`, no extra permission) and has an "Open in Google Calendar" button.
- **Loyola data:** `my.json` returns every assignment from every term, so a 14-day past window is applied. Titles need entity decoding. Some site ids are UUIDs, so course names come from `site.json`.

## Before a public launch
1. Verify the logged-out flow: let the Sakai session expire and confirm the amber badge, then confirm it recovers after logging back in.
2. ~~Decide on the listing name~~: decided, "Calendar Sync for Sakai".
3. Optional but recommended: a Disconnect button that removes the synced calendar and revokes the token.
4. Everything in `PUBLISHING.md`.
5. Talk to Loyola IT before the LinkedIn post.

## Later ideas
- Samigo quizzes/tests, and exam dates from the course Schedule tool (or its iCal feed).
- Settings page: reminder times, all-day vs. timed, which courses and item types to sync.
- Multi-school support via an options page and `optional_host_permissions`.
- Deep links to the specific assignment instead of the course site.
