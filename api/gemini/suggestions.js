import {
  handleCors, sendJson, parseBody, getGeminiKey, getGeminiModel,
  runGeminiJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";
import { sanitizeMustSeePlaces } from "../../placeGuards.js";

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
    `Chaque entrée du tableau "places" doit être un site visitable DANS cette ville.\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide :\n` +
    `{"places":[...],"tips":{"do":[...],"dont":[...]},"suggestedActivities":[...]}\n` +
    `\nTableau "places" : 5 à 7 monuments, musées, parcs, quartiers emblématiques.\n` +
    `"tips.do" : 3 conseils pratiques spécifiques à « ${destination} ».\n` +
    `"tips.dont" : 3 pièges à éviter.\n` +
    `"suggestedActivities" : au moins 6 objets avec title, location, estimatedCostEur (nombre), costNote, description.\n` +
    `${langRule}`;

  const systemInstruction =
    "Tu réponds uniquement par un objet JSON valide UTF-8. " +
    "Le tableau \"places\" ne contient que des lieux géographiques visitables dans la ville nommée.";

  try {
    const data = await runGeminiJson({
      key, modelId, prompt, systemInstruction,
      generationConfigExtra: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 },
    });
    if (data && typeof data === "object" && Array.isArray(data.places)) {
      data.places = sanitizeMustSeePlaces(data.places, destination);
    }
    sendJson(res, 200, { ok: true, data });
  } catch (e) {
    const msg = formatError(e);
    sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
  }
}
