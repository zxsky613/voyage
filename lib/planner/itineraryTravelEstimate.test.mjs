import test from "node:test";
import assert from "node:assert/strict";
import { estimateItineraryLegMinutes } from "./itineraryTravelEstimate.js";

test("estimateItineraryLegMinutes — courte distance à pied", () => {
  const a = { latitude: 43.2148, longitude: 5.5382 };
  const b = { latitude: 43.218, longitude: 5.542 };
  const leg = estimateItineraryLegMinutes(a, b);
  assert.ok(leg);
  assert.equal(leg.mode, "walk");
  assert.ok(leg.minutes >= 5);
  assert.equal(leg.minutes % 5, 0);
});

test("estimateItineraryLegMinutes — longue distance transit", () => {
  const a = { latitude: 43.21, longitude: 5.53 };
  const b = { latitude: 43.35, longitude: 5.72 };
  const leg = estimateItineraryLegMinutes(a, b);
  assert.ok(leg);
  assert.equal(leg.mode, "transit");
  assert.ok(leg.km > 2.5);
});
