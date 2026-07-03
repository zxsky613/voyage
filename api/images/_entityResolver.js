import { wikiUserAgent } from "./_headCheck.js";
import { fetchJsonWithRetry, WikiApiThrottledError } from "./_fetchRetry.js";
import { buildEntitySearchAttempts } from "../../lib/images/entitySearchPlan.js";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

/** @type {Record<string, Set<string>>} */
const P31_BY_KIND = {
  hero: new Set([
    "Q515",
    "Q23442",
    "Q3957",
    "Q15284",
    "Q486972",
    "Q35657",
    "Q8502",
    "Q1549591",
    "Q7275",
    "Q6256",
    "Q82794",
    "Q13220204",
    "Q182676",
    "Q19723451",
    "Q207524",
    "Q33837",
    "Q532",
  ]),
  landmark: new Set([
    "Q33506",
    "Q41176",
    "Q40080",
    "Q46169",
    "Q16917",
    "Q16560",
    "Q570116",
    "Q839954",
    "Q12280",
    "Q16970",
    "Q22698",
    "Q3918",
    "Q483453",
    "Q124734",
  ]),
  activity: new Set([
    "Q33506",
    "Q41176",
    "Q40080",
    "Q46169",
    "Q16917",
    "Q16560",
    "Q570116",
    "Q839954",
    "Q12280",
    "Q22698",
    "Q3918",
    "Q483453",
    "Q124734",
    "Q182676",
    "Q747074",
  ]),
};

const REJECTED_P31 = new Set(["Q5", "Q16521", "Q4167410", "Q13406463", "Q186165", "Q1914636"]);

function normalizeForLookup(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function claimValues(entity, propId) {
  const claims = entity?.claims?.[propId];
  if (!Array.isArray(claims)) return [];
  return claims.map((c) => c?.mainsnak?.datavalue?.value).filter(Boolean);
}

function entityP31Ids(entity) {
  return claimValues(entity, "P31")
    .map((v) => String(v?.id || ""))
    .filter(Boolean);
}

function entityP279Ids(entity) {
  return claimValues(entity, "P279")
    .map((v) => String(v?.id || ""))
    .filter(Boolean);
}

function entityClaimQids(entity, propId) {
  return claimValues(entity, propId)
    .map((v) => String(v?.id || ""))
    .filter(Boolean);
}

function isHomonymEntity(entity, label, context) {
  const blob = `${normalizeForLookup(label)} ${normalizeForLookup(context)}`;
  const id = String(entity?.id || "");
  const labelEn = normalizeForLookup(entity?.labels?.en?.value || entity?.labels?.fr?.value || "");
  if (/\bcapri\b/.test(normalizeForLookup(label))) {
    const ctx = normalizeForLookup(context);
    if (/honduras|gracias a dios|nebraska|saline county/.test(ctx)) {
      if (id === "Q173292" || id === "Q71902") return true;
    }
  }
  if (/crete|heraklion|rethymno|phalasarna|greece|grec/i.test(blob)) {
    if (id === "Q4646" || (labelEn === "bali" && id !== "Q804679")) return true;
    if (/indonesia|denpasar|java/.test(labelEn)) return true;
  }
  if (/ammodramus|kastoria/i.test(labelEn) && /ammoudara|amoudara|heraklion|crete|beach/i.test(blob)) {
    return true;
  }
  return false;
}

function matchesKindType(p31Ids, kind, expandedP279) {
  const allowed = P31_BY_KIND[kind] || P31_BY_KIND.landmark;
  const all = [...p31Ids, ...expandedP279];
  if (all.some((id) => REJECTED_P31.has(id))) return false;
  return all.some((id) => allowed.has(id));
}

/** @returns {string[]} */
function parseContextTokens(context) {
  const c = String(context || "").trim();
  if (!c) return [];
  return c
    .split(/[,;|]/)
    .map((s) => normalizeForLookup(s).replace(/^region\s+/, ""))
    .filter((s) => s.length >= 2);
}

/** Groupes de synonymes région/pays pour le matching contexte (FR/EN/DE/ES). */
const GEO_TOKEN_ALIAS_GROUPS = [
  ["italy", "italie", "italia", "italien", "italiana"],
  ["honduras", "hondure", "hondureno"],
  ["greece", "grece", "greek", "hellas", "hellenic", "grecia", "griechenland"],
  ["campania", "campanie", "campana"],
  ["gracias a dios", "gracias ad dios"],
  ["nebraska", "saline county"],
  ["spain", "espagne", "espana", "spanish", "espagnol", "kingdom of spain"],
  ["canary islands", "canaries", "islas canarias", "ile canaries", "iles canaries", "canarie"],
  ["france", "french", "republique francaise"],
  ["paca", "provence alpes cote d azur", "provence-alpes-cote d azur", "provence", "cote d azur"],
  ["germany", "deutschland", "allemagne", "german"],
  ["bayern", "bavaria", "baviere"],
];

function expandTokenAliases(token) {
  const t = normalizeForLookup(token);
  if (!t) return [];
  const out = new Set([t]);
  for (const group of GEO_TOKEN_ALIAS_GROUPS) {
    if (group.some((g) => g === t || t.includes(g) || g.includes(t))) {
      for (const g of group) out.add(g);
    }
  }
  return [...out];
}

function tokenMatchesLabel(token, labelNorm) {
  if (!token || !labelNorm) return false;
  const aliases = expandTokenAliases(token);
  for (const a of aliases) {
    if (a === labelNorm) return true;
    if (labelNorm.includes(a) || a.includes(labelNorm)) return true;
    const tokenWords = a.split(/\s+/).filter((w) => w.length >= 4);
    if (tokenWords.some((w) => labelNorm.includes(w))) return true;
  }
  return false;
}

/**
 * @param {object} entity
 * @param {string[]} contextTokens
 * @param {Record<string, string[]>} geoLabelMap — QID → libellés (P17, P131)
 */
function entityContextMatchScore(entity, contextTokens, geoLabelMap) {
  if (!contextTokens.length) return { matched: true, score: 0 };

  const geoIds = [...entityClaimQids(entity, "P17"), ...entityClaimQids(entity, "P131")];
  const geoLabels = geoIds.flatMap((id) => geoLabelMap[id] || []).map(normalizeForLookup);
  const entityLabels = Object.values(entity.labels || {})
    .map((l) => normalizeForLookup(l?.value || ""))
    .filter(Boolean);
  const desc = normalizeForLookup(
    entity?.descriptions?.en?.value || entity?.descriptions?.fr?.value || ""
  );

  let score = 0;
  let matched = false;
  for (const token of contextTokens) {
    const pools = [...geoLabels, ...entityLabels];
    if (pools.some((l) => tokenMatchesLabel(token, l))) {
      matched = true;
      score += token.length >= 6 ? 55 : 40;
    }
    if (tokenMatchesLabel(token, desc)) {
      matched = true;
      score += 25;
    }
  }
  return { matched, score };
}

async function fetchEntities(ids) {
  const list = ids.filter((id) => /^Q\d+$/.test(id)).slice(0, 20);
  if (!list.length) return {};
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: list.join("|"),
    props: "claims",
    format: "json",
    origin: "*",
  });
  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(`${WIKIDATA_API}?${params}`, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut) throw new WikiApiThrottledError("Wikidata wbgetentities throttled");
  if (!ok) return {};
  return json?.entities || {};
}

async function expandP279(directP279) {
  const out = new Set(directP279);
  if (!directP279.length) return out;
  const level1 = await fetchEntities(directP279);
  const level2Ids = [];
  for (const ent of Object.values(level1)) {
    for (const id of entityP279Ids(ent)) {
      if (!out.has(id)) {
        out.add(id);
        level2Ids.push(id);
      }
    }
  }
  if (level2Ids.length) {
    const level2 = await fetchEntities(level2Ids.slice(0, 10));
    for (const ent of Object.values(level2)) {
      for (const id of entityP279Ids(ent)) out.add(id);
    }
  }
  return out;
}

async function wbSearchEntities(search, language, limit = 8) {
  const q = String(search || "").trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: q,
    language: String(language || "en").slice(0, 2),
    uselang: String(language || "en").slice(0, 2),
    type: "item",
    limit: String(Math.min(limit, 12)),
    format: "json",
    origin: "*",
  });
  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(`${WIKIDATA_API}?${params}`, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut) throw new WikiApiThrottledError("Wikidata wbsearchentities throttled");
  if (!ok) return [];
  return Array.isArray(json?.search) ? json.search : [];
}

async function wbGetEntitiesFull(ids) {
  const list = ids.filter((id) => /^Q\d+$/.test(id)).slice(0, 12);
  if (!list.length) return {};
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: list.join("|"),
    props: "labels|descriptions|claims|sitelinks",
    languages: "en|fr|de|es|it|zh",
    format: "json",
    origin: "*",
  });
  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(`${WIKIDATA_API}?${params}`, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut) throw new WikiApiThrottledError("Wikidata wbgetentities full throttled");
  if (!ok) return {};
  return json?.entities || {};
}

async function fetchGeoLabelMap(entities) {
  /** @type {Set<string>} */
  const geoIds = new Set();
  for (const ent of entities) {
    if (!ent || ent.missing) continue;
    for (const id of entityClaimQids(ent, "P17")) geoIds.add(id);
    for (const id of entityClaimQids(ent, "P131")) geoIds.add(id);
  }

  let list = [...geoIds].slice(0, 40);
  if (!list.length) return {};

  /** Inclure le parent administratif (ex. Campanie via Naples métropolitaine). */
  const firstPass = await wbGetEntityLabelsOnly(list);
  const parentIds = [];
  for (const id of list) {
    const ent = firstPass[id];
    if (!ent || ent.missing) continue;
    for (const pid of entityClaimQids(ent, "P131")) {
      if (!geoIds.has(pid)) parentIds.push(pid);
    }
  }
  if (parentIds.length) {
    const parents = await wbGetEntityLabelsOnly(parentIds.slice(0, 15));
    Object.assign(firstPass, parents);
  }

  /** @type {Record<string, string[]>} */
  const map = {};
  for (const [id, ent] of Object.entries(firstPass)) {
    if (!ent || ent.missing) continue;
    map[id] = Object.values(ent.labels || {})
      .map((l) => String(l?.value || "").trim())
      .filter(Boolean);
  }
  return map;
}

async function wbGetEntityLabelsOnly(ids) {
  const list = ids.filter((id) => /^Q\d+$/.test(id)).slice(0, 40);
  if (!list.length) return {};
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: list.join("|"),
    props: "labels|claims",
    languages: "en|fr|de|es|it|zh",
    format: "json",
    origin: "*",
  });
  const { ok, json, throttled, timedOut } = await fetchJsonWithRetry(`${WIKIDATA_API}?${params}`, {
    headers: { "User-Agent": wikiUserAgent() },
  });
  if (throttled || timedOut) throw new WikiApiThrottledError("Wikidata wbgetentities labels throttled");
  if (!ok) return {};
  return json?.entities || {};
}

function scoreEntityBase(entity, searchLabel, kind = "hero") {
  if (!entity?.id) return -999;
  const p31 = entityP31Ids(entity);
  if (p31.some((id) => REJECTED_P31.has(id))) return -500;
  let score = 0;
  if (claimValues(entity, "P18").length) score += 30;
  if (claimValues(entity, "P373").length) score += 25;
  const labelNorm = normalizeForLookup(searchLabel);
  const labels = Object.values(entity.labels || {}).map((l) => normalizeForLookup(l?.value || ""));
  if (labels.some((l) => l === labelNorm)) score += 35;
  else if (labels.some((l) => l.startsWith(labelNorm))) score += 10;
  if (kind === "hero") {
    if (p31.some((id) => id === "Q23442" || id === "Q1161185" || id === "Q8502")) score += 25;
    if (p31.some((id) => id === "Q644371" || id === "Q1248784")) score -= 300;
  }
  return score;
}

/**
 * @param {string} searchLabel
 * @param {string} uiLang
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @param {string} [context]
 */
export async function resolveEntity(searchLabel, uiLang, kind, context = "") {
  const lang = String(uiLang || "fr").slice(0, 2);
  const cityLabel = String(searchLabel || "").trim();
  const geoContext = String(context || "").trim();
  const contextTokens = parseContextTokens(geoContext);
  const attempts = buildEntitySearchAttempts(cityLabel);

  for (const { query, language } of attempts) {
    const batch = await wbSearchEntities(query, language, 10);
    if (!batch.length) continue;

    /** @type {{ id: string, searchQuery: string }[]} */
    const hits = batch
      .map((hit) => ({
        id: String(hit?.id || "").trim(),
        searchQuery: query,
      }))
      .filter((h) => h.id);

    const picked = await pickBestEntityFromHits(hits, cityLabel, geoContext, contextTokens, kind, lang);
    if (picked) return picked;
  }

  return null;
}

/**
 * @param {{ id: string, searchQuery: string }[]} hits
 * @param {string} searchLabel
 * @param {string} context
 * @param {string[]} contextTokens
 * @param {import('../../lib/images/types.js').ImageKind} kind
 * @param {string} lang
 */
async function pickBestEntityFromHits(hits, searchLabel, context, contextTokens, kind, lang) {
  if (!hits.length) return null;

  const entities = await wbGetEntitiesFull(hits.map((h) => h.id));
  const hitById = Object.fromEntries(hits.map((h) => [h.id, h]));

  const candidateEntities = hits
    .map((h) => entities[h.id])
    .filter((ent) => ent && !ent.missing && !isHomonymEntity(ent, searchLabel, context));

  const geoLabelMap = await fetchGeoLabelMap(candidateEntities);

  /** @type {{ ent: object, score: number }[]} */
  const ranked = [];
  for (const ent of candidateEntities) {
    const base = scoreEntityBase(ent, searchLabel, kind);
    if (base <= -500) continue;

    const { matched: geoMatched, score: ctxScore } = entityContextMatchScore(
      ent,
      contextTokens,
      geoLabelMap
    );
    const contextOk = !contextTokens.length || geoMatched;

    if (contextTokens.length && !contextOk) continue;

    ranked.push({ ent, score: base + ctxScore });
  }

  if (!ranked.length) return null;

  ranked.sort((a, b) => b.score - a.score);

  for (const { ent } of ranked.slice(0, 8)) {
    const ids = entityP31Ids(ent);
    const p279Direct = [...entityP279Ids(ent), ...ids];
    const expanded = await expandP279(p279Direct);
    if (!matchesKindType(ids, kind, expanded)) continue;

    const p18Filenames = claimValues(ent, "P18")
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    const p373 = claimValues(ent, "P373")
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    const commonsCategory = p373[0] || "";

    const sitelinks = [];
    const wikivoyageSitelinks = [];
    const links = ent.sitelinks || {};
    for (const l of [lang, "en", "fr", "de", "es", "it", "zh"]) {
      const title = String(links[`${l}wiki`]?.title || "").trim();
      if (title) sitelinks.push({ lang: l, title });
      const wvTitle = String(links[`${l}wikivoyage`]?.title || "").trim();
      if (wvTitle) wikivoyageSitelinks.push({ lang: l, title: wvTitle });
    }

    return {
      qid: String(ent.id),
      p18Filenames,
      commonsCategory,
      sitelinks,
      wikivoyageSitelinks,
      p31Ids: ids,
    };
  }

  return null;
}
