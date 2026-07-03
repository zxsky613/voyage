import test from "node:test";
import assert from "node:assert/strict";
import {
  clampActivityEstimatedPriceEur,
  refineEstimatedPriceWithPriceLevel,
  sumDayEstimatedPriceEur,
  applyComputedDayCosts,
  buildPass1CandidatePriceMap,
  attachPricingToRegistryPlace,
} from "./activityPricing.js";

test("clampActivityEstimatedPriceEur bounds 0–300", () => {
  assert.equal(clampActivityEstimatedPriceEur(-5), 0);
  assert.equal(clampActivityEstimatedPriceEur(0), 0);
  assert.equal(clampActivityEstimatedPriceEur(25.7), 26);
  assert.equal(clampActivityEstimatedPriceEur(301), 300);
  assert.equal(clampActivityEstimatedPriceEur("80"), 80);
});

test("refineEstimatedPriceWithPriceLevel caps high estimate on low price_level", () => {
  assert.equal(refineEstimatedPriceWithPriceLevel(80, 1), 30);
  assert.equal(refineEstimatedPriceWithPriceLevel(25, 1), 25);
  assert.equal(refineEstimatedPriceWithPriceLevel(80, undefined), 80);
  assert.equal(refineEstimatedPriceWithPriceLevel(200, 3), 120);
});

test("sumDayEstimatedPriceEur equals day costEur after applyComputedDayCosts", () => {
  const dayIdeas = [
    {
      day: 1,
      title: "Test",
      costEur: 999,
      activities: [
        { id: "c1", estimatedPriceEur: 0, priceSource: "estimate" },
        { id: "c2", estimatedPriceEur: 25, priceSource: "estimate" },
      ],
    },
  ];
  const out = applyComputedDayCosts(dayIdeas);
  assert.equal(sumDayEstimatedPriceEur(out[0].activities), 25);
  assert.equal(out[0].costEur, 25);
  assert.notEqual(out[0].costEur, 999);
});

test("buildPass1CandidatePriceMap reads candidate prices by id", () => {
  const map = buildPass1CandidatePriceMap([
    { id: "c1", estimatedPriceEur: 15 },
    { id: "c2", estimatedPriceEur: "40" },
  ]);
  assert.equal(map.get("c1"), 15);
  assert.equal(map.get("c2"), 40);
});

test("attachPricingToRegistryPlace merges TA price_level cap", () => {
  const place = attachPricingToRegistryPlace(
    { id: "c1", name: "Musée", priceLevel: 1 },
    90
  );
  assert.equal(place.estimatedPriceEur, 30);
  assert.equal(place.priceSource, "estimate");
});
