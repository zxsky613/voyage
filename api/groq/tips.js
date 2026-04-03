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
    `Tu es un expert voyage. Destination : "${destination}".\n` +
    `Réponds UNIQUEMENT avec un JSON UTF-8 valide :\n` +
    `{"tips":{"do":["conseil1","conseil2","conseil3"],"dont":["piege1","piege2","piege3"]}}\n` +
    `"do" : 3 conseils pratiques SPÉCIFIQUES à "${destination}".\n` +
    `"dont" : 3 pièges à éviter.\n${langRule}`;

  const systemPrompt = "Tu produis uniquement un objet JSON valide UTF-8.";

  try {
    const data = await runGroqJson({ key: groqKey, prompt, systemPrompt });
    sendJson(res, 200, { ok: true, data });
  } catch (e) {
    sendJson(res, 502, { error: formatError(e) });
  }
}
