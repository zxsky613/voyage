/** Thaï + lao (alphasyllabaires) : titres OSM/WP souvent dans la langue locale alors que l’UI est FR/EN… */
const THAI_LAO_SCRIPT_RE = /[\u0E00-\u0EFF]/;

/**
 * Retire les noms de lieux uniquement / principalement en thaï ou lao lorsque la langue UI n’est pas th ou lo,
 * afin que clampPlacesList puisse compléter avec le catalogue (ex. iconicPlacesData en français).
 * @param {unknown[]} places
 * @param {string} [uiLanguage] code ISO 2 lettres (fr, en, th…)
 */
export function dropPlacesWrongScriptForUiLang(places, uiLanguage = "fr") {
  if (!Array.isArray(places)) return [];
  const lang = String(uiLanguage || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  if (lang === "th" || lang === "lo") {
    return places.map((p) => String(p || "").trim()).filter(Boolean);
  }
  return places
    .map((p) => String(p || "").trim())
    .filter((s) => s.length >= 2 && !THAI_LAO_SCRIPT_RE.test(s));
}

/**
 * Après `sanitizeMustSeePlaces` : liste prête pour `clampPlacesList`.
 * Si tout est en thaï/lao alors que l’UI est FR/EN/…, retourne [] pour forcer le catalogue emblématique au lieu de réafficher le thaï.
 */
export function pickPlacesListAfterScriptFilter(sanitized, uiLanguage = "fr") {
  if (!Array.isArray(sanitized)) return [];
  const ok = dropPlacesWrongScriptForUiLang(sanitized, uiLanguage);
  if (ok.length > 0) return ok;
  const lang = String(uiLanguage || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  if (lang === "th" || lang === "lo") {
    return sanitized.map((p) => String(p || "").trim()).filter((s) => s.length >= 2);
  }
  return [];
}

/**
 * Phrases de conseils (tips.do / tips.dont) : retire les lignes contenant du thaï/lao si l’UI n’est pas th/lo
 * (l’IA ou des données locales mélangent souvent ces scripts avec le français).
 * @param {unknown[]} lines
 * @param {string} [uiLanguage]
 */
export function filterTipLinesForUiLang(lines, uiLanguage = "fr") {
  if (!Array.isArray(lines)) return [];
  const lang = String(uiLanguage || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  if (lang === "th" || lang === "lo") {
    return lines.map((x) => String(x || "").trim()).filter((s) => s.length >= 2);
  }
  return lines
    .map((x) => String(x || "").trim())
    .filter((s) => s.length >= 2 && !THAI_LAO_SCRIPT_RE.test(s));
}

/** Chaîne normalisée pour dédoublonnage / tests (minuscules, sans accents). */
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const PLACE_SUBSTRINGS =
  /mus[eé]e|tour|parc|park|place|pont|bridge|jardin|garden|cath[eé]drale|basilique|temple|ch[aâ]teau|castle|liberty|statue|observato|quartier|district|avenue|street|st\.|center|centre|plaza|square|hall|op[eé]ra|gallery|galerie|m[eé]morial|memorial|monument|arena|stadium|zoo|aquarium|island|[îi]le|beach|plage|march[eé]|market|tower|palace|palais|gate|wall|mur|central|rockefeller|broadway|empire|brooklyn|manhattan|queens|bronx|soho|tribeca|dumbo|high\s*line|chelsea|midtown|uptown|downtown|times\s*sq|metropolitan|guggenheim|\bmo\b|moma|one\s*world|ellis|battery|wharf|pier|botanical|cathedral|chapel|abbaye|abbatiale|forum|colosseum|colis[eé]e/i;

/**
 * Filtre les entrées « lieux incontournables » manifestement hors sujet (WP, hallucinations).
 * @param {unknown[]} places
 * @param {string} destinationHint ville demandée (ex. « New York », « Paris »)
 */
export function sanitizeMustSeePlaces(places, destinationHint = "") {
  if (!Array.isArray(places)) return [];
  const destRaw = String(destinationHint || "").trim();
  const isNewYorkLike =
    /\bnew\s*york\b|\bnyc\b|\bmanhattan\b|\bbrooklyn\b|\bqueens\b|\bbronx\b/i.test(destRaw) ||
    fold(destRaw).includes("new york");

  const blockedSubstring = [
    /helvetica|comic\s*sans|times\s*new\s*roman|\barial\b|\bcalibri\b|\bcambria\b|\bgaramond\b/i,
    /jeux\s+olympiques|olympics\s+20\d{2}|jo\s+de\s+20\d{2}|jo\s+20\d{2}/i,
    /f[eê]te\s+de\s+la\s+musique/i,
    /xi[eè]zh[iì]|xi[eè]\s*zhi/i,
    /\bgendarme\b/i,
  ];

  /** Villes FR (ou assimilées) sans lien avec un city trip à New York — évite les homonymies WP. */
  const frenchCityWrongForNy =
    /^(n[îi]mes|lyon|paris|marseille|toulouse|bordeaux|strasbourg|colmar|mulhouse|m[üu]lhausen|lille|nice|rennes|reims|toulon|grenoble|dijon|angers|antibes|cannes|nantes|montpellier|aix-en-provence|avignon|metz|nancy)$/i;

  const junkNameOnly = /^(fr[eé]d[eé]ric\s+)?chopin$/i;

  function looksLikePersonNameLine(s) {
    const t = String(s || "").trim();
    if (t.length < 4 || t.length > 72) return false;
    if (PLACE_SUBSTRINGS.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    return words.every((w) => {
      const segments = w.split("-").filter(Boolean);
      if (segments.length === 0) return false;
      return segments.every((seg) => /^[\p{Lu}À-Ÿ][\p{L}à-ÿ'’-]+$/u.test(seg));
    });
  }

  const out = [];
  const seen = new Set();
  for (const p of places) {
    const s = String(p || "").trim();
    if (s.length < 2 || s.length > 120) continue;
    if (blockedSubstring.some((re) => re.test(s))) continue;
    if (junkNameOnly.test(s)) continue;
    if (isNewYorkLike && frenchCityWrongForNy.test(s)) continue;
    if (looksLikePersonNameLine(s)) continue;
    const k = fold(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
