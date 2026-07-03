import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGeoMismatchGuard,
  computePlacesCentroid,
  GEO_MISMATCH_MAX_KM,
  isGeoMismatchPlace,
  isPlanningEligiblePlace,
} from "./geoGuard.js";

test("computePlacesCentroid averages coordinates", () => {
  const c = computePlacesCentroid([
    { latitude: 28.0, longitude: -16.0 },
    { latitude: 28.6, longitude: -16.6 },
  ]);
  assert.ok(c);
  assert.ok(Math.abs(c.latitude - 28.3) < 0.01);
  assert.ok(Math.abs(c.longitude - -16.3) < 0.01);
});

test("applyGeoMismatchGuard rejects outlier far from Canary centroid", () => {
  const places = [
    { id: "a", name: "Teide", latitude: 28.27, longitude: -16.64, status: "verified" },
    { id: "b", name: "Santa Cruz", latitude: 28.46, longitude: -16.25, status: "verified" },
    {
      id: "c",
      name: "Castillo de San Felipe de Barajas",
      latitude: 10.42,
      longitude: -75.54,
      status: "verified",
    },
  ];
  const out = applyGeoMismatchGuard(places, GEO_MISMATCH_MAX_KM);
  const colombia = out.find((p) => p.id === "c");
  const tenerifeA = out.find((p) => p.id === "a");
  assert.equal(isGeoMismatchPlace(colombia), true);
  assert.ok(Number(colombia.geoMismatchKm) > GEO_MISMATCH_MAX_KM);
  assert.equal(isPlanningEligiblePlace(colombia), false);
  assert.equal(tenerifeA.status, "verified");
});

test("applyGeoMismatchGuard skips when fewer than 2 geolocated places", () => {
  const places = [{ id: "x", latitude: 10.0, longitude: -75.0, status: "verified" }];
  const out = applyGeoMismatchGuard(places);
  assert.equal(out[0].status, "verified");
});
