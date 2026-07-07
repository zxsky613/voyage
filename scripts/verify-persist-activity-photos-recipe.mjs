/**
 * Recette persist photos activités — champs photo_url + photo_source à l'insert calendrier.
 * Usage: node scripts/verify-persist-activity-photos-recipe.mjs
 */
import assert from "node:assert/strict";
import { buildActivityPhotoFieldsForPersist } from "../lib/planner/activityImageSource.js";

console.log("=== Recette persist photos activités ===\n");

const ta = buildActivityPhotoFieldsForPersist({
  photoSource: "tripadvisor",
  photos: ["https://media-cdn.tripadvisor.com/media/photo-s/01.jpg"],
});
assert.equal(ta.photo_url.includes("tripadvisor.com"), true);
assert.equal(ta.photo_source, "tripadvisor");
console.log("OK TA →", ta.photo_source);

const ph = buildActivityPhotoFieldsForPersist({ photoSource: "placeholder" });
assert.equal(ph.photo_url, "");
assert.equal(ph.photo_source, "placeholder");
console.log("OK placeholder sans URL");

const wiki = buildActivityPhotoFieldsForPersist(
  { photoSource: "wikimedia" },
  "https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg"
);
assert.ok(wiki.photo_url.includes("wikimedia"));
assert.equal(wiki.photo_source, "wikimedia");
console.log("OK cache modale →", wiki.photo_source.slice(0, 12));

console.log("\n✅ Recette persist — photo_url + photo_source cohérents pour insert planning.");
