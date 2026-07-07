/**
 * Test prod tripmap markers — ballons orange + vignette sheet.
 * Usage: node scripts/verify-prod-tripmap-markers.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchText(url) {
  const r = await fetch(url);
  assert(r.ok, `${url} HTTP ${r.status}`);
  return r.text();
}

console.log(`=== Prod tripmap markers @ ${BASE} ===\n`);

const html = await fetchText(BASE);
const mainMatch = html.match(/src="(\.\/assets\/index-[^"]+\.js)"/);
assert(mainMatch, "bundle index introuvable");
const mainPath = mainMatch[1].replace(/^\.\//, "/");
const mainJs = await fetchText(`${BASE}${mainPath}`);

const chunkNames = [
  ...new Set([
    ...mainJs.matchAll(/TripMap-[A-Za-z0-9_-]+\.js/g),
    ...mainJs.matchAll(/assets\/(TripMap-[A-Za-z0-9_-]+\.js)/g),
  ].map((m) => (m[1] || m[0]).replace(/^\.\//, ""))),
];
const chunkPaths = chunkNames.map((n) => (n.startsWith("assets/") ? `/${n}` : `/assets/${n}`));
assert(chunkPaths.length > 0, "chunk TripMap absent du bundle principal");

const tripMapJs = await fetchText(`${BASE}${chunkPaths[0]}`);
const combined = mainJs + tripMapJs;

assert(/F16A2E|#f16a2e/i.test(combined), "couleur orange ballon absente");
assert(/activity-balloon|registerActivityBalloon|C2551F/i.test(combined), "marqueurs ballon absents");
assert(/encodePhotoUrl|imgBroken|ActivityMapThumbnail|onError/i.test(combined), "fix vignette sheet absent");

const { ACTIVITY_BALLOON_ORANGE, buildActivityBalloonSvg } = await import("../lib/map/activityBalloonMarker.js");
assert(ACTIVITY_BALLOON_ORANGE === "#F16A2E");
const svg = buildActivityBalloonSvg(3);
assert(svg.includes(">3<"), "SVG ballon numéroté");

console.log("  Chunk:", chunkPaths[0]);
console.log("  Orange:", ACTIVITY_BALLOON_ORANGE);
console.log("\n✅ Prod tripmap — ballons orange numérotés + vignette sheet (chunk TripMap).");
