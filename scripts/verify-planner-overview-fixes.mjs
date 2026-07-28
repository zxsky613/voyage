/**
 * Vérifie les 3 fixes vue d'ensemble (marqueurs, pas de route inter-jours, + hors carte).
 * Usage: npm run dev, node scripts/verify-planner-overview-fixes.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "assets");
await mkdir(outDir, { recursive: true });

/** @param {import('playwright').Page} page */
async function waitMapReady(page, scope) {
  await page.waitForSelector(`[data-preview-scope="${scope}"]`, { timeout: 20000 });
  await page.waitForSelector(`[data-effective-map-view="${scope === "trip" ? "trip" : "day"}"]`, {
    timeout: 20000,
  });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 20000 });
  await page.waitForFunction(
    () => window.__tripMap?.hasImage?.("day-pin-0-1"),
    undefined,
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);
}

/** @param {import('playwright').Page} page */
async function mapLayerState(page) {
  return page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (!map?.getLayer) return null;
    const vis = (id) => map.getLayoutProperty(id, "visibility") !== "none";
    const routeSrc = map.getSource("trip-route")?.serialize?.()?.data;
    const spiderSrc = map.getSource("trip-day-spider-lines")?.serialize?.()?.data;
    const daySrc = map.getSource("trip-days")?.serialize?.()?.data;
    return {
      routeVisible: vis("trip-route-line"),
      spiderVisible: vis("trip-day-spider-lines"),
      routeFeatures: routeSrc?.features?.length ?? 0,
      spiderFeatures: spiderSrc?.features?.length ?? 0,
      dayMarkers: daySrc?.features?.length ?? 0,
      zoom: map.getZoom(),
    };
  });
}

/** @param {string} scenario */
async function verifyScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const url = `http://localhost:5173/?preview=planner-sheet&scenario=${scenario}&scope=trip&snap=mid`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await waitMapReady(page, "trip");

  const before = await mapLayerState(page);
  await page.screenshot({
    path: path.join(outDir, `planner-overview-${scenario}-verify.png`),
    fullPage: false,
  });

  // Zoom via API (overlay UI bloque les clics Playwright sur les contrôles)
  await page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (map?.zoomIn) map.zoomIn({ duration: 300 });
  });
  await page.waitForTimeout(700);
  const zoomIn = await mapLayerState(page);
  await page.screenshot({
    path: path.join(outDir, `planner-overview-${scenario}-zoom-in.png`),
    fullPage: false,
  });

  await page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (map?.zoomOut) {
      map.zoomOut({ duration: 300 });
      setTimeout(() => map.zoomOut({ duration: 300 }), 350);
    }
  });
  await page.waitForTimeout(900);
  const zoomOut = await mapLayerState(page);

  // + button outside map (in sheet header, not inside map canvas)
  const plusInSheet = await page.locator('[aria-label="Ajouter"], [aria-label*="ctivit"]').count();
  const plusOnMap = await page.evaluate(() => {
    const canvas = document.querySelector(".maplibregl-canvas");
    if (!canvas) return 0;
    const r = canvas.getBoundingClientRect();
    return [...document.querySelectorAll("button")].filter((b) => {
      const br = b.getBoundingClientRect();
      const cx = br.left + br.width / 2;
      const cy = br.top + br.height / 2;
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom && b.querySelector("svg");
    }).length;
  });

  await page.close();

  const checks = {
    scenario,
    dayMarkers: before?.dayMarkers ?? 0,
    routeHidden: before && !before.routeVisible && before.routeFeatures === 0,
    routeStableOnZoom:
      zoomIn && zoomOut && !zoomIn.routeVisible && !zoomOut.routeVisible && zoomIn.routeFeatures === 0,
    plusOutsideMap: plusInSheet > 0 && plusOnMap === 0,
    spiderLines: before?.spiderFeatures ?? 0,
    zoomInSpider: zoomIn?.spiderFeatures ?? 0,
    zoomOutSpider: zoomOut?.spiderFeatures ?? 0,
  };

  return checks;
}

const browser = await chromium.launch();
const marseille = await verifyScenario(browser, "marseille");
const crete = await verifyScenario(browser, "crete");
await browser.close();

console.log("\n=== Vue d'ensemble — vérification fixes ===\n");

for (const r of [marseille, crete]) {
  console.log(`--- ${r.scenario} ---`);
  console.log(`  Marqueurs-jour visibles (features): ${r.dayMarkers} (attendu: 3)`);
  console.log(`  Route inter-jours masquée: ${r.routeHidden ? "OK" : "FAIL"}`);
  console.log(`  Route stable au zoom: ${r.routeStableOnZoom ? "OK" : "FAIL"}`);
  console.log(`  Bouton + hors carte: ${r.plusOutsideMap ? "OK" : "FAIL"}`);
  console.log(`  Traits spider (leader, pas route): ${r.spiderLines} → zoom ${r.zoomInSpider}/${r.zoomOutSpider}`);
  console.log("");
}

const pass =
  marseille.dayMarkers >= 3
  && crete.dayMarkers >= 3
  && marseille.routeHidden
  && crete.routeHidden
  && marseille.routeStableOnZoom
  && crete.routeStableOnZoom
  && marseille.plusOutsideMap
  && crete.plusOutsideMap;

console.log(pass ? "PASS — tous les critères OK" : "FAIL — voir détails ci-dessus");
console.log("\nCaptures: assets/planner-overview-{marseille,crete}-verify.png\n");
process.exit(pass ? 0 : 1);
