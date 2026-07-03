import test from "node:test";
import assert from "node:assert/strict";
import {
  pickTripAdvisorActivityPhoto,
  pickActivityDisplayPhotoUrl,
  shouldShowTripAdvisorAttribution,
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
