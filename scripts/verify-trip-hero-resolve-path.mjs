/**
 * Test cascade réelle : trip avec id, SANS hero_image_url ni cache → resolve API.
 * Usage: npm run dev, node scripts/verify-trip-hero-resolve-path.mjs
 */
import { chromium } from "playwright";

const url = "http://localhost:5173/?preview=trip-hero-resolve";
let resolveCalls = 0;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.route("**/api/images/resolve", async (route) => {
  resolveCalls += 1;
  return route.continue();
});

await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForFunction(
  () => document.querySelector("article img[src^='http']")?.naturalWidth > 0,
  undefined,
  { timeout: 25000 }
).catch(() => {});

const result = await page.evaluate(() => {
  const img = document.querySelector("article img[src^='http']");
  const tripId = "preview-resolve-marseille";
  return {
    ok: Boolean(img?.src),
    src: img?.src?.slice(0, 100) || "",
    cache: localStorage.getItem(`tp_trip_hero_v2_${tripId}`)?.slice(0, 100) || "",
  };
});

console.log("\n=== Resolve-only path (StrictMode, no inline url) ===\n");
console.log("  resolve API calls:", resolveCalls);
console.log("  img loaded:", result.ok);
console.log("  src:", result.src || "(empty)");
console.log("  v2 cache written:", result.cache ? "yes" : "no");

await browser.close();
const pass = result.ok && resolveCalls > 0;
console.log(pass ? "\nPASS" : "\nFAIL");
process.exit(pass ? 0 : 1);
