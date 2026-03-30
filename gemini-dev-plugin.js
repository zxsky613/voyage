/**
 * En dev / preview Vite uniquement :
 * - POST /api/gemini/suggested-activities — uniquement activités proposées (appel par défaut sans enrichissement complet)
 * - POST /api/gemini/suggestions — lieux + conseils + activités (si VITE_GEMINI_DESTINATION_ENRICH=true)
 * - POST /api/gemini/itinerary — programme sur demande (dates début / fin)
 * Lit GEMINI_API_KEY depuis .env.local (sans préfixe VITE_).
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { sanitizeMustSeePlaces } from "./placeGuards.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function readGeminiKeyFromEnvFiles(envDir) {
  for (const name of [".env.local", ".env"]) {
    const fp = path.join(envDir, name);
    try {
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
      const raw = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        if (k !== "GEMINI_API_KEY") continue;
        let v = t.slice(eq + 1).trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (v) return v;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

function hasEmptyGeminiKeyLine(envDir) {
  for (const name of [".env.local", ".env"]) {
    const fp = path.join(envDir, name);
    try {
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) continue;
      const raw = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        if (t.slice(0, eq).trim() !== "GEMINI_API_KEY") continue;
        let v = t.slice(eq + 1).trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1).trim();
        }
        return v.length === 0;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

function resolveGeminiApiKey(mode, envDir) {
  const fromVite = loadEnv(mode, envDir, "GEMINI_");
  let key = String(fromVite.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  if (!key) key = readGeminiKeyFromEnvFiles(envDir).trim();
  const env = { ...fromVite, GEMINI_API_KEY: key };
  return { key, env };
}

function viteEnvDir(config) {
  return config.envDir || config.root;
}

function isTruthyEnv(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** Nombre de jours inclus entre deux dates YYYY-MM-DD (min 1, max 14 après clamp). */
function countInclusiveTripDays(startYmd, endYmd) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startYmd) || !re.test(endYmd)) return { ok: false, days: 0, error: "Dates au format AAAA-MM-JJ requis." };
  const t0 = Date.parse(`${startYmd}T12:00:00`);
  const t1 = Date.parse(`${endYmd}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { ok: false, days: 0, error: "Dates invalides." };
  let a = t0;
  let b = t1;
  if (b < a) [a, b] = [b, a];
  const diff = Math.round((b - a) / 86400000);
  const days = diff + 1;
  if (days > 14) return { ok: false, days: 0, error: "Maximum 14 jours pour un programme généré." };
  return { ok: true, days, error: "" };
}

/** Retire les blocs ```json … ``` parfois renvoyés malgré responseMimeType JSON. */
function stripMarkdownJsonFences(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  return t.trim();
}

/**
 * Extrait et parse le JSON renvoyé par Gemini (troncature, guillemets typographiques, etc.).
 */
function parseGeminiJsonLenient(rawText, contextLabel = "réponse") {
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
        `JSON Gemini invalide (${contextLabel}) : ${msg}. ` +
          `Si le programme est long, réessaie avec moins de jours ou change de modèle (GEMINI_MODEL). Extrait : ${hint}`
      );
    }
  }
}

async function runGeminiJson({ key, modelId, prompt, generationConfigExtra = {}, systemInstruction }) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const params = {
    model: modelId,
    generationConfig: {
      responseMimeType: "application/json",
      ...generationConfigExtra,
    },
  };
  if (systemInstruction) params.systemInstruction = systemInstruction;
  const model = genAI.getGenerativeModel(params);
  const result = await model.generateContent(prompt);
  const text = String(result.response?.text() || "").trim();
  return parseGeminiJsonLenient(text, "API");
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

const GEMINI_429_HINT_FR =
  " — Quota gratuit Google : souvent un plafond par modèle (ex. 20 requêtes/jour pour gemini-2.5-flash-lite). " +
  "Dans .env.local, essaie GEMINI_MODEL=gemini-2.5-flash (sans -lite) ou GEMINI_MODEL=gemini-2.0-flash pour un autre compteur. " +
  "Sinon attends le délai indiqué, le lendemain, ou active la facturation sur https://aistudio.google.com/ (voir https://ai.google.dev/gemini-api/docs/rate-limits ).";

function formatError(e) {
  let msg = String(e?.message || e || "Erreur Gemini");
  if (/429|Too Many Requests|quota|Quota exceeded/i.test(msg)) {
    msg += GEMINI_429_HINT_FR;
  }
  return msg;
}

function attachGeminiMiddleware(middlewares, mode, envDir) {
  middlewares.use(async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0] || "";
    if (req.method !== "POST") return next();

    const isSuggestions = pathname === "/api/gemini/suggestions";
    const isSuggestedActivities = pathname === "/api/gemini/suggested-activities";
    const isItinerary = pathname === "/api/gemini/itinerary";
    if (!isSuggestions && !isSuggestedActivities && !isItinerary) return next();

    const { key, env } = resolveGeminiApiKey(mode, envDir);
    if (!key) {
      const emptyLine = hasEmptyGeminiKeyLine(envDir);
      sendJson(res, 503, {
        error: emptyLine
          ? "GEMINI_API_KEY est vide dans .env.local. Colle ta clé après le signe =, enregistre (Ctrl+S), puis redémarre npm run dev."
          : "GEMINI_API_KEY introuvable dans .env.local à la racine du projet.",
      });
      return;
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch {
      sendJson(res, 400, { error: "Corps de requête illisible" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { error: "JSON invalide" });
      return;
    }

    /** Défaut : gemini-2.5-flash (quota souvent distinct de gemini-2.5-flash-lite, très limité en gratuit). */
    const modelId = String(env.GEMINI_MODEL || "gemini-2.5-flash").trim();

    if (isItinerary) {
      const premiumOnly = isTruthyEnv(env.GEMINI_ITINERARY_PREMIUM_ONLY);
      const creatorOk = isTruthyEnv(env.GEMINI_CREATOR_ITINERARY);
      if (premiumOnly && !creatorOk) {
        sendJson(res, 403, {
          error:
            "Génération de programme réservée (premium). Ajoute GEMINI_CREATOR_ITINERARY=true dans .env.local pour le compte créateur.",
        });
        return;
      }

      const destination = String(parsed.destination || "").trim();
      const startDate = String(parsed.startDate || "").trim();
      const endDate = String(parsed.endDate || "").trim();
      if (!destination || destination.length > 120) {
        sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });
        return;
      }
      const { ok, days, error: dayErr } = countInclusiveTripDays(startDate, endDate);
      if (!ok) {
        sendJson(res, 400, { error: dayErr });
        return;
      }

      const prompt =
        `Tu es un expert voyage. Ville / destination: "${destination}".\n` +
        `Le voyageur séjourne du ${startDate} au ${endDate} (${days} jour(s) inclus).\n` +
        `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown, sans texte avant ou après, de la forme:\n` +
        `{"dayIdeas":[{"day":1,"title":"titre court","bullets":["Matin : phrase courte","Après-midi : phrase courte"]}, ...]}\n` +
        `Règles STRICTES pour que le JSON soit valide :\n` +
        `- Exactement ${days} objets dans dayIdeas, day = 1 … ${days}.\n` +
        `- Chaque "bullets" : 2 ou 3 phrases courtes (pas de sous-liste). Pas de guillemet double à l'intérieur d'une phrase (utilise l'apostrophe ' pour l'élision).\n` +
        `- Pas de retour à la ligne à l'intérieur d'une chaîne JSON.\n` +
        `Français. Lieux réels pour cette destination.`;

      const itinerarySystem =
        "Tu produis uniquement un objet JSON valide, minifié ou non, sans clé en trop. " +
        "Les chaînes ne contiennent jamais de caractère guillemet double non échappé ; n'emploie pas de citations avec des guillemets.";

      try {
        const data = await runGeminiJson({
          key,
          modelId,
          prompt,
          systemInstruction: itinerarySystem,
          generationConfigExtra: {
            temperature: 0.2,
            topP: 0.85,
            maxOutputTokens: Math.min(8192, 2048 + days * 500),
          },
        });
        const list = Array.isArray(data?.dayIdeas) ? data.dayIdeas : [];
        sendJson(res, 200, { ok: true, data: { dayIdeas: list, tripDays: days, startDate, endDate } });
      } catch (e) {
        const msg = formatError(e);
        sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
      }
      return;
    }

    if (isSuggestedActivities) {
      const destination = String(parsed.destination || "").trim();
      if (!destination || destination.length > 120) {
        sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });
        return;
      }
      const prompt =
        `Tu es conseiller voyage. Destination : « ${destination} ».\n` +
        `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown, de la forme exacte :\n` +
        `{"suggestedActivities":[...]}\n` +
        `\n` +
        `Tableau "suggestedActivities" : au moins 6 objets (pas de simples chaînes), chacun avec :\n` +
        `- "title" : titre court en français.\n` +
        `- "location" : où la faire dans ou près de « ${destination} » (quartier, monument, repère réel).\n` +
        `- "estimatedCostEur" : nombre JSON uniquement (jamais une chaîne), estimation en euros ; 0 si gratuit avéré.\n` +
        `- "costNote" : courte précision (ex. billet adulte, gratuit, déjeuner moyen).\n` +
        `- "description" : une phrase utile (durée, horaire type, conseil).\n` +
        `Activités réalistes et visitables sur place. Texte en français.`;
      const systemInstruction =
        "Tu réponds uniquement par un objet JSON valide UTF-8. Le tableau suggestedActivities contient des activités touristiques concrètes dans la ville indiquée.";
      try {
        const data = await runGeminiJson({
          key,
          modelId,
          prompt,
          systemInstruction,
          generationConfigExtra: {
            temperature: 0.25,
            topP: 0.85,
            maxOutputTokens: 2048,
          },
        });
        const list = Array.isArray(data?.suggestedActivities) ? data.suggestedActivities : [];
        sendJson(res, 200, { ok: true, data: { suggestedActivities: list } });
      } catch (e) {
        const msg = formatError(e);
        sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
      }
      return;
    }

    // suggestions (lieux + conseils + activités)
    const destination = String(parsed.destination || "").trim();
    if (!destination || destination.length > 120) {
      sendJson(res, 400, { error: "destination invalide (1–120 caractères)" });
      return;
    }

    const prompt =
      `Tu agis comme un expert en voyage et conseiller touristique.\n` +
      `\n` +
      `DESTINATION UNIQUE À RESPECTER POUR TOUS LES LIEUX (aucune exception) : « ${destination} ».\n` +
      `Chaque entrée du tableau "places" doit être un site que l’on peut visiter physiquement DANS cette ville ou sa proche banlieue (même agglomération). ` +
      `Interdiction absolue : villes d’un autre pays ou d’une autre région, personnes vivantes ou historiques (ex. pas d’ingénieur, homme d’affaires, artiste comme entrée seule), ` +
      `titres de films ou de livres, équipes sportives, marques, polices, événements datés.\n` +
      `\n` +
      `Réponds UNIQUEMENT avec un JSON UTF-8 valide, sans markdown ni texte hors JSON, exactement cette structure :\n` +
      `{"places":[...],"tips":{"do":[...],"dont":[...]},"suggestedActivities":[...]}\n` +
      `(Pas de champ "summary" : la description affichée vient de Wikipédia côté app.)\n` +
      `\n` +
      `Tableau "places" — lieux incontournables (OBLIGATOIRE) :\n` +
      `- Entre 5 et 7 entrées : minimum 5, maximum 7.\n` +
      `- Uniquement des monuments, musées, parcs, places, quartiers emblématiques, points de vue, sites classiques que les touristes vont réellement voir à « ${destination} ».\n` +
      `- Noms courts (2 à 8 mots), comme sur Google Maps ou un guide Lonely Planet pour CETTE ville.\n` +
      `\n` +
      `"tips.do" : exactement 3 chaînes — conseils d’expert PRATIQUES et SPÉCIFIQUES à « ${destination} » ` +
      `(transports réels, monuments ou quartiers nommés, usages locaux, pièges typiques de cette ville). ` +
      `Interdit : phrases génériques valables pour n’importe quelle ville (« réserve à l’avance » sans dire quoi, « respecte les locaux » sans contexte).\n` +
      `"tips.dont" : au moins 3 pièges ou erreurs à éviter, eux aussi ancrés dans « ${destination} » quand c’est possible.\n` +
      `\n` +
      `Tableau "suggestedActivities" — au moins 6 objets (pas de simples chaînes), chaque objet avec :\n` +
      `- "title" : titre court de l’activité en français.\n` +
      `- "location" : où la faire dans ou près de « ${destination} » (quartier, monument, adresse approximative ou point de repère réel, ex. "Alfama, Lisbonne" ou "Miradouro da Senhora do Monte").\n` +
      `- "estimatedCostEur" : nombre JSON uniquement (jamais une chaîne), entier ou une décimale, estimation réaliste en euros pour un visiteur type (billets, repas, transport local si pertinent) ; 0 seulement si gratuit avéré.\n` +
      `- "costNote" : courte précision en français (ex. "billet adulte site officiel", "gratuit — vue panoramique", "déjeuner moyen").\n` +
      `- "description" : une phrase utile (horaires types, durée, conseil pratique).\n` +
      `Pas de dates inventées pour le séjour. Tout le texte en français.`;

    const systemInstruction =
      "Tu réponds uniquement par un objet JSON valide UTF-8. " +
      "Le tableau \"places\" ne contient que des lieux géographiques visitables dans la ville nommée dans la consigne, jamais des personnes ni des œuvres de fiction.";

    try {
      const data = await runGeminiJson({
        key,
        modelId,
        prompt,
        systemInstruction,
        generationConfigExtra: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 4096,
        },
      });
      if (data && typeof data === "object" && Array.isArray(data.places)) {
        data.places = sanitizeMustSeePlaces(data.places, destination);
      }
      sendJson(res, 200, { ok: true, data });
    } catch (e) {
      const msg = formatError(e);
      sendJson(res, /429|Too Many Requests/i.test(msg) ? 429 : 502, { error: msg });
    }
  });
}

export function geminiDevApiPlugin() {
  return {
    name: "gemini-dev-api",
    configureServer(server) {
      const dir = viteEnvDir(server.config);
      attachGeminiMiddleware(server.middlewares, server.config.mode, dir);
    },
    configurePreviewServer(server) {
      const dir = viteEnvDir(server.config);
      attachGeminiMiddleware(server.middlewares, server.config.mode, dir);
    },
  };
}
