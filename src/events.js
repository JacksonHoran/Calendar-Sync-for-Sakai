// Pure helpers that turn normalized Sakai items into Google Calendar events and decide
// what to create, update, or delete. No chrome.* or network calls, so they're unit-tested.

// Builds an events.insert / events.update body for one item.
// Events end at the due time so they sit at the right spot on the calendar.
export function buildEvent(item, { durationMinutes, reminders, timeZone }) {
  const end = new Date(item.due);
  const start = new Date(end.getTime() - durationMinutes * 60 * 1000);
  const summary = `${item.submitted ? "✓ " : ""}[${item.course}] ${item.title}`;

  return {
    summary,
    description: `${item.submitted ? "Submitted. " : ""}Due in ${item.course}.\n\nOpen in Sakai: ${item.url}`,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    source: { title: "Sakai", url: item.url },
    // Deadlines shouldn't show you as busy.
    transparency: "transparent",
    // No point nagging about work that's already turned in.
    reminders: { useDefault: false, overrides: item.submitted ? [] : reminders },
    extendedProperties: { private: { sakaiKey: item.key, sakaiHash: item.hash } },
  };
}

// Reduces a list of Calendar API events to the ones this extension created, keyed by Sakai item.
// Duplicates (e.g. from an interrupted sync) are returned separately so they can be removed.
export function indexExistingEvents(events) {
  const byKey = new Map();
  const duplicates = [];
  for (const event of events) {
    const meta = event.extendedProperties?.private;
    if (!meta?.sakaiKey) continue;
    const entry = { eventId: event.id, hash: meta.sakaiHash, end: event.end?.dateTime ?? event.end?.date };
    if (byKey.has(meta.sakaiKey)) duplicates.push(entry.eventId);
    else byKey.set(meta.sakaiKey, entry);
  }
  return { byKey, duplicates };
}

// Decides the minimal set of writes. Events for items that disappeared from Sakai are only
// deleted if they're still in the future; past events drop out of Sakai's feed naturally
// and should stay on the calendar as history.
export function planSync(items, existing, { now = Date.now() } = {}) {
  const create = [];
  const update = [];
  const remove = [...existing.duplicates];
  const seen = new Set();

  for (const item of items) {
    seen.add(item.key);
    const current = existing.byKey.get(item.key);
    if (!current) create.push(item);
    else if (current.hash !== item.hash) update.push({ eventId: current.eventId, item });
  }

  for (const [key, entry] of existing.byKey) {
    if (!seen.has(key) && entry.end && Date.parse(entry.end) > now) remove.push(entry.eventId);
  }

  return { create, update, remove };
}
