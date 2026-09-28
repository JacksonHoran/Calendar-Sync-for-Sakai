# Calendar Sync for Sakai

A Chrome extension that copies your Loyola Sakai (sakai.luc.edu) assignments into a dedicated Google Calendar and keeps it up to date in the background.

- One-time setup: install, click **Connect Google Calendar**, and approve.
- Syncs hourly and whenever Chrome starts, as long as you're logged into Sakai.
- Events go into their own "Sakai Assignments" calendar. Your other calendars are never touched.
- No server: data goes straight from Sakai to your Google Calendar inside your browser.

See `CLAUDE.md` for design decisions, `PLAN.md` for status, and `PUBLISHING.md` for the Web Store launch checklist.

## Development setup

### 1. Load the extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. The extension ID comes from the `key` in `manifest.json`, and the Google OAuth client is tied to it. The manifest carries the Chrome Web Store's public key, so the unpacked extension has the same ID as the store version: `kollljgmabpjghfimjdlinokikjbgebo`.

### 2. Google Cloud setup (one time, about 10 minutes)

The extension can't talk to Google until it has its own OAuth client ID.

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Calendar Sync for Sakai").
2. **Enable the API:** APIs & Services → Library → search for "Google Calendar API" → **Enable**.
3. **Configure the consent screen:** go to Google Auth Platform (APIs & Services → OAuth consent screen).
   - **Branding:** set the app name and your support email.
   - **Audience:** User type **External**. For personal testing, **Testing** status with yourself as a test user is fine. Note that **Testing authorizations expire after 7 days**, so move to **In production** before a pilot (see `PUBLISHING.md`).
   - **Data access → Add or remove scopes:** add both of these. If they aren't in the list, paste them into "Manually add scopes".
     - `https://www.googleapis.com/auth/calendar.app.created`: create the "Sakai Assignments" calendar and manage events on it only.
     - `https://www.googleapis.com/auth/calendar.calendarlist`: add that calendar to your sidebar and switch it on. Without this, the calendar exists but Google Calendar never shows it. This scope can see the *names* of the calendars in your list, but not their events.
4. **Create the OAuth client:** Clients → **Create client**.
   - Application type: **Chrome Extension**
   - Item ID: the extension ID shown on `chrome://extensions`
   - Copy the generated **Client ID** (ends in `.apps.googleusercontent.com`).
5. Paste it into `manifest.json` → `oauth2.client_id`.
6. On `chrome://extensions`, click the reload icon on the extension, then open the popup and click **Connect Google Calendar**.

Requirements and gotchas:
- **Chrome itself must be signed into a Google account** (the profile avatar at the top right). `chrome.identity` uses the Chrome profile's account, not whatever account is open in the Calendar tab. The popup shows "Syncing to <email>" once a sync has run.
- Until the app is verified, Google shows an "unverified app" warning on the consent screen. Click **Continue**.
- `bad client id` means the OAuth client's Item ID doesn't match the extension ID.
- After adding a new scope to the manifest, reload the extension and click **Reconnect Google Calendar** to approve it.

### 3. Tests and checks

```bash
npm install        # dev tools only (ESLint); the extension itself has no dependencies
npm run check      # lint + all tests, the same thing CI runs
```

- `test/normalize.test.js`, `test/events.test.js`: pure logic (Sakai → items, event building, sync planning and the delete safeguards).
- `test/sync.test.js`: end-to-end `sync()` runs against in-memory fakes of Chrome (`test/helpers/chrome-mock.js`), Sakai, and Google Calendar (`test/helpers/fake-servers.js`). They cover idempotency, updates, grace-period deletes, logged-out detection, token refresh, rate limits, a deleted calendar, and concurrent syncs.
- `test/manifest.test.js`: fails if a permission, host permission, or OAuth scope is added or removed. Update it deliberately when a permission change is intended.

**Never commit real Sakai responses.** They contain grades, feedback, and other people's contact info. Fixtures must be hand-redacted.

**CI** (`.github/workflows/ci.yml`) runs lint, tests, and a package build on every push to `main` and every PR. The built zip is attached to each run as an artifact.

### 4. Debugging

On `chrome://extensions`, click **service worker** under the extension to open its console. Every sync logs `[sync]` lines, including the normalized items and the create/update/remove counts.

### 5. Packaging and releases

```bash
npm run package
```

This builds `dist/calendar-sync-for-sakai-<version>.zip` containing only runtime files, with the dev-only `key` field stripped. It fails if the zip contains a `key` field or non-runtime files.

To cut a release: bump `version` in `manifest.json`, commit, then `git tag v<version> && git push --tags`. The Release workflow checks that the tag matches the manifest, runs all checks, and attaches the zip to a GitHub release. Uploading to the Web Store stays manual.

## Sakai endpoints (sakai.luc.edu)

| Endpoint | Status | Notes |
|---|---|---|
| `/direct/assignment/my.json` | ✅ works | Returns **every** assignment ever, across all terms. Items due more than 14 days ago are filtered out. `dueTime.epochSecond` is the due date. Titles can contain HTML entities (`&amp;`). `submissions` may be `null`. |
| `/direct/session/current.json` | ✅ works when logged in | Logged-out response not yet verified. |
| `/direct/site.json` | ✅ works | Used for course names, because some sites have UUID ids instead of course codes. |
| Samigo (tests/quizzes) | not yet probed | |
| Calendar / Schedule | not yet probed | |

## License

[MIT](LICENSE)
