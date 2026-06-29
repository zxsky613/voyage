import { resolveHeroLookupLabel } from "../../i18n/cityDisplay.js";

/** Retire le préfixe horaire (« Matin : », « 上午： », etc.) pour la recherche d'image. */
export function stripItineraryBulletTimePrefix(bullet) {
  return String(bullet || "")
    .replace(
      /^(matin|apr[eè]s[- ]midi|soir|morning|afternoon|evening|morgen|vormittag|nachmittag|abend|上午|下午|晚上|午前|午後)\s*[:：\-–—]\s*/iu,
      ""
    )
    .trim();
}

/** Retire le segment thématique après « - » / « : » dans le titre du jour. */
export function extractItineraryPlaceFromDayTitle(dayTitle) {
  const t = String(dayTitle || "").trim();
  if (!t) return "";
  const m = t.match(/[-–—：:|]\s*([^-–—：:|]+)$/);
  if (m) return String(m[1] || "").trim();
  return t;
}

/** Extrait le lieu / thème principal d'une bullet pour getResolvedImage. */
export function extractItineraryBulletPlaceHint(bullet, dayTitle = "") {
  let text = stripItineraryBulletTimePrefix(bullet);
  text = text
    .replace(
      /^(?:自驾(?:前往|至|到)?|驾车(?:前往|至|到)?|开车(?:前往|至|到)?|到达|抵达|徒步至|步行至|乘车至|驱车至)\s*/u,
      ""
    )
    .replace(
      /^(?:参观|游览|漫步|徒步|前往|探索|欣赏|享用|享受)/u,
      ""
    )
    .replace(
      /^(visit(?:er|ing|a)?|explore(?:r|z)?|découvrir|découverte|profiter|se promener|flâner|randonnée|rando|hike|hiking|walk|walking|return to|head to|go to|drive to)\s+/iu,
      ""
    )
    .replace(/[，,。.!！?？;；].*$/, "")
    .trim();
  const generic =
    /^(?:附近|周边|当地|本地|nearby|local|around)\s*(?:的|の)?/i.test(text)
    || /^(?:海滩|beach|plage|strand|海岸|nature|自然)$/i.test(text)
    || /^在(?:半岛|附近|当地|周边)/u.test(text)
    || /半岛上(?:徒步|游览|行走|hike|walk)/i.test(text)
    || /^在.{0,12}(?:徒步|hike|walk|游览)/i.test(text);
  if (generic || text.length < 3) {
    const fromDay = extractItineraryPlaceFromDayTitle(dayTitle);
    if (fromDay.length >= 2) return fromDay;
  }
  return text.length >= 3 ? text : extractItineraryPlaceFromDayTitle(dayTitle) || stripItineraryBulletTimePrefix(bullet);
}

/** Ville précise mentionnée dans la bullet (ex. Héraklion dans une activité « Crète »). */
export function inferItineraryBulletCity(placeHint, cityLabel) {
  const blob = `${String(placeHint || "")} ${String(cityLabel || "")}`;
  if (/heraklion|伊拉克利翁|iraklio|iráklio/i.test(blob)) return "Heraklion";
  if (/chania|hania|哈尼亚|hanía/i.test(blob)) return "Chania";
  if (/rethymno|réthymnon|雷西姆农/i.test(blob)) return "Rethymno";
  if (/elafonisi|elafonissi|埃拉福尼西/i.test(blob)) return "Elafonisi";
  if (/巴厘|bali/i.test(blob) && /crete|克里特|greece|希腊/i.test(blob)) return "Bali, Crete";
  return resolveHeroLookupLabel(cityLabel) || String(cityLabel || "").trim();
}

/**
 * Paramètres getResolvedImage({ kind:'activity'|'landmark', ... }) depuis une bullet ou activité.
 * @returns {{ label: string, context: string }}
 */
export function buildActivityResolveParams(bulletOrTitle, cityLabel, dayTitle = "") {
  const label = extractItineraryBulletPlaceHint(bulletOrTitle, dayTitle);
  const context = inferItineraryBulletCity(label, cityLabel) || String(cityLabel || "").trim();
  return { label, context };
}
