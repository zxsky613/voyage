/**
 * Vérifie le cadrage vue jour — overlays haut + activités visibles dans le canvas.
 */
import { chromium } from "playwright";

const BALLOON_H = 52;
const snaps = ["collapsed", "mid"];

const browser = await chromium.launch();

for (const snap of snaps) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const url = `${process.env.PREVIEW_URL || "http://localhost:5173/?preview=planner-sheet"}&scenario=marseille&scope=day&snap=${snap}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForSelector('[data-effective-map-view="day"]', { timeout: 15000 });
  await page.waitForFunction(
    () => window.__tripMap?.queryRenderedFeatures(undefined, { layers: ["trip-activity-balloon"] })?.length >= 3,
    undefined,
    { timeout: 20000 }
  );
  await page.waitForTimeout(3000);

  const result = await page.evaluate((balloonH) => {
    const map = window.__tripMap;
    const canvas = document.querySelector(".maplibregl-canvas");
    const shell = document.querySelector("[data-effective-map-view='day']");
    const overlay = shell?.querySelector(".pointer-events-none.absolute");
    const canvasRect = canvas?.getBoundingClientRect();
    const overlayRect = overlay?.getBoundingClientRect();
    const overlayBottomInCanvas =
      overlayRect && canvasRect ? overlayRect.bottom - canvasRect.top : 96;
    const mapH = canvasRect?.height || 0;

    const features = map.queryRenderedFeatures(undefined, { layers: ["trip-activity-balloon"] });
    const positions = features.map((f) => {
      const p = map.project(f.geometry.coordinates);
      return {
        id: f.properties?.id,
        anchorY: p.y,
        pinTopY: p.y - balloonH,
      };
    });
    const northern = positions.reduce(
      (best, p) => (p.pinTopY < best.pinTopY ? p : best),
      positions[0] || { pinTopY: 9999, anchorY: 9999 }
    );
    const southern = positions.reduce(
      (best, p) => (p.anchorY > best.anchorY ? p : best),
      positions[0] || { anchorY: -1 }
    );

    const strictOverlay = mapH >= 220;
    const okOverlay = strictOverlay
      ? northern.pinTopY >= overlayBottomInCanvas - 4
      : northern.anchorY >= overlayBottomInCanvas - 6;
    const okCanvas =
      positions.length >= 2
      && northern.anchorY >= -4
      && southern.anchorY <= mapH + 4;

    return {
      count: positions.length,
      mapH,
      overlayBottomInCanvas,
      northern,
      southern,
      zoom: map.getZoom(),
      ok: okOverlay && okCanvas,
      strictOverlay,
    };
  }, BALLOON_H);

  if (!result.ok) {
    console.error(`FAIL snap=${snap}:`, result);
    await browser.close();
    process.exit(1);
  }
  console.log(`OK snap=${snap}:`, result);
  await page.close();
}

await browser.close();
