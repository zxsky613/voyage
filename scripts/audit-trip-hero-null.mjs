/**
 * Diagnostic : voyages sans hero_image_url persisté en base.
 * Usage: node scripts/audit-trip-hero-null.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = ".env.local";
if (!fs.existsSync(envPath)) {
  console.error("FAIL: .env.local introuvable");
  process.exit(1);
}

/** @type {Record<string, string>} */
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
}

const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const role = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !role) {
  console.error("FAIL: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: colProbe, error: colErr } = await db.from("trips").select("id, hero_image_url").limit(1);
if (colErr) {
  const msg = String(colErr.message || "");
  if (/hero_image_url|column .* does not exist/i.test(msg)) {
    console.error("\nFAIL: colonne trips.hero_image_url absente en base.");
    console.error("→ Exécutez supabase/sql/trips_hero_image_url.sql dans Supabase SQL Editor\n");
    process.exit(1);
  }
  console.error("FAIL:", msg);
  process.exit(1);
}

const { data: rows, error } = await db
  .from("trips")
  .select("id, title, destination, hero_image_url")
  .order("start_date", { ascending: false });

if (error) {
  console.error("FAIL:", error.message);
  process.exit(1);
}

const all = rows || [];
const missing = all.filter((r) => !String(r?.hero_image_url || "").trim());
const present = all.filter((r) => String(r?.hero_image_url || "").trim());

console.log(`\n=== Audit hero_image_url (${all.length} voyages) ===\n`);
console.log(`Avec URL persistée : ${present.length}`);
console.log(`Sans URL (NULL/vide) : ${missing.length}\n`);

if (missing.length) {
  console.log("Voyages sans hero_image_url :");
  for (const r of missing) {
    console.log(`  - ${r.id?.slice(0, 8)}… | ${r.destination || r.title || "?"}`);
  }
}

if (present.length) {
  console.log("\nVoyages avec hero_image_url :");
  for (const r of present.slice(0, 10)) {
    const u = String(r.hero_image_url).slice(0, 72);
    console.log(`  - ${r.destination || r.title}: ${u}…`);
  }
  if (present.length > 10) console.log(`  … et ${present.length - 10} autres`);
}

console.log("\nCascade TripHeroImage (par affichage) :");
console.log("  1. trips.hero_image_url (Supabase) — source de vérité");
console.log("  2. localStorage tp_trip_hero_v2_{tripId} — cache perf");
console.log("  3. POST /api/images/resolve (hero, buildHeroResolveLabel) — 1× si 1+2 absents");
console.log("  4. gradient placeholder\n");
