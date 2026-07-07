import test from "node:test";
import assert from "node:assert/strict";
import {
  appendTravelMemorySnapshot,
  buildTripPrefsPrefill,
  deriveTravelPreferences,
  emptyTravelPreferencesDoc,
  inferTravelStyleFromActivityTitle,
  TRAVEL_MEMORY_MIN_TRIPS_FOR_PREFILL,
} from "./travelPreferences.js";

test("buildTripPrefsPrefill returns null before 2 trips with prefs", () => {
  let doc = emptyTravelPreferencesDoc();
  doc = appendTravelMemorySnapshot(doc, {
    prefs: { pace: "relaxed", styles: ["nature"], travelers: "couple", budget: "medium" },
    durationDays: 4,
  });
  assert.equal(buildTripPrefsPrefill(doc), null);
  assert.ok((doc.snapshots?.length || 0) < TRAVEL_MEMORY_MIN_TRIPS_FOR_PREFILL + 1);
});

test("buildTripPrefsPrefill after 2 nature+relaxed trips", () => {
  let doc = emptyTravelPreferencesDoc();
  const prefs = { pace: "relaxed", styles: ["nature", "relaxation"], travelers: "couple", budget: "medium" };
  doc = appendTravelMemorySnapshot(doc, { prefs, durationDays: 5 });
  doc = appendTravelMemorySnapshot(doc, { prefs, durationDays: 6 });
  const prefill = buildTripPrefsPrefill(doc);
  assert.ok(prefill);
  assert.equal(prefill.pace, "relaxed");
  assert.ok(prefill.styles.includes("nature"));
  assert.ok(prefill.styles.includes("relaxation"));
});

test("deleted nightlife activities reduce style weight", () => {
  let doc = emptyTravelPreferencesDoc();
  const prefs = { pace: "moderate", styles: ["nightlife", "cultural"], travelers: "friends", budget: "high" };
  doc = appendTravelMemorySnapshot(doc, { prefs, durationDays: 3 });
  doc = appendTravelMemorySnapshot(doc, {
    prefs,
    durationDays: 4,
    signals: { deletedStyles: { nightlife: 3 }, itineraryRegenerations: 0, dayRegenerations: 0 },
  });
  const prefill = buildTripPrefsPrefill(doc);
  assert.ok(prefill);
  assert.ok(!prefill.styles.includes("nightlife"));
  assert.ok(prefill.styles.includes("cultural"));
});

test("inferTravelStyleFromActivityTitle maps beach to nature", () => {
  assert.equal(inferTravelStyleFromActivityTitle("Plage de Mondello"), "nature");
});

test("recent snapshots weigh more in derived pace", () => {
  let doc = emptyTravelPreferencesDoc();
  doc = appendTravelMemorySnapshot(doc, {
    prefs: { pace: "intensive", styles: ["adventure"], travelers: "solo", budget: "low" },
    durationDays: 3,
  });
  doc = appendTravelMemorySnapshot(doc, {
    prefs: { pace: "relaxed", styles: ["nature"], travelers: "couple", budget: "medium" },
    durationDays: 5,
  });
  doc = appendTravelMemorySnapshot(doc, {
    prefs: { pace: "relaxed", styles: ["nature"], travelers: "couple", budget: "medium" },
    durationDays: 6,
  });
  const derived = deriveTravelPreferences(doc).derived;
  assert.equal(derived.pace, "relaxed");
});
