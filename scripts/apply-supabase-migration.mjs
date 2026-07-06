/**
 * Applique les migrations SQL Supabase (DDL) si SUPABASE_DB_URL ou DATABASE_URL est défini.
 * Sinon vérifie seulement la présence des colonnes / contraintes via PostgREST.
 *
 * Usage: node scripts/apply-supabase-migration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const fp = path.join(root, ".env.local");
  if (!fs.existsSync(fp)) return;
  for (const line of fs.readFileSync(fp, "utf8").split(/\r?\n/)) {
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

loadEnvLocal();

const sqlFiles = [
  "supabase/sql/place_enrichment_cache_fsq_place_id.sql",
];

async function tryApplyViaPg(connectionString) {
  const pg = await import("pg");
  const client = new pg.default.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const rel of sqlFiles) {
      const fp = path.join(root, rel);
      const sql = fs.readFileSync(fp, "utf8");
      console.log(`Applying ${rel} via postgres…`);
      await client.query(sql);
      console.log(`Applied ${rel}`);
    }
    return true;
  } finally {
    await client.end();
  }
}

async function probeFsqColumn() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis pour la sonde.");
    return false;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await db.from("place_enrichment_cache").select("fsq_place_id").limit(1);
  if (!error) {
    console.log("OK place_enrichment_cache.fsq_place_id — colonne présente.");
    return true;
  }
  const msg = String(error.message || "");
  if (/fsq_place_id|column .* does not exist/i.test(msg)) {
    console.warn("MANQUANT place_enrichment_cache.fsq_place_id — migration à appliquer.");
    return false;
  }
  console.warn("Sonde fsq_place_id:", msg);
  return false;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
  let applied = 0;

  if (dbUrl) {
    await tryApplyViaPg(dbUrl);
    applied = sqlFiles.length;
  } else {
    console.log("SUPABASE_DB_URL absent — DDL non exécuté (sonde PostgREST uniquement).");
    console.log("Pour appliquer : coller le SQL dans Supabase SQL Editor ou définir SUPABASE_DB_URL.");
  }

  const ok = await probeFsqColumn();
  if (!ok && !dbUrl) {
    for (const rel of sqlFiles) {
      console.log(`\n--- ${rel} ---\n${fs.readFileSync(path.join(root, rel), "utf8")}`);
    }
    process.exit(applied ? 0 : 1);
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
