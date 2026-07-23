import { normalizeLabel } from "./normalizeLabel.js";

/** Bump when la cascade hero change (invalidation clé label sans purge SQL globale). */
export const HERO_CACHE_KEY_REVISION = "hero-cascade-v3";

/**
 * Clé cache Supabase pour kind=hero (révision incluse).
 * @param {string} label
 * @param {string} [context]
 */
export function heroCacheLabelKey(label, context = "") {
  const base = normalizeLabel(label, context);
  if (!base) return "";
  return `${base}|${HERO_CACHE_KEY_REVISION}`;
}

/**
 * Entrées cache héros legacy (cascade émotion/geosearch-first) — forcer re-résolution.
 * @param {{ source?: string, url?: string }|null|undefined} entry
 */
export function isSupersededHeroCacheEntry(entry) {
  if (!entry?.url) return false;
  const src = String(entry.source || "").trim().toLowerCase();
  // geosearch + Views/Landscapes stockés comme commons-category avant v3
  if (src === "commons-category") return true;
  return false;
}
