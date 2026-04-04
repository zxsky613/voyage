import {
  handleCors, sendJson, parseBody, getGeminiKey, getGeminiModel,
  runGeminiJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";

export default async function handler(req, res) {
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
    `Tu es conseiller voyage. Destination : « ${destination} ».\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown :\n` +
    `{"suggestedActivities":[...]}\n` +
    `${langRule}\n` +
    `Exactement 6 objets avec title, location, estimatedCostEur (nombre JSON), costNote, description.\n` +
    `Chaque description : 1 phrase courte. Pas de guillemet double non échappé dans les chaînes.\n` +
    `IMPORTANT : les activités doivent correspondre à la géographie réelle de « ${destination} ». ` +
    `Ne propose PAS d'activités liées à la mer, la plage ou le littoral si la ville est dans les terres. ` +
    `Ne propose PAS de ski ou montagne si la ville n'est pas en zone montagneuse. ` +
    `Activités réalistes et visitables sur place.`;

  const systemInstruction =
    "Tu produis uniquement un objet JSON valide UTF-8. Les chaînes ne contiennent jamais de guillemet double non échappé.";

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
