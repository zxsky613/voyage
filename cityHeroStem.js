/**
 * Tige ville (premier segment « Voyage à X », Valence→Valencia, etc.) et clés pour images héros figées.
 * Centralisé pour éviter collisions d’alias catalogue (ex. « Canton » = Guangzhou) avec la géographie CH/BE
 * (« Canton de Vaud ») et pour aligner scripts de vérif avec l’app.
 *
 * Règle produit pour `buildCityHeroLookupKeys` :
 * - les clés Commons/bundles viennent uniquement de la **tige ville** (`raw`), pas des morceaux après la virgule
 *   « pays / canton administratif » ;
 * - garde-fou si `raw` contient encore « canton de|du|of … » dans le **libellé complet** : ne pas utiliser
 *   les jetons d’alias Guangzhou (`canton`, `kwangchow`) comme fragments.
 *
 * Note : `resolveCanonicalCity` ci-dessous est la même logique que dans `App.jsx` (recherche catalogue) ;
 * toute évolution des alias doit rester cohérente entre les deux.
 */
import { CITY_CATALOG, CITY_ALIASES } from "./cityCatalogData.js";
import { resolveHeroLookupLabel } from "./i18n/cityDisplay.js";

function normalizeCityInput(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTextForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const CITY_SEARCH_ENTRIES = CITY_CATALOG.flatMap((canonical) => {
  const aliases = Array.isArray(CITY_ALIASES[canonical]) ? CITY_ALIASES[canonical] : [];
  return [{ label: canonical, canonical }, ...aliases.map((alias) => ({ label: alias, canonical }))];
});

export function resolveCanonicalCity(value) {
  const q = normalizeTextForSearch(value);
  if (!q) return normalizeCityInput(value);
  const exact = CITY_SEARCH_ENTRIES.find((entry) => normalizeTextForSearch(entry.label) === q);
  return exact ? exact.canonical : normalizeCityInput(value);
}

/** Retire les préfixes administratifs FR/EN/ES/IT/PT (« Ville de Capri » → « Capri »). */
export function stripAdministrativeCityPrefix(label) {
  return String(label || "")
    .trim()
    .replace(
      /^(?:ville|commune|town|city|cidade|ciudad|citt[aà]|municipio|localit[aà])\s+(?:de|d[''']|du|del|dela|di|von|of)\s+/iu,
      ""
    )
    .trim();
}

/** Requête Nominatim — « Ville de Capri, Campanie, Italie » → « Capri, Campanie, Italie » */
export function buildNominatimCityQuery(destination) {
  const s = String(destination || "").trim();
  if (!s) return "";
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const head = stripAdministrativeCityPrefix(parts[0]);
  if (parts.length === 1) return head || stripAdministrativeCityPrefix(s);
  return [head || parts[0], ...parts.slice(1)].filter(Boolean).join(", ");
}

export function extractCityPrompt(destination) {
  const s = String(destination || "").trim();
  if (!s) return "";
  const comma = s.split(",")[0]?.trim() || "";
  const dash = /\s-\s/.test(comma) ? comma.split(/\s-\s/)[0]?.trim() || comma.trim() : comma.trim();
  return stripAdministrativeCityPrefix(dash);
}

function normalizeForHeroHint(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function disambiguateHeroCityStem(primaryLabel, fullContext) {
  const base = String(primaryLabel || "").trim();
  if (!base) return "";
  const full = normalizeForHeroHint(`${fullContext || ""} ${base}`);
  const baseNorm = normalizeForHeroHint(base.split(",")[0]?.trim() || base);
  if (baseNorm === "valence") {
    const spain =
      /\bespagne\b/.test(full) ||
      /\bspain\b/.test(full) ||
      /\bespaña\b/.test(full) ||
      /\bespana\b/.test(full) ||
      /\bspanien\b/.test(full) ||
      /\bkingdom of spain\b/.test(full) ||
      /comunidad valenciana/.test(full) ||
      /comunitat valenciana/.test(full) ||
      /communaute valencienne/.test(full) ||
      /comunidade valenciana/.test(full) ||
      /generalitat valenciana/.test(full) ||
      /valencian community/.test(full) ||
      (/\bvalencian\b/.test(full) &&
        !/\bfrance\b/.test(full) &&
        !/\bdrome\b/.test(full) &&
        !/\bdrôme\b/.test(full));
    if (spain) return "Valencia";
  }
  return base;
}

export function heroImageStemFromDestination(destination) {
  const raw = String(destination || "").trim();
  if (!raw) return "";
  const base =
    stripAdministrativeCityPrefix(resolveHeroLookupLabel(raw) || extractCityPrompt(raw) || raw);
  return disambiguateHeroCityStem(base, raw);
}

/** URLs figées (Commons, bundle) — jamais Unsplash (trop de faux positifs en cache). */
export function isTrustworthyHeroImageUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  if (/images\.unsplash\.com/.test(u)) return false;
  if (/upload\.wikimedia\.org/.test(u)) return true;
  if (u.startsWith("/destinations/")) return true;
  if (/\/storage\/v1\/object\/public\//.test(u)) return true;
  return false;
}

/** Clé cache image ville — tige + contexte géo si présent (v70 : homonymes ex. Capri IT vs HN). */
export function buildCityImageCacheKey(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw) return "";

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const stemRaw =
    stripAdministrativeCityPrefix(
      resolveHeroLookupLabel(raw) ||
        heroImageStemFromDestination(raw) ||
        extractCityPrompt(raw) ||
        raw
    ) ||
    parts[0] ||
    raw;
  const base = normalizeTextForSearch(
    heroImageStemFromDestination(stemRaw) || resolveHeroLookupLabel(stemRaw) || stemRaw
  );
  if (!base) return "";

  const ctxNorm = parts.length >= 2 ? normalizeTextForSearch(parts.slice(1).join(", ")) : "";
  const discriminant = ctxNorm ? `${base}|${ctxNorm}` : base;
  return `v70:${discriminant}`;
}

/** Guangzhou catalogue / Commons : alias « Canton » ; ne pas confondre avec subdivision CH/BE (canton du …). */
export function isAdministrativeDistrictCantonContext(fullDestination) {
  const n = normalizeTextForSearch(String(fullDestination || ""));
  if (!/\bcanton\b/.test(n)) return false;
  return /\bcanton (de|du|of)\b/.test(n);
}

function shouldSuppressGuangzhouAliasPiece(pieceNorm, fullDestination) {
  if (!pieceNorm) return false;
  if (!isAdministrativeDistrictCantonContext(fullDestination)) return false;
  return pieceNorm === "canton" || pieceNorm === "kwangchow";
}

/**
 * Clés `normalizeTextForSearch` pour lookup WIKIMEDIA / bundles heroes.
 * Important : aucun fragment issu uniquement du suffixe géographique (région, pays après la virgule) —
 * seule la tige `raw` évite les collisions d’alias (ex. « Canton de Vaud » → Guangzhou).
 */
export function buildCityHeroLookupKeys(cityInput) {
  const full = String(cityInput || "").trim();
  const raw = String(heroImageStemFromDestination(cityInput) || extractCityPrompt(cityInput) || full).trim();
  if (!raw && !full) return [];
  const keys = [];
  const pushKey = (k, minLen = 2) => {
    const n = normalizeTextForSearch(String(k || "").trim());
    if (!n || n.length < minLen || keys.includes(n)) return;
    keys.push(n);
  };

  const primarySeg = String(extractCityPrompt(cityInput) || extractCityPrompt(full) || "").trim();
  if (primarySeg && primarySeg !== raw) {
    pushKey(primarySeg, 2);
    const firstPrimary = primarySeg.split(/\s+/)[0] || "";
    if (firstPrimary) {
      const ftNorm = normalizeTextForSearch(firstPrimary);
      if (!shouldSuppressGuangzhouAliasPiece(ftNorm, full)) pushKey(firstPrimary, 2);
    }
  }

  const canonical = resolveCanonicalCity(raw);
  if (canonical) pushKey(canonical, 2);
  pushKey(raw, 2);

  const firstTok = raw.split(/\s+/)[0] || "";
  if (firstTok) {
    const ftNorm = normalizeTextForSearch(firstTok);
    if (!shouldSuppressGuangzhouAliasPiece(ftNorm, full)) pushKey(firstTok, 2);
  }

  for (const piece of raw.split(/[\s,\-–—]+/)) {
    const pieceNorm = normalizeTextForSearch(String(piece || "").trim());
    if (shouldSuppressGuangzhouAliasPiece(pieceNorm, full)) continue;
    pushKey(piece, 3);
  }

  return keys;
}
