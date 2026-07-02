import { getUnsplashKey } from "../_helpers.js";
import {
  buildCityHeroUnsplashQuery,
  getHeroUnsplashDescBoostTokens,
  inferAestheticCityQueryType,
  normalizeCityDroneKey,
  AESTHETIC_CITY_QUERY_TYPE,
} from "../../cityDroneImagePrompt.js";
import { resolveSearchLabel } from "../../lib/images/normalizeLabel.js";

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * @param {object} item
 * @param {object} opts
 */
function scoreUnsplashPhoto(item, opts) {
  const desc = normalizeText(`${item?.description || ""} ${item?.alt_description || ""}`);
  const tagText = (item?.tags || []).map((t) => normalizeText(t?.title)).join(" ");
  const combined = `${desc} ${tagText}`;
  let score = 0;

  const w = Number(item?.width || 0);
  const h = Number(item?.height || 1);
  const ratio = w / h;
  if (ratio >= 1.8) score += 80;
  else if (ratio >= 1.5) score += 50;
  else if (ratio >= 1.3) score += 20;

  for (const kw of opts.preferredKeywords || []) {
    if (combined.includes(kw)) score += 12;
  }
  for (const kw of opts.avoidKeywords || []) {
    if (combined.includes(kw)) score -= 40;
  }
  for (const tok of opts.cityBoost || []) {
    if (tok && combined.includes(tok)) score += 80;
  }
  for (const tok of opts.landmarkBoost || []) {
    if (tok && combined.includes(tok)) score += 40;
  }

  if (opts.heroPenalizeSkyOnly) {
    const skyHints = ["sunset sky", "dramatic sky", "sky only", "cloudscape", "epic sky"];
    const structHints = ["building", "skyline", "cityscape", "landmark", "monument", "beach", "coast"];
    const hasSky = skyHints.some((k) => combined.includes(k));
    const hasStruct = structHints.some((k) => combined.includes(k));
    if (hasSky && !hasStruct) score -= 60;
  }

  return score;
}

async function triggerUnsplashDownload(downloadLocation, accessKey) {
  const url = String(downloadLocation || "").trim();
  if (!url || !accessKey) return;
  try {
    await fetch(url, {
      method: "GET",
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
  } catch {
    /* non bloquant */
  }
}

function homonymHeroAvoidKeywords(label, context) {
  const stem = normalizeText(resolveSearchLabel(label, context));
  const ctx = normalizeText(context);
  if (stem === "capri" && /honduras|gracias a dios/.test(ctx)) {
    return [
      "italy", "italie", "italia", "campania", "campanie", "amalfi", "faraglioni",
      "positano", "naples", "napoli", "mediterranean", "blue grotto",
    ];
  }
  return [];
}

async function searchUnsplashHero(query, opts) {
  const key = getUnsplashKey();
  if (!key) return null;
  const q = String(query || "").trim();
  if (!q) return null;

  const params = new URLSearchParams();
  params.set("query", q);
  params.set("orientation", "landscape");
  params.set("per_page", String(opts.perPage || 20));
  params.set("content_filter", "high");

  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) return null;

  const scored = results
    .map((item) => ({
      item,
      score: scoreUnsplashPhoto(item, opts),
    }))
    .sort((a, b) => b.score - a.score);

  const best = opts.acceptAnyResult
    ? scored[0]?.item || results[0]
    : scored.find((s) => s.score > 0)?.item || results[0];
  const url = String(best?.urls?.regular || best?.urls?.full || "").trim();
  if (!url) return null;

  const downloadLoc = String(best?.links?.download_location || "").trim();
  if (downloadLoc) await triggerUnsplashDownload(downloadLoc, key);

  const user = best?.user;
  return {
    url,
    source: "unsplash",
    author: String(user?.name || user?.username || "").trim() || undefined,
    license: "Unsplash License",
    sourceUrl: String(user?.links?.html || "https://unsplash.com").trim(),
    width: Number(best?.width || 0),
    height: Number(best?.height || 0),
    score: scored[0]?.score || 0,
    unsplashDownloadLocation: downloadLoc,
  };
}

/**
 * Unsplash secours — requête drone via cityDroneImagePrompt.
 * @param {string} label
 * @param {string} [context]
 * @returns {Promise<import('../../lib/images/types.js').ImageCandidate|null>}
 */
export async function fetchUnsplashHeroCandidate(label, context = "") {
  const key = getUnsplashKey();
  if (!key) return null;

  const raw = String(label || context || "").trim();
  const stem = resolveSearchLabel(label, context);
  const cityStem = String(stem || label || "").trim();
  if (cityStem.length < 3) return null;
  const queryInput = context ? `${stem || label}, ${context}` : raw;
  const q = buildCityHeroUnsplashQuery(queryInput);
  if (!q) return null;

  const isCoastal = inferAestheticCityQueryType(queryInput) === AESTHETIC_CITY_QUERY_TYPE.COASTAL;
  const cityTok = normalizeCityDroneKey(stem).split(/\s+/).filter((t) => t.length > 2);
  const contextTok = String(context || "")
    .split(/[,;|]/)
    .map((s) => normalizeText(s))
    .flatMap((s) => s.split(/\s+/))
    .filter((t) => t.length >= 4);
  const landmarkBoost = getHeroUnsplashDescBoostTokens(stem).map((t) => normalizeText(t));
  const homonymAvoid = homonymHeroAvoidKeywords(label, context);

  const preferredKeywords = isCoastal
    ? ["beach", "turquoise", "ocean", "coast", "aerial", "drone", "panorama", "daylight"]
    : ["landmark", "skyline", "aerial", "drone", "panorama", "architecture", "daylight", "golden hour"];

  const baseAvoid = [
    "logo", "icon", "illustration", "map", "monochrome", "black and white",
    "portrait", "selfie", "food", "macro", "close-up",
    ...homonymAvoid,
  ];

  const scoreOpts = {
    preferredKeywords: preferredKeywords.map(normalizeText),
    avoidKeywords: baseAvoid.map(normalizeText),
    cityBoost: [...cityTok, ...contextTok].filter(Boolean),
    landmarkBoost,
    heroPenalizeSkyOnly: true,
  };

  let hit = await searchUnsplashHero(q, { ...scoreOpts, perPage: 20, acceptAnyResult: false });
  return hit;
}

/**
 * Unsplash secours landmark/activity (requête simple).
 * @param {string} label
 * @param {string} [context]
 */
export async function fetchUnsplashPlaceCandidate(label, context = "") {
  const key = getUnsplashKey();
  if (!key) return null;
  const q = `${resolveSearchLabel(label, context)} ${context || ""} landmark travel`.trim();
  if (!q) return null;

  const params = new URLSearchParams({ query: q, orientation: "landscape", per_page: "15", content_filter: "high" });
  const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const photo = json?.results?.[0];
  const url = String(photo?.urls?.regular || "").trim();
  if (!url) return null;
  const downloadLoc = String(photo?.links?.download_location || "").trim();
  if (downloadLoc) await triggerUnsplashDownload(downloadLoc, key);
  const user = photo?.user;
  return {
    url,
    source: "unsplash",
    author: String(user?.name || user?.username || "").trim() || undefined,
    license: "Unsplash License",
    sourceUrl: String(user?.links?.html || "https://unsplash.com").trim(),
    width: Number(photo?.width || 0),
    height: Number(photo?.height || 0),
  };
}
