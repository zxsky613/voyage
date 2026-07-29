/**
 * Script de stabilité hero — 5 rechargements, compare les URLs affichées.
 * Usage: npm run dev, node scripts/verify-trip-hero-stable.mjs
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "assets");
const url = process.env.PREVIEW_URL || "http://localhost:5173/?preview=trips-compact";

await mkdir(outDir, { recursive: true });

/** @param {import('playwright').Page} page */
async function collectHeroSrcs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("article img[src^='http']")].map((img) => img.getAttribute("src") || "")
  );
}

const browser = await chromium.launch();
const runs = [];

for (let i = 0; i < 5; i += 1) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForFunction(() => document.querySelectorAll("article img").length >= 5, undefined, {
    timeout: 20000,
  }).catch(() => {});
  await page.waitForTimeout(1000);
  const srcs = await collectHeroSrcs(page);
  runs.push(srcs);
  if (i === 0) {
    await page.screenshot({ path: path.join(outDir, "trips-hero-stable-run1.png"), fullPage: true });
  }
  await page.close();
}

await browser.close();

const baseline = JSON.stringify(runs[0] || []);
const stable = runs.every((r) => JSON.stringify(r) === baseline);

console.log("\n=== Trip hero stability (5 reloads) ===\n");
for (let i = 0; i < runs.length; i += 1) {
  console.log(`Run ${i + 1}: ${runs[i].length} images`);
  for (const s of runs[i].slice(0, 3)) {
    console.log(`  ${s.slice(0, 90)}…`);
  }
}
console.log(stable ? "\nPASS: identical hero URLs across 5 reloads" : "\nFAIL: hero URLs differ between reloads");
process.exit(stable ? 0 : 1);
