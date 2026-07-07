/** Jalons de phase (%, pas temps réel). */
export const GENERATION_PHASE_ORDER = [
  "candidates",
  "verification",
  "positions",
  "photos",
  "composition",
  "ready",
];

/** @type {Record<string, number>} */
export const GENERATION_PHASE_PERCENT = {
  candidates: 15,
  verification: 40,
  positions: 60,
  photos: 75,
  composition: 95,
  ready: 100,
};

/** Clé i18n `destination.generationPhase*` par phase serveur. */
export const GENERATION_PHASE_I18N_KEY = {
  candidates: "generationPhaseCandidates",
  verification: "generationPhaseVerification",
  positions: "generationPhasePositions",
  photos: "generationPhasePhotos",
  composition: "generationPhaseComposition",
  ready: "generationPhaseReady",
};

export const GENERATION_STALL_MS = 90_000;
export const GENERATION_CREEP_INTERVAL_MS = 600;
export const GENERATION_CREEP_STEP = 0.35;

/**
 * @param {number} milestonePercent
 * @returns {number}
 */
export function nextMilestonePercent(milestonePercent) {
  const sorted = GENERATION_PHASE_ORDER.map((p) => GENERATION_PHASE_PERCENT[p]);
  for (const p of sorted) {
    if (p > milestonePercent) return p;
  }
  return 100;
}

/**
 * Plafond de la progression simulée entre deux jalons (jalon suivant − 2 %).
 * @param {number} milestonePercent
 * @returns {number}
 */
export function creepCapPercent(milestonePercent) {
  const next = nextMilestonePercent(milestonePercent);
  if (next <= milestonePercent) return 100;
  return Math.max(milestonePercent, next - 2);
}

/**
 * @param {number} display
 * @param {number} milestone
 * @param {number} cap
 * @returns {number}
 */
export function tickSimulatedProgress(display, milestone, cap) {
  const floor = Math.max(display, milestone);
  if (floor >= cap) return floor;
  return Math.min(cap, floor + GENERATION_CREEP_STEP);
}

/**
 * @param {string} line
 * @returns {{ type: string, phase?: string, percent?: number, ok?: boolean, data?: object, error?: string } | null}
 */
export function parseGenerationProgressLine(line) {
  const t = String(line || "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
