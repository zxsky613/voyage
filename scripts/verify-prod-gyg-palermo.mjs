/**
 * Test prod GYG widget — Palerme (guide destination).
 * Usage: node scripts/verify-prod-gyg-palermo.mjs
 */
const BASE = process.env.PROD_BASE_URL || "https://www.justtrip.fr";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log(`=== Prod GYG Palerme @ ${BASE} ===\n`);

const indexResp = await fetch(BASE);
assert(indexResp.ok, `index HTTP ${indexResp.status}`);
const html = await indexResp.text();

const jsMatch =
  html.match(/src="(\.\/assets\/index-[^"]+\.js)"/) ||
  html.match(/src="(\/assets\/index-[^"]+\.js)"/) ||
  html.match(/src="(\.\/assets\/[^"]+\.js)"/);
assert(jsMatch, "bundle JS introuvable dans index.html");
const bundlePath = jsMatch[1].replace(/^\.\//, "/");
const bundleUrl = bundlePath.startsWith("http") ? bundlePath : `${BASE}${bundlePath}`;
const bundleResp = await fetch(bundleUrl);
assert(bundleResp.ok, `bundle HTTP ${bundleResp.status}`);
const bundle = await bundleResp.text();

assert(/getyourguide|GygActivitiesWidget|PJB9REI|widget\.getyourguide\.com/i.test(bundle), "code GYG absent du bundle prod");

const { buildGetYourGuideAffiliateUrl, resolveGygPartnerId, GYG_WIDGET_SCRIPT_SRC } = await import(
  "../lib/gyg/getYourGuide.js"
);
const partnerId = resolveGygPartnerId();
assert(partnerId === "PJB9REI", `partnerId ${partnerId}`);

const fallbackUrl = buildGetYourGuideAffiliateUrl("Palerme", partnerId, { appLang: "fr" });
assert(/getyourguide\.com/i.test(fallbackUrl), `fallback URL suspect: ${fallbackUrl}`);
assert(fallbackUrl.includes("PJB9REI"), "partner_id manquant");

console.log("  Partner ID:", partnerId);
console.log("  Widget script:", GYG_WIDGET_SCRIPT_SRC);
console.log("  Fallback Palerme:", fallbackUrl.slice(0, 96) + "…");

/** Script widget GYG joignable */
const gygScriptResp = await fetch(GYG_WIDGET_SCRIPT_SRC, { method: "HEAD" });
assert(gygScriptResp.ok, `GYG script HTTP ${gygScriptResp.status}`);

console.log("\n✅ GYG prod — bundle présent, fallback Palerme OK, script widget joignable.");
