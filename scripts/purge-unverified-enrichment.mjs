/**
 * Supprime les entrées place_enrichment_cache status=unverified (one-shot après fix TA).
 * Usage: node scripts/purge-unverified-enrichment.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const role = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !role) {
  console.error("FAIL: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local");
  process.exit(1);
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });

const { count, error: countErr } = await db
  .from("place_enrichment_cache")
  .select("*", { count: "exact", head: true })
  .eq("status", "unverified");

if (countErr) {
  console.error("FAIL: lecture —", countErr.message);
  process.exit(1);
}

console.log(`purge-unverified-enrichment: ${count ?? 0} ligne(s) unverified à supprimer`);

const { error: delErr } = await db.from("place_enrichment_cache").delete().eq("status", "unverified");
if (delErr) {
  console.error("FAIL: suppression —", delErr.message);
  process.exit(1);
}

console.log("OK: entrées unverified supprimées");
