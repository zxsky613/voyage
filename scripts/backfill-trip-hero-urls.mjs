/**
 * Backfill / repair hero_image_url.
 * Usage:
 *   node scripts/backfill-trip-hero-urls.mjs [--dry-run]           — NULL → resolve + set_trip_hero
 *   node scripts/backfill-trip-hero-urls.mjs --repair --dry-run    — liste les lignes empoisonnées
 *   node scripts/backfill-trip-hero-urls.mjs --repair              — remet à NULL les URLs bloquées
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildHeroResolveLabel } from "../lib/images/heroResolveLabel.js";
import { isBlockedTripHeroUrl, isValidPersistedTripHeroUrl } from "../lib/trips/tripHeroQuality.js";

const dryRun = process.argv.includes("--dry-run");
const repairMode = process.argv.includes("--repair");

const envPath = ".env.local";
/** @type {Record<string, string>} */
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
}

const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const role = env.SUPABASE_SERVICE_ROLE_KEY || "";
const resolveBase = env.VITE_INVITE_API_BASE_URL || "http://localhost:5173";

if (!supabaseUrl || !role) {
  console.error("FAIL: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const db = createClient(supabaseUrl, role, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await db
  .from("trips")
  .select("id, title, destination, hero_image_url")
  .order("start_date", { ascending: false });

if (error) {
  console.error("FAIL:", error.message);
  process.exit(1);
}

if (repairMode) {
  const poisoned = (rows || []).filter((r) => {
    const u = String(r?.hero_image_url || "").trim();
    return u && isBlockedTripHeroUrl(u);
  });

  console.log(`\n=== Repair hero_image_url (${dryRun ? "dry-run" : "APPLY"}) ===\n`);
  console.log(`${poisoned.length} ligne(s) empoisonnée(s) (garde qualité)\n`);

  for (const trip of poisoned) {
    const u = String(trip.hero_image_url || "").trim();
    console.log(`  ${trip.id}`);
    console.log(`    ${trip.destination || trip.title || "(sans titre)"}`);
    console.log(`    ${u}\n`);
  }

  if (!dryRun) {
    for (const trip of poisoned) {
      // Ne doit JAMAIS écrire autre chose que null. Toute écriture d'URL passe par
      // set_trip_hero (L.109) — sinon la garde qualité est contournée.
      const { error: upErr } = await db.from("trips").update({ hero_image_url: null }).eq("id", trip.id);
      if (upErr) console.warn("  FAIL", trip.id, upErr.message);
    }
    console.log("Repair terminé.");
  } else {
    console.log("Dry-run — aucune écriture. Relancer sans --dry-run pour appliquer.");
  }
  process.exit(0);
}

const pending = (rows || []).filter((r) => !String(r?.hero_image_url || "").trim());
console.log(`${pending.length} voyage(s) sans hero_image_url${dryRun ? " (dry-run)" : ""}`);

for (const trip of pending) {
  const label = buildHeroResolveLabel(String(trip.destination || trip.title || "").trim());
  if (!label) {
    console.warn("SKIP (label vide):", trip.id);
    continue;
  }

  let url = "";
  try {
    const r = await fetch(`${resolveBase.replace(/\/$/, "")}/api/images/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "hero", label, context: "", uiLang: "fr" }),
    });
    const j = await r.json().catch(() => ({}));
    url = String(j?.url || "").trim();
  } catch (e) {
    console.warn("resolve fail:", trip.destination || trip.title, e);
    continue;
  }

  if (!isValidPersistedTripHeroUrl(url)) {
    console.warn("SKIP (URL invalide/bloquée):", trip.destination || trip.title);
    continue;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}OK → ${trip.destination || trip.title}`);
  console.log(`       ${url.slice(0, 90)}…`);

  if (!dryRun) {
    const { data, error: rpcErr } = await db.rpc("set_trip_hero", {
      p_trip_id: trip.id,
      p_url: url,
    });
    if (rpcErr) {
      console.warn("  set_trip_hero fail:", rpcErr.message);
    } else if (data && data.ok !== true) {
      console.warn("  set_trip_hero rejected:", data.reason || "unknown");
    }
  }
}

console.log("Done.");
process.exit(0);
