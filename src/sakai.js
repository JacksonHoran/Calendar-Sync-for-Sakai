import { SAKAI_BASE_URL } from "./config.js";

export class SakaiLoggedOutError extends Error {
  constructor(detail) {
    super(`Not logged into Sakai (${detail})`);
    this.name = "SakaiLoggedOutError";
  }
}

export class SakaiHttpError extends Error {
  constructor(status, path) {
    super(`Sakai returned ${status} for ${path}`);
    this.name = "SakaiHttpError";
    this.status = status;
  }
}

const LOGIN_URL_PATTERN = /login|relogin|shibboleth|idp|sso|cas\//i;

// Fetches a Sakai /direct endpoint with the user's session cookies. An expired session
// shows up as a redirect to a login page, an auth error, or an HTML body instead of JSON.
async function fetchJson(path) {
  const res = await fetch(SAKAI_BASE_URL + path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (res.status === 401 || res.status === 403) {
    throw new SakaiLoggedOutError(`HTTP ${res.status}`);
  }
  if (res.redirected && LOGIN_URL_PATTERN.test(res.url)) {
    throw new SakaiLoggedOutError("redirected to login");
  }
  if (!res.ok) {
    throw new SakaiHttpError(res.status, path);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new SakaiLoggedOutError(`expected JSON, got ${contentType || "unknown type"}`);
  }
  return res.json();
}

export async function checkSession() {
  const session = await fetchJson("/direct/session/current.json");
  if (!session.userEid && !session.userId) {
    throw new SakaiLoggedOutError("no user on session");
  }
  return session;
}

// Raw responses for now. Normalization into a common item shape comes in normalize.js
// once real responses from sakai.luc.edu are saved as fixtures.
export async function fetchAssignments() {
  const data = await fetchJson("/direct/assignment/my.json");
  return data.assignment_collection ?? [];
}

export async function fetchSites() {
  const data = await fetchJson("/direct/site.json?_limit=500");
  return data.site_collection ?? [];
}
