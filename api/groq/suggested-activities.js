import {
  handleCors, sendJson, parseBody, getGroqKey,
  runGroqJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";

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
    `Tu es conseiller voyage expert. Destination : « ${destination} ».\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown :\n` +
    `{"suggestedActivities":[...]}\n` +
    `${langRule}\n` +
    `Exactement 6 objets avec title, location, estimatedCostEur (nombre JSON), costNote, description.\n` +
    `RÈGLES IMPORTANTES :\n` +
    `- Chaque "title" DOIT être le NOM PROPRE d'un lieu, monument, musée, sentier, rue ou site CONCRET et RÉEL.\n` +
    `  Exemples de bons titres : "Musée du Louvre", "Sentier des douaniers (GR34)", "Quartier Shibuya", "Brooklyn Bridge".\n` +
    `  Exemples de MAUVAIS titres (INTERDIT) : "Visite des musées", "Balade en ville", "Tour culinaire", "Point de vue".\n` +
    `- "location" : quartier ou adresse précise dans « ${destination} ».\n` +
    `- "description" : 1 phrase courte et utile (durée, horaire, conseil pratique).\n` +
    `- Les activités doivent correspondre à la géographie réelle de « ${destination} ». ` +
    `Ne propose PAS d'activités liées à la mer si la ville est dans les terres. ` +
    `Ne propose PAS de ski si la ville n'est pas en zone montagneuse.\n` +
    `- Variété : mélange monuments, musées, quartiers, nature, gastronomie locale.`;

  const systemPrompt =
    "Tu produis uniquement un objet JSON valide UTF-8. Chaque title doit être un nom propre de lieu réel et concret, jamais une description générique.";

  try {
    const data = await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature: 0.25 });
    const list = Array.isArray(data?.suggestedActivities) ? data.suggestedActivities : [];
    sendJson(res, 200, { ok: true, data: { suggestedActivities: list } });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
