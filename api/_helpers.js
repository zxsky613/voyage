/**
 * Helpers partagés pour les serverless functions Vercel.
 * Préfixe _ → Vercel ne l'expose pas comme endpoint.
 */

export function sendJson(res, status, obj) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(status).json(obj);
}

export function handleCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }
  return false;
}

export function parseBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
}

function stripMarkdownJsonFences(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

export function parseGeminiJsonLenient(rawText, contextLabel = "réponse") {
  let t = stripMarkdownJsonFences(rawText);
  t = t.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch (e1) {
    try {
      return JSON.parse(t.replace(/,\s*([}\]])/g, "$1"));
    } catch (_e2) {
      const hint = t.length > 280 ? `${t.slice(0, 140)}…${t.slice(-120)}` : t;
      const msg = e1 instanceof Error ? e1.message : String(e1);
      throw new Error(
        `JSON invalide (${contextLabel}) : ${msg}. Extrait : ${hint}`
      );
    }
  }
}

export async function runGeminiJson({ key, modelId, prompt, generationConfigExtra = {}, systemInstruction }) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const params = {
    model: modelId,
    generationConfig: { responseMimeType: "application/json", ...generationConfigExtra },
  };
  if (systemInstruction) params.systemInstruction = systemInstruction;
  const model = genAI.getGenerativeModel(params);
  const result = await model.generateContent(prompt);
  const text = String(result.response?.text() || "").trim();
  return parseGeminiJsonLenient(text, "API");
}

export async function runGroqJson({ key, prompt, systemPrompt, temperature = 0.2, model = "llama-3.3-70b-versatile" }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature, response_format: { type: "json_object" } }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Groq ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = String(json?.choices?.[0]?.message?.content || "").trim();
  return parseGeminiJsonLenient(text, "Groq");
}

export function countInclusiveTripDays(startYmd, endYmd) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startYmd) || !re.test(endYmd)) return { ok: false, days: 0, error: "Dates au format AAAA-MM-JJ requis." };
  const t0 = Date.parse(`${startYmd}T12:00:00`);
  const t1 = Date.parse(`${endYmd}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { ok: false, days: 0, error: "Dates invalides." };
  let a = t0, b = t1;
  if (b < a) [a, b] = [b, a];
  const diff = Math.round((b - a) / 86400000);
  const days = diff + 1;
  if (days > 14) return { ok: false, days: 0, error: "Maximum 14 jours pour un programme généré." };
  return { ok: true, days, error: "" };
}

const GEMINI_UI_LANG_RULES = {
  fr: "Langue de sortie : tout texte destiné au voyageur doit être en français.",
  en: "Output language: all traveler-facing strings must be in English.",
  de: "Ausgabesprache: alle für Reisende sichtbaren Texte müssen auf Deutsch sein.",
  es: "Idioma de salida: todo el texto para el viajero debe estar en español.",
  it: "Lingua di output: tutto il testo per il viaggiatore deve essere in italiano.",
  zh: "输出语言：所有面向旅行者的文案必须使用简体中文。",
};

export function resolveUiLanguage(parsed) {
  let c = String(parsed?.language || "fr").trim().toLowerCase();
  if (c.includes("-")) c = c.split("-")[0];
  c = c.slice(0, 2);
  return GEMINI_UI_LANG_RULES[c] ? c : "fr";
}

export function langRuleParagraph(code) {
  return GEMINI_UI_LANG_RULES[code] || GEMINI_UI_LANG_RULES.fr;
}

export function budgetRangeHint(prefs) {
  const tier = prefs?.budget;
  if (tier === "low")    return "< 50 €/jour";
  if (tier === "medium") return "50–150 €/jour";
  if (tier === "high")   return "150–300 €/jour";
  if (tier === "luxury") return "> 300 €/jour";
  return "budget non précisé — estime un coût réaliste pour un touriste moyen";
}

export function formatPrefsForPrompt(prefs) {
  if (!prefs) return "";
  const lines = [];
  const paceLabel = { relaxed: "Détendu (2-3 activités/jour)", moderate: "Modéré (3-4)", intensive: "Intensif (maximum)" };
  if (prefs.pace) lines.push(`- Rythme : ${paceLabel[prefs.pace] || prefs.pace}`);
  if (Array.isArray(prefs.styles) && prefs.styles.length > 0) {
    const styleLabel = { cultural: "Culturel", gastronomy: "Gastronomie", nature: "Nature", relaxation: "Détente", adventure: "Aventure", nightlife: "Vie nocturne", shopping: "Shopping" };
    lines.push(`- Style(s) : ${prefs.styles.map((s) => styleLabel[s] || s).join(", ")}`);
  }
  const travelersLabel = { solo: "Solo", couple: "Couple", family: "Famille", friends: "Amis" };
  if (prefs.travelers) lines.push(`- Profil : ${travelersLabel[prefs.travelers] || prefs.travelers}`);
  const budgetLabel = { low: "Économique", medium: "Modéré", high: "Confortable", luxury: "Luxe" };
  if (prefs.budget) lines.push(`- Budget : ${budgetLabel[prefs.budget] || prefs.budget}`);
  if (prefs.wishes && String(prefs.wishes).trim()) lines.push(`- Souhaits : « ${String(prefs.wishes).trim()} »`);
  if (lines.length === 0) return "";
  return `\nPréférences du voyageur :\n${lines.join("\n")}\nTiens ABSOLUMENT compte de ces préférences.`;
}

const GEMINI_429_HINT =
  " — Quota Google dépassé. Essaie un autre modèle dans les variables d'environnement (GEMINI_MODEL) ou attends le lendemain.";

export function formatError(e) {
  let msg = String(e?.message || e || "Erreur API");
  if (/429|Too Many Requests|quota|Quota exceeded/i.test(msg)) msg += GEMINI_429_HINT;
  return msg;
}

export function getGeminiKey() {
  return String(process.env.GEMINI_API_KEY || "").trim();
}

export function getGeminiModel() {
  return String(process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

export function getGroqKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}

export function getFoursquareKey() {
  return String(process.env.FOURSQUARE_API_KEY || "").trim();
}
