import {
  handleCors, sendJson, parseBody, countInclusiveTripDays, resolveUiLanguage,
  langRuleParagraph, formatPrefsForPrompt, budgetRangeHint, formatError,
  buildItineraryEnrichmentBlock, dedupeItineraryDayIdeas,
  createGenerationProgressSink, wantsGenerationProgressStream,
} from "../_helpers.js";
import { runPlannerLlmJson } from "./_llm.js";
import { verifyCandidatePlaces } from "./_verifyItinerary.js";
import { scoreAndSortPlaces } from "../../lib/planner/scoring.js";
import {
  clusterPlacesIntoDays,
  orderDayNearestNeighbor,
  thresholdsForSpread,
  inferGeoSpreadKm,
  dayOrderPassesSanityCheck,
} from "../../lib/planner/geoCluster.js";
import { capPlacesPerDay, clampDurationHours } from "../../lib/planner/feasibility.js";
import { normalizeVerifiedDayIdeas } from "../../lib/planner/itineraryShape.js";
import { applyGeoMismatchGuard, computePlacesCentroid, isGeoMismatchPlace } from "../../lib/planner/geoGuard.js";
import {
  attachPricingToRegistryPlace,
  buildPass1CandidatePriceMap,
} from "../../lib/planner/activityPricing.js";
import {
  activitiesPerDayForPace,
  dayHourBudget,
  pass1CandidateCount,
  pass1UniqueTarget,
} from "../../lib/planner/paceContract.js";
import { coordsSourceForPlace, placeHasCoords } from "../../lib/planner/coordsSource.js";
import { geocodeCoordlessPlaces } from "./_geocode.js";
import { resolveActivityPhotosForPlaces } from "./_resolveActivityPhotos.js";
import { haversineKm } from "../../lib/planner/geoCluster.js";
import { isTripAdvisorDisabled } from "./_tripadvisorClient.js";
import { normalizePlaceCacheKey } from "./_enrichCache.js";
import { buildEditorialPromptBlock, filterEditorialPlaces } from "../../lib/planner/editorialPolicy.js";
import {
  mergePass1Candidates,
  clusteredParJour,
  describeDayAnchor,
  buildDayTargetedCompletionPrompt,
  contractRelaxFill,
  allUsedPlaceNames,
} from "../../lib/planner/clusterCompletion.js";

/**
 * Contrat dur : chaque jour doit atteindre perDay activités.
 * Complète avec le pool restant (géolocalisés proches d'abord, puis non vérifiés)
 * PLUTÔT que de réduire le nombre.
 */
function backfillDayAssignments(clusters, days, perDay, pool) {
  const out = Array.from({ length: days }, (_, i) => [...(clusters[i] || [])]);
  const used = new Set(out.flat().map((p) => p.id));
  for (let d = 0; d < days; d += 1) {
    const day = out[d];
    if (day.length >= perDay) continue;
    const centroid = computePlacesCentroid(day);
    const spare = (pool || [])
      .filter((p) => p && !used.has(p.id))
      .sort((a, b) => {
        const ga = placeHasCoords(a);
        const gb = placeHasCoords(b);
        if (ga !== gb) return ga ? -1 : 1;
        if (centroid && ga && gb) return haversineKm(a, centroid) - haversineKm(b, centroid);
        return (Number(b.score) || 0) - (Number(a.score) || 0);
      });
    while (day.length < perDay && spare.length) {
      const next = spare.shift();
      day.push(next);
      used.add(next.id);
    }
  }
  return out;
}

/**
 * Faisabilité horaire souple : le compte du contrat rythme (perDay) est un
 * plancher DUR — on ne tronque jamais en dessous. Une activité « full day »
 * (Teide, randonnée…) ne réduit plus le jour à 2 : sa durée effective est
 * plafonnée comme les autres (les estimations LLM sont souvent gonflées).
 */
function fitDayToHourBudget(places, perDay) {
  const list = [...(places || [])];
  const floor = Math.max(1, Number(perDay) || 2);
  if (list.length <= floor) return list;
  const budget = dayHourBudget(perDay);
  const effHours = (p) => Math.min(2.5, clampDurationHours(p?.category, p?.durationHours));
  while (list.length > floor) {
    const total = list.reduce((s, p) => s + effHours(p), 0) + (list.length - 1) * 0.5;
    if (total <= budget) break;
    list.pop();
  }
  return list;
}

function assignDayPeriods(dayPlaces, perDay = 2) {
  // slice dur : capPlacesPerDay laisse passer les « full day » hors plafond,
  // ce qui produisait des jours à perDay+1 — le contrat est un compte exact.
  const capped = capPlacesPerDay(dayPlaces, perDay).slice(0, perDay);
  const morningCount = Math.ceil(capped.length / 2);
  return capped.map((p, i) => ({
    ...p,
    period: i < morningCount ? "morning" : "afternoon",
  }));
}

/**
 * Post-Pass 2 : le compte par jour est un contrat, pas une suggestion.
 * On repart de l'affectation moteur : IDs hors liste éliminés, IDs manquants réinjectés.
 */
function enforceDayAssignments(dayIdeas, dayAssignments, days) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const assigned = dayAssignments[i] || [];
    const allowedIds = new Set(assigned.map((p) => p.id));
    const day =
      (Array.isArray(dayIdeas) ? dayIdeas : []).find((d) => Number(d?.day) === i + 1) ||
      { day: i + 1, title: "", activities: [] };
    const seen = new Set();
    const acts = (Array.isArray(day.activities) ? day.activities : []).filter((a) => {
      const id = String(a?.id || "").trim();
      if (!id || !allowedIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    for (const p of assigned) {
      if (seen.has(p.id)) continue;
      acts.push({ id: p.id, period: p.period || "afternoon", description: p.name });
      seen.add(p.id);
    }
    const orderIdx = new Map(assigned.map((p, j) => [p.id, j]));
    acts.sort((a, b) => (orderIdx.get(String(a.id)) ?? 99) - (orderIdx.get(String(b.id)) ?? 99));
    out.push({ ...day, day: i + 1, activities: acts });
  }
  return out;
}

/** Dédoublonnage Pass 1 initial (ids séquentiels c1…). Conservé pour compat tests. */
function dedupePass1Candidates(candidates, city) {
  return mergePass1Candidates(candidates, city).map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

function finalizeDayCluster(cluster, perDay, sanityKm) {
  let list = capPlacesPerDay(cluster, perDay);
  list = orderDayNearestNeighbor(assignDayPeriods(list, perDay));
  list = fitDayToHourBudget(list, perDay);
  if (list.length >= 2 && !dayOrderPassesSanityCheck(list, sanityKm)) {
    list = orderDayNearestNeighbor(list);
  }
  return assignDayPeriods(list.slice(0, perDay), perDay);
}

/**
 * Cascade coords pour un sous-ensemble (nouveaux candidats complémentaires).
 * @param {object[]} places
 * @param {object} ctx
 */
async function runCoordsCascadeForPlaces(places, ctx) {
  const pass1PriceMap = buildPass1CandidatePriceMap(ctx.mergedCandidates);
  let priced = places
    .filter((p) => !isGeoMismatchPlace(p))
    .map((p) => attachPricingToRegistryPlace(p, pass1PriceMap.get(String(p.id || "").trim())));

  const preScored = scoreAndSortPlaces(priced, ctx.prefs || {});
  const geocodeStats = await geocodeCoordlessPlaces(preScored, {
    city: ctx.destination,
    country: ctx.country,
    maxRequests: Math.min(24, Math.max(8, places.length * 2)),
  });

  let cascadePlaces = geocodeStats.places;
  const estimateStats = await estimateMissingCoordsWithLlm(cascadePlaces, ctx.destination, ctx.country);
  cascadePlaces = estimateStats.places;

  cascadePlaces = applyGeoMismatchGuard(cascadePlaces).map((p) => {
    if (!isGeoMismatchPlace(p)) return p;
    const src = String(p.source || "");
    if (src === "nominatim" || src === "llm_estimate" || src === "foursquare") {
      const { latitude, longitude, geoMismatchKm, ...rest } = p;
      return { ...rest, status: rest.status === "geo_mismatch" ? "partial" : rest.status };
    }
    return p;
  });

  return {
    places: cascadePlaces.filter((p) => !isGeoMismatchPlace(p)),
    geocodeStats,
    estimateStats,
  };
}

function rescorePool(pool, prefs, sourceRank) {
  return scoreAndSortPlaces(pool, prefs || {}).sort(
    (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || sourceRank(b) - sourceRank(a)
  );
}

function buildPass1Prompt({
  destination, days, startDate, endDate, prefsBlock, enrichBlock, editorialBlock, langRule, budgetHint, candidateCount,
}) {
  return (
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    enrichBlock +
    editorialBlock +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide:\n` +
    `{"candidates":[{"id":"c1","name":"Nom affiché (langue voyageur)","searchName":"Official English/local TripAdvisor name","category":"museum|park|landmark|neighborhood|viewpoint|nature|beach|garden|historic_site|cultural_site","durationHours":2,"estimatedPriceEur":15}, ...]}\n` +
    `Règles STRICTES :\n` +
    `- Propose exactement ${candidateCount} candidats (lieux réels, noms propres).\n` +
    `- UNIQUES : chaque lieu physique apparaît UNE SEULE FOIS. Interdiction de décliner le même lieu en variantes ("Visite de X", "Découverte de X", "Explorer X", "Promenade à X"…) — un seul candidat par lieu réel.\n` +
    `- Varie les catégories (museum, park, landmark, neighborhood, viewpoint, nature, beach, garden, historic_site, cultural_site) et les zones/quartiers de ${destination}.\n` +
    `- Chaque candidat a un "id" unique (c1, c2, …), un "name" NON VIDE (affichage), un "searchName" NON VIDE (nom officiel anglais/local tel que sur TripAdvisor/Google Maps), category, durationHours (1–8) et estimatedPriceEur (entier JSON, 0–300 : coût estimé entrée/visite en euros, 0 si gratuit).\n` +
    `- Exemple : name="Vieux port de La Canée", searchName="Old Venetian Harbour Chania", estimatedPriceEur=0.\n` +
    `- Pas de repas, pas d'hôtels, pas de transport seul.\n` +
    `- Pas de doublons ni quasi-doublons entre candidats.\n` +
    `- Couvre plusieurs quartiers/zones de ${destination}.\n` +
    `- Budget indicatif : ${budgetHint}.\n` +
    `${langRule}\n`
  );
}

function buildPass2Prompt({
  destination, days, startDate, endDate, prefsBlock, enrichBlock, langRule, budgetHint, dayAssignments, placeCatalog, perDay,
}) {
  const catalogLines = placeCatalog
    .map(
      (p) =>
        `- ${p.id}: ${p.name} [${p.status}]` +
        (p.rating ? ` ★${p.rating}` : "") +
        (p.numReviews ? ` (${p.numReviews} avis)` : "") +
        (p.category ? `, ${p.category}` : "")
    )
    .join("\n");

  const assignLines = dayAssignments
    .map(
      (places, i) =>
        `Jour ${i + 1} — IDs autorisés: ${places.map((p) => p.id).join(", ") || "(aucun — laisse activities vide)"}`
    )
    .join("\n");

  return (
    `Tu rédiges le programme final pour "${destination}" (${startDate} → ${endDate}, ${days} jours).${prefsBlock}\n` +
    enrichBlock +
    `Catalogue vérifié (utilise UNIQUEMENT ces IDs dans activities[].id):\n${catalogLines}\n\n` +
    `Affectation géographique imposée par le moteur:\n${assignLines}\n\n` +
    `Réponds UNIQUEMENT avec:\n` +
    `{"dayIdeas":[{"day":1,"title":"titre thématique","activities":[{"id":"c1","period":"morning","description":"phrase de visite concrète"}, ...]}, ...]}\n` +
    `Règles STRICTES:\n` +
    `- Exactement ${days} objets dayIdeas, day = 1 … ${days}.\n` +
    `- CONTRAINTE DURE : chaque jour utilise TOUS les IDs autorisés de son jour (${perDay} activités/jour attendues), dans un ordre de visite logique. N'en retire aucun, n'en invente aucun.\n` +
    `- Chaque activities[].id DOIT être dans la liste autorisée du jour correspondant.\n` +
    `- period = "morning" ou "afternoon" (première moitié de la journée = morning).\n` +
    `- description : visite concrète, sans repas ni repos hôtel.\n` +
    `- Ne fournis PAS de costEur journalier (calculé côté serveur).\n` +
    `${langRule}\n`
  );
}

/**
 * Étape 3 de la cascade coords : estimation LLM en un seul appel batch,
 * marquée source='llm_estimate' → coords_source='estimated'.
 */
async function estimateMissingCoordsWithLlm(places, destination, country) {
  const missing = (places || []).filter((p) => p && !placeHasCoords(p));
  if (!missing.length) return { places, estimated: 0 };

  const lines = missing.map((p) => `- ${p.id}: ${p.name}`).join("\n");
  const prompt =
    `Donne les coordonnées GPS approximatives (WGS84, degrés décimaux) des lieux suivants situés à ${destination}${country ? `, ${country}` : ""}.\n` +
    `${lines}\n` +
    `Réponds UNIQUEMENT avec un JSON valide: {"coords":[{"id":"c1","lat":28.4636,"lon":-16.2518}, ...]} — un objet par lieu listé, lat/lon numériques.`;

  let byId = new Map();
  try {
    const out = await runPlannerLlmJson({
      prompt,
      systemPrompt: "Tu réponds uniquement avec un objet JSON coords valide. Pas de markdown.",
      temperature: 0,
    });
    const rows = Array.isArray(out.data?.coords) ? out.data.coords : [];
    byId = new Map(
      rows
        .filter(
          (r) =>
            String(r?.id || "").trim() &&
            Number.isFinite(Number(r?.lat)) &&
            Number.isFinite(Number(r?.lon)) &&
            Math.abs(Number(r.lat)) <= 90 &&
            Math.abs(Number(r.lon)) <= 180
        )
        .map((r) => [String(r.id).trim(), { latitude: Number(r.lat), longitude: Number(r.lon) }])
    );
  } catch {
    return { places, estimated: 0 };
  }

  let estimated = 0;
  const next = (places || []).map((p) => {
    if (!p || placeHasCoords(p)) return p;
    const hit = byId.get(String(p.id || "").trim());
    if (!hit) return p;
    estimated += 1;
    return { ...p, latitude: hit.latitude, longitude: hit.longitude, source: "llm_estimate" };
  });
  return { places: next, estimated };
}

function fallbackDayIdeasFromClusters(dayAssignments, registry, perDay = 2) {
  return dayAssignments.map((places, i) => {
    const activities = assignDayPeriods(places, perDay).map((p) => {
      const meta = registry.get(p.id) || p;
      return {
        id: p.id,
        period: p.period,
        description: meta.name || p.name,
        name: meta.name,
        status: meta.status,
        rating: meta.rating,
        numReviews: meta.numReviews,
        tripadvisorUrl: meta.tripadvisorUrl,
        latitude: meta.latitude,
        longitude: meta.longitude,
        coordsSource: coordsSourceForPlace(meta),
        photos: meta.photos,
        photoUrl: meta.photoUrl,
        photoSource: meta.photoSource,
        estimatedPriceEur: meta.estimatedPriceEur ?? 0,
        priceSource: meta.priceSource || "estimate",
      };
    });
    return {
      day: i + 1,
      title: places.length ? places.map((p) => p.name).slice(0, 2).join(" · ") : `Jour ${i + 1}`,
      activities,
    };
  });
}

function mergeDayIdeasWithRegistry(dayIdeas, registry) {
  return (Array.isArray(dayIdeas) ? dayIdeas : []).map((day, i) => {
    const activities = (Array.isArray(day?.activities) ? day.activities : []).map((a) => {
      const id = String(a?.id || "").trim();
      const meta = registry.get(id) || {};
      return {
        ...a,
        id,
        name: meta.name || a.name,
        status: meta.status,
        rating: meta.rating,
        numReviews: meta.numReviews,
        tripTypeScores: meta.tripTypeScores,
        tripadvisorUrl: meta.tripadvisorUrl,
        latitude: meta.latitude,
        longitude: meta.longitude,
        coordsSource: coordsSourceForPlace(meta),
        photos: Array.isArray(meta.photos) && meta.photos.length ? meta.photos : a.photos,
        photoUrl: meta.photoUrl || a.photoUrl,
        photoSource: meta.photoSource || a.photoSource,
        priceLevel: meta.priceLevel,
        estimatedPriceEur: meta.estimatedPriceEur ?? 0,
        priceSource: meta.priceSource || a.priceSource || "estimate",
      };
    });
    return {
      ...day,
      day: Number(day?.day) || i + 1,
      activities,
    };
  });
}

export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  if (!destination || destination.length > 120) {
    return sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });
  }

  const startDate = String(body.startDate || "").trim();
  const endDate = String(body.endDate || "").trim();
  const prefs = body.prefs && typeof body.prefs === "object" ? body.prefs : null;
  const countryCode = String(body.countryCode || "").trim();
  const country = String(body.country || "").trim();
  const near = country ? `${destination}, ${country}` : destination;

  const { ok, days, error: dayErr } = countInclusiveTripDays(startDate, endDate);
  if (!ok) return sendJson(res, 400, { error: dayErr });

  const uiLang = resolveUiLanguage(body);
  const langRule = langRuleParagraph(uiLang);
  const prefsBlock = formatPrefsForPrompt(prefs);
  const bHint = budgetRangeHint(prefs);
  // Contrat questionnaire : rythme → nombre d'activités/jour (contrainte dure),
  // Pass 1 dimensionnée dynamiquement (jours × activités × 3) au lieu du plafond 28.
  const perDay = activitiesPerDayForPace(prefs?.pace);
  const candidateCount = pass1CandidateCount(days, perDay);
  const uniqueTarget = pass1UniqueTarget(days, perDay);
  const debugMode =
    String(req.query?.debug || body.debug || "").trim() === "1" ||
    String(req.query?.debug || body.debug || "").trim() === "true";
  const streamProgress = wantsGenerationProgressStream(req, body);
  const progress = createGenerationProgressSink(res, streamProgress);
  /** @type {Record<string, number>} */
  const timings = {};
  const tPipeline = Date.now();

  let enrichBlock = "";
  try {
    enrichBlock = await buildItineraryEnrichmentBlock({ startDate, endDate, countryCode, uiLang, perDay });
  } catch {
    enrichBlock = "";
  }
  const editorialBlock = buildEditorialPromptBlock(prefs);

  try {
    const pass1System =
      "Tu produis uniquement un objet JSON valide avec le tableau candidates. " +
      "Chaque lieu a name (affichage), searchName (nom officiel anglais/local pour TripAdvisor) et estimatedPriceEur (entier 0–300). Pas de markdown.";
    const tPass1 = Date.now();
    const pass1Prompt = buildPass1Prompt({
      destination,
      days,
      startDate,
      endDate,
      prefsBlock,
      enrichBlock,
      editorialBlock,
      langRule,
      budgetHint: bHint,
      candidateCount,
    });
    let pass1;
    /** @type {string[]} */
    const llmProviders = [];
    // 84 candidats JSON : une sortie tronquée/malformée arrive — un retry suffit
    // généralement au lieu de faire échouer toute la génération.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const out = await runPlannerLlmJson({
          prompt: pass1Prompt,
          systemPrompt: pass1System,
          temperature: 0.35,
        });
        pass1 = out.data;
        llmProviders.push(out.provider);
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
        console.error(`[planner/diag] pass1 retry après échec: ${formatError(e)}`);
      }
    }
    timings.pass1Ms = Date.now() - tPass1;

    /** @type {Array<Record<string, unknown>>} */
    let allRawCandidates = Array.isArray(pass1?.candidates) ? pass1.candidates : [];
    let clusterCompletionRounds = 0;
    let mergedCandidates = mergePass1Candidates(allRawCandidates, destination);

    const candidatesRawTotal = allRawCandidates.length;
    const candidatesUnique = mergedCandidates.length;
    const uniqueRatio =
      candidatesRawTotal > 0 ? Math.round((candidatesUnique / candidatesRawTotal) * 1000) / 1000 : 0;
    const rawCandidates = mergedCandidates;
    if (!rawCandidates.length) {
      return progress.fail("Passe 1 : aucun candidat proposé.");
    }

    progress.emit("candidates");

    console.info("[planner/diag] pass1", {
      destination,
      days,
      pace: prefs?.pace || "(none)",
      candidatesRequested: candidateCount,
      candidatesReturned: candidatesRawTotal,
      candidatesRawTotal,
      candidatesUnique,
      uniqueTarget,
      uniqueRatio,
      clusterCompletionRounds,
      pass1Ms: timings.pass1Ms,
      tripAdvisorDisabled: isTripAdvisorDisabled(),
    });

    const tVerify = Date.now();
    const { places: verifiedPlacesRaw, tripAdvisorCalls, foursquareCalls: fsqInitial, debug: verifyDebug } =
      await verifyCandidatePlaces(rawCandidates, {
      city: destination,
      near,
      locale: uiLang,
      concurrency: 3,
      debug: true,
    });
    let foursquareCalls = fsqInitial;
    const editorialFilter = filterEditorialPlaces(verifiedPlacesRaw, rawCandidates, prefs);
    const verifiedPlaces = editorialFilter.places;
    const editorialExcluded = editorialFilter.excluded.length;
    const funnelVerified = verifiedPlacesRaw.length;
    const funnelEditorialKept = verifiedPlaces.length;
    timings.verifyMs = Date.now() - tVerify;

    progress.emit("verification");

    console.info("[planner/diag] editorial", {
      editorialExcluded,
      samples: editorialFilter.excluded.slice(0, 8),
    });

    {
      const withCoords = (p) =>
        Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
      const byStatus = { verified: 0, partial: 0, unverified: 0 };
      let coordsCount = 0;
      for (const p of verifiedPlaces) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        if (withCoords(p)) coordsCount += 1;
      }
      const rows = Array.isArray(verifyDebug) ? verifyDebug : [];
      const cacheHits = rows.filter((r) => r.reason === "cache_hit").length;
      const fsqCacheHits = rows.filter(
        (r) => r.reason === "cache_hit" && String(r.source || "").toLowerCase() === "foursquare"
      ).length;
      const timeouts = rows.filter((r) => r.reason === "lookup_timeout").length;
      const taHttpTotal = rows.reduce((s, r) => s + (Number(r.taHttpCalls) || 0), 0);
      console.info("[planner/diag] verify", {
        places: verifiedPlaces.length,
        ...byStatus,
        withCoords: coordsCount,
        withoutCoords: verifiedPlaces.length - coordsCount,
        cacheHits,
        fsqCacheHits,
        lookupTimeouts: timeouts,
        taCounter: tripAdvisorCalls,
        taHttpEstimated: taHttpTotal,
        foursquareCalls,
        tripAdvisorDisabled: isTripAdvisorDisabled(),
        verifyMs: timings.verifyMs,
      });
      for (const r of rows) {
        if (r.reason !== "cache_hit" && (r.status !== "verified" || !r.hasCoords)) {
          console.info("[planner/diag] verify-miss", {
            name: r.name,
            searchName: r.searchName,
            reason: r.reason,
            status: r.status,
            source: r.source,
            hasCoords: r.hasCoords,
            taAttempts: Array.isArray(r.taAttempts) ? r.taAttempts.length : 0,
          });
        }
      }
    }

    const eligiblePlaces = verifiedPlaces.filter((p) => !isGeoMismatchPlace(p));

    const pass1PriceMap = buildPass1CandidatePriceMap(rawCandidates);
    let pricedPlaces = eligiblePlaces.map((p) =>
      attachPricingToRegistryPlace(p, pass1PriceMap.get(String(p.id || "").trim()))
    );

    // ── Cascade coords (C) : TripAdvisor → Foursquare (verify) → Nominatim → LLM ──
    const verifyById = new Map(
      verifiedPlaces.map((p) => {
        const row = (Array.isArray(verifyDebug) ? verifyDebug : []).find(
          (r) => String(r?.name || "").trim() === String(p?.name || "").trim()
        );
        return [
          String(p.id || "").trim(),
          {
            source: String(p.source || ""),
            hasCoords: placeHasCoords(p),
            verifyReason: String(row?.reason || ""),
          },
        ];
      })
    );
    const tGeocode = Date.now();
    const preScored = scoreAndSortPlaces(pricedPlaces, prefs || {});
    const geocodeStats = await geocodeCoordlessPlaces(preScored, {
      city: destination,
      country,
      // Budget en requêtes HTTP (jusqu'à 2 variantes/lieu) : dimensionné pour
      // couvrir le catalogue final (days × perDay) même si TA a peu vérifié
      // (throttle/quota) — c'est l'assurance anti-'estimated'.
      maxRequests: Math.min(56, Math.max(32, days * perDay + 16)),
    });
    let cascadePlaces = geocodeStats.places;
    timings.geocodeMs = Date.now() - tGeocode;

    // Étape 3 : estimation LLM en un appel batch pour le reliquat.
    const tEstimate = Date.now();
    const estimateStats = await estimateMissingCoordsWithLlm(cascadePlaces, destination, country);
    cascadePlaces = estimateStats.places;
    timings.estimateMs = Date.now() - tEstimate;

    // Garde géo après cascade : une coordonnée geocoded/estimated aberrante est
    // retirée (le lieu reste dans le pool, sans coords) au lieu d'éliminer le lieu.
    cascadePlaces = applyGeoMismatchGuard(cascadePlaces).map((p) => {
      if (!isGeoMismatchPlace(p)) return p;
      const src = String(p.source || "");
      if (src === "nominatim" || src === "llm_estimate" || src === "foursquare") {
        const { latitude, longitude, geoMismatchKm, ...rest } = p;
        return { ...rest, status: rest.status === "geo_mismatch" ? "partial" : rest.status };
      }
      return p;
    });
    const finalPool = cascadePlaces.filter((p) => !isGeoMismatchPlace(p));
    const funnelAfterCoords = finalPool.length;

    progress.emit("positions");

    console.info("[planner/diag] coords-cascade", {
      poolSize: finalPool.length,
      geocodeAttempted: geocodeStats.attempted,
      geocodeSucceeded: geocodeStats.succeeded,
      geocodeRequests: geocodeStats.requests,
      geocodeFailReasons: geocodeStats.reasons,
      llmEstimated: estimateStats.estimated,
      stillWithoutCoords: finalPool.filter((p) => !placeHasCoords(p)).length,
      foursquareCalls,
      tripAdvisorCalls,
      tripAdvisorDisabled: isTripAdvisorDisabled(),
      geocodeMs: timings.geocodeMs,
      estimateMs: timings.estimateMs,
    });

    const geocodeFailById = new Map(
      (Array.isArray(geocodeStats.failures) ? geocodeStats.failures : []).map((f) => [f.id, f.reason])
    );
    const geocodeAttemptedIds = geocodeStats.attemptedIds instanceof Set ? geocodeStats.attemptedIds : new Set();

    const registry = new Map(finalPool.map((p) => [p.id, p]));
    // Tie-break par qualité de coords : quand TA est throttlé, la plupart des
    // scores valent 0 — sans ce critère, des lieux 'estimated' évincent des
    // 'geocoded' du catalogue final.
    const sourceRank = (p) => {
      const s = coordsSourceForPlace(p);
      if (s === "tripadvisor") return 3;
      if (s === "foursquare") return 2;
      if (s === "geocoded") return 1;
      return 0;
    };
    let scored = scoreAndSortPlaces(finalPool, prefs || {}).sort(
      (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || sourceRank(b) - sourceRank(a)
    );
    const geoPlaces = scored.filter(placeHasCoords);
    const spread = inferGeoSpreadKm(geoPlaces.length ? geoPlaces : scored);
    const { sanityKm } = thresholdsForSpread(spread);

    const tCluster = Date.now();
    const clusterInputSize = Math.max(days * perDay * 2, days * 2);
    const { clusterKm } = thresholdsForSpread(spread);
    /** @type {object[][]} */
    let dayAssignments = clusterPlacesIntoDays(scored.slice(0, clusterInputSize), days, {
      clusterKm,
    }).map((cluster) => finalizeDayCluster(cluster, perDay, sanityKm));

    let editorialExcludedTotal = editorialExcluded;
    let mergedCandidatesState = mergedCandidates;
    const processedIds = new Set(finalPool.map((p) => String(p.id || "").trim()));

    const pipelineCtx = {
      destination,
      country,
      prefs,
      mergedCandidates: mergedCandidatesState,
    };

    async function ingestSupplementBatch(batch) {
      allRawCandidates = [...allRawCandidates, ...batch];
      mergedCandidatesState = mergePass1Candidates(allRawCandidates, destination);
      pipelineCtx.mergedCandidates = mergedCandidatesState;

      const newOnes = mergedCandidatesState.filter((c) => !processedIds.has(String(c.id || "").trim()));
      if (!newOnes.length) return [];

      const { places: vRaw, foursquareCalls: fsqAdd } = await verifyCandidatePlaces(newOnes, {
        city: destination,
        near,
        locale: uiLang,
        concurrency: 2,
        debug: false,
      });
      foursquareCalls += fsqAdd;

      const ed = filterEditorialPlaces(vRaw, newOnes, prefs);
      editorialExcludedTotal += ed.excluded.length;
      if (!ed.places.length) return [];

      const cascaded = await runCoordsCascadeForPlaces(ed.places, pipelineCtx);
      const added = cascaded.places.filter(placeHasCoords);
      for (const p of added) {
        const id = String(p.id || "").trim();
        processedIds.add(id);
        registry.set(id, p);
      }
      scored = rescorePool([...registry.values()], prefs, sourceRank);
      return added;
    }

    while (clusterCompletionRounds < 2) {
      const counts = clusteredParJour(dayAssignments);
      const deficient = counts.map((n, i) => (n < perDay ? i : -1)).filter((i) => i >= 0);
      if (!deficient.length) break;

      let anyAdded = false;
      for (const dayIdx of deficient) {
        const gap = perDay - dayAssignments[dayIdx].length;
        if (gap <= 0) continue;

        const excludeNames = allUsedPlaceNames(
          [...registry.values()].map((p) => p.name),
          mergedCandidatesState
        );
        const anchor = describeDayAnchor(dayAssignments[dayIdx], destination);
        const prompt = buildDayTargetedCompletionPrompt({
          destination,
          days,
          startDate,
          endDate,
          dayIndex: dayIdx,
          dayAnchor: anchor,
          supplementCount: Math.min(gap + 2, 8),
          excludeNames,
          prefsBlock,
          enrichBlock,
          editorialBlock,
          langRule,
          budgetHint: bHint,
        });

        try {
          const supOut = await runPlannerLlmJson({
            prompt,
            systemPrompt: pass1System,
            temperature: 0.35,
          });
          llmProviders.push(supOut.provider);
          const batch = Array.isArray(supOut.data?.candidates) ? supOut.data.candidates : [];
          if (!batch.length) continue;

          const ingested = await ingestSupplementBatch(batch);
          for (const p of ingested) {
            dayAssignments[dayIdx].push(p);
            anyAdded = true;
          }
          dayAssignments[dayIdx] = finalizeDayCluster(dayAssignments[dayIdx], perDay, sanityKm);

          console.info("[planner/diag] cluster-completion", {
            round: clusterCompletionRounds + 1,
            day: dayIdx + 1,
            gap,
            returned: batch.length,
            ingested: ingested.length,
            parJour: clusteredParJour(dayAssignments),
          });
        } catch (e) {
          console.error(
            `[planner/diag] cluster-completion failed day=${dayIdx + 1}: ${formatError(e)}`
          );
        }
      }

      clusterCompletionRounds += 1;
      if (!anyAdded) break;
    }

    const relaxed = contractRelaxFill(dayAssignments, scored, perDay, days);
    dayAssignments = relaxed.dayAssignments.map((cluster) =>
      finalizeDayCluster(cluster, perDay, sanityKm)
    );
    const contractRelaxed = relaxed.contractRelaxed;

    if (contractRelaxed.length) {
      console.info("[planner/diag] contract-relaxed", {
        days: contractRelaxed,
        parJour: clusteredParJour(dayAssignments),
      });
    }

    dayAssignments = dayAssignments.map((cluster) =>
      assignDayPeriods(capPlacesPerDay(cluster, perDay).slice(0, perDay), perDay)
    );

    const funnel = {
      bruts: allRawCandidates.length,
      uniques: mergedCandidatesState.length,
      verified: funnelVerified,
      editorialKept: funnelEditorialKept,
      afterCoordsPool: funnelAfterCoords,
      clusteredParJour: clusteredParJour(dayAssignments),
      clusterCompletionRounds,
      contractRelaxed,
    };

    const placeCatalog = [];
    const catalogSeen = new Set();
    for (const day of dayAssignments) {
      for (const p of day) {
        const id = String(p?.id || "").trim();
        if (!id || catalogSeen.has(id)) continue;
        catalogSeen.add(id);
        placeCatalog.push(registry.get(id) || p);
      }
    }
    timings.clusterMs = Date.now() - tCluster;

    const tPhotos = Date.now();
    const photoResolve = await resolveActivityPhotosForPlaces(placeCatalog, {
      city: destination,
      country,
      uiLang,
      concurrency: 3,
    });
    for (const p of photoResolve.places) {
      const prev = registry.get(String(p.id || "").trim());
      if (prev) registry.set(String(p.id || "").trim(), { ...prev, ...p });
    }
    timings.photosMs = Date.now() - tPhotos;

    progress.emit("photos");

    console.info("[planner/diag] photos-cascade", {
      catalogSize: placeCatalog.length,
      photoSource: photoResolve.photoSourceCounts,
      wikimediaGeoCalls: photoResolve.wikimediaGeoCalls,
      wikimediaGeoCacheHits: photoResolve.wikimediaGeoCacheHits,
      photosMs: timings.photosMs,
    });

    console.info("[planner/diag] cluster", {
      scoredTotal: scored.length,
      geoPool: geoPlaces.length,
      clusterInput: clusterInputSize,
      perDayTarget: perDay,
      perDay: dayAssignments.map(
        (d) => `${d.length}(${d.filter(placeHasCoords).length}geo)`
      ).join(","),
      catalogSize: placeCatalog.length,
      funnel,
    });

    let dayIdeas = [];
    const tPass2 = Date.now();
    try {
      const pass2System =
        "Tu produis uniquement un objet JSON dayIdeas. " +
        "Tu ne référenceras que des IDs du catalogue fourni. Pas de markdown.";
      const pass2Out = await runPlannerLlmJson({
        prompt: buildPass2Prompt({
          destination,
          days,
          startDate,
          endDate,
          prefsBlock,
          enrichBlock,
          langRule,
          budgetHint: bHint,
          dayAssignments,
          placeCatalog,
          perDay,
        }),
        systemPrompt: pass2System,
        temperature: 0.25,
      });
      llmProviders.push(pass2Out.provider);
      const pass2 = pass2Out.data;
      // Le compte par jour est un contrat : IDs manquants réinjectés, intrus éliminés.
      const enforced = enforceDayAssignments(
        Array.isArray(pass2?.dayIdeas) ? pass2.dayIdeas : [],
        dayAssignments,
        days
      );
      dayIdeas = mergeDayIdeasWithRegistry(enforced, registry);
    } catch {
      dayIdeas = [];
    }
    timings.pass2Ms = Date.now() - tPass2;

    if (
      !dayIdeas.length ||
      dayIdeas.length !== days ||
      !dayIdeas.some((d) => Array.isArray(d?.activities) && d.activities.length > 0)
    ) {
      dayIdeas = mergeDayIdeasWithRegistry(
        fallbackDayIdeasFromClusters(dayAssignments, registry, perDay),
        registry
      );
    }

    let list = normalizeVerifiedDayIdeas(dayIdeas, uiLang);
    list = dedupeItineraryDayIdeas(list, uiLang, { skipFallbackPadding: true });

    progress.emit("composition");

    timings.totalMs = Date.now() - tPipeline;
    console.info("[planner/generate-itinerary]", {
      destination,
      days,
      candidateCount,
      ...timings,
      tripAdvisorCalls,
    });

    const allActivities = list.flatMap((d) => (Array.isArray(d?.activities) ? d.activities : []));
    const coordsSourceCounts = { tripadvisor: 0, foursquare: 0, geocoded: 0, estimated: 0, none: 0 };
    const photoSourceCounts = { tripadvisor: 0, foursquare: 0, wikimedia: 0, wikimedia_geo: 0, placeholder: 0 };
    for (const a of allActivities) {
      const src = String(a?.coordsSource || "").trim();
      if (src && coordsSourceCounts[src] != null) coordsSourceCounts[src] += 1;
      else coordsSourceCounts.none += 1;
      const ps = String(a?.photoSource || "").trim();
      if (ps && photoSourceCounts[ps] != null) photoSourceCounts[ps] += 1;
      else if (!ps || ps === "none") photoSourceCounts.placeholder += 1;
    }

    {
      const actCounts = list.map((d) => (Array.isArray(d?.activities) ? d.activities.length : 0));
      const geoCounts = list.map(
        (d) =>
          (Array.isArray(d?.activities) ? d.activities : []).filter(
            (a) => Number.isFinite(Number(a?.latitude)) && Number.isFinite(Number(a?.longitude))
          ).length
      );
      console.info("[planner/diag] final", {
        perDayTarget: perDay,
        totalActivities: actCounts.reduce((s, n) => s + n, 0),
        perDayActivities: actCounts.join(","),
        perDayWithCoords: geoCounts.join(","),
        coordsSource: coordsSourceCounts,
        photoSource: photoSourceCounts,
        candidatesRawTotal,
        candidatesUnique,
        uniqueRatio,
        clusterCompletionRounds,
        contractRelaxed,
        funnel,
        editorialExcluded: editorialExcludedTotal,
        tripAdvisorDisabled: isTripAdvisorDisabled(),
      });

      for (const a of allActivities) {
        if (String(a?.coordsSource || "") !== "estimated") continue;
        const id = String(a?.id || "").trim();
        const v = verifyById.get(id) || {};
        let nominatim = "skipped_had_coords";
        if (!v.hasCoords) {
          if (geocodeFailById.has(id)) nominatim = geocodeFailById.get(id);
          else if (geocodeAttemptedIds.has(id)) nominatim = "no_result";
          else nominatim = "geocode_budget_exhausted";
        }
        const foursquare =
          v.hasCoords && String(v.source || "").toLowerCase() === "foursquare"
            ? "hit"
            : v.verifyReason === "partial_foursquare"
              ? "miss_no_coords"
              : "no_result";
        console.info("[planner/diag] estimated-reason", {
          id,
          name: a.name || a.description,
          foursquare,
          nominatim,
          verifyReason: v.verifyReason || "(unknown)",
        });
      }
    }

    const payload = {
      ok: true,
      data: {
        dayIdeas: list,
        tripDays: days,
        startDate,
        endDate,
        verified: true,
        meta: {
          candidates: candidatesUnique,
          candidatesRawTotal,
          candidatesUnique,
          uniqueRatio,
          clusterCompletionRounds,
          contractRelaxed,
          funnel,
          perDayTarget: perDay,
          verifiedCount: verifiedPlaces.filter((p) => p.status === "verified").length,
          partialCount: verifiedPlaces.filter((p) => p.status === "partial").length,
          unverifiedCount: verifiedPlaces.filter((p) => p.status === "unverified").length,
          geoMismatchCount: verifiedPlaces.filter((p) => isGeoMismatchPlace(p)).length,
          geocoded: geocodeStats.succeeded,
          llmEstimated: estimateStats.estimated,
          coordsSourceCounts,
          photoSourceCounts,
          tripAdvisorCalls,
          foursquareCalls,
          tripAdvisorDisabled: isTripAdvisorDisabled(),
          editorialExcluded: editorialExcludedTotal,
          llmProviders: [...new Set(llmProviders)],
        },
      },
    };
    if (debugMode) payload.data.timings = timings;
    progress.emit("ready");
    progress.finish(payload);
  } catch (e) {
    progress.fail(formatError(e));
  }
}
