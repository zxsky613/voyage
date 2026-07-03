/**
 * Plan de recherche wbsearchentities — ville seule, sans contexte géo.
 * Ordre : tel quel (fr, en) puis sans accents (en, fr).
 */

export function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} cityLabel — premier segment du label (nom de ville / lieu)
 * @returns {{ query: string, language: string }[]}
 */
export function buildEntitySearchAttempts(cityLabel) {
  const city = String(cityLabel || "").trim();
  if (city.length < 2) return [];

  const stripped = stripDiacritics(city);
  /** @type {{ query: string, language: string }[]} */
  const attempts = [];
  const seen = new Set();

  const push = (query, language) => {
    const q = String(query || "").trim();
    const lang = String(language || "en").slice(0, 2);
    if (q.length < 2) return;
    const key = `${q}\0${lang}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ query: q, language: lang });
  };

  push(city, "fr");
  push(city, "en");
  if (stripped !== city) {
    push(stripped, "en");
    push(stripped, "fr");
  }

  return attempts;
}

/**
 * Segmente un label « Ville, Région, Pays » pour la résolution d'entité.
 * @param {string} searchLabel — ville (déjà extraite ou label brut)
 * @param {string} [context] — contexte explicite si label sans virgules
 * @returns {{ cityLabel: string, geoContext: string }}
 */
export function splitCityLabelForEntitySearch(searchLabel, context = "") {
  const ctxIn = String(context || "").trim();
  const raw = String(searchLabel || "").trim();
  if (!raw) return { cityLabel: "", geoContext: ctxIn };

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { cityLabel: parts[0], geoContext: parts.slice(1).join(", ") };
  }

  return { cityLabel: raw, geoContext: ctxIn };
}

/**
 * Construit le plan complet à partir d'un label API (split + tentatives).
 * @param {string} label
 * @param {string} [context]
 */
export function buildEntitySearchPlan(label, context = "") {
  const { cityLabel, geoContext } = splitCityLabelForEntitySearch(label, context);
  return {
    cityLabel,
    geoContext,
    attempts: buildEntitySearchAttempts(cityLabel),
  };
}
