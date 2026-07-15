import test from "node:test";
import assert from "node:assert/strict";
import {
  periodRank,
  parseBulletPeriod,
  sortDayActivitiesChronologically,
  sortDayBulletsChronologically,
  sortItineraryDayForDisplay,
} from "./itineraryDayOrder.js";

test("periodRank morning before afternoon before evening", () => {
  assert.ok(periodRank("morning") < periodRank("afternoon"));
  assert.ok(periodRank("afternoon") < periodRank("evening"));
  assert.ok(periodRank("evening") < periodRank("other"));
});

test("parseBulletPeriod reads French prefixes", () => {
  assert.equal(parseBulletPeriod("Après-midi : Knossos"), "afternoon");
  assert.equal(parseBulletPeriod("Matin : plage d'Elafonisi"), "morning");
  assert.equal(parseBulletPeriod("Soir : dîner en terrasse"), "evening");
});

test("sortDayActivitiesChronologically fixes disordered day", () => {
  const input = [
    { id: "c2", period: "afternoon", description: "Knossos", time: "14:00" },
    { id: "c1", period: "morning", description: "Elafonisi" },
    { id: "c3", period: "afternoon", description: "Héraklion", time: "16:00" },
  ];
  const sorted = sortDayActivitiesChronologically(input);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["c1", "c2", "c3"]
  );
});

test("sortDayActivitiesChronologically uses bullet prefix when period missing", () => {
  const acts = [
    { id: "b", description: "Musée" },
    { id: "a", description: "Plage" },
  ];
  const bullets = ["Après-midi : Musée", "Matin : Plage"];
  const sorted = sortDayActivitiesChronologically(acts, bullets);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["a", "b"]
  );
});

test("sortDayActivitiesChronologically secondary sort by time within period", () => {
  const input = [
    { id: "b", period: "morning", time: "11:00" },
    { id: "a", period: "morning", time: "09:30" },
  ];
  const sorted = sortDayActivitiesChronologically(input);
  assert.deepEqual(
    sorted.map((a) => a.id),
    ["a", "b"]
  );
});

test("sortItineraryDayForDisplay keeps bullets aligned with activities", () => {
  const day = {
    day: 1,
    activities: [
      { id: "c2", period: "afternoon", description: "B" },
      { id: "c1", period: "morning", description: "A" },
    ],
    bullets: ["Après-midi : B", "Matin : A"],
  };
  const out = sortItineraryDayForDisplay(day);
  assert.deepEqual(
    out.activities.map((a) => a.id),
    ["c1", "c2"]
  );
  assert.deepEqual(out.bullets, ["Matin : A", "Après-midi : B"]);
});

test("sortDayBulletsChronologically without activities", () => {
  const bullets = ["Après-midi : Samaria", "Matin : Balos"];
  assert.deepEqual(sortDayBulletsChronologically(bullets), ["Matin : Balos", "Après-midi : Samaria"]);
});
