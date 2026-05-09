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

/** Détecte japonais / chinois / coréen (UI censée être en alphabet latin). */
const FOREIGN_SCRIPT_FOR_LATIN_UI_RE = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]/;

/**
 * Tips ou phrases : présence de scripts non latins alors que l’UI n’est pas ja/zh/ko → régénération.
 */
export function tipsContainForbiddenNonLatinScript(tips, uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "ja" || code === "zh" || code === "ko") return false;
  const chunks = [];
  if (tips && typeof tips === "object") {
    if (Array.isArray(tips.do)) chunks.push(...tips.do);
    if (Array.isArray(tips.dont)) chunks.push(...tips.dont);
  }
  return chunks.some((x) => FOREIGN_SCRIPT_FOR_LATIN_UI_RE.test(String(x || "")));
}

/**
 * Bundle /api/.../suggestions : tips + champs texte des activités proposées.
 */
export function suggestionsBundleContainsForbiddenNonLatinScript(data, uiLang) {
  if (tipsContainForbiddenNonLatinScript(data?.tips, uiLang)) return true;
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "ja" || code === "zh" || code === "ko") return false;
  const re = FOREIGN_SCRIPT_FOR_LATIN_UI_RE;
  const acts = Array.isArray(data?.suggestedActivities) ? data.suggestedActivities : [];
  for (const a of acts) {
    if (!a || typeof a !== "object") continue;
    for (const k of ["title", "location", "description", "costNote"]) {
      if (re.test(String(a[k] || ""))) return true;
    }
  }
  return false;
}

/**
 * Instruction stricte de second passage si le modèle a encore collé du kanji/kana/etc.
 */
export function buildTipsRewriteRetryInstruction(uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "en") {
    return (
      "\n\nREGENERATE (previous reply INVALID): The tips still contained Japanese/Chinese/Korean characters. " +
      "Output again: 100% English for English readers—including venue names as they appear in English guidebooks or clear English descriptive names. " +
      "Zero hiragana, katakana, kanji, hangul, or han characters in any string.\n"
    );
  }
  if (code === "de") {
    return (
      "\n\nNEU SCHREIBEN (vorher ungültig): Es waren noch japanische/chinesische/koreanische Zeichen drin. " +
      "Alle 6 Sätze vollständig auf Deutsch für deutschsprachige Reisende, auch Eigennamen wie in deutschen Reiseführern — keine Kanji/Kana/Hangul.\n"
    );
  }
  if (code === "es") {
    return (
      "\n\nREESCRIBE (respuesta inválida): Aún había caracteres japoneses/chinos/coreanos. " +
      "Vuelve a generar todo en español para hispanohablantes, incluidos los nombres de sitios como en guías en español — cero kanji, kana o hangul.\n"
    );
  }
  if (code === "it") {
    return (
      "\n\nRISCRIVI (risposta non valida): C'erano ancora caratteri giapponesi/cinesi/coreani. " +
      "Rigenera tutto in italiano per lettori italiani, inclusi i toponimi come nelle guide — nessun kanji, kana, hangul.\n"
    );
  }
  return (
    "\n\nRÉÉCRITURE OBLIGATOIRE (réponse précédente NON CONFORME) : il restait des caractères japonais, chinois ou coréens. " +
    "Regénère l’intégralité des 6 chaînes à 100% en français pour un public francophone : " +
    "tous les noms de lieux doivent être ceux qu’on trouve en français (guides type Routard, Lonely Planet FR, office de tourisme FR), " +
    "ou une appellation descriptive claire en français — AUCUN kanji, hiragana, katakana, hangul ni han dans le JSON.\n"
  );
}

/**
 * Lieux cités : même langue que l’interface (pas seulement même alphabet).
 * Les lecteurs doivent voir des libellés « comme dans un guide dans leur langue ».
 */
export function buildProperNamesScriptConsistencyRule(uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "en") {
    return (
      "\nPLACE NAMES — TRAVELER'S LANGUAGE (MANDATORY):\n" +
      "- The OUTPUT language applies to ALL proper nouns: museums, shrines, districts. Use names as English-speaking travelers see them (English guidebooks, official English pages), e.g. 'Kyoto Railway Museum', 'Kyoto City KYOCERA Museum of Art' — not raw Japanese copy-paste.\n" +
      "- FORBIDDEN: any Japanese (kanji/kana), Korean hangul, or Chinese characters in your strings when the UI is English. Zero exceptions.\n" +
      "- If unsure of the official English name, use a clear short English descriptive name ('science museum for families in Kyoto') instead of foreign script.\n"
    );
  }
  if (code === "de") {
    return (
      "\nTOPONYME — SPRACHE DER OBERFLÄCHE (PFLICHT):\n" +
      "- Alle Eigennamen wie in deutschsprachigen Reiseführern (DuMont, Baedeker-ähnlich) — nicht japanische Silbenschriften beibehalten.\n" +
      "- VERBOTEN: Kanji/Kana/Hangul in den Texten, wenn die Ausgabesprache Deutsch ist.\n"
    );
  }
  if (code === "es") {
    return (
      "\nTOPÓNIMOS — IDIOMA DE LA UI (OBLIGATORIO):\n" +
      "- Todos los nombres propios como en guías en español para viajeros hispanohablantes. Prohibido dejar bloques en japonés, chino o coreano cuando la salida debe ser español.\n"
    );
  }
  if (code === "it") {
    return (
      "\nTOPONIMI — LINGUA DELL'INTERFACCIA (OBBLIGATORIO):\n" +
      "- Nomi dei luoghi come nelle guide italiane per chi legge in italiano. Vietato kanji/kana/hangul se l'output è italiano.\n"
    );
  }
  if (code === "zh") {
    return (
      "\n专名：面向中文读者时使用中文通用译名或规范汉字称谓；避免在无必要时夹写日文假名整段。韩文、日文专有名词用常见中文译名或简短中文说明。\n"
    );
  }
  if (code === "ja") {
    return (
      "\n固有名詞：日本語UIなら和表記を優先し、外国地名は一貫した表記に。他言語のままの固有名詞を混ぜない。\n"
    );
  }
  return (
    "\nNOMS DE LIEUX — MÊME LANGUE QUE L'INTERFACE (IMPÉRATIF) :\n" +
    "- La langue de sortie s'applique à tout le texte, y compris les noms d'établissements : forme française usuelle telle qu'un lecteur français la lit dans un Routard, un Petit Futé, ou une traduction française officielle.\n" +
    "- INTERDIT : laisser le nom uniquement en caractères japonais (kanji, hiragana, katakana), chinois ou coréen dans un conseil pour interface en français — comme dans un article de magazine de voyage français.\n" +
    "- Si aucun nom court en français n'est fixé : utiliser une désignation descriptive en français (ex. musée municipal des sciences pour les jeunes à Kyoto) plutôt que le libellé en écriture locale.\n" +
    "- Toute chaîne du JSON ne doit contenir aucun caractère hiragana, katakana, kanji, hangul ni han lorsque l'interface est en français.\n"
  );
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

/**
 * Cohésion quartier / anti-doublons / variété type marketplace (voyagistes & agrégateurs d’excursions).
 * Injecté dans les prompts d’itinéraire (Groq + Gemini, dev + prod).
 */
export function buildItineraryCohesionAndVarietyRulesParagraph(uiLang) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  if (code === "en") {
    return (
      "\nGEOGRAPHY & SAME-DAY COHESION (MANDATORY):\n" +
      "- Each day MUST focus on ONE main neighborhood/district/arrondissement (or one tight, walkable cluster). Morning + afternoon + evening bullets for that same calendar day must stay in that area, or at most one short metro/tram hop that does not feel like crisscrossing the whole city.\n" +
      "- Mention the focal area early (in the day title or the first bullet), e.g. \"Le Marais & nearby\" / \"Historic center west\".\n" +
      "\nNO CROSS-DAY DUPLICATES (MANDATORY):\n" +
      "- Do NOT repeat the same named venue, museum, monument, park, market, bridge, or viewpoint on a later day. Synonyms count (e.g. \"Louvre\" vs \"Musée du Louvre\").\n" +
      "- Across a long stay (e.g. 14 days), rotate widely: if a major icon appears once, later days must use other districts, smaller gems, or different experience types.\n" +
      "\nVARIETY (broad catalog, e.g. tour marketplaces):\n" +
      "- Mix guided walks, local food/market stops, viewpoints, craft or tasting experiences, residential quartiers, half-day nature nearby if realistic—avoid recycling the same \"flagship museum\" pattern every day unless the traveler's style prefs demand it.\n"
    );
  }
  if (code === "de") {
    return (
      "\nGEO & TAGES-KOHÄRENZ (PFLICHT):\n" +
      "- Pro Kalender-Tag EIN Hauptviertel/Stadtteil/Arrondissement (oder eine kleine fußläufige Gruppe). Alle Bullet-Phasen dieses Tages bleiben dort oder max. eine kurze ÖPNV-Verbindung — nicht morgens Umland und nachmittags andere Stadtseite ohne realistische Zeiten.\n" +
      "- Das Viertel früh nennen (Titel oder erste Bullet).\n" +
      "\nKEINE DUPLIKATE ÜBER TAGE (PFLICHT):\n" +
      "- Dasselbe benannte Museum/Denkmal/Park/Markt nicht an einem späteren Tag erneut einplanen. Synonyme zählen.\n" +
      "\nVIELFALT (breites Angebot wie bei Reise-Plattformen):\n" +
      "- Wechselnde Tagestypen: Spaziergänge, Märkte, Aussichtspunkte, kulinarische Stops, ruhigere Stadtviertel — nicht täglich nur die gleiche Kategorie Top-Museum.\n"
    );
  }
  if (code === "es") {
    return (
      "\nGEOGRAFÍA Y COHESIÓN EN EL MISMO DÍA (OBLIGATORIO):\n" +
      "- Cada día debe centrarse en UN barrio/distrito principal (o un grupo pequeño caminable). Mañana, tarde y noche del MISMO día deben quedarse en esa zona o en un trayecto corto en transporte público, sin saltar al otro extremo de la ciudad.\n" +
      "- Cita el barrio al inicio (título o primera viñeta).\n" +
      "\nSIN REPETICIONES ENTRE DÍAS (OBLIGATORIO):\n" +
      "- No repitas el mismo museo, monumento, parque, mercado o mirador en otro día. Los sinónimos cuentan (p. ej. \"Louvre\" / \"Museo del Louvre\").\n" +
      "\nVARIEDAD (catálogo amplio, estilo agregadores de excursiones):\n" +
      "- Combina paseos guiados, comida local, miradores, talleres o barrios menos turísticos.\n"
    );
  }
  if (code === "it") {
    return (
      "\nGEOGRAFIA E COESIONE NELLO STESSO GIORNO (OBBLIGATORIO):\n" +
      "- Ogni giorno si concentra su UN quartiere/distretto (o un piccolo cluster a piedi). Mattina, pomeriggio e sera di quel CALENDARIO devono restare nella stessa area o in un solo breve spostamento in metro/tram.\n" +
      "- Nomina il quartiere all’inizio (titolo o prima bullet).\n" +
      "\nNESSUN DUPLICATO TRA I GIORNI (OBBLIGATORIO):\n" +
      "- Non ripetere lo stesso museo, monumento, parco, mercato o belvedere in un giorno successivo. I sinonimi contano.\n" +
      "\nVARIETÀ (catalogo ampio come marketplace tour):\n" +
      "- Alterna passeggiate, street food, punti panoramici, quartieri residenziali, esperienze locali.\n"
    );
  }
  if (code === "zh") {
    return (
      "\n地理与同一天动线一致性（必须）：\n" +
      "- 每个日历日聚焦一个主要街区/区域（或可步行的小范围）。同一天内上午、下午、晚上的安排应尽量留在该区域内，或最多一次短途公共交通衔接，避免在城市两端来回奔波。\n" +
      "- 在标题或第一条 bullet 中尽早写出当日区域。\n" +
      "\n跨天不重复（必须）：\n" +
      "- 不要把同一座博物馆、地标、公园、市场或观景台在后续日期再次安排；同义词也算重复（如「卢浮宫」「卢浮宫博物馆」）。\n" +
      "\n多样性（类似综合旅游平台）：\n" +
      "- 混合步行导览、市集/美食、观景、手作体验、居民区等，避免每天都同一类「旗舰博物馆」模板。\n"
    );
  }
  return (
    "\nGÉOGRAPHIE & COHÉRENCE DU MÊME JOUR (OBLIGATOIRE) :\n" +
    "- Chaque jour se concentre sur UN quartier / arrondissement / zone centrale principal (ou un petit cluster vraiment accessible à pied). Toutes les parties de la journée (matin, après-midi, soir) pour cette date du calendrier restent dans cette même zone, ou au maximum un court trajet en transport en commun — pas un éclatement aux deux bouts de la ville.\n" +
    "- Indique le quartier du jour dès le titre ou la première bullet.\n" +
    "\nPAS DE RÉPÉTITIONS SUR PLUSIEURS JOURS (OBLIGATOIRE) :\n" +
    "- Ne repropose pas le même musée, monument, parc, marché couvert, pont ou belvédère à une autre date. Les synonymes comptent (ex. « Louvre » / « Musée du Louvre »).\n" +
    "- Sur un long séjour, fais tourner largement les lieux et les expériences.\n" +
    "\nVARIÉTÉ (large catalogue, esprit plateformes d’excursions) :\n" +
    "- Variété type GetYourGuide / marchands d’activités : visites guidées pédestres, marché ou cuisine locale, points de vue, ateliers, quartiers moins fréquentés, demi-journée nature périphérique si cohérent — pas la réutilisation du même schéma « musée phare » jour après jour sauf si les préférences du voyageur l’exigent.\n"
  );
}

function normalizeBulletForDedup(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''′´`]/g, "'")
    .replace(/[^a-z0-9àâäéèêëïîôùûüçñœæß\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bulletTokenOverlapRatio(a, b) {
  const ta = normalizeBulletForDedup(a)
    .split(" ")
    .filter((w) => w.length > 2);
  const tb = normalizeBulletForDedup(b)
    .split(" ")
    .filter((w) => w.length > 2);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let inter = 0;
  for (const w of ta) if (setB.has(w)) inter += 1;
  return inter / Math.min(ta.length, tb.length);
}

const FALLBACK_BULLETS_EXTRA = {
  fr: [
    "Même zone : flânerie dans des rues secondaires ou cour intérieure, sans reprendre un site déjà cité un autre jour.",
    "Pause locale (café, épicerie fine ou petite galerie) — toujours dans le quartier du jour.",
  ],
  en: [
    "Same area: side streets or a courtyard visit—do not revisit any place named earlier in the trip.",
    "Short local stop (café, deli, small shop) staying within the day’s neighborhood.",
  ],
  de: [
    "Gleiches Viertel: Nebenstraßen ohne bereits genannte Orte.",
    "Kurzer Stopp (Café, kleiner Laden) im Tagesgebiet.",
  ],
  es: [
    "Misma zona: callejuelas o patios sin repetir lugares de otros días.",
    "Parada corta (café, tienda) dentro del barrio del día.",
  ],
  it: [
    "Stessa zona: vicoli o cortili senza ripetere luoghi di altri giorni.",
    "Sosta locale (caffè, bottega) nel quartiere del giorno.",
  ],
  zh: [
    "仍在当日区域：走小巷或庭院，不重复前几日已提过的地点。",
    "短暂停留（咖啡馆、小店）保持在当日街区范围内。",
  ],
};

/**
 * Supprime les bullets quasi identiques entre jours (post-traitement serveur).
 */
export function dedupeItineraryDayIdeas(dayIdeas, uiLang = "fr") {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  const extras = FALLBACK_BULLETS_EXTRA[code] || FALLBACK_BULLETS_EXTRA.fr;
  const kept = [];
  const out = [];
  for (const day of Array.isArray(dayIdeas) ? dayIdeas : []) {
    const rawBullets = Array.isArray(day?.bullets) ? day.bullets : [];
    const next = [];
    for (const b of rawBullets) {
      const s = String(b || "").trim();
      if (!s) continue;
      const norm = normalizeBulletForDedup(s);
      if (norm.length < 12) {
        next.push(s);
        kept.push(s);
        continue;
      }
      let dup = false;
      for (const prev of kept) {
        const pn = normalizeBulletForDedup(prev);
        if (norm === pn) {
          dup = true;
          break;
        }
        if (bulletTokenOverlapRatio(s, prev) >= 0.72) {
          dup = true;
          break;
        }
        if (norm.length >= 34 && pn.length >= 34 && (norm.includes(pn.slice(0, 34)) || pn.includes(norm.slice(0, 34)))) {
          dup = true;
          break;
        }
      }
      if (dup) continue;
      next.push(s);
      kept.push(s);
    }
    while (next.length < 2) {
      next.push(extras[(next.length + out.length) % extras.length]);
    }
    out.push({ ...day, bullets: next });
  }
  return out;
}

/** Bloc à injecter dans les prompts Groq/Gemini d'itinéraire. */
export async function buildItineraryEnrichmentBlock({ startDate, endDate, countryCode, uiLang }) {
  const cal = buildItineraryCalendarPromptBlock(startDate, endDate, uiLang);
  const [holidays, rules, cohesion] = await Promise.all([
    formatNagerHolidaysForPrompt(countryCode, startDate, endDate, uiLang),
    Promise.resolve(buildItinerarySchedulingRulesParagraph(uiLang)),
    Promise.resolve(buildItineraryCohesionAndVarietyRulesParagraph(uiLang)),
  ]);
  const scriptRule = buildProperNamesScriptConsistencyRule(uiLang);
  const code = String(uiLang || "fr").toLowerCase().split("-")[0];
  const calTitle =
    code === "en"
      ? "Exact calendar (each program day = one real date)"
      : code === "zh"
        ? "精确日历（行程中的每一天对应下方日期）"
        : "Calendrier exact (chaque jour du programme = une date réelle)";
  return `\n${calTitle} :\n${cal}\n${holidays}${rules}${cohesion}${scriptRule}`;
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
