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
 * @param {string|null|undefined} hhmm
 * @returns {number|null} minutes depuis minuit
 */
export function parseTimeToMinutes(hhmm) {
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

/** Buffer transfert après l'heure d'arrivée avant la 1ère activité. */
export function arrivalTransferBufferMinutes() {
  return 90;
}

/** Fin d'activité au plus tard avant l'heure de départ. */
export function departureFinishBufferMinutes() {
  return 120;
}

/**
 * Capacité d'un jour partiel selon l'heure d'arrivée ou de départ.
 * @param {number|null} timeMinutes
 * @param {"arrival"|"departure"} kind
 * @param {number} basePerDay
 */
export function partialDayTargetFromTime(timeMinutes, kind, basePerDay) {
  const base = Math.max(1, Math.floor(Number(basePerDay) || 2));
  if (timeMinutes == null) return base;
  if (kind === "arrival") {
    if (timeMinutes < 12 * 60) return base;
    if (timeMinutes < 15 * 60) return Math.ceil(base / 2);
    if (timeMinutes < 17 * 60) return 1;
    return 1;
  }
  if (timeMinutes < 12 * 60) return Math.min(1, base);
  if (timeMinutes < 17 * 60) return Math.ceil(base / 2);
  return base;
}

/**
 * Profil de créneaux pour assignDayPeriods sur un jour partiel.
 * @returns {"full"|"morning"|"afternoon"|"evening"}
 */
export function partialDayPeriodProfile(timeMinutes, kind, basePerDay, target) {
  if (target >= basePerDay || timeMinutes == null) return "full";
  if (kind === "arrival") {
    if (timeMinutes >= 17 * 60) return "evening";
    if (timeMinutes >= 15 * 60) return "evening";
    if (timeMinutes >= 12 * 60) return "afternoon";
    return "full";
  }
  if (timeMinutes < 12 * 60) return "morning";
  if (timeMinutes < 17 * 60) return "morning";
  return "full";
}

/**
 * Cibles d'activités par jour (prorata arrivée / départ).
 * Sans heures → tableau uniforme (comportement historique inchangé).
 * @param {number} days
 * @param {number} basePerDay
 * @param {string|null|undefined} arrivalTime HH:MM jour 1
 * @param {string|null|undefined} departureTime HH:MM dernier jour
 * @returns {number[]}
 */
export function computePerDayTargets(days, basePerDay, arrivalTime, departureTime) {
  const d = Math.max(1, Math.floor(Number(days) || 1));
  const base = Math.max(1, Math.floor(Number(basePerDay) || 2));
  const arrMin = parseTimeToMinutes(arrivalTime);
  const depMin = parseTimeToMinutes(departureTime);

  if (arrMin == null && depMin == null) {
    return Array.from({ length: d }, () => base);
  }

  const targets = Array.from({ length: d }, () => base);
  if (d === 1) {
    const arrT = partialDayTargetFromTime(arrMin, "arrival", base);
    const depT = partialDayTargetFromTime(depMin, "departure", base);
    targets[0] = Math.min(arrT, depT);
    return targets;
  }

  if (arrMin != null) {
    targets[0] = partialDayTargetFromTime(arrMin, "arrival", base);
  }
  if (depMin != null) {
    targets[d - 1] = partialDayTargetFromTime(depMin, "departure", base);
  }
  return targets;
}

/** @param {string|null|undefined} arrivalTime */
export function earliestFirstActivityMinutes(arrivalTime) {
  const arr = parseTimeToMinutes(arrivalTime);
  if (arr == null) return null;
  return arr + arrivalTransferBufferMinutes();
}

/** @param {string|null|undefined} departureTime */
export function latestActivityEndMinutes(departureTime) {
  const dep = parseTimeToMinutes(departureTime);
  if (dep == null) return null;
  return Math.max(0, dep - departureFinishBufferMinutes());
}

/**
 * Oversampling Pass 1 : jours × activités/jour × 3, sans s'autobrider — le
 * coût TripAdvisor n'est pas une contrainte produit (~0,10 $/génération OK).
 * @param {number} days
 * @param {number} perDay
 */
export function pass1CandidateCount(days, perDay) {
  const d = Math.max(1, Number(days) || 1);
  const n = Math.max(1, Number(perDay) || 2);
  return Math.min(Math.max(d * n * 3, 12), 120);
}

/**
 * Plancher de candidats uniques Pass 1 (après dédoublonnage normalisé).
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

/** @param {number[]|number} perDayOrTargets @param {number} dayIndex */
export function perDayForIndex(perDayOrTargets, dayIndex) {
  if (Array.isArray(perDayOrTargets)) {
    return Math.max(1, Number(perDayOrTargets[dayIndex]) || 1);
  }
  return Math.max(1, Number(perDayOrTargets) || 2);
}
