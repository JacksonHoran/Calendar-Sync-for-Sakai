import { State } from "./storage.js";

const BADGES = {
  [State.SAKAI_LOGGED_OUT]: { text: "!", color: "#d97706", title: "Log into Sakai to sync" },
  [State.GOOGLE_AUTH_NEEDED]: { text: "!", color: "#dc2626", title: "Connect Google Calendar to sync" },
  [State.ERROR]: { text: "!", color: "#dc2626", title: "Sync failed. Open for details." },
};

export async function showBadgeForState(state) {
  const badge = BADGES[state];
  await chrome.action.setBadgeText({ text: badge?.text ?? "" });
  await chrome.action.setTitle({ title: badge?.title ?? "Calendar Sync for Sakai" });
  if (badge) await chrome.action.setBadgeBackgroundColor({ color: badge.color });
}
