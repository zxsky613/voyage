/**
 * Chaque clé du catalogue Wikimedia héros doit avoir des lieux incontournables
 * (évite repli « Centre historique de X » / conseils 100 % génériques).
 *
 * Usage : npm run verify:iconic-coverage
 */
import { WIKIMEDIA_CURATED_CITY_HEROES } from "../cityWikimediaHeroes.js";
import { ICONIC_PLACES_CANONICAL } from "../iconicPlacesData.js";

const heroKeys = Object.keys(WIKIMEDIA_CURATED_CITY_HEROES).sort();
const missing = [];
const tooShort = [];

for (const k of heroKeys) {
  const list = ICONIC_PLACES_CANONICAL[k];
  if (!Array.isArray(list) || list.length === 0) {
    missing.push(k);
    continue;
  }
  if (list.length < 5) tooShort.push({ k, n: list.length });
}

if (tooShort.length) {
  console.error("verify-iconic-coverage: entrées avec moins de 5 lieux (recommandé 5–7) :\n");
  for (const { k, n } of tooShort) console.error(`  ${k}: ${n}`);
  console.error("");
}

if (missing.length) {
  console.error(`verify-iconic-coverage: ${missing.length} clé(s) héros sans entrée ICONIC_PLACES_CANONICAL :\n`);
  for (const k of missing) console.error(`  ${k}`);
  process.exit(1);
}

console.error(
  `verify-iconic-coverage: OK — ${heroKeys.length} ville(s) héros couvertes (≥1 entrée iconic chacune).\n`
);
