/**
 * Envoie automatiquement tous les *.jpg de public/destinations/ vers le bucket Supabase.
 * Plus besoin de conversion WebP ni d’upload manuel fichier par fichier.
 *
 * Prérequis (une seule fois) :
 * 1. Dashboard Supabase → Storage → bucket public `city-heroes` (ou le nom dans VITE_CITY_HERO_STORAGE_BUCKET)
 * 2. Dashboard → Project Settings → API → copier la clé **service_role** (secrète)
 * 3. Dans .env.local (jamais commit) :
 *    SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
 *
 * Usage : npm run upload:destinations
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEST_DIR = join(ROOT, "public", "destinations");
const ENV_PATH = join(ROOT, ".env.local");

function loadEnvLocalSync() {
  try {
    const raw = readFileSync(ENV_PATH, "utf8");
    for (const line of raw.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

loadEnvLocalSync();

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = process.env.VITE_CITY_HERO_STORAGE_BUCKET || "city-heroes";

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "Manque VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local\n" +
        "→ Supabase → Settings → API → copier **service_role** (pas la clé anon)."
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let files;
  try {
    files = await readdir(DEST_DIR);
  } catch (e) {
    console.error("Dossier introuvable :", DEST_DIR, e.message);
    process.exit(1);
  }

  const jpgs = files.filter((f) => f.toLowerCase().endsWith(".jpg"));
  if (jpgs.length === 0) {
    console.error("Aucun .jpg dans public/destinations — lance d’abord npm run fetch:destinations");
    process.exit(1);
  }

  console.log(`Bucket « ${BUCKET} » — ${jpgs.length} fichier(s)…\n`);

  let ok = 0;
  let fail = 0;
  for (const name of jpgs.sort()) {
    const buf = await readFile(join(DEST_DIR, name));
    const { error } = await supabase.storage.from(BUCKET).upload(name, buf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) {
      console.error(`✗ ${name} —`, error.message);
      fail += 1;
    } else {
      console.log(`✓ ${name}`);
      ok += 1;
    }
  }

  console.log(`\nTerminé : ${ok} ok, ${fail} erreur(s).`);
  console.log(`URL type : ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/paris.jpg`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
