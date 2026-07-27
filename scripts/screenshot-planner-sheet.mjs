/**
 * Capture mobile planner sheet preview (mid + full = carte réduite, jamais démontée).
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

for (const snap of ["mid", "full"]) {
  await page.goto(`${base}&snap=${snap}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2500);
  const outFile = path.join(outDir, `planner-sheet-${snap}-mobile.png`);
  await page.screenshot({ path: outFile, fullPage: false });
  console.log("OK →", outFile);
  const mapVisible = await page.locator(".maplibregl-canvas").count();
  console.log(`  snap=${snap} map canvas count=${mapVisible}`);
}

await browser.close();
