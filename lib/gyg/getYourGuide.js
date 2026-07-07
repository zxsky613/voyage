import { readActivityEstimatedPriceEur } from "../planner/activityPricing.js";

export const GYG_PARTNER_ID_DEFAULT = "PJB9REI";
export const GYG_CAMPAIGN_WIDGET = "justtrip_guide_widget";
export const GYG_CAMPAIGN_ITINERARY = "justtrip_itinerary_deeplink";
export const GYG_WIDGET_SCRIPT_SRC = "https://widget.getyourguide.com/dist/pa.umd.production.min.js";
export const GYG_WIDGET_MIN_HEIGHT_PX = 420;
export const GYG_WIDGET_NUMBER_OF_ITEMS = 4;

/**
 * GetYourGuide — `data-gyg-location-id` (portail partenaire > Outils > Widget ville).
 * Clés = normalizeTextForSearch(ville). Sinon recherche via `data-gyg-q`.
 */
export const GYG_LOCATION_IDS_BY_NORMALIZED_CITY = {
  paris: "16",
  mykonos: "472",
};

/** Slug URL getyourguide.com/{slug}-l{id}/ quand le nom affiché ≠ segment anglais. */
export const GYG_SLUG_BY_NORMALIZED_CITY = {
  "new york": "new-york",
  "los angeles": "los-angeles",
  "san francisco": "san-francisco",
  "rio de janeiro": "rio-de-janeiro",
  "sao paulo": "sao-paulo",
  "le caire": "cairo",
  bruxelles: "brussels",
  florence: "florence",
  venise: "venice",
  vienne: "vienna",
  munich: "munich",
  marrakech: "marrakesh",
  pekin: "beijing",
  "hong kong": "hong-kong",
};

function normalizeTextForSearchLocal(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveGygPartnerId() {
  return String(import.meta.env?.VITE_GYG_PARTNER_ID || "").trim() || GYG_PARTNER_ID_DEFAULT;
}

export function gygLocaleCodeFromAppLanguage(appLang) {
  const c = String(appLang || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  const map = {
    fr: "fr-FR",
    en: "en-US",
    de: "de-DE",
    es: "es-ES",
    it: "it-IT",
    zh: "zh-CN",
  };
  return map[c] || "en-US";
}

export function resolveGetYourGuideLocationId(cityLabel) {
  const key = normalizeTextForSearchLocal(String(cityLabel || "").trim());
  if (key && Object.prototype.hasOwnProperty.call(GYG_LOCATION_IDS_BY_NORMALIZED_CITY, key)) {
    return String(GYG_LOCATION_IDS_BY_NORMALIZED_CITY[key] || "").trim();
  }
  return "";
}

export function slugForGetYourGuidePath(cityLabel) {
  const key = normalizeTextForSearchLocal(String(cityLabel || "").split(",")[0].trim());
  if (!key) return "";
  if (Object.prototype.hasOwnProperty.call(GYG_SLUG_BY_NORMALIZED_CITY, key)) {
    return GYG_SLUG_BY_NORMALIZED_CITY[key];
  }
  return key.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function appendGygTrackingParams(url, campaign) {
  const cmp = String(campaign || "").trim();
  if (cmp) {
    url.searchParams.set("cmp", cmp);
    url.searchParams.set("utm_source", "justtrip");
    url.searchParams.set("utm_medium", "affiliate");
    url.searchParams.set("utm_campaign", cmp);
  }
  return url;
}

/** Lien affilié destination. Préfère /{slug}-l{id}/ ; sinon recherche getyourguide.com/s/. */
export function buildGetYourGuideAffiliateUrl(cityLabel, partnerId, options = {}) {
  const pid = String(partnerId || "").trim();
  if (!pid) return "";
  const cityToken = String(cityLabel || "").split(",")[0].trim();
  const q = cityToken || "tours";
  const lid = resolveGetYourGuideLocationId(cityToken);
  const slug = slugForGetYourGuidePath(cityToken);
  let u;
  if (slug && lid) {
    u = new URL(`https://www.getyourguide.com/${slug}-l${lid}/`);
  } else {
    u = new URL("https://www.getyourguide.com/s/");
    u.searchParams.set("q", q);
  }
  u.searchParams.set("partner_id", pid);
  return appendGygTrackingParams(u, options.campaign || GYG_CAMPAIGN_WIDGET).toString();
}

/** Deep link itinéraire — recherche par lieu + ville, campagne distincte du widget. */
export function buildGetYourGuideActivityDeepLink(placeQuery, cityLabel, partnerId) {
  const pid = String(partnerId || "").trim();
  if (!pid) return "";
  const place = String(placeQuery || "").trim();
  const city = String(cityLabel || "").split(",")[0].trim();
  const q = [place, city].filter(Boolean).join(" ").trim() || city || "tours";
  const u = new URL("https://www.getyourguide.com/s/");
  u.searchParams.set("q", q);
  u.searchParams.set("partner_id", pid);
  return appendGygTrackingParams(u, GYG_CAMPAIGN_ITINERARY).toString();
}

/** @param {object} activityMeta */
export function isGygEligibleItineraryActivity(activityMeta) {
  if (!activityMeta || typeof activityMeta !== "object") return false;
  const status = String(activityMeta.status || "").toLowerCase();
  if (status !== "verified") return false;
  const price = readActivityEstimatedPriceEur(activityMeta);
  return price != null && price > 0;
}

/** @param {{ cityLabel: string, language: string, partnerId: string, numberOfItems?: number }} input */
export function buildGygWidgetMountConfig(input = {}) {
  const cityToken = String(input.cityLabel || "").split(",")[0].trim();
  const partnerId = String(input.partnerId || "").trim();
  const lid = resolveGetYourGuideLocationId(cityToken);
  const dataset = {
    "data-gyg-href": "https://widget.getyourguide.com/default/activities.frame",
    "data-gyg-widget": "activities",
    "data-gyg-partner-id": partnerId,
    "data-gyg-locale-code": gygLocaleCodeFromAppLanguage(input.language),
    "data-gyg-currency": "EUR",
    "data-gyg-number-of-items": String(
      Math.min(4, Math.max(3, Number(input.numberOfItems) || GYG_WIDGET_NUMBER_OF_ITEMS))
    ),
    "data-gyg-cmp": GYG_CAMPAIGN_WIDGET,
    "data-gyg-q": String(input.cityLabel || cityToken || "tours").trim(),
  };
  if (lid) dataset["data-gyg-location-id"] = lid;
  return { dataset };
}

let gygScriptPromise = null;

/** Charge le script widget une seule fois (lazy, hors chemin critique initial). */
export function loadGygWidgetScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (gygScriptPromise) return gygScriptPromise;

  const existing = document.querySelector(`script[src="${GYG_WIDGET_SCRIPT_SRC}"]`);
  if (existing) {
    gygScriptPromise = Promise.resolve();
    return gygScriptPromise;
  }

  gygScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GYG_WIDGET_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gygScriptPromise = null;
      reject(new Error("gyg_script_failed"));
    };
    document.head.appendChild(script);
  });
  return gygScriptPromise;
}

/** @param {HTMLElement|null} host */
export function gygWidgetHostHasContent(host) {
  if (!host) return false;
  return Boolean(
    host.querySelector("iframe") ||
      host.querySelector('a[href*="getyourguide.com"]') ||
      host.querySelector("[data-gyg-widget-rendered]") ||
      (host.children.length > 0 && host.textContent.trim().length > 20)
  );
}
