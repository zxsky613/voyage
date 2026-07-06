import { normalizePlaceCacheKey } from "../../api/planner/_enrichCache.js";
import { computePlacesCentroid } from "./geoGuard.js";
import { placeHasCoords } from "./coordsSource.js";

/**
 * Fusionne candidats bruts sans réassigner les ids existants.
 * @param {Array<Record<string, unknown>>} allRaw
 * @param {string} city
 */
export function mergePass1Candidates(allRaw, city) {
  const seen = new Set();
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  let maxId = 0;

  for (const c of Array.isArray(allRaw) ? allRaw : []) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    const key = normalizePlaceCacheKey(name, city).place_name_normalized;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const id = String(c?.id || "").trim();
    const m = id.match(/^c(\d+)$/);
    if (m) maxId = Math.max(maxId, Number(m[1]));
    out.push({
      ...c,
      name,
      searchName: String(c?.searchName || "").trim() || name,
      id: m ? id : "",
    });
  }

  return out.map((c) => {
    if (String(c.id || "").match(/^c\d+$/)) return c;
    maxId += 1;
    return { ...c, id: `c${maxId}` };
  });
}

/**
 * @param {object[][]} dayAssignments
 */
export function clusteredParJour(dayAssignments) {
  return (Array.isArray(dayAssignments) ? dayAssignments : []).map((d) =>
    Array.isArray(d) ? d.length : 0
  );
}

/**
 * @param {object[][]} dayAssignments
 */
export function assignedPlaceIds(dayAssignments) {
  return new Set(
    (Array.isArray(dayAssignments) ? dayAssignments : [])
      .flat()
      .map((p) => String(p?.id || "").trim())
      .filter(Boolean)
  );
}

/**
 * @param {object[]} dayPlaces
 * @param {string} destination
 */
export function describeDayAnchor(dayPlaces, destination) {
  const list = Array.isArray(dayPlaces) ? dayPlaces : [];
  if (!list.length) return String(destination || "").trim();
  const names = list.map((p) => String(p?.name || "").trim()).filter(Boolean);
  const centroid = computePlacesCentroid(list.filter(placeHasCoords));
  if (centroid && names.length) {
    return `${names.slice(0, 3).join(", ")} (zone ~${Number(centroid.latitude).toFixed(2)}°N, ${Number(centroid.longitude).toFixed(2)}°E)`;
  }
  return names.slice(0, 4).join(", ") || destination;
}

/**
 * Pass 1 complémentaire ciblée sur un jour sous-rempli.
 */
export function buildDayTargetedCompletionPrompt({
  destination,
  days,
  startDate,
  endDate,
  dayIndex,
  dayAnchor,
  supplementCount,
  excludeNames,
  prefsBlock,
  enrichBlock,
  editorialBlock,
  langRule,
  budgetHint,
}) {
  const dayNum = Number(dayIndex) + 1;
  const excludeList = (excludeNames || [])
    .slice(0, 100)
    .map((n) => `- ${n}`)
    .join("\n");
  return (
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    enrichBlock +
    editorialBlock +
    `COMPLÉMENT CIBLÉ — Jour ${dayNum} du programme :\n` +
    `- Propose exactement ${supplementCount} lieux SUPPLÉMENTAIRES réels, géographiquement cohérents avec l'ancrage du jour ${dayNum}.\n` +
    `- Ancrage / zone du jour ${dayNum} : ${dayAnchor}.\n` +
    `- Les nouveaux lieux doivent être visitables le même jour que les activités déjà prévues dans cette zone (proximité raisonnable).\n` +
    `- INTERDIT de reprendre un lieu déjà utilisé dans le voyage.\n` +
    `- Lieux DÉJÀ retenus (ne pas réutiliser ni décliner en variantes) :\n${excludeList}\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide:\n` +
    `{"candidates":[{"id":"c1","name":"Nom affiché","searchName":"Official English/local name","category":"museum|park|landmark|neighborhood|viewpoint|nature|beach|garden|historic_site|cultural_site","durationHours":2,"estimatedPriceEur":15}, ...]}\n` +
    `Règles : name et searchName NON VIDES, estimatedPriceEur entier 0–300, pas de repas/hôtels/transport seul.\n` +
    `- Budget indicatif : ${budgetHint}.\n` +
    `${langRule}\n`
  );
}

/**
 * Complète les jours sous perDay avec les meilleurs candidats non assignés (sans contrainte géo).
 * @param {object[][]} dayAssignments
 * @param {object[]} scored
 * @param {number} perDay
 * @param {number} days
 */
export function contractRelaxFill(dayAssignments, scored, perDay, days) {
  const out = (Array.isArray(dayAssignments) ? dayAssignments : []).map((d) => [...(d || [])]);
  const used = assignedPlaceIds(out);
  /** @type {number[]} */
  const contractRelaxed = [];

  const spare = (Array.isArray(scored) ? scored : [])
    .filter((p) => p && !used.has(String(p.id || "").trim()))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  for (let d = 0; d < days; d += 1) {
    while (out[d].length < perDay && spare.length) {
      const next = spare.shift();
      if (!next) break;
      const id = String(next.id || "").trim();
      if (!id || used.has(id)) continue;
      out[d].push(next);
      used.add(id);
      const dayNum = d + 1;
      if (!contractRelaxed.includes(dayNum)) contractRelaxed.push(dayNum);
    }
  }

  return { dayAssignments: out, contractRelaxed };
}

/**
 * @param {string[]} registryNames
 * @param {Array<Record<string, unknown>>} rawCandidates
 */
export function allUsedPlaceNames(registryNames, rawCandidates) {
  const names = new Set();
  for (const n of registryNames || []) {
    const s = String(n || "").trim();
    if (s) names.add(s);
  }
  for (const c of rawCandidates || []) {
    const n = String(c?.name || "").trim();
    const sn = String(c?.searchName || "").trim();
    if (n) names.add(n);
    if (sn) names.add(sn);
  }
  return [...names];
}
