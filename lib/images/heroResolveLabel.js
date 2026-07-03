/**
 * Libellé héro envoyé à /api/images/resolve — aligné sur normalizeLabel côté serveur.
 * @param {string} destination
 * @param {{ city?: string, adminRegion?: string, country?: string }|null|undefined} [guide]
 * @returns {string}
 */
export function buildHeroResolveLabel(destination, guide) {
  const dest = String(destination || "").trim();
  if (dest.includes(",")) return dest;

  const city = String(guide?.city || dest).trim();
  const region = String(guide?.adminRegion || "").trim();
  const country = String(guide?.country || "").trim();
  const parts = [city, region, country].filter(Boolean);
  if (parts.length >= 2) return parts.join(", ");
  return city || dest;
}

/** @param {string} url */
export function isPersistableClientHeroUrl(url) {
  const s = String(url || "").trim();
  return s.length > 0 && /^https?:\/\//i.test(s);
}
