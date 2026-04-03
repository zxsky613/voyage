import {
  handleCors, sendJson, parseBody, getGroqKey,
  runGroqJson, countInclusiveTripDays, resolveUiLanguage,
  langRuleParagraph, formatPrefsForPrompt, budgetRangeHint, formatError,
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
  const { ok, days, error: dayErr } = countInclusiveTripDays(startDate, endDate);
  if (!ok) return sendJson(res, 400, { error: dayErr });

  const uiLang = resolveUiLanguage(body);
  const langRule = langRuleParagraph(uiLang);
  const prefsBlock = formatPrefsForPrompt(prefs);
  const bHint = budgetRangeHint(prefs);

  const prompt =
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide :\n` +
    `{"dayIdeas":[{"day":1,"title":"titre court","costEur":95,"bullets":["Matin : phrase courte","Après-midi : phrase courte"]}, ...]}\n` +
    `Règles : exactement ${days} objets, costEur = entier, 2-3 bullets par jour.\n` +
    `Budget : ${bHint}.\n${langRule}\nLieux réels uniquement.`;

  const systemPrompt =
    "Tu produis uniquement un objet JSON valide. costEur est toujours un entier JSON.";

  try {
    const data = await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature: 0.2 });
    const list = Array.isArray(data?.dayIdeas) ? data.dayIdeas : [];
    sendJson(res, 200, { ok: true, data: { dayIdeas: list, tripDays: days, startDate, endDate } });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
