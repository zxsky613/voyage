/**
 * Porte vision héros — télécharge thumb, appelle Gemini, ban auto + boucle candidats.
 */
import { getGeminiKey, getGeminiModel } from "../_helpers.js";
import { resizeCommonsThumbUrl } from "../../lib/images/commonsThumbUrl.js";
import {
  buildHeroColdSignals,
  buildHeroVisionJudgePrompt,
  mockHeroVisionVerdictFromFileTitle,
  parseHeroVisionVerdict,
  resolveHeroVisionPolicy,
  HERO_VISION_THUMB_WIDTH,
} from "../../lib/images/heroVisionJudge.js";
import { extractCommonsFileTitleFromUrl } from "../../lib/images/heroQualityRules.js";
import { banHeroUrl } from "./_heroOverrides.js";
import { purgeImageResolveCacheByLabels } from "./_cache.js";
import { readHeroVisionCache, writeHeroVisionCache } from "./_heroVisionCache.js";

const WIKI_UA = "JustTrip/1.0 (https://justtrip.fr) hero-vision";

let visionCallsSession = 0;

export function getHeroVisionCallsSession() {
  return visionCallsSession;
}

/** Modèle vision — gemini-2.5-flash par défaut (quota gratuit ~1500/j). */
export function getHeroVisionModel() {
  if (process.env.HERO_VISION_MODEL) {
    return String(process.env.HERO_VISION_MODEL).trim();
  }
  const configured = String(process.env.GEMINI_MODEL || "").trim();
  if (configured && !/flash-lite/i.test(configured)) return configured;
  return "gemini-2.5-flash";
}

export function isHeroVisionEnabled() {
  if (process.env.HERO_VISION_DISABLED === "1") return false;
  return Boolean(getGeminiKey()) || process.env.HERO_VISION_MOCK === "1";
}

/**
 * @param {string} text
 * @param {string} [fileTitle]
 */
function safeParseVisionResponse(text, fileTitle = "") {
  const raw = String(text || "").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const tryParse = (s) => {
    try {
      return parseHeroVisionVerdict(JSON.parse(s));
    } catch {
      return null;
    }
  };
  let parsed = tryParse(cleaned);
  if (!parsed) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (parsed) return parsed;

  const mock = mockHeroVisionVerdictFromFileTitle(fileTitle);
  if (mock.verdict !== "acceptable" || mock.reasons[0] !== "mock:default") {
    return { ...mock, reasons: [...mock.reasons, "parse-fallback"] };
  }
  return { verdict: /** @type {const} */ ("acceptable"), shows: "other", reasons: ["parse-failed"] };
}

/**
 * @param {string} url
 */
export async function fetchHeroThumbForVision(url) {
  const thumbUrl = resizeCommonsThumbUrl(url, HERO_VISION_THUMB_WIDTH);
  const r = await fetch(thumbUrl, { headers: { "User-Agent": WIKI_UA } });
  if (!r.ok) throw new Error(`thumb fetch ${r.status} ${thumbUrl}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const mimeType = /\.png(\?|$)/i.test(thumbUrl) ? "image/png" : "image/jpeg";
  return { base64: buf.toString("base64"), mimeType, thumbUrl };
}

/**
 * @param {{ destinationLabel: string, base64: string, mimeType: string, fileTitle?: string }} p
 */
async function runGeminiVisionJudge({ destinationLabel, expectedCountry = "", base64, mimeType, fileTitle = "" }) {
  const key = getGeminiKey();
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: getHeroVisionModel(),
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const prompt = buildHeroVisionJudgePrompt(destinationLabel, expectedCountry);

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ]);
      visionCallsSession += 1;
      const text = String(result.response?.text() || "").trim();
      console.log(
        `[hero-vision] call=${visionCallsSession} model=${getHeroVisionModel()} dest=${destinationLabel}`
      );
      return safeParseVisionResponse(text, fileTitle);
    } catch (err) {
      const status = Number(err?.status) || 0;
      if (status === 429 && attempt < maxRetries - 1) {
        const delayMs = 26_000 * (attempt + 1);
        console.warn(`[hero-vision] 429 rate limit — pause ${delayMs}ms (${destinationLabel})`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("vision retries exhausted");
}

/**
 * @param {Object} p
 * @param {string} p.url
 * @param {string} p.destinationLabel
 * @param {string} [p.fileTitle]
 * @param {string} [p.heroSource]
 * @param {number} [p.width]
 * @param {number} [p.height]
 * @param {boolean} [p.skipCache]
 */
export async function judgeHeroImage(p) {
  const url = String(p.url || "").trim();
  const destinationLabel = String(p.destinationLabel || "").trim();
  if (!url) {
    return {
      vision: { verdict: "reject", shows: "other", reasons: ["empty-url"] },
      cold: buildHeroColdSignals({}),
      policy: "review_reject",
      model: "",
    };
  }

  if (!p.skipCache) {
    const cached = await readHeroVisionCache(url, destinationLabel);
    if (cached) return { ...cached, fromCache: true };
  }

  const fileTitle = String(p.fileTitle || extractCommonsFileTitleFromUrl(url));
  const cold = buildHeroColdSignals({
    url,
    fileTitle,
    heroSource: p.heroSource,
    width: p.width,
    height: p.height,
  });

  /** @type {{ verdict: string, shows: string, reasons: string[] }} */
  let vision;
  if (cold.hardBlock || cold.blocked) {
    const ft = fileTitle.toLowerCase();
    const shows = /wc|restroom|besser|sign|toilet/.test(ft)
      ? "sign"
      : /satellite|island_of|orbital/.test(ft)
        ? "satellite"
        : "other";
    vision = {
      verdict: "reject",
      shows,
      reasons: cold.suspicionReasons?.length ? cold.suspicionReasons : ["cold:hard-block"],
    };
  } else if (process.env.HERO_VISION_MOCK === "1") {
    vision = mockHeroVisionVerdictFromFileTitle(fileTitle);
  } else if (!getGeminiKey()) {
    vision =
      cold.subjectless
        ? { verdict: "reject", shows: "other", reasons: ["cold-only:subjectless"] }
        : { verdict: "acceptable", shows: "other", reasons: ["cold-only:no-gemini-key"] };
  } else {
    try {
      const { base64, mimeType } = await fetchHeroThumbForVision(url);
      vision = await runGeminiVisionJudge({
        destinationLabel,
        expectedCountry: String(p.expectedCountry || "").trim(),
        base64,
        mimeType,
        fileTitle,
      });
      if (cold.subjectless && vision.verdict === "acceptable") {
        vision = {
          verdict: "reject",
          shows: vision.shows || "other",
          reasons: [...(vision.reasons || []), "cold:subjectless-filename"],
        };
      }
    } catch (err) {
      const status = Number(err?.status) || 0;
      if (status === 429 || /quota|rate.?limit/i.test(String(err?.message || ""))) {
        vision = mockHeroVisionVerdictFromFileTitle(fileTitle);
        vision.reasons = [...(vision.reasons || []), "rate-limited-fallback"];
      } else if (cold.subjectless || cold.hardBlock) {
        vision = {
          verdict: "reject",
          shows: "other",
          reasons: [`thumb-failed:${String(err?.message || err)}`],
        };
      } else {
        throw err;
      }
    }
  }

  const policy = resolveHeroVisionPolicy(vision, cold);
  const judgment = {
    vision,
    cold,
    policy,
    model: getHeroVisionModel(),
    thumbUrl: resizeCommonsThumbUrl(url, HERO_VISION_THUMB_WIDTH),
    fromCache: false,
  };

  await writeHeroVisionCache({
    imageUrl: url,
    destinationLabel,
    vision,
    cold,
    policy,
    model: judgment.model,
  });

  return judgment;
}

/**
 * @param {import('../../lib/images/types.js').ImageCandidate[]} candidates
 * @param {string} destinationLabel
 * @param {string} labelNormalized
 * @param {string[]} [bannedUrls]
 * @param {number} [maxAttempts]
 */
export async function selectHeroThroughVisionGate({
  candidates,
  destinationLabel,
  labelNormalized,
  bannedUrls = [],
  maxAttempts = 3,
}) {
  const bansApplied = /** @type {string[]} */ ([]);
  const skipped = /** @type {Array<{ url: string, judgment: Awaited<ReturnType<typeof judgeHeroImage>> }>} */ ([]);
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, maxAttempts);

  if (!isHeroVisionEnabled()) {
    const first = list[0] || null;
    return { candidate: first, judgment: null, bansApplied, skipped };
  }

  for (const c of list) {
    const judgment = await judgeHeroImage({
      url: c.url,
      destinationLabel,
      fileTitle: extractCommonsFileTitleFromUrl(c.url),
      heroSource: c.heroSource,
      width: c.width,
      height: c.height,
    });

    if (judgment.policy === "accept" || judgment.policy === "review") {
      return { candidate: c, judgment, bansApplied, skipped };
    }

    skipped.push({ url: c.url, judgment });

    if (judgment.policy === "auto_reject" && labelNormalized) {
      const ban = await banHeroUrl(labelNormalized, c.url);
      if (ban.ok) {
        bansApplied.push(c.url);
        bannedUrls.push(c.url);
      }
    }
  }

  return { candidate: null, judgment: null, bansApplied, skipped };
}

/**
 * Valide un héros déjà en cache avant de le servir en prod.
 * @param {{ url: string, heroSource?: string, width?: number, height?: number }} cached
 * @param {string} destinationLabel
 * @param {string} labelNormalized
 */
export async function validateCachedHeroWithVision(cached, destinationLabel, labelNormalized) {
  if (!isHeroVisionEnabled() || !cached?.url) {
    return { accept: true, judgment: null };
  }

  const judgment = await judgeHeroImage({
    url: cached.url,
    destinationLabel,
    heroSource: cached.heroSource,
    width: cached.width,
    height: cached.height,
  });

  if (judgment.policy === "accept" || judgment.policy === "review") {
    return { accept: true, judgment };
  }

  if (labelNormalized) {
    if (judgment.policy === "auto_reject") {
      await banHeroUrl(labelNormalized, cached.url);
    }
    await purgeImageResolveCacheByLabels([labelNormalized], "hero");
  }

  return { accept: false, judgment };
}
