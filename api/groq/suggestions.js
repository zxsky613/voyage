import {
  handleCors, sendJson, parseBody, getGroqKey,
  runGroqJson, resolveUiLanguage, langRuleParagraph, formatError,
  buildProperNamesScriptConsistencyRule,
  suggestionsBundleContainsForbiddenNonLatinScript,
  buildTipsRewriteRetryInstruction,
} from "../_helpers.js";
import { pickPlacesListAfterScriptFilter, sanitizeMustSeePlaces } from "../../placeGuards.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const groqKey = getGroqKey();
  if (!groqKey) return sendJson(res, 503, { error: "GROQ_API_KEY non configurée sur le serveur." });

  const body = parseBody(req);
  const destination = String(body.destination || "").trim();
  if (!destination || destination.length > 120) return sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });

  const uiLang = resolveUiLanguage(body);
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
    `${langRule}${buildProperNamesScriptConsistencyRule(uiLang)}`;

  const systemPrompt =
    "Tu réponds uniquement par un objet JSON valide UTF-8. " +
    "Tous les textes visibles par le voyageur, y compris noms de lieux dans tips et suggestedActivities, sont entièrement dans la langue de l'interface. " +
    "Le tableau \"places\" ne contient que des NOMS PROPRES de lieux géographiques réels visitables dans la ville nommée, jamais de descriptions génériques.";

  try {
    let data = await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature: 0.2 });
    if (data && typeof data === "object" && suggestionsBundleContainsForbiddenNonLatinScript(data, uiLang)) {
      data = await runGroqJson({
        key: groqKey,
        prompt: prompt + buildTipsRewriteRetryInstruction(uiLang) +
          " Même exigence pour le tableau « places » (noms dans la langue de l'interface), « suggestedActivities.title », « location », « description », « costNote » : aucun caractère japonais, chinois ou coréen si la langue de sortie est le français, l'anglais, l'allemand, l'espagnol ou l'italien.\n",
        systemPrompt:
          systemPrompt +
          " Seconde tentative obligatoire : réponse 100 % dans la langue de l'interface, sans han/kana/hangul pour ces langues.",
        temperature: 0.05,
      });
    }
    if (data && typeof data === "object" && Array.isArray(data.places)) {
      const cleaned = sanitizeMustSeePlaces(data.places, destination);
      data.places = pickPlacesListAfterScriptFilter(cleaned, uiLang);
    }
    sendJson(res, 200, { ok: true, data });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
