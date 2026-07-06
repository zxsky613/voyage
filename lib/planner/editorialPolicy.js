/**
 * Ligne éditoriale activités planner — lieux de découverte, pas commerce/restauration.
 * Paramétrable via prefs (ex. thème gastronomie futur assouplit restaurant/café).
 */

/** Catégories LLM Pass 1 considérées comme commerce/restauration. */
export const DEFAULT_EXCLUDED_LLM_CATEGORIES = [
  "restaurant",
  "cafe",
  "coffee",
  "bar",
  "pub",
  "food",
  "dining",
  "shopping",
  "shop",
  "retail",
  "mall",
  "market",
  "store",
  "boutique",
  "souvenir",
];

/** Motifs texte (nom, searchName, description) — insensible à la casse. */
const EXCLUDED_NAME_RE =
  /\b(restaurant|resto|brasserie|bistro|bistrot|caf[eé]|coffee\s?shop|tea\s?room|bar\b|pub\b|tapas\s?bar|pizzeria|pizzería|trattoria|osteria|boulangerie|patisserie|pâtisserie|bakery|food\s?court|fast\s?food|burger|kebab|sushi\s?bar|ramen|izakaya|bodega|taberna|winery\s?tasting|degustation|shopping|boutique|magasin|store\b|mall|centre\s?commercial|center\s?commercial|outlet|department\s?store|souvenir\s?shop|gift\s?shop|duty\s?free|supermarket|supermarch[eé]|hypermarket|grocery|epicerie|épicerie|march[eé]\s?(couvert|aux\s?puces|artisanal)?\s?(shopping|flea)?)\b/i;

/** Catégories FSQ / OSM (nom de catégorie normalisé). */
const EXCLUDED_VENUE_CATEGORY_RE =
  /\b(restaurant|caf[eé]|coffee\s?shop|food\s?(court|truck|stand)|bar\b|pub\b|nightclub|wine\s?bar|bakery|dessert|fast\s?food|pizza|burger|shop|store|boutique|mall|department\s?store|market|grocery|supermarket|convenience|gift\s?shop|souvenir|clothing|fashion|jewelry|jewellery|electronics|furniture|home\s?goods|shopping)\b/i;

/**
 * @param {object|null|undefined} prefs
 * @returns {{ excludedLlmCategories: string[], excludedNameRe: RegExp, excludedVenueRe: RegExp }}
 */
export function resolveEditorialPolicy(prefs) {
  let excludedLlmCategories = [...DEFAULT_EXCLUDED_LLM_CATEGORIES];
  const styles = Array.isArray(prefs?.styles) ? prefs.styles.map((s) => String(s).toLowerCase()) : [];

  if (styles.includes("gastronomy")) {
    excludedLlmCategories = excludedLlmCategories.filter(
      (c) => !["restaurant", "cafe", "coffee", "bar", "pub", "food", "dining"].includes(c)
    );
  }

  return {
    excludedLlmCategories,
    excludedNameRe: EXCLUDED_NAME_RE,
    excludedVenueRe: EXCLUDED_VENUE_CATEGORY_RE,
  };
}

/**
 * @param {object|null|undefined} prefs
 * @returns {string}
 */
export function buildEditorialPromptBlock(prefs) {
  const policy = resolveEditorialPolicy(prefs);
  const styles = Array.isArray(prefs?.styles) ? prefs.styles.map((s) => String(s).toLowerCase()) : [];
  const gastronomyOk = styles.includes("gastronomy");

  let block =
    "\nLIGNE ÉDITORIALE — ACTIVITÉS DE DÉCOUVERTE (IMPÉRATIF) :\n" +
    "- Chaque candidat est un LIEU DE DÉCOUVERTE : monument, site naturel, panorama, musée, jardin, quartier historique, expérience culturelle, parc, plage emblématique, viewpoint.\n" +
    "- INTERDIT comme activité principale : restaurants, cafés, bars, boutiques, centres commerciaux, marchés orientés shopping, food courts.\n" +
    "- La gastronomie ou l'artisanat local peut être mentionnée dans la description d'un QUARTIER ou d'une visite globale — jamais comme créneau dédié « repas » ou « shopping ».\n" +
    `- Catégories autorisées Pass 1 : museum, park, landmark, neighborhood, viewpoint, nature, beach, garden, historic_site, cultural_site.\n` +
    `- Catégories interdites Pass 1 : ${policy.excludedLlmCategories.join(", ")}.\n`;

  if (gastronomyOk) {
    block +=
      "- Profil gastronomie : tu peux inclure des adresses food & drink comme activités principales (restaurant, café, marché alimentaire).\n";
  }

  return block;
}

/**
 * @param {unknown} categories
 * @returns {string[]}
 */
function flattenVenueCategoryLabels(categories) {
  const out = [];
  const walk = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== "object") continue;
      const name = String(item.name || item.label || item.short_name || "").trim();
      if (name) out.push(name);
      if (Array.isArray(item.parents)) walk(item.parents);
    }
  };
  walk(categories);
  return out;
}

/**
 * @param {object} params
 * @param {object|null|undefined} params.candidate
 * @param {object|null|undefined} params.place
 * @param {object|null|undefined} params.prefs
 * @returns {{ excluded: boolean, reason?: string }}
 */
export function evaluateEditorialExclusion({ candidate, place, prefs }) {
  const policy = resolveEditorialPolicy(prefs);
  const llmCat = String(candidate?.category || place?.category || "").trim().toLowerCase();
  if (llmCat && policy.excludedLlmCategories.includes(llmCat)) {
    return { excluded: true, reason: `llm_category:${llmCat}` };
  }

  const hay = [
    candidate?.name,
    candidate?.searchName,
    place?.name,
    place?.searchName,
    place?.raw_name,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" | ");

  if (hay && policy.excludedNameRe.test(hay)) {
    return { excluded: true, reason: "name_pattern" };
  }

  const venueLabels = flattenVenueCategoryLabels(place?.fsqCategories || place?.categories);
  for (const label of venueLabels) {
    if (policy.excludedVenueRe.test(label)) {
      return { excluded: true, reason: `venue_category:${label.slice(0, 40)}` };
    }
  }

  return { excluded: false };
}

/**
 * @param {object[]} places
 * @param {object[]} candidates
 * @param {object|null|undefined} prefs
 */
export function filterEditorialPlaces(places, candidates, prefs) {
  const byId = new Map(
    (Array.isArray(candidates) ? candidates : []).map((c) => [String(c?.id || "").trim(), c])
  );
  /** @type {object[]} */
  const kept = [];
  /** @type {object[]} */
  const excluded = [];

  for (const place of Array.isArray(places) ? places : []) {
    const id = String(place?.id || "").trim();
    const verdict = evaluateEditorialExclusion({
      candidate: byId.get(id),
      place,
      prefs,
    });
    if (verdict.excluded) {
      excluded.push({
        id,
        name: place?.name,
        reason: verdict.reason,
      });
    } else {
      kept.push(place);
    }
  }

  return { places: kept, excluded };
}
