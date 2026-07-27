/**
 * Capture mobile screenshot of real TripsCompactPreview components.
 * Usage: npm run dev (separate terminal), then node scripts/screenshot-trips-compact.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets");
const outFile = path.join(outDir, "trips-compact-real-mobile.png");
const baseUrl = process.env.PREVIEW_URL || "http://localhost:5173/?preview=trips-compact";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: outFile, fullPage: true });
await browser.close();

console.log("OK →", outFile);
