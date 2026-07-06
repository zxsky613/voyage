import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDestinationHighlightsFromVerified,
  highlightShowsRatingBadge,
  highlightShowsVerifiedBadge,
  highlightToActivityChip,
  placeToDestinationHighlight,
} from "./highlightShape.js";

test("placeToDestinationHighlight drops geo mismatch and unverified", () => {
  assert.equal(placeToDestinationHighlight({ name: "X", status: "unverified" }), null);
  assert.equal(placeToDestinationHighlight({ name: "X", status: "geo_mismatch" }), null);
  const ok = placeToDestinationHighlight({
    id: "h1",
    name: "Knossos Palace",
    status: "verified",
    rating: 4.5,
    numReviews: 1200,
    estimatedPriceEur: 15,
    photos: ["https://example.com/p.jpg"],
    latitude: 35.3,
    longitude: 25.16,
  });
  assert.equal(ok.name, "Knossos Palace");
  assert.equal(ok.estimatedPriceEur, 15);
  assert.equal(ok.photo_url, "https://example.com/p.jpg");
});

test("buildDestinationHighlightsFromVerified ranks verified first", () => {
  const raw = [
    { id: "h1", name: "A", estimatedPriceEur: 10 },
    { id: "h2", name: "B", estimatedPriceEur: 5 },
  ];
  const verified = [
    { id: "h2", name: "B Museum", status: "verified", rating: 4.8, numReviews: 500, estimatedPriceEur: 5 },
    { id: "h1", name: "A Site", status: "partial", rating: 0, numReviews: 0, estimatedPriceEur: 10 },
  ];
  const out = buildDestinationHighlightsFromVerified(verified, raw, { cityLabel: "Crete", max: 8 });
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "B Museum");
});

test("highlightShowsRatingBadge requires tripadvisor source", () => {
  assert.equal(
    highlightShowsRatingBadge({ status: "verified", source: "tripadvisor", rating: 4.5, numReviews: 10 }),
    true
  );
  assert.equal(
    highlightShowsRatingBadge({ status: "partial", source: "foursquare", rating: 4.5, numReviews: 10 }),
    false
  );
  assert.equal(highlightShowsRatingBadge({ status: "verified", rating: 4.5, numReviews: 10 }), false);
});

test("highlightShowsVerifiedBadge for foursquare partial without TA rating", () => {
  assert.equal(highlightShowsVerifiedBadge({ status: "partial", source: "foursquare" }), true);
  assert.equal(highlightShowsVerifiedBadge({ status: "unverified", source: "none" }), false);
  assert.equal(
    highlightShowsVerifiedBadge({ status: "verified", source: "tripadvisor", rating: 4.5, numReviews: 10 }),
    false
  );
});

test("highlightToActivityChip maps price and photo", () => {
  const chip = highlightToActivityChip({
    name: "Knossos",
    estimatedPriceEur: 15,
    photos: ["https://example.com/k.jpg"],
  });
  assert.equal(chip.title, "Knossos");
  assert.equal(chip.cost, 15);
  assert.equal(chip.photo_url, "https://example.com/k.jpg");
});
