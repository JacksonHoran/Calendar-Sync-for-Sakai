// In-memory fakes of the Sakai /direct API and the Google Calendar v3 API, served through a
// stubbed global fetch. They implement only what the extension calls, but check auth and
// return realistic statuses so error paths get exercised.

const SAKAI = "https://sakai.luc.edu";
const GOOGLE = "https://www.googleapis.com/calendar/v3";
const DAY = 24 * 60 * 60 * 1000;

function response(status, body, { contentType = "application/json", redirected = false, url = "" } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: String(status),
    redirected,
    url,
    headers: new Headers(body === undefined ? {} : { "content-type": contentType }),
    async json() {
      if (typeof body === "string") throw new SyntaxError("Unexpected token <");
      return structuredClone(body);
    },
  };
}

// A Sakai assignment as my.json returns it, due `days` from now.
export function sakaiAssignment(id, { days = 7, title = `Assignment ${id}`, site = "COMP_371_001_2706_1266", submitted = false } = {}) {
  return {
    id,
    title,
    context: site,
    draft: false,
    status: "OPEN",
    dueTime: { epochSecond: Math.floor((Date.now() + days * DAY) / 1000), nano: 0 },
    submissions: [{ userSubmission: submitted, dateSubmittedEpochSeconds: submitted ? 1 : null }],
  };
}

export function createFakeSakai() {
  const sakai = {
    loggedIn: true,
    // "json" = anonymous session JSON, "redirect" = bounced to a login page, "html" = login page body.
    loggedOutStyle: "json",
    assignments: [],
    sites: [{ id: "COMP_371_001_2706_1266", title: "COMP 371-001 Programming Languages" }],
    requests: [],
    handle(path) {
      sakai.requests.push(path);
      if (!sakai.loggedIn && sakai.loggedOutStyle === "redirect") {
        return response(200, "<html>login</html>", { contentType: "text/html", redirected: true, url: `${SAKAI}/portal/xlogin` });
      }
      if (!sakai.loggedIn && sakai.loggedOutStyle === "html" && path !== "/direct/session/current.json") {
        return response(200, "<html>login</html>", { contentType: "text/html" });
      }
      if (path === "/direct/session/current.json") {
        return response(200, sakai.loggedIn ? { userEid: "student1", userId: "u1" } : { userEid: null, userId: null });
      }
      if (path === "/direct/assignment/my.json") return response(200, { assignment_collection: sakai.assignments });
      if (path.startsWith("/direct/site.json")) return response(200, { site_collection: sakai.sites });
      return response(404, { error: "not found" });
    },
  };
  return sakai;
}

export function createFakeGoogle(chromeState, { email = "student@example.com" } = {}) {
  let nextId = 1;
  const google = {
    calendars: new Map(), // id -> { events: Map(eventId -> event) }
    calendarList: new Map(), // id -> { id, selected, hidden }
    requests: [],
    failNext: [], // queue of statuses (with optional reason) to return before normal handling
    handle(method, url, headers, body) {
      const { pathname, searchParams } = new URL(url);
      const path = pathname.replace("/calendar/v3", "");
      google.requests.push(`${method} ${path}`);

      if (headers.Authorization !== `Bearer ${chromeState.token}`) return response(401, { error: { message: "Invalid Credentials" } });
      const injected = google.failNext.shift();
      if (injected) return response(injected.status, { error: { message: "injected", errors: [{ reason: injected.reason ?? "" }] } });

      let m;
      if (method === "POST" && path === "/calendars") {
        const id = `cal${nextId++}@group.calendar.google.com`;
        google.calendars.set(id, { summary: body.summary, events: new Map() });
        return response(200, { id, summary: body.summary });
      }
      if ((m = path.match(/^\/users\/me\/calendarList\/(.+)$/))) {
        const id = decodeURIComponent(m[1]);
        const entry = google.calendarList.get(id);
        if (!entry) return response(404, { error: { message: "Not Found" } });
        if (method === "PATCH") Object.assign(entry, body);
        return response(200, entry);
      }
      if (method === "POST" && path === "/users/me/calendarList") {
        if (!google.calendars.has(body.id)) return response(404, { error: { message: "Not Found" } });
        google.calendarList.set(body.id, { id: body.id, selected: body.selected, hidden: body.hidden });
        return response(200, google.calendarList.get(body.id));
      }
      if ((m = path.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/))) {
        const calendar = google.calendars.get(decodeURIComponent(m[1]));
        if (!calendar) return response(404, { error: { message: "Not Found" } });
        const eventId = m[2] && decodeURIComponent(m[2]);

        if (method === "GET" && !eventId) {
          const timeMin = searchParams.get("timeMin");
          const items = [...calendar.events.values()].filter((e) => !timeMin || Date.parse(e.end.dateTime) > Date.parse(timeMin));
          return response(200, { items });
        }
        if (method === "POST" && !eventId) {
          const event = { ...body, id: `evt${nextId++}`, creator: { email } };
          calendar.events.set(event.id, event);
          return response(200, event);
        }
        if (!calendar.events.has(eventId)) return response(404, { error: { message: "Not Found" } });
        if (method === "PUT") {
          const event = { ...body, id: eventId, creator: { email } };
          calendar.events.set(eventId, event);
          return response(200, event);
        }
        if (method === "DELETE") {
          calendar.events.delete(eventId);
          return { status: 204, ok: true, headers: new Headers(), json: async () => null };
        }
      }
      return response(404, { error: { message: `unhandled ${method} ${path}` } });
    },
    // All events across all calendars, for assertions.
    allEvents() {
      return [...google.calendars.values()].flatMap((c) => [...c.events.values()]);
    },
  };
  return google;
}

// Routes the global fetch to the fakes. Returns a restore function.
export function installFetch({ sakai, google }) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith(SAKAI)) return sakai.handle(url.slice(SAKAI.length));
    if (url.startsWith(GOOGLE)) {
      const body = init.body ? JSON.parse(init.body) : undefined;
      return google.handle(init.method ?? "GET", url, init.headers ?? {}, body);
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return () => { globalThis.fetch = original; };
}
