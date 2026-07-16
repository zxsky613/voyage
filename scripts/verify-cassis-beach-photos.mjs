/**
 * Vérifie top-up catalog + photos pour plages Cassis (coordless → geocode → geo photo).
 */
import { topUpPlaceCatalogCoords } from "../api/planner/_catalogCoordsTopUp.js";
import { resolveActivityPhotosForPlaces } from "../api/planner/_resolveActivityPhotos.js";

async function mockEstimate(places, destination, country) {
  return { places, estimated: 0 };
}

const beaches = [
  { id: "c1", name: "Plage de la Grande Mer", searchName: "Plage de la Grande Mer", category: "beach" },
  { id: "c2", name: "Plage du Bestouan", searchName: "Plage du Bestouan", category: "beach" },
];

console.log("=== Cassis coordless catalog → top-up geocode → photos ===\n");

const topUp = await topUpPlaceCatalogCoords(beaches, {
  destination: "Cassis",
  country: "France",
  estimateMissingCoordsWithLlm: mockEstimate,
});

console.log("top-up:", {
  coordlessBefore: topUp.coordlessBefore,
  geocodeSucceeded: topUp.geocodeStats?.succeeded,
  stillWithoutCoordsAtPhoto: topUp.stillWithoutCoordsAtPhoto,
});

for (const p of topUp.places) {
  console.log(
    " coords",
    p.name,
    p.latitude != null ? `${p.latitude},${p.longitude}` : "NONE",
    p.source || ""
  );
}

const photos = await resolveActivityPhotosForPlaces(topUp.places, {
  city: "Cassis",
  country: "France",
  uiLang: "fr",
  concurrency: 2,
});

console.log("\nphotos:", photos.photoSourceCounts);
for (const p of photos.places) {
  const url = String(p.photoUrl || "");
  console.log(
    p.name,
    p.photoSource,
    url ? url.split("/").pop()?.slice(0, 55) : "EMPTY"
  );
}

const ok = photos.places.every((p) => p.photoSource === "wikimedia_geo" && p.photoUrl);
if (!ok) {
  console.error("\nFAIL: expected wikimedia_geo for both beaches");
  process.exit(1);
}
console.log("\nOK: Grande Mer + Bestouan have geo photos");
