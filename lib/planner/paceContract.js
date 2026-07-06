/**
 * Contrat rythme du questionnaire → contraintes DURES du pipeline.
 * Le rythme choisi détermine le nombre d'activités par jour ; la Pass 1 est
 * dimensionnée en fonction (oversampling ×3) au lieu d'une constante.
 */

/** @param {string} pace 'relaxed' | 'moderate' | 'intensive' */
export function activitiesPerDayForPace(pace) {
  const p = String(pace || "").trim().toLowerCase();
  if (p === "relaxed") return 2;
  if (p === "intensive") return 4;
  return 3;
}

/**
 * Oversampling Pass 1 : jours × activités/jour × 3, sans s'autobrider — le
 * coût TripAdvisor n'est pas une contrainte produit (~0,10 $/génération OK).
 * 8 j × 4 = 96 passe entier ; ~40 tokens/candidat → ~5 000 tokens de sortie,
 * dans la marge maxTokens (8000) de Groq. La borne 120 ne mord que sur les
 * très longs séjours intensifs (>= 10 j × 4) où le JSON devient peu fiable
 * (les troncatures observées venaient du repli Gemini free tier, pas de Groq).
 * @param {number} days
 * @param {number} perDay
 */
export function pass1CandidateCount(days, perDay) {
  const d = Math.max(1, Number(days) || 1);
  const n = Math.max(1, Number(perDay) || 2);
  return Math.min(Math.max(d * n * 3, 12), 120);
}

/**
 * Plancher de candidats uniques Pass 1 (après dédoublonnage normalisé) :
 * jours × activités/jour × 1,5 — en dessous, relances complémentaires (max 2).
 * @param {number} days
 * @param {number} perDay
 */
export function pass1UniqueTarget(days, perDay) {
  const d = Math.max(1, Number(days) || 1);
  const n = Math.max(1, Number(perDay) || 2);
  return Math.ceil(d * n * 1.5);
}

/**
 * Budget d'heures de visite par jour selon la densité demandée
 * (2/jour → 9 h, 3/jour → 10,5 h, 4/jour → 12 h, trajets inclus).
 * @param {number} perDay
 */
export function dayHourBudget(perDay) {
  const n = Math.max(1, Number(perDay) || 2);
  return 9 + Math.max(0, n - 2) * 1.5;
}
