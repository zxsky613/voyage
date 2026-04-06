/**
 * Audit heuristique des **premières** URLs du catalogue (complète `verify:city-heroes`).
 * Critères alignés sur l’en-tête de `cityWikimediaHeroes.js` : préférer le jour lisible ;
 * stations balnéaires = mer / plage / front de mer en tête quand c’est possible.
 *
 * Usage : npm run audit:city-heroes
 */

import { WIKIMEDIA_CURATED_CITY_HEROES } from "../cityWikimediaHeroes.js";

const NIGHT_HINT = /night|nocturne|twilight|coucher|dusk|crepuscule|blue.?hour|after_?dark|by_?night|_night\.|at_?night/i;

const COASTAL_KEYS = new Set(
  [
    "miami",
    "barcelone",
    "barcelona",
    "nice",
    "marseille",
    "lisbonne",
    "lisbon",
    "rio de janeiro",
    "sydney",
    "dubai",
    "bali",
    "cape town",
    "los angeles",
    "san francisco",
    "honolulu",
    "cancun",
    "phuket",
    "naples",
    "napoli",
    "venice",
    "venise",
    "amalfi",
    "porto",
    "athens",
    "athenes",
    "istanbul",
    "tel aviv",
    "mumbai",
    "hong kong",
    "singapour",
    "singapore",
    "seattle",
    "copenhague",
    "copenhagen",
    "stockholm",
    "oslo",
    "helsinki",
    "vancouver",
    "san diego",
    "havana",
    "la havane",
    "cartagena",
    "dubrovnik",
    "split",
    "mykonos",
    "myconos",
    "santorini",
    "casablanca",
    "tunis",
    "alger",
    "dakar",
    "mombasa",
    "zanzibar",
    "goa",
    "colombo",
    "abu dhabi",
    "doha",
    "yokohama",
    "osaka",
    "busan",
    "shanghai",
    "qingdao",
    "cannes",
    "monaco",
    "bordeaux",
    "jakarta",
    "auckland",
  ].map((s) => s.toLowerCase())
);

const WATER_HINT =
  /beach|plage|promenade|_sea|ocean|pacific|atlantic|mediterr|aegean|biscayne|bay|gulf|harbo?u?r|hafen|waterfront|coast|c[oô]te|rivage|canal|marina|shore|baie|surf|dock|pier|island|oper|ribeira|rabelos|bel[eé]m|torre_de_bel|golden_gate|bosph|skyline_from.*bridge|from.*beach|southbeach|croisette|anglais|venice|venise|mykonos|phuket|bali|dhow|corniche|palm_jumeirah|marina_bay|canada_place|table_mountain|pudong|huangpu|christ_the|burj|monaco|jakarta_panorama/i;

/** Côte + monument iconique en tête : OK selon les critères (pas seulement « plage »). */
const MONUMENT_FIRST_COASTAL = new Set(
  [
    "barcelona",
    "barcelone",
    "osaka",
    "bordeaux",
    "athens",
    "athenes",
    "abu dhabi",
    "doha",
    "auckland",
    "tunis",
    "alger",
    "istanbul",
  ].map((s) => s.toLowerCase())
);

function main() {
  const nightFirst = [];
  const coastalNoWaterHint = [];

  for (const [city, urls] of Object.entries(WIKIMEDIA_CURATED_CITY_HEROES)) {
    const first = String(urls?.[0] || "").trim();
    if (!first) continue;
    const key = city.toLowerCase();
    if (NIGHT_HINT.test(first)) {
      nightFirst.push({ city, url: first });
    }
    if (
      COASTAL_KEYS.has(key) &&
      !MONUMENT_FIRST_COASTAL.has(key) &&
      !WATER_HINT.test(first)
    ) {
      coastalNoWaterHint.push({ city, url: first });
    }
  }

  console.error(`audit-city-heroes: ${Object.keys(WIKIMEDIA_CURATED_CITY_HEROES).length} ville(s) dans le catalogue\n`);

  if (nightFirst.length) {
    console.error("--- Première URL avec indice « nuit / crépuscule » (à vérifier manuellement) ---\n");
    for (const { city, url } of nightFirst) {
      console.error(`[${city}]\n  ${url}\n`);
    }
  } else {
    console.error("Aucune première URL ne matche les indices nuit/crépuscule.\n");
  }

  if (coastalNoWaterHint.length) {
    console.error(
      "--- Villes côtières : première URL sans mot-clé mer/plage/canal (indicatif seulement) ---\n"
    );
    for (const { city, url } of coastalNoWaterHint) {
      console.error(`[${city}]\n  ${url}\n`);
    }
  } else {
    console.error(
      "Aucune alerte côte : 1re URL = eau/plage/canal (mots-clés) ou ville en « monument côtier » explicite.\n"
    );
  }
}

main();
