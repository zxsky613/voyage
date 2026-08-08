/**
 * Correspondance de noms lieux (TripAdvisor / cache enrichissement).
 * Aligné sur api/planner/_tripadvisorClient.js — partagé pour les gardes cache.
 */

function normalizeTokens(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} query
 * @param {string} name
 */
export function nameMatchScore(query, name) {
  const qTokens = normalizeTokens(query).split(" ").filter((w) => w.length > 2);
  const nTokens = new Set(normalizeTokens(name).split(" ").filter((w) => w.length > 2));
  if (!qTokens.length || !nTokens.size) return 0;
  let hit = 0;
  for (const t of qTokens) if (nTokens.has(t)) hit += 1;
  return hit / qTokens.length;
}

/**
 * @param {string} query
 * @param {string} name
 */
export function reasonableNameMatch(query, name) {
  const score = nameMatchScore(query, name);
  if (score >= 0.35) return true;
  const q = normalizeTokens(query);
  const n = normalizeTokens(name);
  if (!q || !n) return false;
  if (q.length >= 4 && n.includes(q)) return true;
  if (n.length >= 4 && q.includes(n)) return true;
  return score >= 0.25;
}

/**
 * Entrée cache liée au libellé client (clé place_name) — rejette un raw_name
 * clairement d’un autre lieu (poison name/searchName).
 * @param {string} placeName
 * @param {string} [cachedRawName]
 */
export function cacheRawNameMatchesPlace(placeName, cachedRawName) {
  const place = String(placeName || "").trim();
  const raw = String(cachedRawName || "").trim();
  if (!place) return false;
  if (!raw) return true;
  return reasonableNameMatch(place, raw);
}
