/**
 * Backfill : résout et persiste hero_image_url pour les voyages sans URL en base.
 * Usage: node scripts/backfill-trip-hero-urls.mjs [--dry-run]
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildHeroResolveLabel } from "../lib/images/heroResolveLabel.js";

const dryRun = process.argv.includes("--dry-run");

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

const db = createClient(supabaseUrl, role, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await db
  .from("trips")
  .select("id, title, destination, hero_image_url")
  .order("start_date", { ascending: false });

if (error) {
  console.error("FAIL:", error.message);
  process.exit(1);
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

  if (!/^https?:\/\//i.test(url)) {
    console.warn("SKIP (pas d'URL):", trip.destination || trip.title);
    continue;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}OK → ${trip.destination || trip.title}`);
  console.log(`       ${url.slice(0, 90)}…`);

  if (!dryRun) {
    const { error: upErr } = await db.from("trips").update({ hero_image_url: url }).eq("id", trip.id);
    if (upErr) console.warn("  persist fail:", upErr.message);
  }
}

console.log("Done.");
