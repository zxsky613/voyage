/**
 * Vérifie P1 planning overview en prod via bundle déployé (preview dev-only).
 * Usage: node scripts/verify-prod-p1-planner.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  assert(r.ok, `${url} HTTP ${r.status}`);
  return r.text();
}

async function loadTripMapChunk() {
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
  assert(chunkNames.length > 0, "chunk TripMap absent");
  const chunkPath = chunkNames[0].startsWith("assets/") ? `/${chunkNames[0]}` : `/assets/${chunkNames[0]}`;
  const tripMapJs = await fetchText(`${BASE}${chunkPath}`);
  return { mainJs, tripMapJs, chunkPath, mainPath };
}

console.log(`=== P1 prod bundle @ ${BASE} ===\n`);

let bundle = null;
for (let attempt = 1; attempt <= 18; attempt++) {
  try {
    bundle = await loadTripMapChunk();
    const combined = bundle.mainJs + bundle.tripMapJs;
    const ready =
      /day-dot|registerDayPin|buildDayPinSvg/i.test(combined)
      && /computeTripOverviewFitPadding|computeDayViewFitPadding|TRIP_OVERVIEW_MAX_ZOOM/i.test(combined);
    if (ready) break;
  } catch {
    /* retry */
  }
  console.log(`  deploy poll ${attempt}/18…`);
  await new Promise((r) => setTimeout(r, 10000));
}

assert(bundle, "impossible de charger le bundle prod");
const combined = bundle.mainJs + bundle.tripMapJs;

const checks = {
  roundColoredDayDots: /day-dot|buildDayPinSvg|registerDayPin|DAY_MARKER_PALETTE/i.test(combined),
  orangeActivityBalloons: /F16A2E|#f16a2e|activity-balloon/i.test(combined),
  noSpiderfy: !/dayMarkerSpiderfy|trip-day-spider-lines/i.test(combined),
  tripOverviewFit: /computeTripOverviewFitPadding|TRIP_OVERVIEW_MAX_ZOOM|fitTripOverview/i.test(combined),
  dayFitAsymmetric: /computeDayViewFitPadding|clampFitPadding|paddingInsets/i.test(combined),
  sheetSnapProp: /sheetSnap/i.test(combined),
};

console.log("  Chunk:", bundle.chunkPath);
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${k}: ${v ? "OK" : "FAIL"}`);
}

const pass = Object.values(checks).every(Boolean);
console.log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — prod bundle P1`);
console.log("  Note: ?preview=planner-sheet est dev-only ; vérif UI = scripts locaux post-build.");

process.exit(pass ? 0 : 1);
