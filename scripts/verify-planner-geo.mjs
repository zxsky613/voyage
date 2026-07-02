/**
 * Tests unitaires clustering / scoring (sans réseau).
 */
import assert from "node:assert/strict";
import {
  haversineKm,
  clusterPlacesIntoDays,
  orderDayNearestNeighbor,
  dayOrderPassesSanityCheck,
  thresholdsForSpread,
} from "../lib/planner/geoCluster.js";
import { scoreEnrichedPlace, tripTypeMatchBonus } from "../lib/planner/scoring.js";
import { mapAppTravelersToTripAdvisorType } from "../lib/planner/tripTypeMap.js";
import { deriveBulletsFromActivities } from "../lib/planner/itineraryShape.js";

const parisLouvre = { id: "c1", name: "Louvre", latitude: 48.8606, longitude: 2.3376, rating: 4.7, numReviews: 90000, status: "verified" };
const parisOrsay = { id: "c2", name: "Orsay", latitude: 48.86, longitude: 2.3266, rating: 4.6, numReviews: 40000, status: "verified" };
const parisMarais = { id: "c3", name: "Marais", latitude: 48.8566, longitude: 2.3622, rating: 4.5, numReviews: 12000, status: "verified" };
const lyonFar = { id: "c4", name: "Lyon centre", latitude: 45.764, longitude: 4.8357, rating: 4.8, numReviews: 5000, status: "verified" };

assert.ok(haversineKm(parisLouvre, parisOrsay) < 2, "Louvre–Orsay proches");
assert.ok(haversineKm(parisLouvre, lyonFar) > 300, "Paris–Lyon loin");

const clusters = clusterPlacesIntoDays([parisLouvre, parisOrsay, parisMarais, lyonFar], 2);
assert.equal(clusters.length, 2);
const allIds = clusters.flat().map((p) => p.id).sort();
assert.deepEqual(allIds.sort(), ["c1", "c2", "c3", "c4"].sort());

const ordered = orderDayNearestNeighbor([
  { ...parisMarais, period: "morning" },
  { ...parisLouvre, period: "afternoon" },
]);
assert.equal(ordered.length, 2);

const { sanityKm } = thresholdsForSpread(3);
assert.equal(dayOrderPassesSanityCheck([parisLouvre, parisOrsay], sanityKm), true);

assert.equal(mapAppTravelersToTripAdvisorType("couple"), "couples");
assert.equal(mapAppTravelersToTripAdvisorType("unknown"), null);
assert.equal(tripTypeMatchBonus({ couples: 40 }, "couples"), 0.35);

const verifiedScore = scoreEnrichedPlace(parisLouvre, { travelers: "couple", budget: "medium" });
const unverifiedScore = scoreEnrichedPlace({ ...parisLouvre, status: "unverified" }, { travelers: "couple" });
assert.ok(verifiedScore > unverifiedScore, "verified > unverified");

const bullets = deriveBulletsFromActivities(
  {
    activities: [
      { period: "morning", description: "Visite du Louvre" },
      { period: "afternoon", description: "Promenade au Marais" },
    ],
  },
  "fr"
);
assert.equal(bullets.length, 2);
assert.match(bullets[0], /^Matin/i);

console.log("verify-planner-geo: OK");
