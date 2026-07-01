import {
  handleCors, sendJson, parseBody, getGeminiKey, getGeminiModel,
  runGeminiJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";

export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const key = getGeminiKey();
  if (!key) return sendJson(res, 503, { error: "GEMINI_API_KEY non configurée sur le serveur." });

  const parsed = parseBody(req);
  const modelId = getGeminiModel();
  const destination = String(parsed.destination || "").trim();
  if (!destination || destination.length > 120) return sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });

  const uiLang = resolveUiLanguage(parsed);
  const langRule = langRuleParagraph(uiLang);

  const prompt =
    `Tu es conseiller voyage expert. Destination : « ${destination} ».\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown :\n` +
    `{"suggestedActivities":[...]}\n` +
    `${langRule}\n` +
    `Exactement 6 objets avec title, location, estimatedCostEur (nombre JSON), costNote, description.\n` +
    `RÈGLES IMPORTANTES :\n` +
    `- Chaque "title" DOIT être le NOM PROPRE d'un lieu, monument, musée, sentier, rue ou site CONCRET et RÉEL.\n` +
    `  Exemples de bons titres : "Musée du Louvre", "Sentier des douaniers (GR34)", "Quartier Shibuya", "Brooklyn Bridge".\n` +
    `  Exemples de MAUVAIS titres (INTERDIT) : "Visite des musées", "Balade en ville", "Tour culinaire", "Restaurant Le …", "Point de vue".\n` +
    `- "location" : quartier ou adresse précise dans « ${destination} ».\n` +
    `- "description" : 1 phrase courte et utile (durée, horaire, conseil pratique).\n` +
    `- Pas de guillemet double non échappé dans les chaînes.\n` +
    `- Les activités doivent correspondre à la géographie réelle de « ${destination} ». ` +
    `Ne propose PAS d'activités liées à la mer si la ville est dans les terres. ` +
    `Ne propose PAS de ski si la ville n'est pas en zone montagneuse.\n` +
    `- Variété : mélange monuments, musées, quartiers, nature, espaces extérieurs — aucun lieu de restauration ni adresse de repas comme "title".`;

  const systemInstruction =
    "Tu produis uniquement un objet JSON valide UTF-8. Chaque title doit être un nom propre de lieu réel et concret, jamais une description générique. Les chaînes ne contiennent jamais de guillemet double non échappé.";

  try {
    const data = await runGeminiJson({
      key, modelId, prompt, systemInstruction,
      generationConfigExtra: { temperature: 0.25, topP: 0.85, maxOutputTokens: 4096 },
    });
    const list = Array.isArray(data?.suggestedActivities) ? data.suggestedActivities : [];
    sendJson(res, 200, { ok: true, data: { suggestedActivities: list } });
  } catch (e) {
    const msg = formatError(e);
    sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
  }
}
