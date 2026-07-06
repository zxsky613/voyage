/**
 * Recette qualité héros — Crète + hors catalogue + régression catalogue (resolve API).
 * Usage: node scripts/verify-hero-quality-recipe.mjs
 */
import { resolveImage } from "../api/images/_resolveImage.js";
import { isLikelyNonScenicHeroImagery } from "../lib/images/wikiImageFilters.js";
import {
  isCommonsThumbPath,
  isWikimediaUploadUrl,
} from "../lib/images/commonsThumbUrl.js";

/** @type {{ label: string, context?: string, uiLang?: string }[]} */
const CASES = [
  { label: "Crete, Greece", context: "", uiLang: "fr" },
  { label: "Annecy", context: "France", uiLang: "fr" },
  { label: "Split", context: "Croatia", uiLang: "en" },
  { label: "Ronda", context: "Spain", uiLang: "es" },
  { label: "Paris", context: "France", uiLang: "fr" },
  { label: "Barcelona", context: "Spain", uiLang: "es" },
];

/** @param {string} url */
async function fetchImageBytes(url) {
  const head = await fetch(url, { method: "HEAD", redirect: "follow" });
  if (head.ok) {
    const cl = Number(head.headers.get("content-length") || 0);
    if (cl > 0) return cl;
  }
  const r = await fetch(url, { method: "GET", redirect: "follow" });
  const buf = await r.arrayBuffer();
  return buf.byteLength;
}

console.log("=== Recette hero-quality (resolve API) ===\n");
console.log("| Destination | heroSource | status | thumb | size | URL (trunc) |");
console.log("|-------------|------------|--------|-------|------|-------------|");

let failed = 0;

for (const c of CASES) {
  const outcome = await resolveImage({
    kind: "hero",
    label: c.label,
    context: c.context || "",
    uiLang: c.uiLang || "fr",
  });
  const url = String(outcome.image?.url || "");
  const heroSource = String(outcome.heroSource || outcome.image?.heroSource || "fallback");
  const isCommons = isWikimediaUploadUrl(url);
  const thumbOk = !isCommons || isCommonsThumbPath(url);
  const scenicBad =
    url &&
    (isLikelyNonScenicHeroImagery(url, decodeURIComponent(url)) ||
      /besser|toilet|wc|restroom|lavatory/i.test(decodeURIComponent(url)));
  let sizeKb = "—";
  if (url && isCommons) {
    try {
      const bytes = await fetchImageBytes(url);
      sizeKb = `${Math.round(bytes / 1024)} Ko`;
      if (bytes > 512000) failed += 1;
    } catch {
      sizeKb = "err";
      failed += 1;
    }
  }
  const bad = scenicBad || (isCommons && !thumbOk);
  const status = bad ? "FAIL" : url ? "OK" : "fallback";
  if (bad) failed += 1;
  console.log(
    `| ${c.label} | ${heroSource} | ${status} | ${thumbOk ? "yes" : "no"} | ${sizeKb} | ${url ? url.slice(0, 56) : "—"} |`
  );
}

console.log("");
if (failed) {
  console.error(`verify-hero-quality-recipe: ${failed} échec(s)`);
  process.exit(1);
}
console.log("verify-hero-quality-recipe: OK");
