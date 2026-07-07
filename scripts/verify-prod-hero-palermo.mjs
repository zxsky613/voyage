/**
 * Test prod hero Palerme ≠ Buenos Aires.
 * Usage: node scripts/verify-prod-hero-palermo.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`=== Prod hero Palerme @ ${BASE} ===\n`);

const resp = await fetch(`${BASE}/api/images/resolve`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "hero",
    label: "Palerme",
    context: "Italie",
    uiLang: "fr",
  }),
});

const json = await resp.json();
console.log("HTTP", resp.status, "entityId:", json?.entityId || "—");

assert(resp.ok || resp.status === 200, `HTTP ${resp.status}`);
assert(json?.entityId === "Q2656", `QID attendu Q2656 (Palerme Sicile), got ${json?.entityId}`);

const url = String(json?.url || "").toLowerCase();
assert(url.length > 20, "URL héros vide");
assert(!/buenos.?aires|argentina|palermo_buenos/i.test(url), `Hero Palerme BA détecté: ${url.slice(0, 120)}`);

console.log("  URL:", url.slice(0, 100) + "…");
console.log("\n✅ Hero prod Palerme → Q2656, pas Buenos Aires.");
