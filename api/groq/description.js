import {
  handleCors, sendJson, parseBody, getGroqKey,
  runGroqJson, resolveUiLanguage, langRuleParagraph, formatError,
} from "../_helpers.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const groqKey = getGroqKey();
  if (!groqKey) return sendJson(res, 503, { error: "GROQ_API_KEY non configurée sur le serveur." });

  const body = parseBody(req);
  const destination = String(body.destination || body.city || "").trim();
  if (!destination || destination.length > 120) return sendJson(res, 400, { error: "destination invalide" });

  const uiLang = resolveUiLanguage(body);
  const langRule = langRuleParagraph(uiLang);

  const prompt =
    `Tu es un guide de voyage passionné. Décris la ville "${destination}" en exactement 2 phrases.\n` +
    `Mentionne une particularité unique. Donne envie de visiter sans être générique.\n` +
    `${langRule}\nRéponds UNIQUEMENT avec un JSON valide : {"description": "tes 2 phrases ici"}`;

  const systemPrompt =
    "Tu produis uniquement un objet JSON valide UTF-8 avec une seule clé \"description\".";

  try {
    const data = await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature: 0.5 });
    const desc = String(data?.description || "").trim();
    sendJson(res, 200, { ok: !!desc, description: desc });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
