/**
 * Pré-chauffe image_resolve_cache pour un libellé héro.
 * Usage: node scripts/warmup-resolve-hero.mjs "Ténérife, Canaries, Espagne"
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { normalizeLabel } from "../lib/images/normalizeLabel.js";
import { resolveImage } from "../api/images/_resolveImage.js";

const envPath = ".env.local";
if (fs.existsSync(envPath)) {
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
    if (!process.env[k]) process.env[k] = v;
  }
}

const label = process.argv[2] || "Ténérife, Canaries, Espagne";
const uiLang = process.argv[3] || "fr";

console.log(`warmup-resolve-hero: label="${label}" uiLang=${uiLang}`);

const cacheKey = normalizeLabel(label, "");
console.log(`cache key: ${cacheKey || "(empty)"}`);

const outcome = await resolveImage({ kind: "hero", label, context: "", uiLang });
if (outcome.image?.url) {
  console.log("OK:", {
    url: outcome.image.url.slice(0, 100) + "...",
    source: outcome.image.source,
    entityId: outcome.image.entityId,
    cached: outcome.image.cached,
    cache: outcome.cache,
  });
} else {
  console.log("FAIL:", outcome.reason || "not_found", "cache:", outcome.cache || "miss");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const role = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (url && role) {
  const db = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db
    .from("image_resolve_cache")
    .select("label_normalized, kind, entity_id, image_url, source, updated_at")
    .eq("label_normalized", cacheKey)
    .eq("kind", "hero")
    .maybeSingle();
  if (error) console.log("cache verify error:", error.message);
  else console.log("cache row:", data ? { ...data, image_url: String(data.image_url).slice(0, 80) + "..." } : null);
}
