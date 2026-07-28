/**
 * Capture marqueurs épingle — vue d'ensemble (Marseille / Crète) + vue jour.
 * Usage: npm run dev, then node scripts/screenshot-planner-sheet.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets");
const base = process.env.PREVIEW_URL || "http://localhost:5173/?preview=planner-sheet";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

/** @param {string} scenario @param {'trip'|'day'} scope @param {string} outName */
async function capture(scenario, scope, outName) {
  const url = `${base}&scenario=${scenario}&scope=${scope}&snap=mid`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForSelector(`[data-preview-scope="${scope}"]`, { timeout: 15000 });
  await page.waitForSelector(`[data-effective-map-view="${scope === "trip" ? "trip" : "day"}"]`, {
    timeout: 15000,
  });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      /** @type {any} */
      const map = window.__tripMap;
      if (!map?.hasImage) return false;
      if (scope === "day") return map.hasImage("activity-balloon-1");
      return map.hasImage("day-pin-0-1");
    },
    undefined,
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(1500);

  const outFile = path.join(outDir, outName);
  await page.screenshot({ path: outFile, fullPage: false });
  console.log("OK →", outFile);
}

await capture("marseille", "trip", "planner-overview-marseille-mobile.png");
await capture("crete", "trip", "planner-overview-crete-mobile.png");
await capture("marseille", "day", "planner-day-marseille-mobile.png");

await browser.close();
