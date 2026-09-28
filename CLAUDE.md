# Calendar Sync for Sakai (Chrome Extension)

## Goal
A Chrome extension that automatically pulls assignments from Loyola's Sakai (`sakai.luc.edu`) and creates matching Google Calendar events. After a one-time setup (install + approve Google access), the user should never have to do anything. The plan is to publish on the Chrome Web Store and present it to the school (including a LinkedIn post).

## Status (2026-09-28)
- **Working end to end** for assignments. Tested by the developer: 40 items synced into a "Sakai Assignments" calendar that shows up in Google Calendar.
- **Next:** publishing prep. See `PUBLISHING.md` for the checklist and store/verification copy. `PLAN.md` tracks phases and open work.

## User experience
- Install the extension, click "Connect Google Calendar" once, and that's it.
- Syncs silently in the background (hourly via `chrome.alarms`, plus on browser startup) whenever Chrome is running.
- Events go into a dedicated secondary calendar, "Sakai Assignments", that the extension creates. It never touches the user's other calendars.
- The only recurring requirement is that the user stays logged into Sakai. When the Sakai session has expired, the icon shows an amber "!" badge ("Log into Sakai to sync") instead of failing silently.

## Decisions made
- **Sakai URL:** `https://sakai.luc.edu`, hardcoded in `src/config.js` and `host_permissions`. Loyola only for v1.
- **Item types:** assignments only (`/direct/assignment/my.json`). Quizzes/tests (Samigo) and calendar items are not implemented or probed yet.
- **Skipped items:** titles matching `SKIP_TITLE_PATTERNS` in `src/config.js` (currently "Late Pass …"). Also skipped: drafts, items with no due date, and anything due more than 14 days ago (`my.json` returns every assignment from every past term).
- **Event shape:** a 30-minute timed event ending at the due time, marked "transparent" (doesn't show as busy). Title is `[COURSE 123] Title`. Submitted items get a leading "✓" and no reminders. Otherwise, popup reminders fire 1 day and 2 hours before. The description and `source.url` link to the course site (`/portal/site/{siteId}`).
- **OAuth scopes:** `calendar.app.created` **plus** `calendar.calendarlist`. The original plan was `calendar.app.created` only, but in testing the created calendar never appeared in Google Calendar, and `calendarList.insert` requires `calendar.calendarlist`. That scope lets the extension see calendar *names* in the user's list, not their events. The calendar is added to the list and switched on **once** per calendar id (`listedCalendarId` in storage), so a user who hides it later isn't overridden.
- **Dedup / source of truth:** Google Calendar itself. Every event carries `extendedProperties.private.{sakaiKey, sakaiHash}`. Each sync lists the app calendar's events and diffs against Sakai (`src/events.js` `planSync`). There's no local event map, so a reinstall can't create duplicates. Events are deleted only when the item vanished from Sakai, the event is still in the future, **and** it has been missing for 12 hours (`REMOVAL_GRACE_MS`, tracked in `missingSince` storage). Nothing is deleted if Sakai returns zero items. This keeps a glitchy Sakai response from wiping the calendar.
- **Request budget per hourly sync:** Sakai session check + `my.json` (`site.json` only when the 24h cache is stale or an unknown site appears), then Google `events.list` limited to events ending in the last 15 days onward with a `fields` mask. The calendar's existence isn't checked separately; a 404 from `events.list` triggers recreation.
- **Sync on login:** while in the logged-out state, a completed `sakai.luc.edu` page load (`tabs.onUpdated`, visible via host permission, throttled 5s) triggers a sync, so the badge clears right after logging back in.
- **Extension ID:** `kollljgmabpjghfimjdlinokikjbgebo`, the Chrome Web Store ID. The `key` in `manifest.json` is the store's public key, so unpacked dev builds get the same ID and the same OAuth client works for both. `npm run package` strips the key from the upload zip. The old dev ID (`agfkkmblbjjkcfecamfddhgjbflkookd`, from the gitignored `key.pem`) is retired.

## Architecture
No backend. Chrome talks to Sakai with the user's existing session cookies and to the Google Calendar API with a `chrome.identity` token.

```
manifest.json
src/
  background.js   service worker: alarms, onStartup/onInstalled, popup messages (sync, connect)
  sync.js         one sync run: lock → Sakai fetch → normalize → Google calendar diff/apply → status/badge
  sakai.js        fetch /direct/*.json with cookies; SakaiLoggedOutError detection
  normalize.js    PURE: raw my.json → items {key, title, course, due, url, submitted, hash}
  events.js       PURE: buildEvent, indexExistingEvents, planSync
  gcal.js         getAuthToken, api() with 401/rate-limit/missing-scope handling, calendar + list + events
  storage.js      chrome.storage.local wrappers (status, googleConnected, calendarId, listedCalendarId)
  badge.js        badge per state
  config.js       URLs, calendar name, skip patterns, event duration, reminders
popup/            status UI: Connect/Reconnect, Sync now, Open Sakai, Open in Google Calendar, "Syncing to <email>"
test/             node:test unit tests for normalize.js and events.js, redacted fixture in test/fixtures/
```

## Conventions
- Plain ES modules, **no build step, no runtime dependencies**. Dev-only tooling (ESLint) lives in `devDependencies` and never ships.
- **`npm run check` (lint + tests) must pass before committing.** CI (`.github/workflows/ci.yml`) runs the same on every push/PR, plus `npm run package`.
- Tests: pure-logic unit tests, end-to-end `sync()` tests against in-memory fakes (`test/helpers/`), and a manifest guard. When changing sync behavior, add or adjust a case in `test/sync.test.js`. When adding a Chrome API call, extend `test/helpers/chrome-mock.js`.
- `test/manifest.test.js` pins permissions and OAuth scopes. Changing them is a deliberate product decision (it forces user re-approval and store/OAuth re-review), never a side effect.
- **Sync concurrency** is guarded by an in-memory promise in `sync.js` (all syncs run in the one service worker). Don't reintroduce a storage-based lock: it raced and created duplicate calendars and events.
- Keep `normalize.js` and `events.js` free of `chrome.*` and network calls so they stay unit-testable.
- **Never commit real Sakai responses.** They contain grades, instructor feedback, names, and other people's contact info. Fixtures must be hand-redacted.
- Never commit `key.pem`.

## Loyola Sakai quirks (observed)
- `my.json` returns all historical assignments. `dueTime.epochSecond` is the due date.
- Titles can contain HTML entities (`&amp;`) and stray whitespace. Service workers have no DOMParser, so `decodeEntities` handles it by hand.
- Site ids are either course codes (`COMP_371_001_2706_1266`) or UUIDs. Course labels come from `/direct/site.json` titles, falling back to parsing the site id, then "Sakai".
- `submissions` may be `null`. "Submitted" means the user has a submission with `dateSubmittedEpochSeconds` set.

## Constraints to design around
- Sync only runs while Chrome is open. It catches up on the next launch.
- The Sakai session expires, and the extension cannot log in on its own.
- `chrome.identity` uses the **Chrome profile's** Google account, not whatever account is open in the Calendar tab. Brave/Edge are a non-goal for v1.
- While the Google OAuth app is in **Testing** status, authorizations expire after 7 days. Move it to "In production" (even unverified) for any pilot.

## Open work
- Verify logged-out detection against a real expired Sakai session.
- Probe Samigo (tests/quizzes) and calendar endpoints at Loyola.
- Consider a "Disconnect / remove synced calendar" button before public launch.
- Talk to school IT before a public launch or LinkedIn post.
