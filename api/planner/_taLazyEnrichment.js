/**
 * Enrichissement TA différé (TA_ENRICHMENT=lazy) — activités FINALES d'un voyage sauvegardé.
 * Non branché à la génération d'essai ni aux candidats verify.
 */
import {
  getTaEnrichmentMode,
  getTaMonthlyCap,
  isTaEnrichmentLazy,
} from "../../lib/planner/taEnrichment.js";
import {
  createTripAdvisorCallCounter,
  getLocationDetails,
  getLocationPhotos,
  searchLocationDetailed,
} from "./_tripadvisorClient.js";
import { readPlaceEnrichmentCache, writePlaceEnrichmentCache } from "./_enrichCache.js";

/** @type {{ month: string, count: number }} */
let monthlyUsage = { month: "", count: 0 };

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthlyUsageCount() {
  const m = currentMonthKey();
  if (monthlyUsage.month !== m) monthlyUsage = { month: m, count: 0 };
  return monthlyUsage.count;
}

function incrementMonthlyUsage(n = 1) {
  const m = currentMonthKey();
  if (monthlyUsage.month !== m) monthlyUsage = { month: m, count: 0 };
  monthlyUsage.count += Math.max(0, Number(n) || 0);
}

function canSpendTaCalls(extra = 1) {
  const cap = getTaMonthlyCap();
  if (getMonthlyUsageCount() + extra > cap) {
    console.warn(`[ta-lazy] monthly cap reached (${cap}), skipping TA enrichment`);
    return false;
  }
  return true;
}

/**
 * @param {object} activity
 * @param {{ city: string, locale?: string, searchName?: string, category?: string }} opts
 */
async function enrichSingleActivityWithTripAdvisor(activity, opts) {
  const placeName = String(activity?.title || activity?.name || "").trim();
  const city = String(opts?.city || "").trim();
  if (!placeName || !city) return activity;

  const cached = await readPlaceEnrichmentCache(placeName, city);
  if (cached && String(cached.source || "").toLowerCase() === "tripadvisor") {
    return { ...activity, ...cached, name: cached.name || placeName };
  }

  if (!canSpendTaCalls(3)) return activity;

  const taCounter = createTripAdvisorCallCounter();
  const locale = String(opts?.locale || "fr");
  const searchName = String(opts?.searchName || activity?.searchName || "").trim() || placeName;
  const searchQ = `${searchName}, ${city}`;

  const { hit, trace } = await searchLocationDetailed(searchQ, {
    language: locale,
    category: opts?.category,
    searchName,
    geoName: city,
  });
  taCounter.add(Array.isArray(trace?.attempts) ? trace.attempts.length : 1);
  if (!hit?.locationId) {
    incrementMonthlyUsage(taCounter.get());
    return activity;
  }

  if (!canSpendTaCalls(2)) {
    incrementMonthlyUsage(taCounter.get());
    return activity;
  }

  taCounter.inc();
  const details = await getLocationDetails(hit.locationId, locale);
  if (!details) {
    incrementMonthlyUsage(taCounter.get());
    return activity;
  }
  taCounter.inc();
  const photos = await getLocationPhotos(hit.locationId, locale, 5);
  taCounter.inc();

  const enrichment = {
    ...details,
    name: details.name || hit.name || placeName,
    status: "verified",
    source: "tripadvisor",
    photos,
  };
  await writePlaceEnrichmentCache(placeName, city, enrichment);
  incrementMonthlyUsage(taCounter.get());

  return {
    ...activity,
    ...enrichment,
    title: activity?.title || enrichment.name,
    name: enrichment.name,
  };
}

/**
 * Enrichit les activités persistées d'un voyage (lazy only). No-op si TA_ENRICHMENT≠lazy.
 * @param {object[]} activities
 * @param {{ city: string, locale?: string }} opts
 * @returns {Promise<{ activities: object[], taCalls: number, skipped: boolean }>}
 */
export async function enrichSavedTripActivitiesWithTripAdvisor(activities, opts) {
  if (!isTaEnrichmentLazy()) {
    return { activities: activities || [], taCalls: 0, skipped: true };
  }
  if (getTaEnrichmentMode() !== "lazy") {
    return { activities: activities || [], taCalls: 0, skipped: true };
  }

  const list = Array.isArray(activities) ? activities : [];
  const city = String(opts?.city || "").trim();
  if (!list.length || !city) return { activities: list, taCalls: 0, skipped: false };

  const out = [];
  let taCalls = 0;
  const before = getMonthlyUsageCount();

  for (const act of list) {
    const enriched = await enrichSingleActivityWithTripAdvisor(act, {
      city,
      locale: opts?.locale,
      searchName: act?.searchName,
      category: act?.category,
    });
    out.push(enriched);
  }

  taCalls = getMonthlyUsageCount() - before;
  console.info("[ta-lazy] enrich-saved-trip", {
    activities: list.length,
    taCalls,
    taEnrichment: getTaEnrichmentMode(),
    monthlyUsage: getMonthlyUsageCount(),
    monthlyCap: getTaMonthlyCap(),
  });

  return { activities: out, taCalls, skipped: false };
}
