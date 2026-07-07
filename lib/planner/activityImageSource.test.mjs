import test from "node:test";
import assert from "node:assert/strict";
import {
  pickTripAdvisorActivityPhoto,
  pickActivityDisplayPhotoUrl,
  shouldShowTripAdvisorAttribution,
  buildActivityPhotoFieldsForPersist,
} from "./activityImageSource.js";

test("pickTripAdvisorActivityPhoto returns first http URL from photos[]", () => {
  const url = pickTripAdvisorActivityPhoto({
    photos: ["", "https://media.tripadvisor.com/a.jpg", "https://media.tripadvisor.com/b.jpg"],
  });
  assert.equal(url, "https://media.tripadvisor.com/a.jpg");
});

test("pickActivityDisplayPhotoUrl prefers TripAdvisor over stored", () => {
  assert.equal(
    pickActivityDisplayPhotoUrl(
      { photos: ["https://ta.example/1.jpg"] },
      "https://wiki.example/x.jpg"
    ),
    "https://ta.example/1.jpg"
  );
});

test("shouldShowTripAdvisorAttribution when display URL is TA photo", () => {
  const meta = { photos: ["https://ta.example/hero.jpg"], tripadvisorUrl: "https://ta.example/p/1" };
  assert.equal(shouldShowTripAdvisorAttribution(meta, "https://ta.example/hero.jpg"), true);
  assert.equal(shouldShowTripAdvisorAttribution(meta, "https://other.example/x.jpg"), false);
});

test("buildActivityPhotoFieldsForPersist uses meta photoSource and TA URL", () => {
  const out = buildActivityPhotoFieldsForPersist({
    photoSource: "tripadvisor",
    photos: ["https://media-cdn.tripadvisor.com/media/photo-s/01.jpg"],
  });
  assert.equal(out.photo_url, "https://media-cdn.tripadvisor.com/media/photo-s/01.jpg");
  assert.equal(out.photo_source, "tripadvisor");
});

test("buildActivityPhotoFieldsForPersist respects placeholder without cache", () => {
  const out = buildActivityPhotoFieldsForPersist({ photoSource: "placeholder" });
  assert.equal(out.photo_url, "");
  assert.equal(out.photo_source, "placeholder");
});

test("buildActivityPhotoFieldsForPersist falls back to modal cache URL", () => {
  const out = buildActivityPhotoFieldsForPersist(
    { photoSource: "wikimedia" },
    "https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg"
  );
  assert.equal(out.photo_url, "https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg");
  assert.equal(out.photo_source, "wikimedia");
});
