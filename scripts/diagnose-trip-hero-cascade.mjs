/**
 * Diagnostic cascade TripHeroImage — resolve API + Strict Mode ref bug.
 * Usage: npm run dev, node scripts/diagnose-trip-hero-cascade.mjs
 */
import { chromium } from "playwright";

const resolveUrl = "http://localhost:5173/api/images/resolve";
const label = "Marseille";

console.log("=== 1. Resolve API (Marseille) ===\n");
const apiResp = await fetch(resolveUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "hero", label, context: "", uiLang: "fr" }),
});
const apiJson = await apiResp.json().catch(() => ({}));
console.log("  HTTP:", apiResp.status);
console.log("  ok:", apiJson.ok);
console.log("  url:", apiJson.url ? `${String(apiJson.url).slice(0, 90)}…` : "(empty)");
console.log("  reason:", apiJson.reason || apiJson.error || "—");

console.log("\n=== 2. Preview demo (inline hero_image_url — NOT real cascade) ===\n");
const browser = await chromium.launch();
const demoPage = await browser.newPage();
await demoPage.goto("http://localhost:5173/?preview=trips-compact", { waitUntil: "networkidle", timeout: 45000 });
const demoImgs = await demoPage.evaluate(() =>
  [...document.querySelectorAll("article img[src^='http']")].map((i) => i.src.slice(0, 80))
);
console.log("  images:", demoImgs.length, demoImgs[0]?.slice(0, 60) || "(none)");

console.log("\n=== 3. Simulated resolve-only trip (no DB url, no cache) ===\n");
await demoPage.goto("about:blank");
await demoPage.setContent(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`);
await demoPage.addScriptTag({ url: "http://localhost:5173/@vite/client", type: "module" });

// Inject minimal trip card test via evaluate after loading app module
const cascadeResult = await demoPage.evaluate(async () => {
  const logs = [];
  const origFetch = window.fetch;
  let resolveCalls = 0;
  window.fetch = async (input, init) => {
    const u = String(input);
    if (u.includes("/api/images/resolve")) {
      resolveCalls += 1;
      logs.push(`resolve call #${resolveCalls}`);
    }
    return origFetch(input, init);
  };

  // Simulate resolveStartedRef bug: second run blocked
  let resolveStartedRef = "";
  const tripId = "test-marseille-uuid";
  const runEffect = (pass) => {
    if (resolveStartedRef === tripId) {
      logs.push(`${pass}: SKIPPED (resolveStartedRef blocks)`);
      return;
    }
    resolveStartedRef = tripId;
    logs.push(`${pass}: started resolve`);
  };
  runEffect("mount-1");
  runEffect("mount-2-strict-mode");
  return { logs, resolveCalls };
});

console.log("  StrictMode simulation:", cascadeResult.logs.join(" | "));

console.log("\n=== 4. Real app — network resolve calls (needs login) ===");
console.log("  → Open Mes voyages logged-in; check DevTools for POST /api/images/resolve\n");

await browser.close();

const apiOk = apiResp.ok && apiJson.ok && apiJson.url;
console.log("=== Verdict ===");
console.log("  Resolve API:", apiOk ? "OK" : "FAIL");
console.log("  Root cause (likely): resolveStartedRef + React StrictMode double-mount cancels 1st resolve and blocks 2nd");
console.log("  False positive test: preview demo uses inline hero_image_url, never hits resolve path");

process.exit(apiOk ? 0 : 1);
