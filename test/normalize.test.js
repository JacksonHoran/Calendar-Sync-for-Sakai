import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeAssignments,
  decodeEntities,
  shortCourseName,
  courseLabel,
} from "../src/normalize.js";

const raw = JSON.parse(readFileSync(new URL("./fixtures/assignments-my.json", import.meta.url)));
const BASE = "https://sakai.luc.edu";
const NOW = Date.parse("2026-09-25T20:00:00Z");
const siteTitles = { "26c72234-b572-45d9-b2ee-4a8ba7e7214e": "COMP 363-001 Design and Analysis of Algorithms" };

const items = normalizeAssignments(raw, { siteTitles, baseUrl: BASE, now: NOW, skipTitles: [/^late pass\b/i] });
const byId = (id) => items.find((i) => i.key === `assignment:${id}`);

test("drops old, draft, and undated assignments", () => {
  assert.equal(byId("1b65800c-6574-4e74-8f08-ae38a8fa31d3"), undefined);
  assert.equal(byId("00000000-0000-0000-0000-000000000001"), undefined);
  assert.equal(byId("00000000-0000-0000-0000-000000000002"), undefined);
  assert.equal(items.length, 4);
});

test("skips titles matching skipTitles", () => {
  assert.equal(byId("c791a24b-c273-432a-962a-11887f1edb2d"), undefined);
  const unfiltered = normalizeAssignments(raw, { siteTitles, baseUrl: BASE, now: NOW });
  assert.ok(unfiltered.find((i) => i.key === "assignment:c791a24b-c273-432a-962a-11887f1edb2d"));
});

test("keeps recently-past items inside the window", () => {
  assert.ok(byId("bbdc8880-155f-4643-883b-b0f79da730d6"));
});

test("maps fields for an upcoming assignment", () => {
  const item = byId("639fcbac-fbd2-4539-bed5-d494ce2dfcb3");
  assert.equal(item.title, "Project 2a F26");
  assert.equal(item.course, "COMP 371");
  assert.equal(item.due, "2026-09-29T04:55:00.000Z");
  assert.equal(item.url, "https://sakai.luc.edu/portal/site/COMP_371_001_2706_1266");
  assert.equal(item.submitted, false);
});

test("detects submissions and tolerates null submissions", () => {
  assert.equal(byId("0f3c0137-39b1-4781-a16c-c83d374583e5").submitted, true);
  assert.equal(byId("1c5bd1cc-1284-47ed-a557-8e1cca20b13f").submitted, false);
});

test("cleans titles and resolves UUID sites via site titles", () => {
  const item = byId("bbdc8880-155f-4643-883b-b0f79da730d6");
  assert.equal(item.title, "Week 04 - Newton & Recursion");
  assert.equal(item.course, "COMP 363");
  assert.equal(byId("1c5bd1cc-1284-47ed-a557-8e1cca20b13f").title, "Perspective Drawing");
});

test("sorts by due date", () => {
  const dues = items.map((i) => i.due);
  assert.deepEqual(dues, [...dues].sort());
});

test("hash changes when the due date changes", () => {
  const moved = structuredClone(raw);
  moved[1].dueTime.epochSecond += 3600;
  const again = normalizeAssignments(moved, { siteTitles, baseUrl: BASE, now: NOW });
  const before = byId("639fcbac-fbd2-4539-bed5-d494ce2dfcb3").hash;
  const after = again.find((i) => i.key === "assignment:639fcbac-fbd2-4539-bed5-d494ce2dfcb3").hash;
  assert.notEqual(before, after);
});

test("helpers", () => {
  assert.equal(decodeEntities("A &amp; B &#39;c&#x27; &nbsp;"), "A & B 'c'  ");
  assert.equal(shortCourseName("LITR_245_06W_3055_1266"), "LITR 245");
  assert.equal(shortCourseName("26c72234-b572-45d9"), null);
  assert.equal(courseLabel("some-uuid", {}), "Sakai");
  assert.equal(courseLabel("some-uuid", { "some-uuid": "Internship Seminar" }), "Internship Seminar");
});
