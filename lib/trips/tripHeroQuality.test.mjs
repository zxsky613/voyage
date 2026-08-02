import test from "node:test";
import assert from "node:assert/strict";
import {
  isBlockedTripHeroUrl,
  isValidPersistedTripHeroUrl,
  readTripHeroUrlFromTrip,
} from "./tripHeroQuality.js";
import { readGuideHeroCandidate } from "./applyCreateTripHeroCandidate.js";

test("isBlockedTripHeroUrl — satellite et drapeau", () => {
  assert.equal(
    isBlockedTripHeroUrl(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Satellite_view_of_Marseille.jpg/1280px-Satellite_view_of_Marseille.jpg"
    ),
    true
  );
  assert.equal(
    isBlockedTripHeroUrl("https://upload.wikimedia.org/wikipedia/commons/flag_of_france.svg"),
    true
  );
});

test("isValidPersistedTripHeroUrl — HTTPS non bloqué", () => {
  assert.equal(
    isValidPersistedTripHeroUrl(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg/1280px-Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg"
    ),
    true
  );
  assert.equal(isValidPersistedTripHeroUrl(""), false);
});

test("readTripHeroUrlFromTrip — ignore legacy empoisonné", () => {
  const blocked =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Satellite_view_of_Marseille.jpg/1280px-Satellite_view_of_Marseille.jpg";
  assert.equal(readTripHeroUrlFromTrip({ hero_image_url: blocked }), "");
  const ok =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg/1280px-Hafen_von_Marseille-Notre_Dame_de_la_Garde.jpg";
  assert.equal(readTripHeroUrlFromTrip({ hero_image_url: ok }), ok);
});

test("readGuideHeroCandidate — pas hero_image_url insert", () => {
  assert.equal(readGuideHeroCandidate({ guideHeroCandidateUrl: "https://example.com/a.jpg" }), "https://example.com/a.jpg");
  assert.equal(readGuideHeroCandidate({ hero_image_url: "https://example.com/b.jpg" }), "");
});
