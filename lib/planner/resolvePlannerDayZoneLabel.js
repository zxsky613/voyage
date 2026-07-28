/**
 * Libellé zone/quartier pour un jour du planning.
 * Données dispo sur les activités persistées : `location` (souvent quartier/adresse),
 * pas de champ zone dédié ni reverse geocoding côté planner.
 *
 * @param {{ activities?: Array<object>, cityLabel?: string }} opts
 * @returns {string}
 */
export function resolvePlannerDayZoneLabel({ activities = [], cityLabel = "" }) {
  const city = String(cityLabel || "").trim();
  const locations = (activities || [])
    .map((a) => String(a?.location || "").trim())
    .filter(Boolean);

  if (!locations.length) return city;

  /** @type {Map<string, { count: number, raw: string }>} */
  const byNorm = new Map();
  for (const raw of locations) {
    const norm = raw.toLowerCase();
    const cur = byNorm.get(norm) || { count: 0, raw };
    cur.count += 1;
    byNorm.set(norm, cur);
  }

  const top = [...byNorm.values()].sort((a, b) => b.count - a.count)[0]?.raw || locations[0];
  const short = top.split(",")[0]?.trim() || top;
  return short || city;
}
