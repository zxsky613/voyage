import {
  handleCors, sendJson, parseBody, countInclusiveTripDays, resolveUiLanguage,
  langRuleParagraph, formatPrefsForPrompt, budgetRangeHint, formatError,
  buildItineraryEnrichmentBlock, dedupeItineraryDayIdeas,
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
import { capPlacesPerDay, dayFeasible } from "../../lib/planner/feasibility.js";
import { normalizeVerifiedDayIdeas } from "../../lib/planner/itineraryShape.js";

function padDayClusters(clusters, days, fallbackPool) {
  const out = Array.from({ length: days }, (_, i) => [...(clusters[i] || [])]);
  const used = new Set(out.flat().map((p) => p.id));
  const spare = (fallbackPool || []).filter((p) => !used.has(p.id));
  for (let d = 0; d < days; d++) {
    if (out[d].length >= 1) continue;
    const next = spare.shift();
    if (next) {
      out[d].push(next);
      used.add(next.id);
    }
  }
  return out;
}

function assignDayPeriods(dayPlaces) {
  const capped = capPlacesPerDay(dayPlaces, 2);
  return capped.map((p, i) => ({
    ...p,
    period: i === 0 ? "morning" : "afternoon",
  }));
}

function buildPass1Prompt({ destination, days, startDate, endDate, prefsBlock, enrichBlock, langRule, budgetHint, candidateCount }) {
  return (
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    enrichBlock +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide:\n` +
    `{"candidates":[{"id":"c1","name":"Nom affiché (langue voyageur)","searchName":"Official English/local TripAdvisor name","category":"museum|park|landmark|neighborhood|viewpoint","durationHours":2}, ...]}\n` +
    `Règles STRICTES :\n` +
    `- Propose exactement ${candidateCount} candidats uniques (lieux réels, noms propres).\n` +
    `- Chaque candidat a un "id" unique (c1, c2, …), un "name" NON VIDE (affichage), un "searchName" NON VIDE (nom officiel anglais/local tel que sur TripAdvisor/Google Maps), category et durationHours (1–8).\n` +
    `- Exemple : name="Vieux port de La Canée", searchName="Old Venetian Harbour Chania".\n` +
    `- Pas de repas, pas d'hôtels, pas de transport seul.\n` +
    `- Pas de doublons ni quasi-doublons entre candidats.\n` +
    `- Couvre plusieurs quartiers/zones de ${destination}.\n` +
    `- Budget indicatif : ${budgetHint}.\n` +
    `${langRule}\n`
  );
}

function buildPass2Prompt({
  destination, days, startDate, endDate, prefsBlock, enrichBlock, langRule, budgetHint, dayAssignments, placeCatalog,
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
    `{"dayIdeas":[{"day":1,"title":"titre thématique","costEur":95,"activities":[{"id":"c1","period":"morning","description":"phrase de visite concrète"}, ...]}, ...]}\n` +
    `Règles STRICTES:\n` +
    `- Exactement ${days} objets dayIdeas, day = 1 … ${days}.\n` +
    `- Chaque activities[].id DOIT être dans la liste autorisée du jour correspondant.\n` +
    `- period = "morning" ou "afternoon". Max 2 activities/jour.\n` +
    `- description : visite concrète, sans repas ni repos hôtel.\n` +
    `- costEur entier JSON, cohérent budget : ${budgetHint}.\n` +
    `${langRule}\n`
  );
}

function fallbackDayIdeasFromClusters(dayAssignments, registry) {
  return dayAssignments.map((places, i) => {
    const activities = assignDayPeriods(places).map((p) => {
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
        photos: meta.photos,
      };
    });
    return {
      day: i + 1,
      title: places.length ? places.map((p) => p.name).slice(0, 2).join(" · ") : `Jour ${i + 1}`,
      costEur: 0,
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
        photos: meta.photos,
        priceLevel: meta.priceLevel,
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
  const candidateCount = Math.min(Math.max(days * 3, 6), 42);

  let enrichBlock = "";
  try {
    enrichBlock = await buildItineraryEnrichmentBlock({ startDate, endDate, countryCode, uiLang });
  } catch {
    enrichBlock = "";
  }

  try {
    const pass1System =
      "Tu produis uniquement un objet JSON valide avec le tableau candidates. " +
      "Chaque lieu a name (affichage) et searchName (nom officiel anglais/local pour TripAdvisor). Pas de markdown.";
    const pass1 = await runPlannerLlmJson({
      prompt: buildPass1Prompt({
        destination,
        days,
        startDate,
        endDate,
        prefsBlock,
        enrichBlock,
        langRule,
        budgetHint: bHint,
        candidateCount,
      }),
      systemPrompt: pass1System,
      temperature: 0.35,
    });

    const rawCandidates = Array.isArray(pass1?.candidates) ? pass1.candidates : [];
    if (!rawCandidates.length) {
      return sendJson(res, 502, { error: "Passe 1 : aucun candidat proposé." });
    }

    const { places: verifiedPlaces, tripAdvisorCalls } = await verifyCandidatePlaces(rawCandidates, {
      city: destination,
      near,
      locale: uiLang,
    });

    const registry = new Map(verifiedPlaces.map((p) => [p.id, p]));
    const scored = scoreAndSortPlaces(verifiedPlaces, prefs || {});
    const geoPlaces = scored.filter(
      (p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
    );
    const spread = inferGeoSpreadKm(geoPlaces.length ? geoPlaces : scored);
    const { sanityKm } = thresholdsForSpread(spread);

    let dayClusters = clusterPlacesIntoDays(scored.slice(0, Math.max(days * 3, days * 2)), days);
    dayClusters = padDayClusters(dayClusters, days, scored);

    const dayAssignments = dayClusters.map((cluster) => {
      let list = capPlacesPerDay(cluster, 2);
      list = orderDayNearestNeighbor(assignDayPeriods(list));
      if (!dayFeasible(list)) list = list.slice(0, 1);
      if (list.length >= 2 && !dayOrderPassesSanityCheck(list, sanityKm)) {
        list = list.slice(0, 1);
      }
      return list;
    });

    const placeCatalog = scored.filter((p) =>
      dayAssignments.some((day) => day.some((x) => x.id === p.id))
    );

    let dayIdeas = [];
    try {
      const pass2System =
        "Tu produis uniquement un objet JSON dayIdeas. " +
        "Tu ne référenceras que des IDs du catalogue fourni. Pas de markdown.";
      const pass2 = await runPlannerLlmJson({
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
        }),
        systemPrompt: pass2System,
        temperature: 0.25,
      });
      dayIdeas = mergeDayIdeasWithRegistry(
        Array.isArray(pass2?.dayIdeas) ? pass2.dayIdeas : [],
        registry
      );
    } catch {
      dayIdeas = [];
    }

    if (
      !dayIdeas.length ||
      dayIdeas.length !== days ||
      !dayIdeas.some((d) => Array.isArray(d?.activities) && d.activities.length > 0)
    ) {
      dayIdeas = mergeDayIdeasWithRegistry(
        fallbackDayIdeasFromClusters(dayAssignments, registry),
        registry
      );
    }

    let list = normalizeVerifiedDayIdeas(dayIdeas, uiLang);
    list = dedupeItineraryDayIdeas(list, uiLang, { skipFallbackPadding: true });

    sendJson(res, 200, {
      ok: true,
      data: {
        dayIdeas: list,
        tripDays: days,
        startDate,
        endDate,
        verified: true,
        meta: {
          candidates: rawCandidates.length,
          verifiedCount: verifiedPlaces.filter((p) => p.status === "verified").length,
          partialCount: verifiedPlaces.filter((p) => p.status === "partial").length,
          unverifiedCount: verifiedPlaces.filter((p) => p.status === "unverified").length,
          tripAdvisorCalls,
        },
      },
    });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
