/**
 * Vignette de repli par catégorie quand le resolver image ne trouve pas de photo.
 * Fonction pure — testable sans React.
 */

/** @typedef {{ iconKey: string, bgClass: string, fgClass: string }} ActivityCategoryThumb */

const DEFAULT_THUMB = {
  iconKey: "MapPin",
  bgClass: "bg-brand-blue-tint",
  fgClass: "text-brand-blue",
};

/**
 * @param {string} title
 */
export function normalizeActivityTitleForCategory(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @type {Array<{ test: RegExp, thumb: ActivityCategoryThumb }>} */
const CATEGORY_RULES = [
  {
    test: /\b(train|gare|rail|railway|metro|subway)\b/,
    thumb: { iconKey: "TrainFront", bgClass: "bg-slate-100", fgClass: "text-slate-600" },
  },
  {
    test: /\b(transport|vol|flight|avion|plane|bus|ferry|transfert|transfer|aeroport|airport)\b/,
    thumb: { iconKey: "Plane", bgClass: "bg-slate-100", fgClass: "text-slate-600" },
  },
  {
    test: /\b(sport|velo|bike|cycl|cycling|kayak|surf|ski|golf|jogging|running)\b/,
    thumb: { iconKey: "Bike", bgClass: "bg-lime-50", fgClass: "text-lime-600" },
  },
  {
    test: /\b(fete|soiree|concert|bar|club|party|festival|nightlife|discotheque|boite)\b/,
    thumb: { iconKey: "PartyPopper", bgClass: "bg-rose-50", fgClass: "text-rose-600" },
  },
  {
    test: /\b(plage|beach|baignade|snorkel|snorkeling|seaside|mer|swim)\b/,
    thumb: { iconKey: "Waves", bgClass: "bg-cyan-50", fgClass: "text-cyan-600" },
  },
  {
    test: /\b(port|harbor|harbour|marina|quai|dock|embarcadere)\b/,
    thumb: { iconKey: "Anchor", bgClass: "bg-sky-50", fgClass: "text-sky-700" },
  },
  {
    test: /\b(chateau|castle|fort|fortresse|citadelle)\b/,
    thumb: { iconKey: "Castle", bgClass: "bg-stone-100", fgClass: "text-stone-600" },
  },
  {
    test: /\b(calanque|cove|gorges)\b/,
    thumb: { iconKey: "Mountain", bgClass: "bg-emerald-50", fgClass: "text-emerald-600" },
  },
  {
    test: /\b(point de vue|viewpoint|panorama|belvedere|mirador|observation|lookout)\b/,
    thumb: { iconKey: "Camera", bgClass: "bg-violet-50", fgClass: "text-violet-600" },
  },
  {
    test: /\b(rando|randonnee|hike|hiking|trek|trekking|montagne|mountain|balade|walking|trail|sentier)\b/,
    thumb: { iconKey: "Mountain", bgClass: "bg-emerald-50", fgClass: "text-emerald-600" },
  },
  {
    test: /\b(musee|museum|expo|exposition|galerie|gallery|monument|eglise|church|temple|cathedrale|basilique|palace|palais)\b/,
    thumb: { iconKey: "Landmark", bgClass: "bg-stone-100", fgClass: "text-stone-600" },
  },
  {
    test: /\b(shopping|courses|marche|market|boutique|magasin|mall|centre commercial)\b/,
    thumb: { iconKey: "ShoppingBag", bgClass: "bg-violet-50", fgClass: "text-violet-600" },
  },
  {
    test: /\b(ami|amis|famille|family|friend|friends)\b|(?:\bchez\b)|(?:visite de (?:mon |ma |mes |un |une )?(?:ami|amis|famille|friend|friends))/,
    thumb: { iconKey: "Users", bgClass: "bg-brand-orange-tint", fgClass: "text-brand-orange-ink" },
  },
  {
    test: /\b(spa|piscine|pool|hammam|sauna|wellness)\b/,
    thumb: { iconKey: "Waves", bgClass: "bg-sky-50", fgClass: "text-sky-600" },
  },
  {
    test: /\b(repos|detente|sieste|relax|relaxation|hotel|hebergement|lodging|sleep|nap)\b/,
    thumb: { iconKey: "BedDouble", bgClass: "bg-sky-50", fgClass: "text-sky-600" },
  },
  {
    test: /\b(restaurant|diner|dejeuner|brunch|cafe|coffee|manger|food|dinner|lunch|breakfast|repas|meal|bistro|brasserie|pique-nique|picnic)\b/,
    thumb: { iconKey: "UtensilsCrossed", bgClass: "bg-amber-50", fgClass: "text-amber-600" },
  },
];

/**
 * @param {string} title
 * @returns {ActivityCategoryThumb}
 */
export function categoryForActivityTitle(title) {
  const norm = normalizeActivityTitleForCategory(title);
  if (!norm) return { ...DEFAULT_THUMB };
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(norm)) return { ...rule.thumb };
  }
  return { ...DEFAULT_THUMB };
}
