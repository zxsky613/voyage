/**
 * Captures before / mid / after day fly transition (legend J1 → J2).
 * Usage: npm run dev, then node scripts/screenshot-day-fly.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets");
const base =
  process.env.PREVIEW_URL?.replace(/\?.*$/, "")
  || "http://localhost:5173";
const url = `${base}/?preview=planner-sheet&scenario=${process.env.PREVIEW_SCENARIO || "marseille"}&scope=day&snap=mid`;

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector('[data-preview-scope="day"]', { timeout: 20000 });
await page.waitForSelector(".maplibregl-canvas", { timeout: 20000 });
await page.waitForFunction(
  () => document.querySelector("[data-effective-map-view]")?.getAttribute("data-effective-map-view") === "day",
  undefined,
  { timeout: 25000 }
).catch(() => {});
await page.waitForTimeout(2000);

const before = path.join(outDir, "planner-day-fly-j1-before.png");
await page.screenshot({ path: before, fullPage: false });
console.log("OK →", before);

const day2Btn = page.getByRole("button", { name: /Jour 2/i }).first();
await day2Btn.click();
await page.waitForTimeout(350);
const mid = path.join(outDir, "planner-day-fly-j1-to-j2-mid.png");
await page.screenshot({ path: mid, fullPage: false });
console.log("OK →", mid);

await page.waitForTimeout(500);
const after = path.join(outDir, "planner-day-fly-j2-after.png");
await page.screenshot({ path: after, fullPage: false });
console.log("OK →", after);

const day3Btn = page.getByRole("button", { name: /Jour 3/i }).first();
await day3Btn.click();
await page.waitForTimeout(850);
const j3 = path.join(outDir, "planner-day-fly-j3-after.png");
await page.screenshot({ path: j3, fullPage: false });
console.log("OK →", j3);

await browser.close();
