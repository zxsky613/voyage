import test from "node:test";
import assert from "node:assert/strict";
import { estimateItineraryLegMinutes, WALK_THRESHOLD_KM } from "./itineraryTravelEstimate.js";

test("WALK_THRESHOLD_KM is 1", () => {
  assert.equal(WALK_THRESHOLD_KM, 1);
});

test("estimateItineraryLegMinutes — courte distance à pied", () => {
  const a = { latitude: 43.2148, longitude: 5.5382 };
  const b = { latitude: 43.218, longitude: 5.542 };
  const leg = estimateItineraryLegMinutes(a, b);
  assert.ok(leg);
  assert.equal(leg.mode, "walk");
  assert.ok(leg.km <= WALK_THRESHOLD_KM);
  assert.ok(leg.minutes >= 5);
  assert.equal(leg.minutes % 5, 0);
});

test("estimateItineraryLegMinutes — au-delà du seuil → transit", () => {
  const a = { latitude: 43.21, longitude: 5.53 };
  const b = { latitude: 43.22, longitude: 5.55 };
  const leg = estimateItineraryLegMinutes(a, b);
  assert.ok(leg);
  assert.equal(leg.mode, "transit");
  assert.ok(leg.km > WALK_THRESHOLD_KM);
});

test("estimateItineraryLegMinutes — coords manquantes → null", () => {
  assert.equal(estimateItineraryLegMinutes({}, { latitude: 1, longitude: 2 }), null);
});
