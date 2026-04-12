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

/** Une ligne par jour du séjour : jour du programme, date ISO, jour de la semaine (locale). */
export function buildItineraryCalendarPromptBlock(startYmd, endYmd, uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  const loc =
    code === "en"
      ? "en-US"
      : code === "de"
        ? "de-DE"
        : code === "es"
          ? "es-ES"
          : code === "it"
            ? "it-IT"
            : code === "zh"
              ? "zh-CN"
              : "fr-FR";
  const lines = [];
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
  let a = start;
  let b = end;
  if (b < a) [a, b] = [b, a];
  const dayWord =
    code === "en"
      ? "Day"
      : code === "de"
        ? "Tag"
        : code === "es"
          ? "Día"
          : code === "it"
            ? "Giorno"
            : code === "zh"
              ? "第"
              : "Jour";
  const d = new Date(a);
  let n = 1;
  while (d <= b) {
    const iso = d.toISOString().slice(0, 10);
    const weekday = d.toLocaleDateString(loc, { weekday: "long" });
    if (code === "zh") {
      lines.push(`- 第${n}天 = ${iso}（${weekday}）`);
    } else {
      lines.push(`- ${dayWord} ${n} = ${iso} (${weekday})`);
    }
    d.setDate(d.getDate() + 1);
    n += 1;
  }
  return lines.join("\n");
}

/** Jours fériés nationaux (Nager.Date) — code pays ISO 3166-1 alpha-2. */
export async function fetchNagerHolidaysInRange(countryCode, startYmd, endYmd) {
  const cc = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (cc.length !== 2) return [];
  let a = String(startYmd || "").trim();
  let b = String(endYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return [];
  if (b < a) [a, b] = [b, a];
  const y0 = Number(a.slice(0, 4));
  const y1 = Number(b.slice(0, 4));
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return [];
  const out = [];
  for (let y = y0; y <= y1; y += 1) {
    try {
      const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${cc}`);
      if (!r.ok) continue;
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      for (const h of arr) {
        const date = String(h?.date || "").trim();
        if (date >= a && date <= b) {
          out.push({
            date,
            name: String(h?.localName || h?.name || "").trim() || date,
          });
        }
      }
    } catch {
      /* réseau / timeout — pas bloquant */
    }
  }
  out.sort((x, y) => x.date.localeCompare(y.date));
  const seen = new Set();
  return out.filter((h) => {
    if (seen.has(h.date + h.name)) return false;
    seen.add(h.date + h.name);
    return true;
  });
}

export async function formatNagerHolidaysForPrompt(countryCode, startYmd, endYmd, uiLang) {
  const list = await fetchNagerHolidaysInRange(countryCode, startYmd, endYmd);
  if (list.length === 0) return "";
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  const hdr =
    code === "en"
      ? "Public holidays during this trip (adapt the day: closures, crowds):"
      : code === "de"
        ? "Gesetzliche Feiertage in diesem Zeitraum (Programm anpassen):"
        : code === "es"
          ? "Festivos en estas fechas (adaptar el programa):"
          : code === "it"
            ? "Festività nel periodo (adatta il programma):"
            : code === "zh"
              ? "行程期间的公共假日（请据此调整安排）："
              : "Jours fériés sur la période (adapter le programme : fermetures, affluence) :";
  const lines = list.map((h) => `- ${h.date}: ${h.name}`);
  return `\n${hdr}\n${lines.join("\n")}\n`;
}

/** Règles terrain + honnêteté sur les imprévus (marathon, travaux, etc.). */
export function buildItinerarySchedulingRulesParagraph(uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "en") {
    return (
      "\nSCHEDULING & CLOSURE RULES (MANDATORY):\n" +
      "- Use the calendar below: each \"Day N\" MUST match the listed calendar date and weekday.\n" +
      "- Museums / monuments: respect TYPICAL weekly closing patterns for the destination country (e.g. many museums in France closed Monday; adapt to the city/country). If unsure for a specific venue, say \"check official hours / book online\" instead of inventing times.\n" +
      "- Restaurants & shops: respect common local patterns (e.g. Sunday closures in some areas); say \"check opening hours\" when relevant.\n" +
      "- If public holidays are listed below, adapt that day (closures, crowds) and mention the holiday name in that day's bullets.\n" +
      "\nLIMITS (be honest):\n" +
      "- You do NOT have real-time data: marathons, protests, roadworks, exceptional street or store closures, or weather. In at least ONE bullet somewhere in the itinerary, tell the traveler to check the official city website, public transport alerts, and local news before the trip.\n" +
      "- For dense city-center days (often weekends), suggest a backup plan or time buffer in the bullets.\n"
    );
  }
  if (code === "de") {
    return (
      "\nZEITPLAN & SCHLIESSZEITEN (VERPFLICHTEND):\n" +
      "- Nutze den Kalender unten: Jeder \"Tag N\" muss zum angegebenen Datum und Wochentag passen.\n" +
      "- Museen / Denkmäler: typische wöchentliche Ruhetage des Landes beachten (z. B. in Frankreich oft montags). Bei Unsicherheit: \"Öffnungszeiten prüfen / online buchen\".\n" +
      "- Feiertage: falls unten aufgeführt, den Tag anpassen und im Text nennen.\n" +
      "\nGRENZEN:\n" +
      "- Keine Echtzeitdaten: Marathon, Demo, Bauarbeiten, Ausnahmeschließungen. Mindestens eine Erinnerung: offizielle Stadtseite, Verkehrsinfos, lokale Nachrichten vor Abreise prüfen.\n"
    );
  }
  if (code === "es") {
    return (
      "\nHORARIOS Y CIERRES (OBLIGATORIO):\n" +
      "- Usa el calendario: cada \"Día N\" debe coincidir con la fecha y el día de la semana indicados.\n" +
      "- Museos: respeta los cierres semanales típicos del país. Si dudas: «comprobar horarios / reserva online».\n" +
      "- Festivos listados abajo: adapta ese día y menciónalo en las viñetas.\n" +
      "\nLÍMITES:\n" +
      "- Sin datos en tiempo real (maratón, obras, manifestaciones). Al menos un recordatorio: web oficial de la ciudad, transporte y noticias locales antes del viaje.\n"
    );
  }
  if (code === "it") {
    return (
      "\nORARI E CHIUSURE (OBBLIGATORIO):\n" +
      "- Usa il calendario sotto: ogni \"Giorno N\" deve corrispondere alla data e al giorno della settimana indicati.\n" +
      "- Musei: rispetta le chiusure settimanali tipiche del paese. In dubbio: «verificare orari / prenotazione online».\n" +
      "- Se ci sono festività elencate, adatta il programma e citale.\n" +
      "\nLIMITI:\n" +
      "- Nessun dato in tempo reale (maratona, cantieri). Almeno un promemoria: sito ufficiale del comune, trasporti, notizie locali prima della partenza.\n"
    );
  }
  if (code === "zh") {
    return (
      "\n时间安排与闭馆（必须遵守）：\n" +
      "- 使用下方日历：每个「第N天」必须与所列日期和星期一致。\n" +
      "- 博物馆/景点：尊重目的地国家常见的每周闭馆日（如法国许多博物馆周一闭馆）。不确定时请写「请查官网开放时间/线上预约」，不要编造时间。\n" +
      "- 若下列列出公共假日，请在该日行程中考虑闭馆与人流并写出假日名称。\n" +
      "\n局限说明：\n" +
      "- 你无法获得实时信息（马拉松、游行、道路施工、临时封路或商店停业）。行程中至少有一处提醒：出发前查阅城市官网、交通公告与本地新闻。\n"
    );
  }
  return (
    "\nCONTRAINTES D'HORAIRES ET FERMETURES (OBLIGATOIRE) :\n" +
    "- S'appuie sur le calendrier ci-dessous : chaque « Jour N » correspond à la date et au jour de la semaine indiqués — ne pas les mélanger.\n" +
    "- Musées / monuments : respecte les fermetures hebdomadaires TYPIQUES du pays de la destination (ex. beaucoup de musées en France fermés le lundi ; adapte selon la ville et le pays). Si la règle d'un lieu précis est incertaine, indique « vérifier les horaires sur le site officiel / réservation en ligne » plutôt qu'un horaire inventé.\n" +
    "- Restaurants et commerces : selon les habitudes locales, évite un planning incohérent ; utilise « vérifier ouverture » quand c'est pertinent.\n" +
    "- Jours fériés : s'ils sont listés ci-dessous, adapte le jour concerné (fermetures, affluence) et cite le nom du jour férié dans les bullets de ce jour.\n" +
    "\nLIMITES (honnêteté) :\n" +
    "- Tu n'as pas les données en temps réel : marathon, manifestation, travaux, fermeture exceptionnelle d'une rue ou d'un magasin, météo. Dans au moins une bullet du programme, rappelle explicitement de consulter avant le départ le site officiel de la ville ou de la région, les infos transports et l'actualité locale pour anticiper les imprévus.\n" +
    "- Pour les zones sensibles aux événements (centre-ville un week-end), propose dans les bullets une alternative ou une marge horaire.\n"
  );
}

/** Bloc à injecter dans les prompts Groq/Gemini d'itinéraire. */
export async function buildItineraryEnrichmentBlock({ startDate, endDate, countryCode, uiLang }) {
  const cal = buildItineraryCalendarPromptBlock(startDate, endDate, uiLang);
  const [holidays, rules] = await Promise.all([
    formatNagerHolidaysForPrompt(countryCode, startDate, endDate, uiLang),
    Promise.resolve(buildItinerarySchedulingRulesParagraph(uiLang)),
  ]);
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  const calTitle =
    code === "en"
      ? "Exact calendar (each program day = one real date)"
      : code === "zh"
        ? "精确日历（行程中的每一天对应下方日期）"
        : "Calendrier exact (chaque jour du programme = une date réelle)";
  return `\n${calTitle} :\n${cal}\n${holidays}${rules}`;
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
