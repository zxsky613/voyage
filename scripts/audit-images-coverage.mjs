/**
 * Audit de couverture images (héro + activités) contre la PROD.
 * Dev/ops uniquement — n'appelle jamais TripAdvisor, uniquement /api/images/resolve + caches Supabase (lecture).
 *
 * Usage:
 *   npm run audit:images
 *   node scripts/audit-images-coverage.mjs
 *   node scripts/audit-images-coverage.mjs --cities "Fréjus, Ténérife, Crète"
 *   node scripts/audit-images-coverage.mjs --fix   # purge cache SUSPECT (service-role)
 *   node scripts/audit-images-coverage.mjs --limit 10 --delay 400
 *
 * Env: AUDIT_PROD_URL (défaut https://www.justtrip.fr), SUPABASE_* pour caches + --fix
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { CITY_CATALOG, CITY_ALIASES } from "../cityCatalogData.js";
import { WIKIMEDIA_CURATED_CITY_HEROES } from "../cityWikimediaHeroes.js";
import {
  BUNDLED_CITY_HERO_PATHS,
  CITY_HERO_IMAGE_URLS,
  CITY_HERO_IMAGE_URL_LISTS,
} from "../cityHeroBundled.js";
import { resolveCanonicalCity } from "../cityHeroStem.js";
import { normalizeKeyPart, normalizeLabel, inferDefaultHeroResolveContext } from "../lib/images/normalizeLabel.js";
import {
  isLikelyNonScenicHeroImagery,
  isLikelyOrbitalOrMapImagery,
  isLikelyWikiBrandOrLogoImage,
} from "../lib/images/wikiImageFilters.js";
import { headCheckUrl, wikiUserAgent, isWikimediaApiUrl } from "../api/images/_headCheck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REPORTS_DIR = path.join(__dirname, "_reports");
const DEST_DIR = path.join(ROOT, "public", "destinations");

const DEFAULT_PROD_URL = "https://www.justtrip.fr";
const WARMUP_TOP_N = 50;

/** Contexte géo explicite — aligné sur warmup-image-resolve-top-cities.mjs */
const GEO_SUFFIX = Object.freeze({
  Paris: "France",
  Lyon: "France",
  Marseille: "France",
  Nice: "France",
  Monaco: "Monaco",
  Bordeaux: "France",
  Toulouse: "France",
  Lille: "France",
  Nantes: "France",
  Tokyo: "Japan",
  Kyoto: "Japan",
  Osaka: "Japan",
  Seoul: "South Korea",
  Bangkok: "Thailand",
  Singapore: "Singapore",
  Bali: "Indonesia",
  Jakarta: "Indonesia",
  Beijing: "China",
  Shanghai: "China",
  Guangzhou: "China",
  "New York": "United States",
  "Los Angeles": "United States",
  "San Francisco": "United States",
  Miami: "United States",
  Chicago: "United States",
  Toronto: "Canada",
  Vancouver: "Canada",
  London: "United Kingdom",
  Barcelona: "Spain",
  Madrid: "Spain",
  Rome: "Italy",
  Milan: "Italy",
  Venise: "Italy",
  Berlin: "Germany",
  Amsterdam: "Netherlands",
});

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {{ cities: string[], fix: boolean, limit: number|null, delayMs: number, concurrency: number, prodUrl: string, uiLang: string }} */
  const out = {
    cities: [],
    fix: false,
    limit: null,
    delayMs: 400,
    concurrency: 3,
    prodUrl: String(process.env.AUDIT_PROD_URL || DEFAULT_PROD_URL).replace(/\/$/, ""),
    uiLang: "fr",
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--fix") out.fix = true;
    else if (a === "--cities" && args[i + 1]) {
      out.cities = String(args[++i])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--limit" && args[i + 1]) out.limit = Math.max(1, Number(args[++i]) || 0) || null;
    else if (a === "--delay" && args[i + 1]) out.delayMs = Math.max(100, Number(args[++i]) || 400);
    else if (a === "--concurrency" && args[i + 1]) out.concurrency = Math.max(1, Math.min(3, Number(args[++i]) || 3));
    else if (a === "--prod" && args[i + 1]) out.prodUrl = String(args[++i]).replace(/\/$/, "");
    else if (a === "--lang" && args[i + 1]) out.uiLang = String(args[++i] || "fr");
  }
  return out;
}

function titleCaseWords(s) {
  return String(s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugToCityName(slug) {
  return titleCaseWords(String(slug || "").replace(/\.jpg$/i, "").replace(/-/g, " "));
}

/** @type {Map<string, string>} normalized key → libellé affichage préféré */
function buildDisplayLabelMap() {
  /** @type {Map<string, string>} */
  const map = new Map();

  const add = (label, preferred) => {
    const key = normalizeKeyPart(label);
    if (!key) return;
    if (!map.has(key)) map.set(key, preferred || resolveCanonicalCity(label) || titleCaseWords(label));
  };

  for (const canonical of CITY_CATALOG) {
    add(canonical, canonical);
    for (const alias of CITY_ALIASES[canonical] || []) add(alias, canonical);
  }

  for (const k of Object.keys(WIKIMEDIA_CURATED_CITY_HEROES)) {
    add(k, resolveCanonicalCity(k) || titleCaseWords(k));
  }
  for (const k of Object.keys(BUNDLED_CITY_HERO_PATHS)) {
    add(k, resolveCanonicalCity(k) || titleCaseWords(k));
  }
  for (const k of Object.keys(CITY_HERO_IMAGE_URLS)) add(k);
  for (const k of Object.keys(CITY_HERO_IMAGE_URL_LISTS)) add(k);

  return map;
}

function labelFromNormalizedKey(keyPart, displayMap) {
  const k = normalizeKeyPart(keyPart);
  if (displayMap.has(k)) return displayMap.get(k);
  return resolveCanonicalCity(k) || titleCaseWords(k);
}

async function listBundledDestinationSlugs() {
  try {
    const files = await readdir(DEST_DIR);
    return files.filter((f) => f.toLowerCase().endsWith(".jpg")).map((f) => f.replace(/\.jpg$/i, ""));
  } catch {
    return [];
  }
}

/**
 * @param {ReturnType<typeof createClient>|null} db
 * @param {Map<string, string>} displayMap
 */
async function loadCacheCityKeys(db, displayMap) {
  /** @type {Set<string>} */
  const keys = new Set();
  if (!db) return keys;

  const { data: imageRows, error: imgErr } = await db
    .from("image_resolve_cache")
    .select("label_normalized");
  if (imgErr) {
    console.warn(`[audit] image_resolve_cache lecture: ${imgErr.message}`);
  } else {
    for (const row of imageRows || []) {
      const part = String(row.label_normalized || "").split("|")[0].trim();
      if (part) keys.add(part);
    }
  }

  const { data: enrichRows, error: enrErr } = await db
    .from("place_enrichment_cache")
    .select("city_normalized");
  if (enrErr) {
    console.warn(`[audit] place_enrichment_cache lecture: ${enrErr.message}`);
  } else {
    for (const row of enrichRows || []) {
      const part = String(row.city_normalized || "").trim();
      if (part) keys.add(normalizeKeyPart(part));
    }
  }

  for (const k of keys) {
    if (!displayMap.has(k)) {
      displayMap.set(k, labelFromNormalizedKey(k, displayMap));
    }
  }
  return keys;
}

/**
 * @param {ReturnType<typeof createClient>|null} db
 * @returns {Promise<Map<string, string[]>>}
 */
async function loadEnrichmentPlacesByCity(db) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  if (!db) return map;

  const { data, error } = await db
    .from("place_enrichment_cache")
    .select("place_name_normalized, city_normalized, raw_name, status, num_reviews")
    .order("num_reviews", { ascending: false, nullsFirst: false });

  if (error) {
    console.warn(`[audit] enrich places: ${error.message}`);
    return map;
  }

  for (const row of data || []) {
    const cityKey = normalizeKeyPart(row.city_normalized || "");
    if (!cityKey) continue;
    const name = String(row.raw_name || row.place_name_normalized || "").trim();
    if (!name) continue;
    if (!map.has(cityKey)) map.set(cityKey, []);
    const list = map.get(cityKey);
    if (list.length < 6 && !list.includes(name)) list.push(name);
  }
  return map;
}

/**
 * @param {Map<string, string>} displayMap
 * @param {ReturnType<typeof createClient>|null} db
 * @param {string[]} cliCities
 */
async function buildCityList(displayMap, db, cliCities) {
  if (cliCities.length) {
    return cliCities.map((c) => resolveCanonicalCity(c) || c.trim()).filter(Boolean);
  }

  /** @type {Map<string, string>} key → display */
  const unique = new Map();

  const register = (label) => {
    const display = resolveCanonicalCity(label) || String(label).trim();
    const key = normalizeKeyPart(display);
    if (!key) return;
    if (!unique.has(key)) unique.set(key, display);
  };

  for (const k of Object.keys(WIKIMEDIA_CURATED_CITY_HEROES)) {
    register(displayMap.get(k) || labelFromNormalizedKey(k, displayMap));
  }
  for (const k of Object.keys(BUNDLED_CITY_HERO_PATHS)) {
    register(displayMap.get(k) || labelFromNormalizedKey(k, displayMap));
  }
  for (const slug of await listBundledDestinationSlugs()) {
    register(slugToCityName(slug));
  }
  for (const city of CITY_CATALOG.slice(0, WARMUP_TOP_N)) {
    register(city);
  }

  const cacheKeys = await loadCacheCityKeys(db, displayMap);
  for (const k of cacheKeys) {
    register(displayMap.get(k) || labelFromNormalizedKey(k, displayMap));
  }

  return [...unique.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

function heroLabelForCity(city) {
  const canonical = resolveCanonicalCity(city);
  const ctx =
    GEO_SUFFIX[canonical] ||
    GEO_SUFFIX[city] ||
    inferDefaultHeroResolveContext(canonical || city);
  return ctx ? `${canonical || city}, ${ctx}` : canonical || city;
}

function activityLabelsForCity(city, heroLabel, enrichmentByCity) {
  const cityKey = normalizeKeyPart(resolveCanonicalCity(city) || city);
  const fromCache = enrichmentByCity.get(cityKey) || [];
  if (fromCache.length >= 2) {
    return fromCache.slice(0, 2).map((name) => `${name}, ${heroLabel}`);
  }
  if (fromCache.length === 1) {
    return [
      `${fromCache[0]}, ${heroLabel}`,
      `Monument principal, ${heroLabel}`,
    ];
  }
  return [`Musée principal, ${heroLabel}`, `Monument principal, ${heroLabel}`];
}

/** Limite globale prod /api/images/resolve (~30/min côté serveur). */
class ProdApiRateLimiter {
  /** @param {number} minIntervalMs */
  constructor(minIntervalMs = 2100) {
    this.minIntervalMs = minIntervalMs;
    this.chain = Promise.resolve();
    this.last = 0;
  }

  /** @template T @param {() => Promise<T>} fn */
  schedule(fn) {
    this.chain = this.chain.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.last + this.minIntervalMs - now);
      if (wait) await sleep(wait);
      this.last = Date.now();
      return fn();
    });
    return this.chain;
  }
}

/**
 * @param {string} prodUrl
 * @param {{ kind: string, label: string, context?: string, uiLang?: string }} body
 */
async function resolveOnProd(prodUrl, body) {
  const res = await fetch(`${prodUrl}/api/images/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function absoluteUrl(url, prodUrl) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${prodUrl}${u}`;
  return u;
}

/**
 * @param {string} url
 * @param {'hero'|'activity'|'landmark'} kind
 */
function filterCheck(url, kind) {
  const decoded = decodeURIComponent(String(url || ""));
  const brand = isLikelyWikiBrandOrLogoImage(url, decoded);
  const orbital = kind === "hero" && isLikelyOrbitalOrMapImagery(url, decoded, "");
  const nonScenic = kind === "hero" && isLikelyNonScenicHeroImagery(url, decoded, "");
  if (brand || orbital || nonScenic) {
    const reasons = [];
    if (brand) reasons.push("logo/flag/map-brand");
    if (orbital) reasons.push("orbital/satellite/map");
    if (nonScenic) reasons.push("non-scenic/monochrome/detail");
    return { suspect: true, reason: reasons.join("; ") };
  }
  return { suspect: false, reason: "" };
}

/**
 * @param {string} url
 */
async function headCheckDetailed(url) {
  const u = absoluteUrl(url, DEFAULT_PROD_URL);
  if (!u.startsWith("http")) {
    return { ok: false, status: 0, contentType: "", isImage: false, reason: "invalid_url" };
  }
  const wikiHeaders = isWikimediaApiUrl(u) ? { "User-Agent": wikiUserAgent() } : {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    let res = await fetch(u, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: wikiHeaders,
    });
    let ct = res.headers.get("content-type") || "";
    if (res.ok && /^image\//i.test(ct)) {
      return { ok: true, status: res.status, contentType: ct, isImage: true, reason: "" };
    }
    if (res.status === 405 || res.status === 403 || !res.ok) {
      res = await fetch(u, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { ...wikiHeaders, Range: "bytes=0-512" },
      });
      ct = res.headers.get("content-type") || "";
    }
    const isImage =
      /^image\//i.test(ct) ||
      ((res.ok || res.status === 206) && /\.(jpe?g|webp|png|gif|avif)(\?|$)/i.test(u));
    return {
      ok: res.ok || res.status === 206,
      status: res.status,
      contentType: ct,
      isImage,
      reason: isImage ? "" : `head_${res.status}_${ct || "no_ct"}`,
    };
  } catch (e) {
    const ok = await headCheckUrl(u, 12000);
    return {
      ok,
      status: ok ? 200 : 0,
      contentType: ok ? "image/*" : "",
      isImage: ok,
      reason: ok ? "" : String(e?.message || "head_failed"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} resolveRes
 * @param {'hero'|'activity'} kind
 * @param {string} prodUrl
 */
async function evaluateResolve(resolveRes, kind, prodUrl) {
  const url = absoluteUrl(resolveRes?.url, prodUrl);
  const cache = String(resolveRes?.cache || (resolveRes?.cached ? "hit" : "miss"));
  const source = String(resolveRes?.source || "");
  const ok = resolveRes?.ok === true && Boolean(url);

  if (!ok) {
    return {
      ok: false,
      placeholder: true,
      suspect: false,
      url: "",
      source,
      cache,
      reason: String(resolveRes?.reason || resolveRes?.error || "not_found"),
      headOk: false,
    };
  }

  const filters = filterCheck(url, kind);
  if (filters.suspect) {
    return {
      ok: true,
      placeholder: false,
      suspect: true,
      url,
      source,
      cache,
      reason: filters.reason,
      headOk: false,
    };
  }

  const head = await headCheckDetailed(url);
  if (!head.isImage) {
    return {
      ok: true,
      placeholder: false,
      suspect: false,
      url,
      source,
      cache,
      reason: head.reason || "head_not_image",
      headOk: false,
      badUrl: true,
    };
  }

  return {
    ok: true,
    placeholder: false,
    suspect: false,
    url,
    source,
    cache,
    reason: "",
    headOk: true,
  };
}

/**
 * @param {object} hero
 * @param {object[]} activities
 */
function classifyCity(hero, activities) {
  if (hero.suspect || activities.some((a) => a.suspect)) {
    return {
      status: "SUSPECT",
      emoji: "⚠️",
      reason: [hero, ...activities]
        .filter((x) => x.suspect)
        .map((x) => x.reason)
        .join(" | "),
    };
  }
  if (hero.placeholder || !hero.ok) {
    return {
      status: "KO",
      emoji: "❌",
      reason: hero.reason || "hero_placeholder",
    };
  }
  if (!hero.headOk) {
    return {
      status: "KO",
      emoji: "❌",
      reason: hero.reason || "hero_url_unreachable",
    };
  }
  const actOk = activities.filter((a) => a.ok && a.headOk && !a.placeholder).length;
  if (actOk < activities.length) {
    return {
      status: "PARTIAL",
      emoji: "🟡",
      reason: `${actOk}/${activities.length} activités OK`,
    };
  }
  return { status: "OK", emoji: "✅", reason: "" };
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatTimestamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * @param {ReturnType<typeof createClient>|null} db
 * @param {{ label: string, kind: string, context?: string }} entry
 */
async function purgeSuspectCacheEntry(db, entry) {
  if (!db) return { ok: false, reason: "no_supabase" };
  const labelNorm = normalizeLabel(entry.label, entry.context || "");
  if (!labelNorm) return { ok: false, reason: "empty_key" };
  const { error } = await db
    .from("image_resolve_cache")
    .delete()
    .eq("label_normalized", labelNorm)
    .eq("kind", entry.kind);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, labelNorm };
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs();
  const displayMap = buildDisplayLabelMap();

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  /** @type {ReturnType<typeof createClient>|null} */
  const db =
    supabaseUrl && serviceRole
      ? createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  if (!db) {
    console.warn("[audit] Supabase non configuré — sources cache utilisateurs ignorées.");
  }

  let cities = await buildCityList(displayMap, db, opts.cities);
  if (opts.limit) cities = cities.slice(0, opts.limit);

  const enrichmentByCity = await loadEnrichmentPlacesByCity(db);
  const prodLimiter = new ProdApiRateLimiter(2100);

  console.log(
    `audit-images-coverage: ${cities.length} ville(s), prod=${opts.prodUrl}, concurrency=${opts.concurrency}, delay=${opts.delayMs}ms`
  );
  if (opts.fix) console.log("--fix actif : purge image_resolve_cache pour entrées SUSPECT uniquement\n");

  /** @type {Array<object>} */
  const rows = [];
  let done = 0;

  async function auditOneCity(city) {
    const heroLabel = heroLabelForCity(city);
    const actLabels = activityLabelsForCity(city, heroLabel, enrichmentByCity);

    const heroRes = await prodLimiter.schedule(() =>
      resolveOnProd(opts.prodUrl, { kind: "hero", label: heroLabel, uiLang: opts.uiLang })
    );
    const hero = await evaluateResolve(heroRes, "hero", opts.prodUrl);

    /** @type {object[]} */
    const activities = [];
    for (const actLabel of actLabels) {
      const actRes = await prodLimiter.schedule(() =>
        resolveOnProd(opts.prodUrl, {
          kind: "activity",
          label: actLabel,
          uiLang: opts.uiLang,
        })
      );
      activities.push(await evaluateResolve(actRes, "activity", opts.prodUrl));
    }

    const cls = classifyCity(hero, activities);
    done += 1;
    console.log(
      `[${done}/${cities.length}] ${cls.emoji} ${city} — ${cls.status}` +
        (cls.reason ? ` (${cls.reason.slice(0, 80)})` : "") +
        ` | héro cache=${hero.cache} source=${hero.source || "-"}`
    );

    /** @type {Array<{label:string,kind:string,context?:string}>} */
    const suspectEntries = [];
    if (hero.suspect) suspectEntries.push({ label: heroLabel, kind: "hero" });
    actLabels.forEach((label, i) => {
      if (activities[i]?.suspect) suspectEntries.push({ label, kind: "activity" });
    });

    if (opts.fix && suspectEntries.length && db) {
      for (const entry of suspectEntries) {
        const purged = await purgeSuspectCacheEntry(db, entry);
        if (purged.ok) {
          console.log(`  → purged cache ${entry.kind} key=${purged.labelNorm}`);
        } else {
          console.warn(`  → purge skip: ${purged.reason}`);
        }
      }
    }

    return {
      city,
      heroLabel,
      status: cls.status,
      emoji: cls.emoji,
      reason: cls.reason,
      heroSource: hero.source,
      heroCache: hero.cache,
      heroUrl: hero.url,
      heroReason: hero.reason,
      act1Label: actLabels[0] || "",
      act1Source: activities[0]?.source || "",
      act1Cache: activities[0]?.cache || "",
      act1Url: activities[0]?.url || "",
      act1Reason: activities[0]?.reason || "",
      act2Label: actLabels[1] || "",
      act2Source: activities[1]?.source || "",
      act2Cache: activities[1]?.cache || "",
      act2Url: activities[1]?.url || "",
      act2Reason: activities[1]?.reason || "",
      suspectEntries,
    };
  }

  /** Pool concurrence villes */
  let cursor = 0;
  async function worker() {
    while (cursor < cities.length) {
      const idx = cursor++;
      const city = cities[idx];
      rows[idx] = await auditOneCity(city);
      if (idx < cities.length - 1) await sleep(opts.delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, cities.length) }, () => worker()));

  rows.sort((a, b) => a.city.localeCompare(b.city, "fr"));

  const total = rows.length;
  const okN = rows.filter((r) => r.status === "OK").length;
  const partialN = rows.filter((r) => r.status === "PARTIAL").length;
  const koN = rows.filter((r) => r.status === "KO").length;
  const suspectN = rows.filter((r) => r.status === "SUSPECT").length;
  const pctOk = total ? ((okN / total) * 100).toFixed(1) : "0.0";

  const koList = rows.filter((r) => r.status === "KO").map((r) => r.city);
  const suspectList = rows.filter((r) => r.status === "SUSPECT").map((r) => r.city);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = formatTimestamp();
  const baseName = `audit-images-${stamp}`;
  const mdPath = path.join(REPORTS_DIR, `${baseName}.md`);
  const csvPath = path.join(REPORTS_DIR, `${baseName}.csv`);

  const md = [
    `# Audit couverture images — ${new Date().toISOString()}`,
    "",
    `- **Prod** : ${opts.prodUrl}`,
    `- **Villes** : ${total}`,
    `- **OK** : ${okN} (${pctOk}%)`,
    `- **PARTIEL** : ${partialN}`,
    `- **KO** : ${koN}`,
    `- **SUSPECT** : ${suspectN}`,
    "",
    "## KO",
    koList.length ? koList.map((c) => `- ${c}`).join("\n") : "_aucun_",
    "",
    "## SUSPECT (cache à purger)",
    suspectList.length ? suspectList.map((c) => `- ${c}`).join("\n") : "_aucun_",
    "",
    "## Détail par ville",
    "",
    "| Ville | Statut | Héro source | Héro cache | Raison | URL héro |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.city} | ${r.emoji} ${r.status} | ${r.heroSource || "-"} | ${r.heroCache || "-"} | ${String(r.reason || r.heroReason).replace(/\|/g, "/")} | ${String(r.heroUrl).slice(0, 80)} |`
    ),
    "",
    "### Activités",
    "",
    ...rows.flatMap((r) => [
      `#### ${r.city}`,
      `- Act1 \`${r.act1Label}\` — ${r.act1Source || "-"} (${r.act1Cache}) ${r.act1Reason ? `— ${r.act1Reason}` : ""}`,
      `- Act2 \`${r.act2Label}\` — ${r.act2Source || "-"} (${r.act2Cache}) ${r.act2Reason ? `— ${r.act2Reason}` : ""}`,
      "",
    ]),
  ].join("\n");

  const csvHeader =
    "city,status,reason,hero_label,hero_source,hero_cache,hero_url,hero_reason,act1_label,act1_source,act1_cache,act1_url,act1_reason,act2_label,act2_source,act2_cache,act2_url,act2_reason";
  const csvBody = rows
    .map((r) =>
      [
        r.city,
        r.status,
        r.reason,
        r.heroLabel,
        r.heroSource,
        r.heroCache,
        r.heroUrl,
        r.heroReason,
        r.act1Label,
        r.act1Source,
        r.act1Cache,
        r.act1Url,
        r.act1Reason,
        r.act2Label,
        r.act2Source,
        r.act2Cache,
        r.act2Url,
        r.act2Reason,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  fs.writeFileSync(mdPath, md, "utf8");
  fs.writeFileSync(csvPath, `${csvHeader}\n${csvBody}\n`, "utf8");

  console.log("\n=== Résumé ===");
  console.log(`OK: ${okN}/${total} (${pctOk}%) | PARTIEL: ${partialN} | KO: ${koN} | SUSPECT: ${suspectN}`);
  if (koList.length) console.log(`KO: ${koList.join(", ")}`);
  if (suspectList.length) console.log(`SUSPECT: ${suspectList.join(", ")}`);
  console.log(`\nRapports:\n  ${mdPath}\n  ${csvPath}`);

  process.exit(koN > total / 2 ? 1 : 0);
}

main().catch((e) => {
  console.error("audit-images-coverage fatal:", e);
  process.exit(1);
});
