/**
 * Recette qualité héros — Crète + hors catalogue + régression catalogue (resolve API).
 * Usage: node scripts/verify-hero-quality-recipe.mjs
 */
import { resolveImage } from "../api/images/_resolveImage.js";
import { isLikelyNonScenicHeroImagery } from "../lib/images/wikiImageFilters.js";
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
];

const WIKI_UA = "JustTrip/1.0 (https://justtrip.fr; contact@justtrip.fr) verify-hero";

/**
 * Vérifie que la miniature Commons répond 200 (HEAD, repli GET partiel).
 * @param {string} url
 */
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

console.log("=== Recette hero-quality (resolve API + HTTP thumb) ===\n");
console.log(`Hero thumb width attendu: ${HERO_COMMONS_THUMB_WIDTH}px (standard w.wiki/GHai)\n`);
console.log("| Destination | heroSource | HTTP | width | size | status |");
console.log("|-------------|------------|------|-------|------|--------|");

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

  if (!url) {
    console.log(`| ${c.label} | ${heroSource} | — | — | — | fallback |`);
    continue;
  }

  const scenicBad =
    isLikelyNonScenicHeroImagery(url, decodeURIComponent(url)) ||
    /besser|toilet|wc|restroom|lavatory/i.test(decodeURIComponent(url));

  const width = isCommons ? thumbWidthFromUrl(url) : 0;
  const widthOk = !isCommons || (isCommonsThumbPath(url) && width === HERO_COMMONS_THUMB_WIDTH && isAllowedThumbWidth(width));

  let httpStatus = "—";
  let httpOk = !isCommons;
  let sizeKb = "—";

  if (isCommons) {
    try {
      const http = await verifyThumbHttp(url);
      httpStatus = String(http.status);
      httpOk = http.ok;
      if (http.ok) {
        const head = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": WIKI_UA } });
        const cl = Number(head.headers.get("content-length") || 0);
        if (cl > 0) sizeKb = `${Math.round(cl / 1024)} Ko`;
      }
    } catch (err) {
      httpStatus = "err";
      httpOk = false;
    }
  }

  const bad = scenicBad || !widthOk || (isCommons && !httpOk);
  const status = bad ? "FAIL" : "OK";
  if (bad) failed += 1;

  console.log(
    `| ${c.label} | ${heroSource} | ${httpStatus} | ${width || "—"} | ${sizeKb} | ${status} |`
  );
  if (bad && url) {
    console.log(`  url: ${url.slice(0, 100)}`);
  }
}

console.log("");
if (failed) {
  console.error(`verify-hero-quality-recipe: ${failed} échec(s)`);
  process.exit(1);
}
console.log("verify-hero-quality-recipe: OK");
