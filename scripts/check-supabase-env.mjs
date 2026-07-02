import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = ".env.local";
if (!fs.existsSync(envPath)) {
  console.log("FAIL: .env.local introuvable");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
/** @type {Record<string, string>} */
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const url =
  env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const role = env.SUPABASE_SERVICE_ROLE_KEY || "";
const anon = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "";

function keyKind(v) {
  if (!v) return "empty";
  if (v.startsWith("sb_secret_")) return "secret_key";
  if (v.startsWith("eyJ") && v.split(".").length === 3) return "jwt";
  if (v.startsWith("sb_publishable_")) return "publishable_wrong";
  return "unknown";
}

const report = {
  supabaseUrl: url ? (url.includes("supabase.co") ? "ok" : "unexpected_host") : "missing",
  serviceRoleKey: role ? "set" : "missing",
  serviceRoleKind: keyKind(role),
  serviceRoleLength: role.length,
  sameAsAnonKey: Boolean(role && anon && role === anon),
  looksLikePublishable: role.startsWith("sb_publishable_"),
};

console.log("check-supabase-env:", JSON.stringify(report, null, 2));

if (!url || !role) {
  console.log("FAIL: SUPABASE URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local");
  process.exit(1);
}
if (report.sameAsAnonKey || report.looksLikePublishable) {
  console.log("FAIL: vous avez mis la clé publique (anon/publishable), pas la clé secrète service_role");
  process.exit(1);
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await db.from("image_resolve_cache").select("label_normalized").limit(1);
if (error) {
  console.log("FAIL: connexion Supabase refusée —", error.message);
  if (/relation.*does not exist/i.test(error.message)) {
    console.log("HINT: exécutez supabase/sql/image_resolve_cache.sql dans le SQL Editor Supabase");
  }
  process.exit(1);
}

console.log("OK: SUPABASE_SERVICE_ROLE_KEY valide et table image_resolve_cache accessible");
