# Publishing Checklist

Everything needed to go from "works on my machine" to the Chrome Web Store, in dependency order. Copy-paste text for the forms is in the appendices at the bottom.

**Recommended rollout:** publish as **Unlisted** first and share the link with a few classmates. Go **Public** after verification and a talk with Loyola IT.

---

## 0. Decisions before you start

- [x] **Listing name: "Calendar Sync for Sakai".** "Sakai" is a trademark of the Apereo Foundation, so the name uses the descriptive "for Sakai" form. It's already applied in the manifest, popup, `docs/`, and `src/config.js`. **Also rename the Google OAuth app** (Google Auth Platform → Branding) to match.
- [ ] **Version.** Bump `manifest.json` → `version` to `1.0.0` for the first public release. Every later upload needs a higher version. Then tag it (`git tag v1.0.0 && git push --tags`), and the Release workflow builds the zip and attaches it to a GitHub release.
- [x] **Contact email:** jacksonhoran1@gmail.com, filled into `docs/index.html` and `docs/privacy.html`.

## 1. Pre-flight testing

- [x] **Logged-out flow:** log out of Sakai (or let the session expire), click **Sync now**, and confirm the amber "!" badge and the "Log into Sakai to sync" message. Log back in and confirm the next sync clears it.
- [ ] **Hourly alarm:** leave Chrome open for over an hour. The popup's "Last successful sync" should advance on its own.
- [ ] **Browser restart:** quit and reopen Chrome. It should sync on startup.
- [ ] **Change detection:** if an instructor moves a due date, the event moves on the next sync.
- [ ] Fresh-profile test: in a new Chrome profile with a different Google account, install, connect, and confirm the calendar appears. This is exactly what a new user will experience.

## 2. Homepage and privacy policy (GitHub Pages)

- [x] GitHub repo: `JacksonHoran/Calendar-Sync-for-Sakai`. It must be public for free GitHub Pages.
- [x] Repo **Settings → Pages →** Source: deploy from branch `main`, folder **`/docs`**.
- [x] Confirm `https://jacksonhoran.github.io/Calendar-Sync-for-Sakai/` and `.../privacy.html` load.
- [x] **Verify the domain** in [Google Search Console](https://search.google.com/search-console): add `https://jacksonhoran.github.io/` as a URL-prefix property and verify with the HTML meta tag. Google OAuth verification requires this. Done; keep the tag in place, since Google re-checks it.

## 3. Chrome Web Store: first upload (draft only)

- [ ] Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). There's a one-time $5 fee.
- [ ] `npm run package` builds `dist/calendar-sync-for-sakai-<version>.zip`, with the dev `key` stripped.
- [ ] **New item →** upload the zip. **Don't submit yet.**

## 4. Switch to the store's extension ID

The store assigns its own ID, which differs from the dev ID `agfkkmblbjjkcfecamfddhgjbflkookd`. The Google OAuth client must match the ID users actually install.

- [ ] Dashboard → your item → **Package → View public key.** Copy the text between the BEGIN/END lines and remove the newlines.
- [ ] Replace `"key"` in `manifest.json` with it. Reload the unpacked extension and confirm the ID on `chrome://extensions` matches the dashboard's Item ID.
- [ ] In Google Cloud → Google Auth Platform → **Clients**, edit the Chrome Extension client and change its **Item ID** to the new ID. The client ID string stays the same, so the manifest doesn't need to change.
- [ ] Reload, **Reconnect Google Calendar**, and run a sync to confirm it still works. The old `key.pem` is no longer needed.
- [ ] `npm run package` and upload the new zip.

## 5. Google OAuth consent screen: production and verification

- [ ] **Branding:** app name (matching the store name), 120×120 logo, support email, homepage URL, privacy policy URL, and your `github.io` domain under **Authorized domains**.
- [ ] **Audience → Publish app** (Testing → In production). This matters even before verification: Testing authorizations **expire every 7 days**, and In-production unverified apps don't. Unverified apps show a warning screen and are capped at 100 users for sensitive scopes.
- [ ] **Verification center → submit for verification.** You need:
  - Scope justifications (Appendix D).
  - A demo video on YouTube, unlisted is fine (Appendix E).
  - Expect days to weeks, with possible back-and-forth by email.

## 6. Store listing and review

- [ ] **Store listing tab:** description (Appendix A), category **Workflow & Planning**, language English.
- [ ] **Graphics:** the store icon is 128×128 (`icons/icon128.png`, though a more polished version is worth making), at least one **1280×800** screenshot, and a **440×280** small promo tile. Good screenshots: the popup showing "Up to date · Syncing to …", and Google Calendar week view with the Sakai Assignments events. Screenshots are in `store-assets/` (personal details blurred; never commit unblurred originals). Promo tile: `store-assets/promo-tile-440x280.png`. Optional marquee (1400×560): `store-assets/marquee-1400x560.png`.
- [ ] **Privacy practices tab:** single purpose, permission justifications, and data usage (Appendices B and C). Privacy policy URL: `https://jacksonhoran.github.io/Calendar-Sync-for-Sakai/privacy.html`.
- [ ] **Distribution:** Visibility **Unlisted** for the pilot, then Public.
- [ ] **Submit for review.** Reviews usually take a few days. Narrow host permissions (only `sakai.luc.edu`) and no remote code help.
- [ ] After approval, put the store URL into `docs/index.html` (`CHROME_WEB_STORE_URL`) and push.

## 7. Launch

- [ ] Pilot with 5–10 classmates via the unlisted link. Collect feedback on event titles, reminders, and anything confusing in setup.
- [ ] **Talk to Loyola IT** (and possibly the Sakai admins) before going Public or posting on LinkedIn. Explain that it only reads the student's own data through Sakai's standard `/direct` API, runs in the student's browser, and has no server.
- [ ] Switch visibility to Public and post.

---

## Appendix A: Store listing text

**Summary** (also `manifest.json` description, ≤132 chars):
> Automatically keeps your Loyola Sakai assignment due dates in a dedicated Google Calendar.

**Description:**
> Never miss a Sakai deadline again. Calendar Sync for Sakai puts every assignment from your Loyola Sakai courses on your Google Calendar, and keeps it up to date automatically.
>
> HOW IT WORKS
> 1. Install the extension and log into sakai.luc.edu like you normally do.
> 2. Click the extension icon → Connect Google Calendar.
> 3. Done. A "Sakai Assignments" calendar appears in Google Calendar.
>
> FEATURES
> • Every assignment appears at its due time, labeled by course: "[COMP 371] Project 2a"
> • Reminders 1 day and 2 hours before each deadline
> • Submitted work gets a ✓ and its reminders are turned off
> • Changed due dates update automatically, and removed assignments disappear
> • Syncs every hour and whenever Chrome starts
> • If your Sakai login expires, the icon shows a "!" until you log back in
>
> PRIVACY
> There's no server. Everything runs in your browser, and assignment info goes straight from Sakai to your own Google Calendar. The extension can only edit the one calendar it creates, never your other calendars' events.
>
> Works with Loyola University Chicago's Sakai (sakai.luc.edu). An independent student project, not affiliated with Loyola University Chicago, the Apereo Foundation, or Google.

## Appendix B: Privacy practices, single purpose and permissions

**Single purpose:**
> Copies the user's assignment due dates from Loyola's Sakai learning management system into a dedicated Google Calendar and keeps them in sync.

| Permission | Justification |
|---|---|
| `identity` | Signs the user into Google with Chrome's built-in OAuth, so the extension can create and update events in the "Sakai Assignments" calendar it creates. |
| `storage` | Stores the ID of the calendar the extension created and the last sync status (time, item count, error) locally, so the popup can show status and syncs don't create duplicates. |
| `alarms` | Schedules the hourly background sync, so the calendar stays current without the user doing anything. |
| Host `https://sakai.luc.edu/*` | Reads the user's own assignments and course names from Sakai's JSON API, using the Sakai login the user already has. This is the extension's data source. It reads only; nothing is ever written to Sakai. |
| Host `https://www.googleapis.com/*` | Calls the Google Calendar API to create the "Sakai Assignments" calendar and create, update, and delete events on it. |

**Remote code:** No, I am not using remote code. All JavaScript is included in the package.

## Appendix C: Privacy practices, data usage

Check these data types:
- **Personally identifiable information:** the user's Google account email is read from the events the extension creates and shown in the popup. It is stored locally only.
- **Authentication information:** the Google OAuth access token, which Chrome manages. It is sent only to Google APIs.
- **Website content:** assignment titles, due dates, submission status, and course names read from Sakai. They are sent only to the user's own Google Calendar.

Leave everything else unchecked (health, financial, location, web history, user activity, personal communications).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Appendix D: OAuth scope justifications (Google verification)

**`https://www.googleapis.com/auth/calendar.app.created`**
> The extension creates one secondary calendar, "Sakai Assignments", and creates, updates, and deletes events on it to mirror the user's assignment due dates from their university's Sakai site. Each sync reads that calendar's events to avoid duplicates and to update changed due dates. This is the narrowest Calendar scope that allows this, because it grants no access to any calendar the app did not create.

**`https://www.googleapis.com/auth/calendar.calendarlist`**
> A calendar created with calendar.app.created is not automatically shown in the user's Google Calendar. The extension calls calendarList.insert (or patch) once to add the "Sakai Assignments" calendar to the user's calendar list with selected=true, so the synced events are actually visible. It never reads, stores, or transmits the user's other calendar list entries, and it doesn't modify any other entry. Without this scope, users would have to find and subscribe to the calendar by hand, which defeats the extension's purpose of zero-maintenance syncing.

## Appendix E: Demo video script (2–3 minutes, YouTube unlisted)

Google wants to see the OAuth client ID in the consent screen's URL and each scope being used.

1. Show `chrome://extensions` with the installed extension and its ID.
2. Show sakai.luc.edu logged in, with a few assignments visible. Blur grades and other names.
3. Open the popup and click **Connect Google Calendar**. On the Google consent screen, **zoom into the URL bar to show the `client_id`**, then show both permissions listed and click Allow.
4. Popup shows "Up to date · N items · Syncing to <email>".
5. Open Google Calendar: "Sakai Assignments" is in **My calendars**, which demonstrates `calendarlist`. Show the events at their due times, with `[COURSE] Title`, the ✓ on submitted items, and the Sakai link in an event, which demonstrates `app.created`.
6. Briefly show that the user's other calendars are untouched.
7. Show how to revoke access at myaccount.google.com/permissions.
