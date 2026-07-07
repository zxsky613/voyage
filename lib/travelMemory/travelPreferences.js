/**
 * Mémoire de préférences inter-voyages — déduction, pondération récence, pré-remplissage.
 * v1 : pas de préférences par destination, pas de ML.
 */

export const TRAVEL_MEMORY_VERSION = 1;
export const TRAVEL_MEMORY_MIN_TRIPS_FOR_PREFILL = 2;
export const TRAVEL_MEMORY_RECENT_WEIGHT = 2;
export const TRAVEL_MEMORY_OLDER_WEIGHT = 1;
export const TRAVEL_MEMORY_RECENT_SNAPSHOT_COUNT = 3;

const PACE_VALUES = new Set(["relaxed", "moderate", "intensive"]);
const BUDGET_VALUES = new Set(["low", "medium", "high", "luxury"]);
const TRAVELER_VALUES = new Set(["solo", "couple", "family", "friends"]);
const STYLE_VALUES = new Set(["cultural", "nature", "relaxation", "adventure", "nightlife"]);

const PENDING_SIGNALS_KEY = "tp_travel_memory_pending";

/**
 * @param {string} title
 * @returns {string|null}
 */
export function inferTravelStyleFromActivityTitle(title) {
  const n = String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(plage|beach|parc|park|jardin|garden|rando|randonnee|hike|trek|montagne|mountain|nature|lac|lake|foret|forest)\b/.test(n)) {
    return "nature";
  }
  if (/\b(musee|museum|cathedrale|cathedral|eglise|church|monument|palais|palace|cultural|chateau|castle)\b/.test(n)) {
    return "cultural";
  }
  if (/\b(spa|relax|detente|détente|hammam|wellness)\b/.test(n)) {
    return "relaxation";
  }
  if (/\b(bar|club|night|soiree|festival|discotheque|boite|nightlife)\b/.test(n)) {
    return "nightlife";
  }
  if (/\b(aventure|adventure|kayak|surf|climb|escalade|parapente|plongee|dive|rafting)\b/.test(n)) {
    return "adventure";
  }
  return null;
}

/** @returns {{ deletedStyles: Record<string, number>, itineraryRegenerations: number, dayRegenerations: number }} */
export function emptyPendingTravelSignals() {
  return { deletedStyles: {}, itineraryRegenerations: 0, dayRegenerations: 0 };
}

export function readPendingTravelSignals() {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNALS_KEY);
    if (!raw) return emptyPendingTravelSignals();
    const o = JSON.parse(raw);
    return {
      deletedStyles:
        o?.deletedStyles && typeof o.deletedStyles === "object" ? { ...o.deletedStyles } : {},
      itineraryRegenerations: Number(o?.itineraryRegenerations) || 0,
      dayRegenerations: Number(o?.dayRegenerations) || 0,
    };
  } catch {
    return emptyPendingTravelSignals();
  }
}

/** @param {ReturnType<typeof emptyPendingTravelSignals>} signals */
export function writePendingTravelSignals(signals) {
  try {
    sessionStorage.setItem(PENDING_SIGNALS_KEY, JSON.stringify(signals));
  } catch {
    /* ignore */
  }
}

export function clearPendingTravelSignals() {
  try {
    sessionStorage.removeItem(PENDING_SIGNALS_KEY);
  } catch {
    /* ignore */
  }
}

/** @param {string} activityTitle */
export function recordDeletedActivityStyleSignal(activityTitle) {
  const style = inferTravelStyleFromActivityTitle(activityTitle);
  if (!style) return;
  const pending = readPendingTravelSignals();
  pending.deletedStyles[style] = (Number(pending.deletedStyles[style]) || 0) + 1;
  writePendingTravelSignals(pending);
}

export function recordItineraryRegenerationSignal() {
  const pending = readPendingTravelSignals();
  pending.itineraryRegenerations += 1;
  writePendingTravelSignals(pending);
}

export function consumePendingTravelSignals() {
  const pending = readPendingTravelSignals();
  clearPendingTravelSignals();
  return pending;
}

/**
 * @param {string} startYmd
 * @param {string} endYmd
 */
export function tripDurationDaysInclusive(startYmd, endYmd) {
  const a = String(startYmd || "").trim();
  const b = String(endYmd || a).trim();
  const d1 = new Date(`${a}T12:00:00`);
  const d2 = new Date(`${b}T12:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

/**
 * @param {unknown} raw
 */
export function normalizeTravelPreferencesDoc(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const snapshots = Array.isArray(o.snapshots)
    ? o.snapshots
        .map((s) => ({
          savedAt: String(s?.savedAt || new Date().toISOString()),
          pace: PACE_VALUES.has(String(s?.pace)) ? String(s.pace) : null,
          styles: (Array.isArray(s?.styles) ? s.styles : [])
            .map((x) => String(x || "").trim())
            .filter((x) => STYLE_VALUES.has(x)),
          travelers: TRAVELER_VALUES.has(String(s?.travelers)) ? String(s.travelers) : null,
          budget: BUDGET_VALUES.has(String(s?.budget)) ? String(s.budget) : null,
          durationDays: Math.max(1, Number(s?.durationDays) || 1),
          signals: {
            deletedStyles:
              s?.signals?.deletedStyles && typeof s.signals.deletedStyles === "object"
                ? { ...s.signals.deletedStyles }
                : {},
            itineraryRegenerations: Number(s?.signals?.itineraryRegenerations) || 0,
            dayRegenerations: Number(s?.signals?.dayRegenerations) || 0,
          },
        }))
        .slice(-20)
    : [];
  return {
    version: TRAVEL_MEMORY_VERSION,
    snapshots,
    derived: o.derived && typeof o.derived === "object" ? { ...o.derived } : {},
  };
}

/**
 * @param {Array<{ value: string, weight: number }>} scored
 */
function weightedMode(scored) {
  const counts = new Map();
  for (const { value, weight } of scored) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + weight);
  }
  let best = "";
  let bestScore = -1;
  for (const [k, v] of counts) {
    if (v > bestScore) {
      best = k;
      bestScore = v;
    }
  }
  return best || null;
}

/**
 * @param {ReturnType<typeof normalizeTravelPreferencesDoc>} doc
 */
export function deriveTravelPreferences(doc) {
  const snapshots = doc.snapshots || [];
  const n = snapshots.length;
  if (!n) return { ...doc, derived: {} };

  const paceScores = [];
  const budgetScores = [];
  const travelerScores = [];
  const styleScores = new Map();
  const negativeStyles = new Map();
  const durations = [];

  snapshots.forEach((s, idx) => {
    const fromEnd = n - 1 - idx;
    const weight =
      fromEnd < TRAVEL_MEMORY_RECENT_SNAPSHOT_COUNT
        ? TRAVEL_MEMORY_RECENT_WEIGHT
        : TRAVEL_MEMORY_OLDER_WEIGHT;
    if (s.pace) paceScores.push({ value: s.pace, weight });
    if (s.budget) budgetScores.push({ value: s.budget, weight });
    if (s.travelers) travelerScores.push({ value: s.travelers, weight });
    for (const st of s.styles || []) {
      styleScores.set(st, (styleScores.get(st) || 0) + weight);
    }
    durations.push({ value: s.durationDays, weight });
    for (const [st, c] of Object.entries(s.signals?.deletedStyles || {})) {
      if (!STYLE_VALUES.has(st)) continue;
      negativeStyles.set(st, (negativeStyles.get(st) || 0) + Number(c) * weight);
    }
  });

  const sortedStyles = [...styleScores.entries()]
    .map(([style, score]) => ({
      style,
      score: score - (negativeStyles.get(style) || 0) * 0.75,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.style);

  let durationWeighted = 0;
  let durationTotal = 0;
  for (const d of durations) {
    durationWeighted += d.value * d.weight;
    durationTotal += d.weight;
  }

  return {
    ...doc,
    derived: {
      pace: weightedMode(paceScores),
      budget: weightedMode(budgetScores),
      travelers: weightedMode(travelerScores),
      styles: sortedStyles.slice(0, 3),
      typicalDurationDays: durationTotal ? Math.round(durationWeighted / durationTotal) : null,
      savedTripCount: n,
      negativeStyles: Object.fromEntries([...negativeStyles.entries()].filter(([, v]) => v > 0)),
    },
  };
}

/**
 * @param {ReturnType<typeof normalizeTravelPreferencesDoc>} doc
 * @param {{ prefs?: object|null, durationDays?: number, signals?: object }} snapshotInput
 */
export function appendTravelMemorySnapshot(doc, snapshotInput = {}) {
  const prefs = snapshotInput.prefs && typeof snapshotInput.prefs === "object" ? snapshotInput.prefs : null;
  const signals = snapshotInput.signals || emptyPendingTravelSignals();
  const snap = {
    savedAt: new Date().toISOString(),
    pace: PACE_VALUES.has(String(prefs?.pace)) ? String(prefs.pace) : null,
    styles: (Array.isArray(prefs?.styles) ? prefs.styles : [])
      .map((x) => String(x || "").trim())
      .filter((x) => STYLE_VALUES.has(x)),
    travelers: TRAVELER_VALUES.has(String(prefs?.travelers)) ? String(prefs.travelers) : null,
    budget: BUDGET_VALUES.has(String(prefs?.budget)) ? String(prefs.budget) : null,
    durationDays: Math.max(1, Number(snapshotInput.durationDays) || 1),
    signals: {
      deletedStyles: { ...(signals.deletedStyles || {}) },
      itineraryRegenerations: Number(signals.itineraryRegenerations) || 0,
      dayRegenerations: Number(signals.dayRegenerations) || 0,
    },
  };
  const next = normalizeTravelPreferencesDoc({
    ...doc,
    snapshots: [...(doc.snapshots || []), snap],
  });
  return deriveTravelPreferences(next);
}

/**
 * Pré-remplissage questionnaire — null si < 2 voyages avec prefs exploitables.
 * @param {ReturnType<typeof normalizeTravelPreferencesDoc>} doc
 */
export function buildTripPrefsPrefill(doc) {
  const derived = doc?.derived || {};
  const count = Number(derived.savedTripCount) || (doc?.snapshots?.length || 0);
  const withPrefs = (doc?.snapshots || []).filter((s) => s.pace || (s.styles?.length || 0) > 0).length;
  if (withPrefs < TRAVEL_MEMORY_MIN_TRIPS_FOR_PREFILL) return null;

  const styles = Array.isArray(derived.styles) ? derived.styles.filter((s) => STYLE_VALUES.has(s)) : [];
  if (!derived.pace && !styles.length && !derived.budget && !derived.travelers) return null;

  return {
    pace: PACE_VALUES.has(String(derived.pace)) ? String(derived.pace) : "moderate",
    styles,
    travelers: TRAVELER_VALUES.has(String(derived.travelers)) ? String(derived.travelers) : "couple",
    budget: BUDGET_VALUES.has(String(derived.budget)) ? String(derived.budget) : "medium",
    wishes: "",
  };
}

/**
 * @param {ReturnType<typeof normalizeTravelPreferencesDoc>} doc
 * @param {(key: string, vars?: object) => string} t
 */
export function humanizeTravelPreferences(doc, t) {
  const d = doc?.derived || {};
  const lines = [];
  const count = Number(d.savedTripCount) || 0;
  if (!count) return [];

  lines.push(t("travelMemory.summaryTripCount", { n: String(count) }));

  if (d.pace) {
    const key = `destination.prefsPace${d.pace.charAt(0).toUpperCase()}${d.pace.slice(1)}`;
    lines.push(t("travelMemory.summaryPace", { value: t(key) }));
  }
  if (Array.isArray(d.styles) && d.styles.length) {
    const labels = d.styles.map((s) => {
      const k = `destination.prefsStyle${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      return t(k);
    });
    lines.push(t("travelMemory.summaryStyles", { value: labels.join(", ") }));
  }
  if (d.budget) {
    const key = `destination.prefsBudget${d.budget.charAt(0).toUpperCase()}${d.budget.slice(1)}`;
    lines.push(t("travelMemory.summaryBudget", { value: t(key) }));
  }
  if (d.travelers) {
    const travelerKeys = {
      solo: "destination.prefsTravelersSolo",
      couple: "destination.prefsTravelerCouple",
      family: "destination.prefsTravelersFamily",
      friends: "destination.prefsTravelersFriends",
    };
    lines.push(t("travelMemory.summaryTravelers", { value: t(travelerKeys[d.travelers] || travelerKeys.couple) }));
  }
  if (d.typicalDurationDays) {
    lines.push(t("travelMemory.summaryDuration", { n: String(d.typicalDurationDays) }));
  }
  const neg = d.negativeStyles && typeof d.negativeStyles === "object" ? Object.keys(d.negativeStyles) : [];
  if (neg.length) {
    const labels = neg.map((s) => {
      const k = `destination.prefsStyle${s.charAt(0).toUpperCase()}${s.slice(1)}`;
      return t(k);
    });
    lines.push(t("travelMemory.summaryAvoids", { value: labels.join(", ") }));
  }
  return lines;
}

export function emptyTravelPreferencesDoc() {
  return deriveTravelPreferences(normalizeTravelPreferencesDoc({ snapshots: [] }));
}
