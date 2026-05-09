import {
  handleCors, sendJson, parseBody, getGroqKey,
  runGroqJson, countInclusiveTripDays, resolveUiLanguage,
  langRuleParagraph, formatPrefsForPrompt, budgetRangeHint, formatError,
  buildItineraryEnrichmentBlock,
  dedupeItineraryDayIdeas,
} from "../_helpers.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const groqKey = getGroqKey();
  if (!groqKey) return sendJson(res, 503, { error: "GROQ_API_KEY non configurée sur le serveur." });

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  if (!destination || destination.length > 120) return sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });

  const startDate = String(body.startDate || "").trim();
  const endDate = String(body.endDate || "").trim();
  const prefs = body.prefs && typeof body.prefs === "object" ? body.prefs : null;
  const countryCode = String(body.countryCode || "").trim();
  const { ok, days, error: dayErr } = countInclusiveTripDays(startDate, endDate);
  if (!ok) return sendJson(res, 400, { error: dayErr });

  const uiLang = resolveUiLanguage(body);
  const langRule = langRuleParagraph(uiLang);
  const prefsBlock = formatPrefsForPrompt(prefs);
  const bHint = budgetRangeHint(prefs);

  let enrichBlock = "";
  try {
    enrichBlock = await buildItineraryEnrichmentBlock({
      startDate,
      endDate,
      countryCode,
      uiLang,
    });
  } catch {
    enrichBlock = "";
  }

  const prompt =
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    enrichBlock +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown, sans texte avant ou après, de la forme:\n` +
    `{"dayIdeas":[{"day":1,"title":"titre court descriptif","costEur":95,"bullets":["Matin : phrase courte","Après-midi : phrase courte","Soir : phrase courte"]}, ...]}\n` +
    `Règles STRICTES :\n` +
    `- Exactement ${days} objets dans dayIdeas, day = 1 … ${days}, alignés sur le calendrier ci-dessus (même ordre).\n` +
    `- Chaque objet DOIT avoir un champ "title" NON VIDE (thème du jour, ex: "Vieille ville et gastronomie").\n` +
    `- Chaque objet DOIT avoir un champ "bullets" NON VIDE avec 2-3 phrases courtes décrivant les activités (jour de la semaine, fermetures typiques, jours fériés si listés).\n` +
    `- "costEur" : entier JSON — coût total estimé de la journée en euros, cohérent avec le budget : ${bHint}. Inclure repas, entrées, transports locaux.\n` +
    `- Pas de guillemet double non échappé ni de retour à la ligne à l'intérieur d'une chaîne JSON.\n` +
    `${langRule}\n` +
    `Lieux réels pour cette destination (pas de lieux inventés).`;

  const systemPrompt =
    "Tu produis uniquement un objet JSON valide. " +
    "Chaque dayIdeas DOIT contenir un title non vide et un bullets non vide. " +
    "Les chaînes ne contiennent jamais de guillemet double non échappé. " +
    "Le champ costEur est toujours un entier JSON. " +
    "Tu respectes le calendrier et les règles de fermetures ; tu ne inventes pas d'horaires précis non vérifiables. " +
    "Chaque jour = un quartier/zone principal cohérent ; ne répète jamais le même lieu nommé sur un autre jour.";

  try {
    const data = await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature: 0.2 });
    const list = dedupeItineraryDayIdeas(Array.isArray(data?.dayIdeas) ? data.dayIdeas : [], uiLang);
    sendJson(res, 200, { ok: true, data: { dayIdeas: list, tripDays: days, startDate, endDate } });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
