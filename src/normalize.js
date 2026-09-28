// Turns raw Sakai JSON into the common item shape used by the sync layer.
// Pure functions only (no chrome.* APIs) so they can be unit-tested in Node.

const DAY_MS = 24 * 60 * 60 * 1000;

// my.json returns every assignment the student has ever had, so anything that
// was due more than this long ago is dropped.
export const PAST_WINDOW_DAYS = 14;

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Service workers have no DOMParser, so decode the handful of entities Sakai emits by hand.
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? match : String.fromCodePoint(n);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function cleanTitle(title) {
  return decodeEntities(title ?? "").replace(/\s+/g, " ").trim();
}

// "COMP 371-001 Programming Languages" or "COMP_371_001_2706_1266" -> "COMP 371".
// Returns null when neither looks like a course code (e.g. project sites with UUID ids).
export function shortCourseName(text) {
  // Lookarounds instead of \b, because "_" counts as a word character.
  const match = /(?<![A-Za-z0-9])([A-Z]{2,5})[\s_-]?(\d{3})(?!\d)/.exec(text ?? "");
  return match ? `${match[1]} ${match[2]}` : null;
}

export function courseLabel(siteId, siteTitles = {}) {
  const title = siteTitles[siteId];
  return shortCourseName(title) ?? shortCourseName(siteId) ?? title?.trim() ?? "Sakai";
}

function isSubmitted(assignment) {
  return (assignment.submissions ?? []).some((s) => s.userSubmission && s.dateSubmittedEpochSeconds != null);
}

// Small stable string hash (djb2) used to detect when an item changed between syncs.
export function hashString(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function normalizeAssignments(raw, { siteTitles = {}, baseUrl, now = Date.now(), skipTitles = [] } = {}) {
  const cutoff = now - PAST_WINDOW_DAYS * DAY_MS;
  const items = [];

  for (const a of raw ?? []) {
    const dueSeconds = a.dueTime?.epochSecond;
    if (a.draft || !a.id || dueSeconds == null) continue;

    const dueMs = dueSeconds * 1000;
    if (dueMs < cutoff) continue;

    const title = cleanTitle(a.title);
    if (skipTitles.some((pattern) => pattern.test(title))) continue;

    const item = {
      key: `assignment:${a.id}`,
      type: "assignment",
      title,
      siteId: a.context,
      course: courseLabel(a.context, siteTitles),
      due: new Date(dueMs).toISOString(),
      url: `${baseUrl}/portal/site/${encodeURIComponent(a.context)}`,
      submitted: isSubmitted(a),
    };
    item.hash = hashString([item.title, item.course, item.due, item.url, item.submitted].join("|"));
    items.push(item);
  }

  return items.sort((x, y) => x.due.localeCompare(y.due));
}

export function siteTitleMap(sites) {
  return Object.fromEntries((sites ?? []).filter((s) => s.id).map((s) => [s.id, s.title]));
}
