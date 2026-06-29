/**
 * Garantit qu’aucune entrée du catalogue (ville + alias) n’est sans image héros « hors réseau »
 * (Wikimedia figé, bundle `public/destinations`, ou URL figées dans cityHeroBundled.js).
 * Utilise les mêmes clés que l’app : `buildCityHeroLookupKeys` (cityHeroStem.js).
 *
 * Usage : npm run verify:catalog-hero
 */

import { CITY_CATALOG, CITY_ALIASES } from "../cityCatalogData.js";
import { WIKIMEDIA_CURATED_CITY_HEROES } from "../cityWikimediaHeroes.js";
import {
  BUNDLED_CITY_HERO_PATHS,
  CITY_HERO_IMAGE_URLS,
  CITY_HERO_IMAGE_URL_LISTS,
} from "../cityHeroBundled.js";
import { extractCityPrompt, resolveCanonicalCity, buildCityHeroLookupKeys } from "../cityHeroStem.js";

function normalizeTextForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function urlsForHeroLookupKeys(keys) {
  const urls = [];
  const seen = new Set();
  for (const k of keys) {
    if (!k) continue;
    const curated = WIKIMEDIA_CURATED_CITY_HEROES[k];
    if (Array.isArray(curated)) {
      for (const u of curated) {
        const s = String(u || "").trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          urls.push(s);
        }
      }
    }
    const multi = CITY_HERO_IMAGE_URL_LISTS[k];
    if (multi) {
      for (const u of multi) {
        const s = String(u || "").trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          urls.push(s);
        }
      }
    }
    const one = CITY_HERO_IMAGE_URLS[k];
    if (one) {
      const s = String(one).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        urls.push(s);
      }
    }
  }
  return urls;
}

function getCityHeroImageCandidates(cityInput) {
  return urlsForHeroLookupKeys(buildCityHeroLookupKeys(cityInput));
}

function getBundledCityHeroPath(cityInput) {
  const raw = String(extractCityPrompt(cityInput) || cityInput || "").trim();
  if (!raw) return "";
  const keys = [];
  const canonical = resolveCanonicalCity(raw);
  if (canonical) keys.push(normalizeTextForSearch(canonical));
  keys.push(normalizeTextForSearch(raw));
  const firstTok = normalizeTextForSearch(raw.split(/\s+/)[0] || "");
  if (firstTok && !keys.includes(firstTok)) keys.push(firstTok);
  for (const k of keys) {
    if (!k) continue;
    const p = BUNDLED_CITY_HERO_PATHS[k];
    if (p) return String(p).trim();
  }
  return "";
}

function hasCatalogHeroForLabel(label) {
  const urls = getCityHeroImageCandidates(label);
  if (urls.length > 0) return true;
  return Boolean(getBundledCityHeroPath(label));
}

function main() {
  const missing = [];
  for (const canonical of CITY_CATALOG) {
    const labels = [canonical, ...(Array.isArray(CITY_ALIASES[canonical]) ? CITY_ALIASES[canonical] : [])];
    for (const label of labels) {
      if (!String(label || "").trim()) continue;
      if (!hasCatalogHeroForLabel(label)) {
        missing.push({ canonical, label });
      }
    }
  }
  if (missing.length) {
    console.error("verify-catalog-hero: villes / alias sans image héros figée ni bundle :\n");
    for (const m of missing) {
      console.error(`  — ${m.label} (canon : ${m.canonical})`);
    }
    process.exit(1);
  }
  console.error(`verify-catalog-hero: OK — ${CITY_CATALOG.length} ville(s), tous les alias couverts.`);
}

main();
