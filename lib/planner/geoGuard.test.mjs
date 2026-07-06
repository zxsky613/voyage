import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGeoMismatchGuard,
  checkDestinationGeoOutlier,
  computePlacesCentroid,
  GEO_MISMATCH_MAX_KM,
  isGeoMismatchPlace,
  isPlanningEligiblePlace,
  stripCoordsIfDestinationOutlier,
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

test("checkDestinationGeoOutlier accepts Teide within 60km of Tenerife center", () => {
  const center = { latitude: 28.4636, longitude: -16.2518 };
  const teide = { latitude: 28.272, longitude: -16.642 };
  const { within, distKm } = checkDestinationGeoOutlier(center, teide, 60);
  assert.equal(within, true);
  assert.ok(distKm != null && distKm < 60);
});

test("checkDestinationGeoOutlier rejects homonym far from destination", () => {
  const center = { latitude: 28.4636, longitude: -16.2518 };
  const colombia = { latitude: 10.42, longitude: -75.54 };
  const { within, distKm } = checkDestinationGeoOutlier(center, colombia, 60);
  assert.equal(within, false);
  assert.ok(distKm != null && distKm > 1000);
});

test("stripCoordsIfDestinationOutlier removes coords and counts rejection", () => {
  const center = { latitude: 28.4636, longitude: -16.2518 };
  let rejected = 0;
  const out = stripCoordsIfDestinationOutlier(
    { name: "Jardín botánico", latitude: 10.42, longitude: -75.54, status: "partial" },
    center,
    () => {
      rejected += 1;
    }
  );
  assert.equal(rejected, 1);
  assert.equal(out.latitude, undefined);
  assert.equal(out.longitude, undefined);
  assert.ok(out.geoOutlierRejectedKm > 1000);
});
