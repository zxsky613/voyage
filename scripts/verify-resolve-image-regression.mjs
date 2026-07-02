// @ts-check
/**
 * Non-régression resolveImage — filtres orbitaux + contexte géographique.
 * Usage: node scripts/verify-resolve-image-regression.mjs
 * Live Wikidata/API: VERIFY_RESOLVE_LIVE=1 node scripts/verify-resolve-image-regression.mjs
 */
import {
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
  isOrbitalCommonsCategoryName,
  scoreScenicCommonsFile,
} from "../lib/images/wikiImageFilters.js";
import {
  normalizeLabelKey,
  splitResolveImageLabelContext,
} from "../lib/images/normalizeLabel.js";
import { resolveEntity } from "../api/images/_entityResolver.js";
import { resolveImage } from "../api/images/_resolveImage.js";
import { buildCityHeroUnsplashQuery } from "../cityDroneImagePrompt.js";
import { buildCityImageCacheKey } from "../cityHeroStem.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Rejet héro : carte, logo, drapeau ou SVG vectoriel. */
function isRejectedHeroImage(url, fileTitle) {
  return (
    isLikelyWikiBrandOrLogoImage(url, fileTitle) ||
    isLikelyOrbitalOrMapImagery(url, fileTitle, "")
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("verify-resolve-image: unit tests…");

assert(
  isLikelyOrbitalOrMapImagery("", "Crete_from_space_ISS.jpg"),
  "ISS / from space filename"
);
assert(
  isLikelyOrbitalOrMapImagery("https://upload.wikimedia.org/x/Sentinel-2_Crete.jpg", ""),
  "Sentinel filename"
);
assert(
  isLikelyOrbitalOrMapImagery("", "", "Satellite pictures of Crete"),
  "satellite category"
);
assert(!isLikelyOrbitalOrMapImagery("", "Harbour_of_Heraklion.jpg"), "harbour not orbital");
assert(isOrbitalCommonsCategoryName("Maps of Capri"), "maps category");

const satScore = scoreScenicCommonsFile("Crete_satellite_view.jpg", "https://x/y.jpg", 2000, 1200, {
  hero: true,
});
const groundScore = scoreScenicCommonsFile("Harbour_Crete_panorama.jpg", "https://x/z.jpg", 2000, 1200, {
  hero: true,
});
assert(satScore < 0, "satellite hero score negative");
assert(groundScore > 0, "ground hero score positive");

const svgScore = scoreScenicCommonsFile("Apulia in Italy.svg", "https://x/a.svg.png", 2000, 1200, {
  hero: true,
});
const photoScore = scoreScenicCommonsFile("Polignano a Mare, Puglia.jpg", "https://x/p.jpg", 2000, 1200, {
  hero: true,
});
assert(svgScore < 0, "SVG locator hero score must be strongly negative");
assert(photoScore > 0, "JPEG hero should score well (photo bias)");

const mustReject = [
  ["", "File:Apulia in Italy.svg"],
  ["", "File:Phuket in Thailand.svg"],
  ["", "File:Bavaria in Germany.svg"],
  ["", "File:Hokkaido in Japan.svg"],
  ["", "File:Andalusia in Spain.svg"],
  ["", "File:California in the United States.svg"],
  ["", "File:Nairobi County in Kenya.svg"],
  ["", "File:São Paulo in Brazil.svg"],
  ["", "File:São Paulo location map.svg"],
  [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Some_Region_locator.svg.png/640px-Some_Region_locator.svg.png",
    "",
  ],
  ["", "File:Country location map generic.svg"],
  ["", "File:Flag of Anywhere.svg"],
  ["", "File:Coat of arms of Somewhere.svg"],
];
for (const [url, title] of mustReject) {
  assert(isRejectedHeroImage(url, title), `must reject: ${title || url}`);
}

const mustKeep = [
  ["https://upload.wikimedia.org/x/Polignano.jpg", "File:Polignano a Mare, Puglia.jpg"],
  ["https://upload.wikimedia.org/x/Frejus.jpg", "File:Fréjus port.jpg"],
  ["https://upload.wikimedia.org/x/Avignon.jpg", "File:Avignon Palais des Papes.jpg"],
  ["https://upload.wikimedia.org/x/Kyoto.jpg", "File:Kyoto Fushimi Inari.jpg"],
  ["https://upload.wikimedia.org/x/CapeTown.jpg", "File:Cape Town Table Mountain.jpg"],
  ["https://upload.wikimedia.org/x/Rio.jpg", "File:Rio de Janeiro Copacabana.jpg"],
  ["https://upload.wikimedia.org/x/Bangkok.jpg", "File:Bangkok Grand Palace.jpeg"],
  ["https://upload.wikimedia.org/x/Munich.webp", "File:Munich Marienplatz.webp"],
];
for (const [url, title] of mustKeep) {
  assert(!isRejectedHeroImage(url, title), `must keep photo: ${title}`);
}

const capriSplit = splitResolveImageLabelContext("Capri, Gracias a Dios, Honduras", "");
assert(capriSplit.searchLabel === "Capri", "Capri label stem");
assert(/honduras/i.test(capriSplit.context), "Capri HN context preserved");

const capriIt = splitResolveImageLabelContext("Capri, Campania, Italie", "");
assert(/italie|campania/i.test(capriIt.context), "Capri IT context");

const creteKeys = ["Crete", "Crète", "克里特岛"].map((l) => normalizeLabelKey(l, ""));
assert(new Set(creteKeys).size === 1, `Crete cache keys differ: ${creteKeys.join(" | ")}`);

assert(
  normalizeLabelKey("Capri, Gracias a Dios, Honduras", "") !==
    normalizeLabelKey("Capri, Campania, Italie", ""),
  "Capri HN vs IT cache keys must differ"
);

assert(
  buildCityImageCacheKey("Capri, Gracias a Dios, Honduras") !==
    buildCityImageCacheKey("Capri, Campania, Italie"),
  "Capri HN vs IT hero image cache keys must differ"
);

const capriHnQuery = buildCityHeroUnsplashQuery("Capri, Gracias a Dios, Honduras");
assert(/honduras/i.test(capriHnQuery), "Capri HN Unsplash query must mention Honduras");
assert(!/faraglioni|amalfi|blue grotto/i.test(capriHnQuery), "Capri HN query must not use IT landmarks");

console.log("verify-resolve-image: unit OK");

const live = process.env.VERIFY_RESOLVE_LIVE === "1" || process.env.VERIFY_RESOLVE_LIVE === "true";
if (!live) {
  console.log("verify-resolve-image: skip live (set VERIFY_RESOLVE_LIVE=1 for Wikidata/API)");
  process.exit(0);
}

async function liveResolveEntity(...args) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(2500 * attempt);
    const ent = await resolveEntity(...args);
    if (ent?.qid) return ent;
  }
  return null;
}

console.log("verify-resolve-image: live tests (slow, rate-limit aware)…");

await sleep(1200);

const creteEntity = await liveResolveEntity("Crete", "en", "hero", "Greece");
assert(
  creteEntity?.qid === "Q34374",
  `Crete (Greece) entity expected Q34374, got ${creteEntity?.qid || "null"}`
);

await sleep(1200);

const capriItEntity = await liveResolveEntity("Capri", "fr", "hero", "Campania, Italie");
assert(
  capriItEntity?.qid === "Q173292" || capriItEntity?.qid === "Q71902",
  `Capri IT expected Q173292/Q71902, got ${capriItEntity?.qid || "null"}`
);

await sleep(1200);

const capriHnEntity = await liveResolveEntity("Capri", "en", "hero", "Gracias a Dios, Honduras");
assert(
  !capriHnEntity || (capriHnEntity.qid !== "Q173292" && capriHnEntity.qid !== "Q71902"),
  `Capri HN must not resolve Italian Capri (got ${capriHnEntity?.qid})`
);

await sleep(1500);

const creteHero = await resolveImage({
  kind: "hero",
  label: "Crete, Greece",
  context: "",
  uiLang: "en",
});
assert(creteHero?.url, "Crete hero should resolve an URL");
assert(
  !isLikelyOrbitalOrMapImagery(creteHero.url, creteHero.url),
  `Crete hero must not be orbital: ${creteHero.url.slice(0, 80)}`
);

console.log("verify-resolve-image: live OK");
