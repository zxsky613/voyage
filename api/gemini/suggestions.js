import {
  handleCors, sendJson, parseBody, getGeminiKey, getGeminiModel,
  runGeminiJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";
import { pickPlacesListAfterScriptFilter, sanitizeMustSeePlaces } from "../../placeGuards.js";

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
    `Tu agis comme un expert en voyage et conseiller touristique.\n` +
    `DESTINATION UNIQUE : « ${destination} ».\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide :\n` +
    `{"places":[...],"tips":{"do":[...],"dont":[...]},"suggestedActivities":[...]}\n` +
    `\nTableau "places" : 5 à 7 NOMS PROPRES de lieux RÉELS et CONCRETS à visiter.\n` +
    `Chaque entrée DOIT être un nom propre précis : monument, musée, rue célèbre, sentier de randonnée, paysage, site naturel, place ou quartier iconique.\n` +
    `Exemples de bons noms : "Calanques de Marseille", "Musée du Louvre", "Sentier des douaniers (GR34)", "Piazza San Marco".\n` +
    `Exemples de MAUVAIS noms (INTERDIT) : "Musées et galeries", "Balade en ville", "Quartiers historiques", "Points de vue".\n` +
    `\n"tips.do" : 3 conseils pratiques spécifiques à « ${destination} ».\n` +
    `"tips.dont" : 3 pièges à éviter.\n` +
    `"suggestedActivities" : exactement 6 objets avec :\n` +
    `- "title" : NOM PROPRE d'un lieu concret (même règle que places).\n` +
    `- "location" : quartier ou adresse précise.\n` +
    `- "estimatedCostEur" (nombre), "costNote", "description" (1 phrase).\n` +
    `${langRule}`;

  const systemInstruction =
    "Tu réponds uniquement par un objet JSON valide UTF-8. " +
    "Le tableau \"places\" ne contient que des NOMS PROPRES de lieux géographiques réels visitables dans la ville nommée, jamais de descriptions génériques.";

  try {
    const data = await runGeminiJson({
      key, modelId, prompt, systemInstruction,
      generationConfigExtra: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 },
    });
    if (data && typeof data === "object" && Array.isArray(data.places)) {
      const cleaned = sanitizeMustSeePlaces(data.places, destination);
      data.places = pickPlacesListAfterScriptFilter(cleaned, uiLang);
    }
    sendJson(res, 200, { ok: true, data });
  } catch (e) {
    const msg = formatError(e);
    sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
  }
}
