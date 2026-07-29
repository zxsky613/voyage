/**
 * Vérifie vue d'ensemble : pastilles-jour stables, pas de route inter-jours, + hors carte.
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
    () => window.__tripMap?.hasImage?.("day-dot-0-1"),
    undefined,
    { timeout: 20000 }
  );
  await page.waitForFunction(
    () =>
      window.__tripMap?.getLayoutProperty?.("trip-day-pins", "icon-anchor") === "center",
    undefined,
    { timeout: 10000 }
  );
  await page.waitForTimeout(2500);
}

/** @param {import('playwright').Page} page */
async function dayMarkerCoords(page) {
  return page.evaluate(() => {
    const src = window.__tripMap?.getSource?.("trip-days")?.serialize?.()?.data;
    return (src?.features || [])
      .map((f) => ({
        label: f.properties?.label,
        lon: f.geometry?.coordinates?.[0],
        lat: f.geometry?.coordinates?.[1],
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  });
}

/** @param {import('playwright').Page} page */
async function dayMarkersInFrame(page) {
  return page.evaluate(() => {
    const map = window.__tripMap;
    const canvas = document.querySelector(".maplibregl-canvas");
    const shell = document.querySelector("[data-effective-map-view='trip']");
    const overlay = shell?.querySelector(".pointer-events-none.absolute");
    const canvasRect = canvas?.getBoundingClientRect();
    const overlayRect = overlay?.getBoundingClientRect();
    if (!map || !canvasRect) return { ok: false, reason: "no-map" };

    const MARKER_R = 24;
    const SIDE = 36;
    const BOTTOM = 28;
    const overlayBottom =
      overlayRect && canvasRect ? overlayRect.bottom - canvasRect.top : 96;
    const w = canvasRect.width;
    const h = canvasRect.height;
    const src = map.getSource("trip-days")?.serialize?.()?.data;
    const positions = (src?.features || []).map((f) => {
      const p = map.project(f.geometry.coordinates);
      return {
        label: f.properties?.label,
        x: p.x,
        y: p.y,
        inFrame:
          p.x - MARKER_R >= SIDE
          && p.x + MARKER_R <= w - SIDE
          && p.y - MARKER_R >= overlayBottom + 2
          && p.y + MARKER_R <= h - BOTTOM,
      };
    });

    return {
      ok: positions.length >= 2 && positions.every((p) => p.inFrame),
      positions,
      w,
      h,
      overlayBottom,
      zoom: map.getZoom(),
    };
  });
}

/** @param {import('playwright').Page} page */
async function mapLayerState(page) {
  return page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (!map?.getLayer) return null;
    const vis = (id) => {
      if (!map.getLayer(id)) return false;
      return map.getLayoutProperty(id, "visibility") !== "none";
    };
    const routeSrc = map.getSource("trip-route")?.serialize?.()?.data;
    const daySrc = map.getSource("trip-days")?.serialize?.()?.data;
    return {
      routeVisible: vis("trip-route-line"),
      routeFeatures: routeSrc?.features?.length ?? 0,
      dayMarkers: daySrc?.features?.length ?? 0,
      spiderLayer: Boolean(map.getLayer("trip-day-spider-lines")),
      anchorCenter:
        map.getLayer("trip-day-pins")
        && map.getLayoutProperty("trip-day-pins", "icon-anchor") === "center",
      zoom: map.getZoom(),
    };
  });
}

/** @param {string} scenario */
async function verifyScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const url = `http://localhost:5173/?preview=planner-sheet&scenario=${scenario}&scope=trip&snap=collapsed`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await waitMapReady(page, "trip");

  const coordsBefore = await dayMarkerCoords(page);
  const before = await mapLayerState(page);
  const frameBefore = await dayMarkersInFrame(page);
  await page.screenshot({
    path: path.join(outDir, `planner-overview-${scenario}-verify.png`),
    fullPage: false,
  });

  await page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (map?.zoomIn) map.zoomIn({ duration: 0 });
    if (map?.zoomIn) map.zoomIn({ duration: 0 });
  });
  await page.waitForTimeout(500);
  const coordsZoomIn = await dayMarkerCoords(page);
  const zoomIn = await mapLayerState(page);
  await page.screenshot({
    path: path.join(outDir, `planner-overview-${scenario}-zoom-in.png`),
    fullPage: false,
  });

  await page.evaluate(() => {
    /** @type {any} */
    const map = window.__tripMap;
    if (map?.zoomOut) {
      map.zoomOut({ duration: 0 });
      map.zoomOut({ duration: 0 });
    }
  });
  await page.waitForTimeout(500);
  const coordsZoomOut = await dayMarkerCoords(page);

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

  const geoStable =
    JSON.stringify(coordsBefore) === JSON.stringify(coordsZoomIn)
    && JSON.stringify(coordsBefore) === JSON.stringify(coordsZoomOut);

  return {
    scenario,
    dayMarkers: before?.dayMarkers ?? 0,
    routeHidden: before && !before.routeVisible && before.routeFeatures === 0,
    noSpiderLayer: before && !before.spiderLayer,
    anchorCenter: before?.anchorCenter ?? false,
    geoStable,
    plusOutsideMap: plusInSheet > 0 && plusOnMap === 0,
    allMarkersInFrame: frameBefore.ok,
    frameZoom: frameBefore.zoom,
    coordsBefore,
  };
}

const browser = await chromium.launch();
const marseille = await verifyScenario(browser, "marseille");
const crete = await verifyScenario(browser, "crete");
await browser.close();

console.log("\n=== Vue d'ensemble — pastilles stables ===\n");

for (const r of [marseille, crete]) {
  console.log(`--- ${r.scenario} ---`);
  console.log(`  Marqueurs-jour: ${r.dayMarkers} (attendu: 3)`);
  console.log(`  Ancrage center (centroïde): ${r.anchorCenter ? "OK" : "FAIL"}`);
  console.log(`  Coords geo stables au zoom: ${r.geoStable ? "OK" : "FAIL"}`);
  console.log(`  Pas de couche spider: ${r.noSpiderLayer ? "OK" : "FAIL"}`);
  console.log(`  Route inter-jours masquée: ${r.routeHidden ? "OK" : "FAIL"}`);
  console.log(`  Tous marqueurs dans le cadre: ${r.allMarkersInFrame ? "OK" : "FAIL"} (zoom ${r.frameZoom?.toFixed?.(2) ?? "?"})`);
  console.log(`  Bouton + hors carte: ${r.plusOutsideMap ? "OK" : "FAIL"}`);
  if (r.coordsBefore?.length) {
    console.log(`  Centroïdes: ${r.coordsBefore.map((c) => `${c.label}=[${c.lon?.toFixed(4)},${c.lat?.toFixed(4)}]`).join(" ")}`);
  }
  console.log("");
}

const pass =
  marseille.dayMarkers >= 3
  && crete.dayMarkers >= 3
  && marseille.geoStable
  && crete.geoStable
  && marseille.noSpiderLayer
  && crete.noSpiderLayer
  && marseille.anchorCenter
  && crete.anchorCenter
  && marseille.routeHidden
  && crete.routeHidden
  && marseille.plusOutsideMap
  && crete.plusOutsideMap
  && marseille.allMarkersInFrame
  && crete.allMarkersInFrame;

console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
