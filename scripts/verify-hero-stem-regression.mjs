/**
 * Régressions ciblées — collisions géographique vs alias catalogue (Guangzhou / « Canton »).
 * Usage : npm run verify:hero-stem
 */

import { buildCityHeroLookupKeys, heroImageStemFromDestination, buildNominatimCityQuery, buildCityImageCacheKey } from "../cityHeroStem.js";
import { resolveHeroLookupLabel } from "../i18n/cityDisplay.js";

function fail(msg) {
  console.error(`verify-hero-stem: ${msg}`);
  process.exit(1);
}

function main() {
  const aigle = buildCityHeroLookupKeys("Aigle, Canton de Vaud, Suisse");
  if (aigle.includes("canton") || aigle.includes("kwangchow")) {
    fail(`« Aigle, Canton… » ne doit pas produire les clés alias Guangzhou (obtenu : ${aigle.join(", ")})`);
  }

  const cantonCn = buildCityHeroLookupKeys("Canton, Guangdong, China");
  if (!cantonCn.includes("canton")) fail(`« Canton, Guangdong » doit encore résoudre l’alias canton`);

  const mykonos = buildCityHeroLookupKeys("Mon été à Mykonos, Cyclades");
  if (!mykonos.includes("mykonos")) {
    fail(`titre voyage doit garder « mykonos » dans les clés (obtenu : ${mykonos.join(", ")})`);
  }

  const creteLabel = resolveHeroLookupLabel("克里特, Crete, 希腊");
  if (creteLabel !== "Crete") {
    fail(`« 克里特, Crete, 希腊 » doit résoudre « Crete » (obtenu : ${creteLabel})`);
  }
  const creteKeys = buildCityHeroLookupKeys("克里特, Crete, 希腊");
  if (!creteKeys.includes("crete")) {
    fail(`Crète doit produire la clé « crete » (obtenu : ${creteKeys.join(", ")})`);
  }

  const creteZh = resolveHeroLookupLabel("克里特岛");
  if (creteZh !== "Crete") {
    fail(`« 克里特岛 » doit résoudre « Crete » (obtenu : ${creteZh})`);
  }

  const capriStem = heroImageStemFromDestination("Ville de Capri, Campanie, Italie");
  if (capriStem !== "Capri") {
    fail(`« Ville de Capri, Campanie, Italie » doit donner la tige « Capri » (obtenu : ${capriStem})`);
  }
  const capriNom = buildNominatimCityQuery("Ville de Capri, Campanie, Italie");
  if (!/capri/i.test(capriNom) || !/ital/i.test(capriNom)) {
    fail(`requête Nominatim Capri doit inclure Capri + Italie (obtenu : ${capriNom})`);
  }
  const creteZhKeys = buildCityHeroLookupKeys("克里特岛");
  if (!creteZhKeys.includes("crete")) {
    fail(`« 克里特岛 » doit produire la clé « crete » (obtenu : ${creteZhKeys.join(", ")})`);
  }

  const capriHnKey = buildCityImageCacheKey("Capri, Gracias a Dios, Honduras");
  const capriItKey = buildCityImageCacheKey("Capri, Campania, Italie");
  if (capriHnKey === capriItKey) {
    fail(`clés cache Capri HN vs IT doivent différer (obtenu : ${capriHnKey})`);
  }
  if (!/honduras/.test(capriHnKey)) {
    fail(`clé cache Capri HN doit inclure le contexte Honduras (obtenu : ${capriHnKey})`);
  }

  console.error("verify-hero-stem: OK");
}

main();
