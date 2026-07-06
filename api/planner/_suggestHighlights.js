import {
  handleCors,
  sendJson,
  parseBody,
  resolveUiLanguage,
  langRuleParagraph,
  buildItineraryEnrichmentBlock,
  formatError,
} from "../_helpers.js";
import { runPlannerLlmJson } from "./_llm.js";
import { verifyCandidatePlaces } from "./_verifyItinerary.js";
import { resolveDestinationCenter } from "./_geocode.js";
import { buildDestinationHighlightsFromVerified } from "../../lib/planner/highlightShape.js";
import {
  readDestinationHighlightsCache,
  writeDestinationHighlightsCache,
} from "../../lib/planner/highlightsListCache.js";

const HIGHLIGHT_CANDIDATE_COUNT = 12;
const HIGHLIGHT_OUTPUT_MAX = 8;

function buildSuggestHighlightsPrompt({ destination, enrichBlock, langRule, candidateCount }) {
  return (
    `Tu es un expert voyage. Destination: "${destination}".\n` +
    enrichBlock +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide:\n` +
    `{"candidates":[{"id":"h1","name":"Nom affiché (langue voyageur)","searchName":"Official English/local TripAdvisor name","category":"museum|park|landmark|neighborhood|market|viewpoint|nature","estimatedPriceEur":15}, ...]}\n` +
    `Règles STRICTES :\n` +
    `- Propose exactement ${candidateCount} lieux réels uniques et visitables (monuments, musées, quartiers, marchés, parcs, points de vue…).\n` +
    `- Chaque candidat : id unique (h1…), name NON VIDE (affichage), searchName NON VIDE (nom officiel TripAdvisor/Google Maps), category, estimatedPriceEur (entier 0–300, 0 si gratuit).\n` +
    `- Pas de repas, hôtels, transport seul, plages génériques ni activités floues (« visite de la ville »).\n` +
    `- Pas de doublons. Couvre plusieurs zones de ${destination}.\n` +
    `${langRule}\n`
  );
}

function normalizeCandidates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const unique = [];
  const seen = new Set();
  for (const c of list) {
    const name = String(c?.name || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      id: String(c?.id || "").trim() || `h${unique.length + 1}`,
      name,
      searchName: String(c?.searchName || "").trim(),
      category: String(c?.category || "").trim(),
      estimatedPriceEur: c?.estimatedPriceEur,
    });
    if (unique.length >= HIGHLIGHT_CANDIDATE_COUNT) break;
  }
  return unique;
}

export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  const country = String(body.country || "").trim();
  const countryCode = String(body.countryCode || "").trim();
  const near = country ? `${destination}, ${country}` : destination;
  const locale = resolveUiLanguage(body);
  const debugMode = String(req.query?.debug || "").trim() === "1";

  if (!destination) return sendJson(res, 400, { error: "destination requise" });

  try {
    const cached = await readDestinationHighlightsCache(destination, locale);
    if (cached && Array.isArray(cached.highlights) && cached.highlights.length > 0) {
      const payload = {
        ok: true,
        data: {
          highlights: cached.highlights,
          tripAdvisorCalls: cached.tripAdvisorCalls || 0,
          cached: true,
        },
      };
      if (debugMode) payload.debug = { cacheHit: true };
      return sendJson(res, 200, payload);
    }

    const langRule = langRuleParagraph(locale);
    const enrichBlock = buildItineraryEnrichmentBlock({
      destination,
      country,
      countryCode,
      language: locale,
    });

    const pass1Out = await runPlannerLlmJson({
      prompt: buildSuggestHighlightsPrompt({
        destination,
        enrichBlock,
        langRule,
        candidateCount: HIGHLIGHT_CANDIDATE_COUNT,
      }),
      temperature: 0.35,
      maxTokens: 2048,
    });

    const candidates = normalizeCandidates(pass1Out.data?.candidates);
    if (!candidates.length) {
      return sendJson(res, 200, {
        ok: true,
        data: { highlights: [], tripAdvisorCalls: 0, cached: false },
      });
    }

    const destinationCenter = await resolveDestinationCenter(destination, country);
    const geoOutlierRejected = { n: 0, inc() { this.n += 1; }, get() { return this.n; } };
    const { places, tripAdvisorCalls } = await verifyCandidatePlaces(candidates, {
      city: destination,
      near,
      locale,
      concurrency: 6,
      debug: debugMode,
      destinationCenter,
      geoOutlierRejected,
    });

    const cityLabel = destination.split(",")[0].trim();
    const highlights = buildDestinationHighlightsFromVerified(places, candidates, {
      cityLabel,
      max: HIGHLIGHT_OUTPUT_MAX,
      profile: body.prefs && typeof body.prefs === "object" ? body.prefs : {},
    });

    if (highlights.length > 0) {
      await writeDestinationHighlightsCache(destination, locale, highlights, tripAdvisorCalls);
    }

    const payload = {
      ok: true,
      data: {
        highlights,
        tripAdvisorCalls: tripAdvisorCalls || 0,
        cached: false,
      },
    };
    if (debugMode) {
      payload.debug = {
        candidateCount: candidates.length,
        verifiedCount: (places || []).filter((p) => p.status === "verified").length,
      };
    }
    sendJson(res, 200, payload);
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
