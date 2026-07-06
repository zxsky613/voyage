/**
 * Recette hero v2 — émotion avant officiel ; HTTP 200 + thumb 1280 + URLs complètes.
 * Usage: node scripts/verify-hero-quality-recipe.mjs
 */
import { resolveImage } from "../api/images/_resolveImage.js";
import {
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
} from "../lib/images/wikiImageFilters.js";
import {
  HERO_COMMONS_THUMB_WIDTH,
  isAllowedThumbWidth,
  isCommonsThumbPath,
  isWikimediaUploadUrl,
} from "../lib/images/commonsThumbUrl.js";

/** @type {{ label: string, context?: string, uiLang?: string }[]} */
const CASES = [
  { label: "Crete, Greece", context: "", uiLang: "fr" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Split", context: "Croatia", uiLang: "en" },
  { label: "Ronda", context: "Spain", uiLang: "es" },
  { label: "Marseille", context: "France", uiLang: "fr" },
  { label: "Santorini", context: "Greece", uiLang: "en" },
];

const WIKI_UA = "JustTrip/1.0 (https://justtrip.fr; contact@justtrip.fr) verify-hero";

/** @param {string} url */
async function verifyThumbHttp(url) {
  const headers = { "User-Agent": WIKI_UA };
  let r = await fetch(url, { method: "HEAD", redirect: "follow", headers });
  if (r.ok) return { ok: true, status: r.status };
  if (r.status === 405 || r.status === 403) {
    r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { ...headers, Range: "bytes=0-0" },
    });
    return { ok: r.ok || r.status === 206, status: r.status };
  }
  return { ok: r.ok, status: r.status };
}

/** @param {string} url */
function thumbWidthFromUrl(url) {
  const m = String(url || "").match(/\/(\d+)px-/i);
  return m ? Number(m[1]) : 0;
}

console.log("=== Recette hero v2 (resolve API + HTTP thumb + URLs) ===\n");
console.log(`Thumb attendu: ${HERO_COMMONS_THUMB_WIDTH}px | sources émotion: commons-featured, commons-quality, geosearch\n`);

let failed = 0;
/** @type {{ label: string, heroSource: string, url: string, status: string }[]} */
const report = [];

for (const c of CASES) {
  const outcome = await resolveImage({
    kind: "hero",
    label: c.label,
    context: c.context || "",
    uiLang: c.uiLang || "fr",
  });
  const url = String(outcome.image?.url || "");
  const heroSource = String(outcome.heroSource || outcome.image?.heroSource || "fallback");
  const decoded = decodeURIComponent(url);

  if (!url) {
    console.log(`FAIL ${c.label} — fallback (pas d'URL)`);
    failed += 1;
    report.push({ label: c.label, heroSource, url: "", status: "FAIL" });
    continue;
  }

  const isCommons = isWikimediaUploadUrl(url);
  const satellite = isLikelyOrbitalOrMapImagery(url, decoded, "");
  const scenicBad =
    isLikelyNonScenicHeroImagery(url, decoded) ||
    /besser|toilet|wc|restroom|lavatory/i.test(decoded);
  const width = isCommons ? thumbWidthFromUrl(url) : 0;
  const widthOk =
    !isCommons ||
    (isCommonsThumbPath(url) && width === HERO_COMMONS_THUMB_WIDTH && isAllowedThumbWidth(width));

  let httpStatus = 0;
  let httpOk = !isCommons;
  if (isCommons) {
    try {
      const http = await verifyThumbHttp(url);
      httpStatus = http.status;
      httpOk = http.ok;
    } catch {
      httpOk = false;
    }
  }

  const officialOnly = heroSource === "pageimage" || heroSource === "p18";
  const bad = satellite || scenicBad || !widthOk || (isCommons && !httpOk);
  const status = bad ? "FAIL" : "OK";
  if (bad) failed += 1;

  console.log(`${status} | ${c.label} | ${heroSource} | HTTP ${httpStatus || "—"} | ${width || "—"}px${officialOnly ? " (officiel)" : ""}`);
  console.log(`  ${url}\n`);
  report.push({ label: c.label, heroSource, url, status });
}

console.log("--- Résumé URLs (jugement visuel) ---");
for (const row of report) {
  console.log(`${row.label}: [${row.status}] ${row.heroSource}`);
  console.log(row.url || "(vide)");
  console.log("");
}

if (failed) {
  console.error(`verify-hero-quality-recipe: ${failed} échec(s)`);
  process.exit(1);
}
console.log("verify-hero-quality-recipe: OK");
