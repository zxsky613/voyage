import assert from "node:assert/strict";
import { test } from "node:test";
import { buildActivityPhotoFieldsForPersist } from "./activityImageSource.js";
import { inferPhotoSourceFromPlace, mapResolverSourceToPhotoSource } from "./photoSource.js";
import {
  ACTIVITY_PHOTO_SOURCE_DB_ALLOWED,
  ACTIVITY_PHOTO_SOURCE_PIPELINE_EMITTED,
  isActivityPhotoSourceDbAllowed,
} from "./activityPhotoSourceContract.js";

test("pipeline photo_source ⊆ CHECK DB allowed", () => {
  for (const v of ACTIVITY_PHOTO_SOURCE_PIPELINE_EMITTED) {
    assert.ok(
      isActivityPhotoSourceDbAllowed(v),
      `pipeline value "${v}" must be in ACTIVITY_PHOTO_SOURCE_DB_ALLOWED`
    );
  }
});

test("mapResolverSourceToPhotoSource never emits values outside DB contract", () => {
  const resolverInputs = [
    "wikidata-commons",
    "commons-category",
    "wikipedia",
    "wikivoyage",
    "unsplash",
    "fallback",
    "commons",
    "",
  ];
  for (const input of resolverInputs) {
    const out = mapResolverSourceToPhotoSource(input);
    if (out != null) {
      assert.ok(isActivityPhotoSourceDbAllowed(out), `resolver "${input}" → "${out}"`);
    }
  }
});

test("inferPhotoSourceFromPlace emits only contract values", () => {
  const cases = [
    { photos: ["https://media-cdn.tripadvisor.com/x.jpg"] },
    { photoSource: "wikimedia_geo" },
    { photoSource: "foursquare", source: "foursquare", photos: ["https://example.com/a.jpg"] },
    { photoSource: "placeholder" },
    { source: "unknown", photos: [] },
  ];
  for (const place of cases) {
    const out = inferPhotoSourceFromPlace(place);
    assert.ok(isActivityPhotoSourceDbAllowed(out), `infer → "${out}"`);
  }
});

test("buildActivityPhotoFieldsForPersist covers cascade outcomes", () => {
  const cases = [
    [{ photoSource: "tripadvisor", photos: ["https://media-cdn.tripadvisor.com/a.jpg"] }],
    [{ photoSource: "wikimedia_geo", photoUrl: "https://commons.wikimedia.org/x.jpg" }],
    [{ photoSource: "foursquare", photos: ["https://example.com/fsq.jpg"] }],
    [{ photoSource: "wikimedia" }, "https://commons.wikimedia.org/y.jpg"],
    [{ photoSource: "placeholder" }],
    [{ photos: ["https://media-cdn.tripadvisor.com/b.jpg"] }],
    [{ latitude: 43.2, longitude: 5.4, photoSource: "wikimedia_geo", photoUrl: "https://commons.wikimedia.org/z.jpg" }],
  ];
  for (const args of cases) {
    const out = buildActivityPhotoFieldsForPersist(...args);
    assert.ok(isActivityPhotoSourceDbAllowed(out.photo_source), `persist → "${out.photo_source}"`);
  }
});

test("DB allowed list is documented superset of pipeline (no surprise shrink)", () => {
  assert.ok(ACTIVITY_PHOTO_SOURCE_DB_ALLOWED.includes("user"));
  assert.equal(ACTIVITY_PHOTO_SOURCE_DB_ALLOWED.length, 6);
  assert.equal(ACTIVITY_PHOTO_SOURCE_PIPELINE_EMITTED.length, 5);
});
