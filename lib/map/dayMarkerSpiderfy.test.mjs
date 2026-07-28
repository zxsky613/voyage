import test from "node:test";
import assert from "node:assert/strict";
import {
  clusterIndicesByPixelOverlap,
  spiderfyPixelPositions,
  spiderfyHorizontalPositions,
  buildDayMarkerSpiderLayout,
  maxCentroidSpreadKm,
  DAY_MARKER_MIN_SEPARATION_PX,
} from "./dayMarkerSpiderfy.js";

test("clusterIndicesByPixelOverlap groups close points", () => {
  const groups = clusterIndicesByPixelOverlap(
    [
      { x: 100, y: 100 },
      { x: 110, y: 105 },
      { x: 400, y: 400 },
    ],
    DAY_MARKER_MIN_SEPARATION_PX
  );
  assert.equal(groups.length, 2);
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert.deepEqual(sizes, [1, 2]);
});

test("maxCentroidSpreadKm detects city-trip cluster", () => {
  const spread = maxCentroidSpreadKm([
    { latitude: 43.2951, longitude: 5.374 },
    { latitude: 43.2965, longitude: 5.3698 },
    { latitude: 43.2935, longitude: 5.3775 },
  ]);
  assert.ok(spread < 1);
});

test("buildDayMarkerSpiderLayout spiderfies tight geographic cluster (Marseille-like)", () => {
  const centroids = [
    { dayIndex: 0, dayNum: 1, latitude: 43.2951, longitude: 5.374 },
    { dayIndex: 1, dayNum: 2, latitude: 43.2965, longitude: 5.3698 },
    { dayIndex: 2, dayNum: 3, latitude: 43.2935, longitude: 5.3775 },
  ];
  const layout = buildDayMarkerSpiderLayout(
    centroids,
    0,
    (lon, lat) => ({ x: lon * 1000, y: lat * 1000 }),
    (x, y) => ({ lng: x / 1000, lat: y / 1000 })
  );
  assert.equal(layout.leaderLines.features.length, 3);
  assert.equal(layout.spiderfied, true);
});

test("spiderfyHorizontalPositions spreads markers on one row above center", () => {
  const pts = spiderfyHorizontalPositions(200, 100, 3, 50);
  assert.equal(pts.length, 3);
  assert.ok(pts.every((p) => p.y < 100));
  assert.ok(new Set(pts.map((p) => p.x)).size === 3);
});

test("buildDayMarkerSpiderLayout keeps spaced road-trip markers at anchor", () => {
  const centroids = [
    { dayIndex: 0, dayNum: 1, latitude: 35.34, longitude: 25.14 },
    { dayIndex: 1, dayNum: 2, latitude: 35.51, longitude: 24.02 },
    { dayIndex: 2, dayNum: 3, latitude: 35.26, longitude: 25.73 },
  ];
  const layout = buildDayMarkerSpiderLayout(
    centroids,
    0,
    (lon, lat) => ({ x: lon * 200, y: lat * 200 }),
    (x, y) => ({ lng: x / 200, lat: y / 200 })
  );
  assert.equal(layout.spiderfied, false);
  assert.equal(layout.leaderLines.features.length, 0);
  for (let i = 0; i < centroids.length; i += 1) {
    const f = layout.markers.features[i];
    assert.equal(f.properties.spiderfied, false);
    assert.equal(f.geometry.coordinates[0], centroids[i].longitude);
  }
});
