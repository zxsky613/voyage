/**
 * Vérifie le filtre P31 Wikidata must-see (whitelist visite + exclusions).
 * Usage: node scripts/verify-wikidata-must-see-types.mjs
 */
import {
  NOTABLE_TYPE_QIDS,
  EXCLUDED_MUST_SEE_TYPE_QIDS,
} from "../lib/guide/wikidataNotablePlaces.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("=== Wikidata must-see P31 filter ===\n");

assert(!NOTABLE_TYPE_QIDS.includes("Q41176"), "Q41176 building retiré de la whitelist");
assert(NOTABLE_TYPE_QIDS.includes("Q24354"), "théâtre en whitelist");
assert(NOTABLE_TYPE_QIDS.includes("Q174782"), "place en whitelist");
assert(EXCLUDED_MUST_SEE_TYPE_QIDS.includes("Q483110"), "stade exclu");
assert(EXCLUDED_MUST_SEE_TYPE_QIDS.includes("Q875538"), "université exclue");
assert(EXCLUDED_MUST_SEE_TYPE_QIDS.includes("Q16917"), "hôpital exclu");
assert(EXCLUDED_MUST_SEE_TYPE_QIDS.includes("Q55488"), "gare exclue");

const overlap = NOTABLE_TYPE_QIDS.filter((q) => EXCLUDED_MUST_SEE_TYPE_QIDS.includes(q));
assert(overlap.length === 0, `overlap whitelist/exclusions: ${overlap.join(", ")}`);

console.log("  Whitelist:", NOTABLE_TYPE_QIDS.length, "types");
console.log("  Exclusions:", EXCLUDED_MUST_SEE_TYPE_QIDS.length, "types");
console.log("\n✅ Filtre P31 must-see — orienté visite, stades/universités exclus.");
