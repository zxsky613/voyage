/**
 * Vérification live des tables cache Supabase (dev uniquement — ne pas appeler depuis l'app).
 * Usage: npm run check:cache
 * Requiert SUPABASE_URL (ou VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY dans .env.local
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeLabel } from "../lib/images/normalizeLabel.js";

/** @typedef {{ ok: boolean, reason?: string }} CheckResult */

/**
 * @param {string} envPath
 * @returns {Record<string, string>}
 */
function loadEnvFile(envPath) {
  /** @type {Record<string, string>} */
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
  return env;
}

/**
 * @param {import('@supabase/supabase-js').PostgrestError | null | undefined} error
 */
function classifySupabaseError(error) {
  if (!error) return "unknown error";
  const code = String(error.code || "").trim();
  const msg = String(error.message || "").trim();
  const status = Number(error.status || error.statusCode || 0);

  if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
    return `table absente (42P01): ${msg}`;
  }
  if (status === 401 || /invalid api key/i.test(msg) || /jwt/i.test(msg)) {
    return `clé invalide ou refusée (401/JWT): ${msg}`;
  }
  if (status === 403 || /permission denied/i.test(msg)) {
    return `accès refusé (403): ${msg}`;
  }
  return msg || code || "unknown error";
}

/**
 * @param {ReturnType<typeof createClient>} db
 * @param {string} table
 * @param {object} healthRow
 * @param {string} onConflict
 * @param {string[]} previewColumns
 */
async function checkTable(db, table, healthRow, onConflict, previewColumns) {
  /** @type {CheckResult} */
  const result = { ok: false };

  console.log(`\n=== ${table} ===`);

  const probe = await db.from(table).select("*").limit(1);
  if (probe.error) {
    result.reason = classifySupabaseError(probe.error);
    console.log(`SELECT LIMIT 1: FAIL — ${result.reason}`);
    return result;
  }
  console.log("SELECT LIMIT 1: OK (table accessible)");

  const upsert = await db.from(table).upsert(healthRow, { onConflict });
  if (upsert.error) {
    result.reason = `upsert healthcheck FAIL — ${classifySupabaseError(upsert.error)}`;
    console.log(result.reason);
    return result;
  }
  console.log("UPSERT healthcheck: OK");

  const pkCols = onConflict.split(",").map((c) => c.trim());
  let readQuery = db.from(table).select("*");
  for (const col of pkCols) {
    readQuery = readQuery.eq(col, healthRow[col]);
  }
  const readBack = await readQuery.maybeSingle();
  if (readBack.error || !readBack.data) {
    result.reason = `read-back healthcheck FAIL — ${classifySupabaseError(readBack.error)}`;
    console.log(result.reason);
    return result;
  }
  console.log("READ-BACK healthcheck: OK");

  const delQuery = db.from(table).delete();
  let deleteBuilder = delQuery;
  for (const col of pkCols) {
    deleteBuilder = deleteBuilder.eq(col, healthRow[col]);
  }
  const del = await deleteBuilder;
  if (del.error) {
    result.reason = `delete healthcheck FAIL — ${classifySupabaseError(del.error)}`;
    console.log(result.reason);
    return result;
  }
  console.log("DELETE healthcheck: OK");

  const { count, error: countErr } = await db.from(table).select("*", { count: "exact", head: true });
  if (countErr) {
    console.log(`COUNT: FAIL — ${classifySupabaseError(countErr)}`);
  } else {
    console.log(`COUNT: ${count ?? 0} ligne(s)`);
  }

  const orderCol = previewColumns.includes("updated_at") ? "updated_at" : "created_at";
  const { data: recent, error: recentErr } = await db
    .from(table)
    .select(previewColumns.join(","))
    .order(orderCol, { ascending: false })
    .limit(5);

  if (recentErr) {
    console.log(`RECENT: FAIL — ${classifySupabaseError(recentErr)}`);
  } else if (!recent?.length) {
    console.log("RECENT: (aucune ligne)");
  } else {
    console.log("RECENT (5 dernières):");
    for (const row of recent) {
      console.log(`  - ${JSON.stringify(row)}`);
    }
  }

  result.ok = true;
  return result;
}

/**
 * Écrit puis relit une entrée via normalizeLabel — la clé doit matcher (hit).
 * @param {ReturnType<typeof createClient>} db
 */
async function checkNormalizeLabelReadWriteCoherence(db) {
  console.log("\n=== normalizeLabel read/write coherence ===");
  const probeLabel = "Ténérife, Canaries, Espagne";
  const labelNormalized = normalizeLabel(probeLabel, "");
  const expectedKey = "tenerife|canaries, espagne";

  if (labelNormalized !== expectedKey) {
    console.log(`normalizeLabel FAIL — got "${labelNormalized}", expected "${expectedKey}"`);
    return { ok: false, reason: "normalizeLabel key mismatch" };
  }
  console.log(`normalizeLabel OK — "${probeLabel}" → "${labelNormalized}"`);

  const row = {
    label_normalized: labelNormalized,
    kind: "hero",
    entity_id: "Q40846",
    image_url: "https://example.com/coherence-probe.jpg",
    source: "fallback",
    updated_at: new Date().toISOString(),
  };

  const upsert = await db.from("image_resolve_cache").upsert(row, { onConflict: "label_normalized,kind" });
  if (upsert.error) {
    return { ok: false, reason: `coherence upsert FAIL — ${classifySupabaseError(upsert.error)}` };
  }

  const readKey = normalizeLabel(probeLabel, "");
  const readBack = await db
    .from("image_resolve_cache")
    .select("label_normalized, image_url")
    .eq("label_normalized", readKey)
    .eq("kind", "hero")
    .maybeSingle();

  if (readBack.error || !readBack.data?.image_url) {
    return {
      ok: false,
      reason: `coherence read-back FAIL — ${classifySupabaseError(readBack.error)}`,
    };
  }
  console.log("READ via normalizeLabel: OK (hit)");

  const del = await db
    .from("image_resolve_cache")
    .delete()
    .eq("label_normalized", readKey)
    .eq("kind", "hero");
  if (del.error) {
    return { ok: false, reason: `coherence cleanup FAIL — ${classifySupabaseError(del.error)}` };
  }
  console.log("DELETE coherence probe: OK");

  return { ok: true };
}

const fileEnv = loadEnvFile(".env.local");
const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL ||
  "";
const role = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "";
const anon = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || "";

console.log("check-image-cache: démarrage");
console.log(
  JSON.stringify(
    {
      supabaseUrl: url ? (url.includes("supabase.co") ? "set" : "unexpected_host") : "missing",
      serviceRoleKey: role ? "set" : "missing",
      serviceRoleSameAsAnon: Boolean(role && anon && role === anon),
      serviceRoleLooksPublishable: role.startsWith("sb_publishable_"),
    },
    null,
    2
  )
);

/** @type {string[]} */
const failures = [];

if (!url || !role) {
  failures.push(!role ? "SUPABASE_SERVICE_ROLE_KEY manquante" : "SUPABASE_URL manquante");
  console.error("\nCACHE CASSÉ:", failures.join("; "));
  process.exit(1);
}

if (role === anon || role.startsWith("sb_publishable_")) {
  failures.push("vous utilisez la clé anon/publishable au lieu de la service-role");
  console.error("\nCACHE CASSÉ:", failures.join("; "));
  process.exit(1);
}

const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });

const imageResult = await checkTable(
  db,
  "image_resolve_cache",
  {
    label_normalized: "__healthcheck__",
    kind: "hero",
    entity_id: null,
    image_url: "https://example.com/x.jpg",
    source: "fallback",
    updated_at: new Date().toISOString(),
  },
  "label_normalized,kind",
  ["label_normalized", "kind", "entity_id", "source", "updated_at", "created_at"]
);
if (!imageResult.ok) failures.push(`image_resolve_cache: ${imageResult.reason}`);

const coherenceResult = await checkNormalizeLabelReadWriteCoherence(db);
if (!coherenceResult.ok) failures.push(`normalizeLabel coherence: ${coherenceResult.reason}`);

const placeResult = await checkTable(
  db,
  "place_enrichment_cache",
  {
    place_name_normalized: "__healthcheck__",
    city_normalized: "",
    location_id: null,
    status: "unverified",
    source: "none",
    raw_name: "__healthcheck__",
    updated_at: new Date().toISOString(),
  },
  "place_name_normalized,city_normalized",
  ["place_name_normalized", "city_normalized", "status", "source", "updated_at"]
);
if (!placeResult.ok) failures.push(`place_enrichment_cache: ${placeResult.reason}`);

console.log("");
if (failures.length) {
  console.error("CACHE CASSÉ:", failures.join(" | "));
  process.exit(1);
}

console.log("CACHE OK: image_resolve_cache et place_enrichment_cache lisibles/écrivables (service-role).");
process.exit(0);
