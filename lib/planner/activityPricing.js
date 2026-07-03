/** Borne haute estimation activité (EUR entier). */
export const ACTIVITY_ESTIMATE_PRICE_MAX = 300;

/** Plafonds TA price_level (1=€ … 4=€€€€) pour ajuster une surestimation LLM. */
export const TA_PRICE_LEVEL_CAP_EUR = Object.freeze({
  1: 30,
  2: 60,
  3: 120,
  4: 300,
});

/**
 * @param {unknown} n
 * @returns {number}
 */
export function clampActivityEstimatedPriceEur(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(ACTIVITY_ESTIMATE_PRICE_MAX, Math.round(x));
}

/**
 * @param {unknown} v
 * @returns {number}
 */
export function parseEstimatedPriceEurInput(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return clampActivityEstimatedPriceEur(v);
  const s = String(v)
    .trim()
    .replace(/€/gi, "")
    .replace(/\s+/g, "")
    .replace(/(\d),(\d)/g, "$1.$2");
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return 0;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? clampActivityEstimatedPriceEur(n) : 0;
}

/**
 * Ajuste l'estimation LLM si TripAdvisor fournit un price_level (ne crée pas de prix si absent).
 * @param {number} estimateEur
 * @param {unknown} priceLevel
 * @returns {number}
 */
export function refineEstimatedPriceWithPriceLevel(estimateEur, priceLevel) {
  const est = clampActivityEstimatedPriceEur(estimateEur);
  const level = Number(priceLevel);
  if (!Number.isFinite(level) || level < 1 || level > 4) return est;
  const cap = TA_PRICE_LEVEL_CAP_EUR[level];
  if (cap == null) return est;
  return Math.min(est, cap);
}

/**
 * @param {object|null|undefined} activityOrMeta
 * @returns {number}
 */
export function readActivityEstimatedPriceEur(activityOrMeta) {
  if (!activityOrMeta || typeof activityOrMeta !== "object") return 0;
  const o = /** @type {Record<string, unknown>} */ (activityOrMeta);
  const raw =
    o.estimatedPriceEur ??
    o.estimated_price_eur ??
    o.estimatedCostEur ??
    o.estimated_cost_eur ??
    o.cost ??
    o.costEur;
  return clampActivityEstimatedPriceEur(parseEstimatedPriceEurInput(raw));
}

/**
 * @param {Array<{ estimatedPriceEur?: number }>|null|undefined} activities
 * @returns {number}
 */
export function sumDayEstimatedPriceEur(activities) {
  return (Array.isArray(activities) ? activities : []).reduce(
    (sum, a) => sum + readActivityEstimatedPriceEur(a),
    0
  );
}

/**
 * @param {object} place
 * @param {unknown} [candidatePriceEur]
 * @returns {object}
 */
export function attachPricingToRegistryPlace(place, candidatePriceEur) {
  const raw =
    candidatePriceEur != null && candidatePriceEur !== ""
      ? parseEstimatedPriceEurInput(candidatePriceEur)
      : readActivityEstimatedPriceEur(place);
  const estimatedPriceEur = refineEstimatedPriceWithPriceLevel(raw, place?.priceLevel);
  return {
    ...place,
    estimatedPriceEur,
    priceSource: String(place?.priceSource || "estimate"),
  };
}

/**
 * @param {Array<{ id?: string, estimatedPriceEur?: unknown, estimated_price_eur?: unknown }>} candidates
 * @returns {Map<string, number>}
 */
export function buildPass1CandidatePriceMap(candidates) {
  const map = new Map();
  for (const c of Array.isArray(candidates) ? candidates : []) {
    const id = String(c?.id || "").trim();
    if (!id) continue;
    map.set(
      id,
      parseEstimatedPriceEurInput(c.estimatedPriceEur ?? c.estimated_price_eur)
    );
  }
  return map;
}

/**
 * Recalcule costEur journalier = somme des activités (ignore costEur LLM passe 2).
 * @param {object[]} dayIdeas
 * @returns {object[]}
 */
export function applyComputedDayCosts(dayIdeas) {
  return (Array.isArray(dayIdeas) ? dayIdeas : []).map((day) => {
    const activities = (Array.isArray(day?.activities) ? day.activities : []).map((a) => ({
      ...a,
      estimatedPriceEur: readActivityEstimatedPriceEur(a),
      priceSource: String(a?.priceSource || "estimate"),
    }));
    return {
      ...day,
      activities,
      costEur: sumDayEstimatedPriceEur(activities),
    };
  });
}

/**
 * @param {object[]} dayIdeas
 * @returns {number}
 */
export function sumTripEstimatedPriceEur(dayIdeas) {
  return applyComputedDayCosts(dayIdeas).reduce((sum, d) => sum + (Number(d?.costEur) || 0), 0);
}
