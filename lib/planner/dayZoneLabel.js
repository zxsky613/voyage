/**
 * Labels de zone géographique par jour — dérivés des lieux réels, jamais inventés.
 */

const RELAXED_SUFFIX = Object.freeze({
  fr: "et environs",
  en: "and surrounding area",
  de: "und Umgebung",
  es: "y alrededores",
  it: "e dintorni",
  zh: "及周边",
});

const NEIGHBORHOOD_CATEGORY_RE = /neighborhood|quartier|district|vieux|old[_\s-]?town|historic[_\s-]?center|centre[_\s-]?historique/i;

/**
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeZoneLabel(raw) {
  const s = String(raw || "")
    .replace(/[«»"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.split(" ").filter(Boolean).slice(0, 4).join(" ");
}

/**
 * @param {string} destination
 * @param {string} [lang]
 */
export function relaxedZoneLabel(destination, lang = "fr") {
  const code = String(lang || "fr").slice(0, 2).toLowerCase();
  const city = String(destination || "")
    .split(/[,|]/)[0]
    .trim();
  if (!city) return "";
  const suffix = RELAXED_SUFFIX[code] || RELAXED_SUFFIX.fr;
  return sanitizeZoneLabel(`${city} ${suffix}`);
}

/**
 * @param {object} place
 */
function placeDisplayName(place) {
  return String(place?.name || place?.searchName || "").trim();
}

/**
 * Infère un label court depuis les lieux assignés (sans inventer de quartier).
 * @param {object[]} places
 * @param {string} destination
 * @param {{ contractRelaxed?: boolean, lang?: string }} [opts]
 */
export function inferZoneLabelFromPlaces(places, destination, opts = {}) {
  if (opts.contractRelaxed) {
    return relaxedZoneLabel(destination, opts.lang);
  }

  const list = (Array.isArray(places) ? places : []).filter((p) => placeDisplayName(p));
  if (!list.length) return "";

  const neighborhood = list.find((p) => {
    const cat = String(p?.category || "");
    const name = placeDisplayName(p).toLowerCase();
    return NEIGHBORHOOD_CATEGORY_RE.test(cat) || NEIGHBORHOOD_CATEGORY_RE.test(name);
  });
  if (neighborhood) return sanitizeZoneLabel(placeDisplayName(neighborhood));

  const landmark = list.find((p) => /landmark|monument|castle|château|palace|cathedral|harbour|harbor|port|beach|plage|viewpoint|panoram/i.test(String(p?.category || "")));
  if (landmark) return sanitizeZoneLabel(placeDisplayName(landmark));

  return sanitizeZoneLabel(placeDisplayName(list[0]));
}

/**
 * @param {string} dayNum
 * @param {string} zoneLabel
 * @param {string} [activityTitle]
 * @param {(key: string, vars?: object) => string} [t]
 */
export function formatDayCalendarEventTitle(dayNum, zoneLabel, activityTitle = "", t) {
  const n = Number(dayNum) || 1;
  const zone = sanitizeZoneLabel(zoneLabel);
  const act = String(activityTitle || "").trim();
  const dayPrefix = typeof t === "function" ? t("destination.itineraryDay", { n }) : `Jour ${n}`;
  if (zone && act) return `${dayPrefix} · ${zone} — ${act}`;
  if (zone) return `${dayPrefix} · ${zone}`;
  if (act) return `${dayPrefix} — ${act}`;
  return dayPrefix;
}

/**
 * @param {object[]} dayIdeas
 * @param {object[][]} dayAssignments
 * @param {string} destination
 * @param {number[]} contractRelaxed
 * @param {string} [lang]
 */
export function finalizeDayZoneLabels(dayIdeas, dayAssignments, destination, contractRelaxed = [], lang = "fr") {
  const relaxedSet = new Set((Array.isArray(contractRelaxed) ? contractRelaxed : []).map(Number));
  return (Array.isArray(dayIdeas) ? dayIdeas : []).map((day, i) => {
    const dayNum = Number(day?.day) || i + 1;
    const places = dayAssignments[i] || [];
    const isRelaxed = relaxedSet.has(dayNum);
    let zone = isRelaxed
      ? inferZoneLabelFromPlaces(places, destination, { contractRelaxed: true, lang })
      : sanitizeZoneLabel(day?.zone_label) || inferZoneLabelFromPlaces(places, destination, { lang });
    if (!zone) return { ...day };
    return { ...day, zone_label: zone };
  });
}
