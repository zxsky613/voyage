import {
  handleCors, sendJson, parseBody, getGeminiKey, getGeminiModel,
  runGeminiJson, countInclusiveTripDays, resolveUiLanguage,
  langRuleParagraph, formatPrefsForPrompt, budgetRangeHint, formatError,
} from "../_helpers.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const key = getGeminiKey();
  if (!key) return sendJson(res, 503, { error: "GEMINI_API_KEY non configurée sur le serveur." });

  const parsed = parseBody(req);
  const modelId = getGeminiModel();
  const destination = String(parsed.destination || "").trim();
  if (!destination || destination.length > 120) return sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });

  const startDate = String(parsed.startDate || "").trim();
  const endDate = String(parsed.endDate || "").trim();
  const prefs = parsed.prefs && typeof parsed.prefs === "object" ? parsed.prefs : null;
  const { ok, days, error: dayErr } = countInclusiveTripDays(startDate, endDate);
  if (!ok) return sendJson(res, 400, { error: dayErr });

  const uiLang = resolveUiLanguage(parsed);
  const langRule = langRuleParagraph(uiLang);
  const prefsBlock = formatPrefsForPrompt(prefs);
  const bHint = budgetRangeHint(prefs);

  const prompt =
    `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
    `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).${prefsBlock}\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown, sans texte avant ou après, de la forme:\n` +
    `{"dayIdeas":[{"day":1,"title":"titre court","costEur":95,"bullets":["Matin : phrase courte","Après-midi : phrase courte"]}, ...]}\n` +
    `Règles STRICTES :\n` +
    `- Exactement ${days} objets dans dayIdeas, day = 1 … ${days}.\n` +
    `- "costEur" : entier JSON — coût total estimé de la journée en euros, cohérent avec le budget : ${bHint}.\n` +
    `- Chaque "bullets" : 2 ou 3 phrases courtes. Pas de guillemet double à l'intérieur.\n` +
    `- Pas de retour à la ligne à l'intérieur d'une chaîne JSON.\n` +
    `${langRule}\nLieux réels pour cette destination.`;

  const systemInstruction =
    "Tu produis uniquement un objet JSON valide. " +
    "Les chaînes ne contiennent jamais de guillemet double non échappé. " +
    "Le champ costEur est toujours un entier JSON.";

  try {
    const data = await runGeminiJson({
      key, modelId, prompt, systemInstruction,
      generationConfigExtra: { temperature: 0.2, topP: 0.85, maxOutputTokens: Math.min(8192, 2048 + days * 500) },
    });
    const list = Array.isArray(data?.dayIdeas) ? data.dayIdeas : [];
    sendJson(res, 200, { ok: true, data: { dayIdeas: list, tripDays: days, startDate, endDate } });
  } catch (e) {
    const msg = formatError(e);
    sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
  }
}
