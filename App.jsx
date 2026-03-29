import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Calendar,
  Briefcase,
  DollarSign,
  Plus,
  X,
  Menu,
  Share2,
  Users,
  Search,
  MapPin,
  Pencil,
  Trash2,
  Plane,
  Mail,
  MessageCircle,
  UserRound,
  ChevronDown,
  ChevronRight,
  Eye,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Lock,
} from "lucide-react";
import { fetchGeminiTripSuggestions, fetchGeminiItinerary } from "./geminiClient.js";
import { sanitizeMustSeePlaces } from "./placeGuards.js";
import { ICONIC_PLACES_CANONICAL } from "./iconicPlacesData.js";

/** Si true : bouton programme masqué sauf créateur (VITE_CREATOR_ITINERARY=true). Côté serveur : GEMINI_ITINERARY_PREMIUM_ONLY + GEMINI_CREATOR_ITINERARY. */
const SHOW_DESTINATION_ITINERARY_CTA =
  import.meta.env.VITE_ITINERARY_PREMIUM_ONLY !== "true" ||
  import.meta.env.VITE_CREATOR_ITINERARY === "true";

/** Quand true : encarts quota Gemini, .env, détails techniques. À activer seulement dans .env.local du développeur — pas pour les utilisateurs finaux. */
const SHOW_GEMINI_DEV_UI =
  import.meta.env.VITE_SHOW_GEMINI_DEV_ERRORS === "true" ||
  import.meta.env.VITE_SHOW_GEMINI_DEV_ERRORS === "1";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "YOUR_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";
/** Bucket Supabase Storage (public) pour la couche 3 — fichiers {slug}.webp ex. tokyo.webp */
const CITY_HERO_STORAGE_BUCKET = import.meta.env.VITE_CITY_HERO_STORAGE_BUCKET || "";
const cityImageMemoryCache = {};
const CHAT_CACHE_KEY = "tp_chat_cache_v1";
const ACTIVITY_DESC_CACHE_KEY = "tp_activity_desc_cache_v1";

const TODAY_STR = new Date().toISOString().slice(0, 10);
function getTodayStr() {
  return TODAY_STR;
}

function formatDate(value) {
  const s = String(value || "");
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function getInviteApiUrl() {
  const base = String(import.meta.env.VITE_INVITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/api/send-invite` : "/api/send-invite";
}

function buildParticipantAvatarUrl(seed) {
  const safe = encodeURIComponent(String(seed || "participant"));
  return `https://api.dicebear.com/9.x/initials/svg?seed=${safe}`;
}

function isValidEmail(value) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(value || "").trim());
}

function parseEmails(input) {
  const raw = String(input || "");
  const candidates = raw
    .split(/[,;\s]+/g)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(candidates)];
  return unique.filter((mail) => isValidEmail(mail));
}

function buildParticipantsFromInvites(invitedEmailsInput) {
  const invites = Array.isArray(invitedEmailsInput)
    ? [...new Set(invitedEmailsInput.map((m) => String(m || "").trim().toLowerCase()).filter((m) => isValidEmail(m)))]
    : [];
  return ["Moi", ...invites];
}

function canonicalParticipants(participantsInput, invitedEmailsInput) {
  const invited = Array.isArray(invitedEmailsInput)
    ? [...new Set(invitedEmailsInput.map((m) => String(m || "").trim().toLowerCase()).filter((m) => isValidEmail(m)))]
    : [];
  // Single source of truth for budget sharing:
  // only "Moi" + invited emails (participants list can contain legacy noise).
  return ["Moi", ...invited];
}

function loadChatCacheFromStorage() {
  try {
    const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_e) {
    return {};
  }
}

function saveChatCacheToStorage(cache) {
  try {
    window.localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache || {}));
  } catch (_e) {
    // ignore storage errors
  }
}

function loadActivityDescriptionCache() {
  try {
    const raw = window.localStorage.getItem(ACTIVITY_DESC_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function saveActivityDescriptionCache(cache) {
  try {
    window.localStorage.setItem(ACTIVITY_DESC_CACHE_KEY, JSON.stringify(cache || {}));
  } catch (_e) {
    // ignore storage errors
  }
}

function getCachedActivityDescription(activityId) {
  if (typeof window === "undefined") return "";
  const id = String(activityId || "");
  if (!id) return "";
  const cache = loadActivityDescriptionCache();
  return String(cache?.[id] || "");
}

function cacheActivityDescription(activityId, description) {
  if (typeof window === "undefined") return;
  const id = String(activityId || "");
  if (!id) return;
  const text = String(description || "").trim();
  const cache = loadActivityDescriptionCache();
  if (!text) {
    if (Object.prototype.hasOwnProperty.call(cache, id)) {
      delete cache[id];
      saveActivityDescriptionCache(cache);
    }
    return;
  }
  cache[id] = text;
  saveActivityDescriptionCache(cache);
}

function getCurrentUserDisplayName(session) {
  const first = String(session?.user?.user_metadata?.first_name || "").trim();
  const last = String(session?.user?.user_metadata?.last_name || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const fromMeta = String(session?.user?.user_metadata?.full_name || "").trim();
  if (fromMeta) return fromMeta;
  const emailLocal = String(session?.user?.email || "").split("@")[0] || "";
  return emailLocal || "Moi";
}

function initialsFromLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return "??";
  const emailLocal = raw.includes("@") ? raw.split("@")[0] : raw;
  const tokens = emailLocal
    .split(/[\s._-]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0] || ""}${tokens[tokens.length - 1][0] || ""}`.toUpperCase();
  const t = tokens[0] || "";
  return (t.slice(0, 2) || "??").toUpperCase();
}

function participantDisplayFromRaw(value, currentUserDisplayName) {
  const raw = String(value || "").trim();
  if (!raw) return "Membre";
  if (raw.toLowerCase() === "moi") return String(currentUserDisplayName || "Moi");
  if (!raw.includes("@")) return raw;
  const local = raw.split("@")[0] || "";
  const pretty = local
    .split(/[._-]+/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return pretty || raw;
}

function resolveVoterLabel(vote, session) {
  const currentUserId = String(session?.user?.id || "");
  if (String(vote?.voter_id || "") === currentUserId) return "Moi";
  const named = String(vote?.voter_name || vote?.author_name || "").trim();
  if (named) return named;
  const mail = String(vote?.voter_email || vote?.author_email || "").trim();
  if (mail) {
    const local = mail.split("@")[0] || "";
    return local
      .split(/[._-]+/g)
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join(" ") || mail;
  }
  const id = String(vote?.voter_id || "");
  return id ? `Membre ${id.slice(0, 6)}` : "Membre";
}

function getCityGlassTheme(cityInput) {
  const city = resolveCanonicalCity(cityInput);
  const c = String(city || "").toLowerCase();

  const theme = (a, b, edge = "rgba(255,255,255,0.38)") => ({
    overlay: `linear-gradient(135deg, ${a}, ${b})`,
    edge,
  });

  if (c.includes("dubai") || c.includes("doha") || c.includes("abu dhabi")) {
    return theme("rgba(249,115,22,0.44)", "rgba(15,23,42,0.32)");
  }
  if (c.includes("marrakech") || c.includes("le caire") || c.includes("tunis")) {
    return theme("rgba(244,114,182,0.38)", "rgba(251,146,60,0.34)");
  }
  if (c.includes("san francisco") || c.includes("los angeles") || c.includes("miami")) {
    return theme("rgba(250,204,21,0.34)", "rgba(14,165,233,0.30)");
  }
  if (c.includes("bali") || c.includes("sydney") || c.includes("auckland")) {
    return theme("rgba(129,140,248,0.36)", "rgba(217,70,239,0.30)");
  }
  if (c.includes("paphos") || c.includes("athenes") || c.includes("lisbonne") || c.includes("porto")) {
    return theme("rgba(16,185,129,0.34)", "rgba(14,165,233,0.30)");
  }
  if (c.includes("istanbul")) {
    return theme("rgba(59,130,246,0.40)", "rgba(99,102,241,0.34)");
  }
  if (c.includes("lyon") || c.includes("paris") || c.includes("london") || c.includes("berlin")) {
    return theme("rgba(71,85,105,0.42)", "rgba(30,41,59,0.30)");
  }
  return theme("rgba(15,23,42,0.34)", "rgba(15,23,42,0.26)");
}

function normalizeCityInput(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTextForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const CITY_CATALOG = [
  "Paris", "Lyon", "Marseille", "Nice", "Monaco", "Bordeaux", "Toulouse", "Lille", "Nantes",
  "Tokyo", "Kyoto", "Osaka", "Seoul", "Bangkok", "Singapore", "Bali", "Jakarta", "Beijing", "Shanghai", "Guangzhou",
  "New York", "Los Angeles", "San Francisco", "Miami", "Chicago", "Toronto", "Vancouver",
  "London", "Barcelona", "Madrid", "Rome", "Milan", "Venise", "Berlin", "Amsterdam",
  "Bruxelles", "Lisbonne", "Porto", "Prague", "Vienne", "Budapest", "Athènes", "Istanbul",
  "Dubai", "Doha", "Abu Dhabi", "Le Caire", "Marrakech", "Tunis", "Alger",
  "Sydney", "Melbourne", "Auckland", "Cape Town", "Rio de Janeiro", "Sao Paulo", "Phuket",
];

const CITY_ALIASES = {
  Beijing: ["Pekin", "Pékin", "Peking"],
  "New York": ["NYC", "New York City"],
  Venise: ["Venice"],
  "Le Caire": ["Cairo"],
  Lisbonne: ["Lisbon"],
  Vienne: ["Vienna"],
  Athènes: ["Athens"],
  "Sao Paulo": ["São Paulo"],
  Guangzhou: ["Canton", "Kwangchow"],
  Monaco: ["Monte Carlo", "Monte-Carlo"],
  London: ["Londres"],
  Barcelona: ["Barcelone"],
  Rome: ["Roma"],
};

const CITY_SEARCH_ENTRIES = CITY_CATALOG.flatMap((canonical) => {
  const aliases = Array.isArray(CITY_ALIASES[canonical]) ? CITY_ALIASES[canonical] : [];
  return [{ label: canonical, canonical }, ...aliases.map((alias) => ({ label: alias, canonical }))];
});

function resolveCanonicalCity(value) {
  const q = normalizeTextForSearch(value);
  if (!q) return normalizeCityInput(value);
  const exact = CITY_SEARCH_ENTRIES.find((entry) => normalizeTextForSearch(entry.label) === q);
  return exact ? exact.canonical : normalizeCityInput(value);
}

/** Première partie "ville" avant virgule, puis canon catalogue si possible. */
function normalizeDestinationConfirm(raw) {
  const step = extractCityPrompt(raw) || String(raw || "").trim();
  if (step.length < 2) return "";
  return resolveCanonicalCity(step);
}

function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** Liste locale d’abord, puis résultats API sans doublon (même ville). */
function mergeCitySuggestionLists(localList, remoteList, max = 10) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const raw = String(s || "").trim();
    if (!raw) return;
    const key = normalizeTextForSearch(raw.split(",")[0]?.trim() || raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(raw);
  };
  for (const s of localList || []) {
    if (out.length >= max) break;
    add(s);
  }
  for (const s of remoteList || []) {
    if (out.length >= max) break;
    add(s);
  }
  return out;
}

function getCitySuggestions(input) {
  const q = normalizeTextForSearch(input);
  if (q.length < 2) return [];
  const ranked = CITY_SEARCH_ENTRIES.map((entry) => {
    const c = normalizeTextForSearch(entry.label);
    let score = 0;
    if (c === q) score = 100;
    else if (c.startsWith(q)) score = 92;
    else if (c.includes(q)) score = 75;
    else {
      const dist = levenshteinDistance(q, c);
      const maxLen = Math.max(q.length, c.length);
      const similarity = 1 - dist / Math.max(1, maxLen);
      score = Math.round(similarity * 100);
      if (q.length >= 5 && dist <= 2) score += 12;
    }
    return { city: entry.canonical, score };
  }).sort((a, b) => b.score - a.score);

  const strict = [...new Set(ranked.filter((x) => x.score >= 45).map((x) => x.city))].slice(0, 8);

  if (strict.length > 0) return strict;

  // Fallback: always keep a few closest results, to avoid empty suggestion list.
  return [...new Set(ranked.filter((x) => x.score > 0).map((x) => x.city))].slice(0, 5);
}

const WORLD_CITY_SUGGESTIONS_CACHE = {};

async function fetchWorldwideCitySuggestions(input, limit = 8) {
  const q = normalizeCityInput(input);
  if (q.length < 2) return [];
  const cacheKey = `${normalizeTextForSearch(q)}::${Number(limit)}`;
  if (WORLD_CITY_SUGGESTIONS_CACHE[cacheKey]) {
    return WORLD_CITY_SUGGESTIONS_CACHE[cacheKey];
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
    )}&count=${Math.min(Math.max(Number(limit) || 8, 1), 12)}&language=fr&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    const rows = Array.isArray(json?.results) ? json.results : [];
    const mapped = rows
      .map((row) => {
        const city = String(row?.name || "").trim();
        if (!city) return "";
        const admin = String(row?.admin1 || "").trim();
        const country = String(row?.country || "").trim();
        const parts = [city];
        if (admin && normalizeTextForSearch(admin) !== normalizeTextForSearch(city)) parts.push(admin);
        if (country) parts.push(country);
        return parts.join(", ");
      })
      .filter(Boolean);
    const unique = [...new Set(mapped)].slice(0, Math.max(1, Number(limit) || 8));
    WORLD_CITY_SUGGESTIONS_CACHE[cacheKey] = unique;
    return unique;
  } catch (_e) {
    return [];
  }
}

/** Fond écrans auth / chargement — aligné bleu-gris carte */
const BG = "#eef3f8";
const TEXT = "#0B1220";
const ACCENT = "#0F172A";
const slots = ["09:30", "14:00", "18:30", "21:00"];

/** Chargement `trips` : inclure owner_id / invited_emails pour que userCanSeeTrip filtre (base Supabase partagée). */
const TRIPS_SELECT_ATTEMPTS = [
  "*",
  "id,title,name,destination,start_date,end_date,fixed_url,participants,owner_id,invited_emails",
  "id,title,start_date,end_date,owner_id,invited_emails",
  "id,title,start_date,end_date,owner_id",
];

const GLASS_BUTTON_CLASS =
  "border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_14px_35px_rgba(15,23,42,0.3)] transition hover:brightness-110";
const GLASS_ACCENT_STYLE = {
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.92) 55%, rgba(15,23,42,0.96) 100%)",
};

function extractCityPrompt(destination) {
  const s = String(destination || "").trim();
  if (!s) return "";
  // If user types "Paris, France" or "Paris - France", keep the first token.
  const comma = s.split(",")[0]?.trim() || "";
  const dash = comma.split("-")[0]?.trim() || comma.trim();
  return dash;
}

/** Titre de page Wikipédia EN quand il diffère du nom affiché dans l’app. */
const WIKI_EN_PAGE_TITLE = Object.freeze({
  "new york": "New York City",
  venise: "Venice",
  athenes: "Athens",
  bruxelles: "Brussels",
  lisbonne: "Lisbon",
  "le caire": "Cairo",
  vienne: "Vienna",
  "sao paulo": "São Paulo",
  canton: "Guangzhou",
  pekin: "Beijing",
  mumbai: "Mumbai",
  "rio de janeiro": "Rio de Janeiro",
});

/** Titre de page Wikipédia FR quand il diffère du nom canon dans l’app. */
const WIKI_FR_PAGE_TITLE = Object.freeze({
  london: "Londres",
  athenes: "Athènes",
  vienne: "Vienne",
  lisbonne: "Lisbonne",
  "le caire": "Le Caire",
  beijing: "Pékin",
  pekin: "Pékin",
  canton: "Guangzhou",
});

const wikiHeroUrlInflight = Object.create(null);

function dedupeImageUrlChain(urls) {
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function fetchWikiPageImageApi(wikiHost, title, thumbSize = 2048) {
  const t = String(title || "").trim();
  if (!t) return "";
  try {
    const api = `https://${wikiHost}/w/api.php?action=query&titles=${encodeURIComponent(
      t
    )}&prop=pageimages&format=json&origin=*&pithumbsize=${thumbSize}&redirects=1`;
    const r = await fetch(api);
    if (!r.ok) return "";
    const j = await r.json();
    const pages = j?.query?.pages;
    if (!pages || typeof pages !== "object") return "";
    const page = Object.values(pages)[0];
    if (!page || page.missing === true || Number(page.pageid) < 0) return "";
    return String(page.thumbnail?.source || "").trim();
  } catch (_e) {
    return "";
  }
}

/**
 * Images stables liées à l’article Wikipédia (upload.wikimedia.org), EN + FR en parallèle.
 * Évite Unsplash dont les IDs cassent sans préavis.
 */
async function fetchWikipediaHeroImageUrls(safeCity) {
  const key = normalizeTextForSearch(safeCity);
  if (!key) return [];
  if (wikiHeroUrlInflight[key]) return wikiHeroUrlInflight[key];
  wikiHeroUrlInflight[key] = (async () => {
    const norm = key;
    const enTitle = WIKI_EN_PAGE_TITLE[norm] || safeCity;
    const frTitle = WIKI_FR_PAGE_TITLE[norm] || safeCity;
    const [enU, frU] = await Promise.all([
      fetchWikiPageImageApi("en.wikipedia.org", enTitle),
      fetchWikiPageImageApi("fr.wikipedia.org", frTitle),
    ]);
    return dedupeImageUrlChain([enU, frU]);
  })();
  return wikiHeroUrlInflight[key];
}

async function fetchFrenchWikiSummaryThumb(safeCity) {
  try {
    const r = await fetch(
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(safeCity)}`
    );
    if (!r.ok) return "";
    const j = await r.json();
    return String(j?.thumbnail?.source || "").trim();
  } catch (_e) {
    return "";
  }
}

/**
 * Couche 1 — Images servies par l’app (`public/destinations/{slug}.jpg`).
 * Remplir avec `npm run fetch:destinations` (voir scripts/fetch-destination-images.mjs).
 */
/** Bundles locaux — régénérés avec npm run fetch:destinations (profils plage / skyline / patrimoine : scripts/destination-image-profiles.mjs). */
const BUNDLED_CITY_HERO_PATHS = Object.freeze({
  paris: "/destinations/paris.jpg",
  tokyo: "/destinations/tokyo.jpg",
  london: "/destinations/london.jpg",
  "new york": "/destinations/new-york.jpg",
  dubai: "/destinations/dubai.jpg",
  sydney: "/destinations/sydney.jpg",
  barcelona: "/destinations/barcelona.jpg",
  rome: "/destinations/rome.jpg",
  berlin: "/destinations/berlin.jpg",
  istanbul: "/destinations/istanbul.jpg",
  "los angeles": "/destinations/los-angeles.jpg",
  nice: "/destinations/nice.jpg",
  miami: "/destinations/miami.jpg",
  singapore: "/destinations/singapore.jpg",
  amsterdam: "/destinations/amsterdam.jpg",
  prague: "/destinations/prague.jpg",
  lyon: "/destinations/lyon.jpg",
  pisa: "/destinations/pisa.jpg",
  pise: "/destinations/pisa.jpg",
  shanghai: "/destinations/shanghai.jpg",
  beijing: "/destinations/beijing.jpg",
  pekin: "/destinations/beijing.jpg",
  marrakech: "/destinations/marrakech.jpg",
  phuket: "/destinations/phuket.jpg",
});

function getBundledCityHeroPath(cityInput) {
  const raw = String(extractCityPrompt(cityInput) || cityInput || "").trim();
  if (!raw) return "";
  const keys = [];
  const canonical = resolveCanonicalCity(raw);
  if (canonical) keys.push(normalizeTextForSearch(canonical));
  keys.push(normalizeTextForSearch(raw));
  const firstTok = normalizeTextForSearch(raw.split(/\s+/)[0] || "");
  if (firstTok && !keys.includes(firstTok)) keys.push(firstTok);
  for (const k of keys) {
    if (!k) continue;
    const p = BUNDLED_CITY_HERO_PATHS[k];
    if (p) return String(p).trim();
  }
  return "";
}

/** Couche 3 — URL publique Supabase Storage (même nom que en local : {slug}.jpg). Upload : npm run upload:destinations */
function getStorageMirrorHeroUrl(cityInput) {
  if (!CITY_HERO_STORAGE_BUCKET) return "";
  const base = String(SUPABASE_URL || "").replace(/\/$/, "");
  if (!base || base.includes("YOUR_PROJECT")) return "";
  const raw = String(extractCityPrompt(cityInput) || cityInput || "").trim();
  if (!raw) return "";
  const canonical = resolveCanonicalCity(raw) || raw;
  const slug = normalizeTextForSearch(canonical).replace(/\s+/g, "-");
  if (!slug) return "";
  return `${base}/storage/v1/object/public/${CITY_HERO_STORAGE_BUCKET}/${slug}.jpg`;
}

/**
 * Couche 2 (b) — Fichiers Wikimedia Commons figés (chemins stables), avant l’API pageimages.
 * Complète quand il n’y a pas de bundle local ni miroir Storage.
 */
const CITY_HERO_IMAGE_URLS = Object.freeze({
  nice: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nice_vue_du_Ch%C3%A2teau.jpg/1600px-Nice_vue_du_Ch%C3%A2teau.jpg",
});

const CITY_HERO_IMAGE_URL_LISTS = Object.freeze({
  "los angeles": [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Los_Angeles_from_Griffith_Observatory_%28cropped%29.jpg/1920px-Los_Angeles_from_Griffith_Observatory_%28cropped%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Los_Angeles_from_Griffith_Observatory_%28cropped%29.jpg/1280px-Los_Angeles_from_Griffith_Observatory_%28cropped%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/f/f5/Los_Angeles_from_Griffith_Observatory_%28cropped%29.jpg",
  ],
});

/** Vignette Wikipédia souvent = drapeau / sceau / blason — inadaptée comme bandeau paysage. */
function isLikelyWikiFlagOrSealThumb(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return false;
  return (
    u.includes("flag_of") ||
    u.includes("/flag/") ||
    u.includes("flag_of_") ||
    u.includes("seal_of") ||
    u.includes("coat_of_arms") ||
    u.includes("armoiries") ||
    u.includes("emblem_of") ||
    u.includes("drapeau") ||
    u.includes("blason") ||
    u.includes("_seal.") ||
    u.includes("_badge.") ||
    u.includes("logo_")
  );
}

function getCityHeroImageCandidates(cityInput) {
  const raw = String(extractCityPrompt(cityInput) || cityInput || "").trim();
  if (!raw) return [];
  const keys = [];
  const canonical = resolveCanonicalCity(raw);
  if (canonical) keys.push(normalizeTextForSearch(canonical));
  keys.push(normalizeTextForSearch(raw));
  const firstTok = normalizeTextForSearch(raw.split(/\s+/)[0] || "");
  if (firstTok && !keys.includes(firstTok)) keys.push(firstTok);
  const urls = [];
  const seen = new Set();
  for (const k of keys) {
    if (!k) continue;
    const multi = CITY_HERO_IMAGE_URL_LISTS[k];
    if (multi) {
      for (const u of multi) {
        const s = String(u || "").trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          urls.push(s);
        }
      }
    }
    const one = CITY_HERO_IMAGE_URLS[k];
    if (one) {
      const s = String(one).trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        urls.push(s);
      }
    }
  }
  return urls;
}

function resolveCityHeroImageUrl(cityInput) {
  const list = getCityHeroImageCandidates(cityInput);
  return list[0] || "";
}

/** Image carte voyage : bundle / Storage / Commons figés, puis Picsum déterministe (évite carte vide si 404 ou ville hors map). */
function buildCityImageUrl(prompt) {
  const p = String(extractCityPrompt(prompt) || prompt || "").trim();
  if (!p) return "";
  const primary =
    getBundledCityHeroPath(p) || getStorageMirrorHeroUrl(p) || resolveCityHeroImageUrl(p);
  if (primary) return primary;
  return seededPicsumUrl(`${normalizeTextForSearch(p)}|city-hero`, 1600, 1000);
}

function getCityImageCacheKey(cityInput) {
  return `v17:${String(extractCityPrompt(cityInput) || cityInput || "")
    .trim()
    .toLowerCase()}`;
}

async function getCachedCityImage(cityInput) {
  const cacheKey = getCityImageCacheKey(cityInput);
  if (!cacheKey) return "";
  const localStorageKey = `tp_city_img_${cacheKey}`;

  if (cityImageMemoryCache[cacheKey]) return String(cityImageMemoryCache[cacheKey]);

  try {
    const persisted = window.localStorage.getItem(localStorageKey);
    if (persisted) {
      cityImageMemoryCache[cacheKey] = persisted;
      return String(persisted);
    }
  } catch (_e) {
    // ignore localStorage errors
  }

  try {
    const { data, error } = await supabase.from("image_cache").select("url").eq("id", cacheKey).limit(1);
    if (!error && data && data.length > 0 && data[0]?.url) {
      const url = String(data[0].url);
      cityImageMemoryCache[cacheKey] = url;
      try {
        window.localStorage.setItem(localStorageKey, url);
      } catch (_e) {
        // ignore localStorage errors
      }
      return url;
    }
  } catch (_e) {
    // ignore cache read failures
  }

  return "";
}

async function persistCityImage(cityInput, urlInput) {
  const cacheKey = getCityImageCacheKey(cityInput);
  const url = String(urlInput || "").trim();
  if (!cacheKey || !url) return;
  const localStorageKey = `tp_city_img_${cacheKey}`;
  cityImageMemoryCache[cacheKey] = url;
  try {
    window.localStorage.setItem(localStorageKey, url);
  } catch (_e) {
    // ignore localStorage errors
  }
  try {
    await supabase.from("image_cache").upsert({ id: cacheKey, url }, { onConflict: "id" });
  } catch (_e) {
    // ignore cache write failures
  }
}

// Guide Recherche — vue drone zenithale, vague sur sable & eau turquoise (proche visuel “luxe plage”)
// Wikimedia Commons — CC0 — Derek Thomson / Unsplash (archivé Commons)
/** Fond marketing (écran sans guide) — plage ; ne pas réutiliser comme repli du bandeau ville. */
const DESTINATION_GUIDE_HERO_IMAGE =
  "https://upload.wikimedia.org/wikipedia/commons/f/fe/Drone_view_of_ocean_shoreline_%28Unsplash%29.jpg";
const DESTINATION_GUIDE_HERO_IMAGE_1280 =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Drone_view_of_ocean_shoreline_%28Unsplash%29.jpg/1280px-Drone_view_of_ocean_shoreline_%28Unsplash%29.jpg";

function buildActivityImageQuery(activity) {
  const text = String(`${activity?.title || activity?.name || ""} ${activity?.location || ""}`).toLowerCase();
  const rules = [
    { keys: ["natation", "piscine", "swim", "pool"], query: "swimmer in pool" },
    { keys: ["randonnee", "randonnée", "hike", "trek"], query: "mountain hiking trail" },
    { keys: ["ski", "snow"], query: "ski resort" },
    { keys: ["surf", "kitesurf"], query: "ocean surfing" },
    { keys: ["plage", "beach"], query: "tropical beach" },
    { keys: ["musee", "musée", "museum"], query: "art museum interior" },
    { keys: ["restaurant", "diner", "dîner", "food"], query: "restaurant table food" },
    { keys: ["velo", "vélo", "bike", "cycling"], query: "cycling city" },
    { keys: ["running", "course", "jogging"], query: "running track" },
    { keys: ["yoga"], query: "yoga studio" },
  ];
  const hit = rules.find((r) => r.keys.some((k) => text.includes(k)));
  if (hit) return hit.query;
  return String(
    `${activity?.title || activity?.name || "activity"} ${activity?.location || "travel"}`
  ).trim();
}

function buildTravelTips(city) {
  const safeCity = String(city || "la destination");
  return {
    do: [
      `Reserve les lieux populaires de ${safeCity} en avance.`,
      "Utilise les transports locaux pour gagner du temps.",
      "Garde une version hors-ligne de la carte de la ville.",
    ],
    dont: [
      "Evite les zones ultra-touristiques aux heures de pointe.",
      "Ne transporte pas tous tes documents originaux en meme temps.",
      "Ne change pas de grosses sommes dans la rue.",
    ],
  };
}

function buildSuggestedActivitiesForCity(city) {
  const c = String(city || "").toLowerCase();
  const base = [
    "Visite des quartiers historiques",
    "Tour culinaire local",
    "Point de vue au coucher du soleil",
    "Musee ou galerie incontournable",
  ];
  if (c.includes("tokyo")) return ["Shibuya & Shinjuku", "Temple Senso-ji", "Sushi local", "Vue depuis Shibuya Sky"];
  if (c.includes("paris")) return ["Tour Eiffel", "Musee du Louvre", "Croisiere sur la Seine", "Montmartre"];
  if (c.includes("bali")) return ["Temple Uluwatu", "Rizieres de Tegallalang", "Plage de Canggu", "Session surf"];
  if (c.includes("new york")) return ["Central Park", "Brooklyn Bridge", "Top of the Rock", "SoHo & Greenwich"];
  return base;
}

/**
 * Villes hors catalogue Open-Meteo / saisie libre : 5–7 axes concrets (pas de noms inventés).
 */
function buildExplorationPlacesFallback(cityLabel) {
  const name = String(cityLabel || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return null;
  return [
    `Centre historique & cœur de ${name}`,
    `Musées, monuments & patrimoine — ${name}`,
    `Parcs, jardins & points de vue à ${name}`,
    `Quartiers agréables pour se balader`,
    `Marchés, cuisine locale & vie de quartier`,
    `Architecture remarquable & art dans la ville`,
    `Excursion ou panorama aux alentours de ${name}`,
  ];
}

/** Repères emblématiques : tout le CITY_CATALOG dans iconicPlacesData.js + repli exploration. */
function getIconicPlacesFallback(safeCity) {
  const resolved = String(resolveCanonicalCity(safeCity) || "").trim();
  const candidates = [resolved, String(safeCity || "").trim()].filter((s) => s.length >= 2);
  const tried = new Set();
  for (const label of candidates) {
    const k = normalizeTextForSearch(label);
    if (tried.has(k)) continue;
    tried.add(k);
    const list = ICONIC_PLACES_CANONICAL[k];
    if (Array.isArray(list) && list.length > 0) return list.slice();
  }
  return null;
}

/** Assure entre min et max lieux : complète avec repères emblématiques si besoin. */
function clampPlacesList(places, cityName, { min = 5, max = 7 } = {}) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    const s = String(p || "").trim();
    if (!s) return;
    const k = normalizeTextForSearch(s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  (places || []).forEach(add);
  const fallback =
    getIconicPlacesFallback(cityName) || buildExplorationPlacesFallback(cityName) || [];
  for (const p of fallback) {
    if (out.length >= min) break;
    add(p);
  }
  for (const p of fallback) {
    if (out.length >= max) break;
    add(p);
  }
  return out.slice(0, max);
}

/** Affichage instantane (sans reseau) le temps que les APIs repondent. */
function buildInstantDestinationGuide(rawQuery) {
  const cityStem = extractCityPrompt(rawQuery) || normalizeCityInput(rawQuery);
  if (cityStem.length < 2) return null;
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return null;
  const img = buildCityImageUrl(safeCity);
  const instantCandidates = dedupeImageUrlChain([
    getBundledCityHeroPath(safeCity),
    getStorageMirrorHeroUrl(safeCity),
    ...getCityHeroImageCandidates(safeCity),
  ]);
  return {
    city: safeCity,
    description: `Chargement des infos sur ${safeCity}…`,
    places:
      getIconicPlacesFallback(safeCity) ||
      buildExplorationPlacesFallback(safeCity) ||
      [],
    suggestedActivities: buildSuggestedActivitiesForCity(safeCity),
    tips: buildTravelTips(safeCity),
    imageUrl: img,
    landscapeImageUrl: img,
    heroImageCandidates: instantCandidates,
    coordinates: null,
  };
}

const countryMapCache = Object.create(null);

/** Bbox + contour GeoJSON du pays (une requête Nominatim avec polygon_geojson). */
async function fetchCountryMapData(countryName, countryCode) {
  const name = String(countryName || "").trim();
  if (!name) return null;
  const cc = String(countryCode || "")
    .trim()
    .toLowerCase();
  const cacheKey = `${cc}|${name.toLowerCase()}`;
  if (countryMapCache[cacheKey]) return countryMapCache[cacheKey];

  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&polygon_geojson=1&addressdetails=0&featuretype=country&accept-language=fr&q=${encodeURIComponent(
      name
    )}`;
    if (cc.length === 2) url += `&countrycodes=${cc}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const arr = await r.json();
    const first = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    const bb = first?.boundingbox;
    if (!Array.isArray(bb) || bb.length < 4) return null;
    const south = Number(bb[0]);
    const north = Number(bb[1]);
    const west = Number(bb[2]);
    const east = Number(bb[3]);
    if (![south, north, west, east].every(Number.isFinite)) return null;
    const geo = first?.geojson;
    const data = {
      bbox: { south, north, west, east },
      geojson: geo && typeof geo === "object" ? geo : null,
    };
    countryMapCache[cacheKey] = data;
    return data;
  } catch (_e) {
    return null;
  }
}

function expandBoundingBox(box, pad = 0.07) {
  const south = Number(box.south);
  const north = Number(box.north);
  const west = Number(box.west);
  const east = Number(box.east);
  if (![south, north, west, east].every(Number.isFinite)) return box;
  const latPad = (north - south) * pad;
  const lonPad = (east - west) * pad;
  return {
    south: south - latPad,
    north: north + latPad,
    west: west - lonPad,
    east: east + lonPad,
  };
}

function unionBboxWithPoint(bbox, lat, lon, marginDeg = 0.4) {
  const b = expandBoundingBox(bbox, 0);
  const la = Number(lat);
  const lo = Number(lon);
  if (![b.south, b.north, b.west, b.east, la, lo].every(Number.isFinite)) return bbox;
  return {
    south: Math.min(b.south, la - marginDeg),
    north: Math.max(b.north, la + marginDeg),
    west: Math.min(b.west, lo - marginDeg),
    east: Math.max(b.east, lo + marginDeg),
  };
}

/** Fallback quand le pays n’est pas résolu : vue régionale autour de la ville. */
function bboxAroundPoint(lat, lon, latHalfSpan = 3.5, lonHalfSpan = 4.5) {
  return {
    south: lat - latHalfSpan,
    north: lat + latHalfSpan,
    west: lon - lonHalfSpan,
    east: lon + lonHalfSpan,
  };
}

function projectLonLatToSvg(lon, lat, b, svgW, svgH) {
  const x = ((Number(lon) - b.west) / (b.east - b.west)) * svgW;
  const y = ((b.north - Number(lat)) / (b.north - b.south)) * svgH;
  return [x, y];
}

function ringToSvgPath(ring, b, svgW, svgH) {
  if (!Array.isArray(ring) || ring.length === 0) return "";
  const segs = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const lo = Number(p?.[0]);
    const la = Number(p?.[1]);
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
    const [x, y] = projectLonLatToSvg(lo, la, b, svgW, svgH);
    segs.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  if (segs.length === 0) return "";
  return `${segs.join(" ")} Z`;
}

function geoJsonOutlineToPathD(geometry, b, svgW, svgH) {
  if (!geometry?.type || !geometry.coordinates) return "";
  const t = geometry.type;
  const c = geometry.coordinates;
  if (t === "Polygon") {
    if (!c[0]) return "";
    return ringToSvgPath(c[0], b, svgW, svgH);
  }
  if (t === "MultiPolygon") {
    return c
      .map((poly) => (poly?.[0] ? ringToSvgPath(poly[0], b, svgW, svgH) : ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function getRingLonLatBounds(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of ring) {
    const lo = Number(p?.[0]);
    const la = Number(p?.[1]);
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue;
    west = Math.min(west, lo);
    east = Math.max(east, lo);
    south = Math.min(south, la);
    north = Math.max(north, la);
  }
  if (!Number.isFinite(west)) return null;
  return { west, east, south, north };
}

/** Bbox du plus grand îlot du MultiPolygon (souvent masse continentale vs confettis d’outre-mer). */
function getMainLandLonLatBounds(geometry) {
  if (!geometry?.type || !geometry.coordinates) return null;
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ? getRingLonLatBounds(geometry.coordinates[0]) : null;
  }
  if (geometry.type !== "MultiPolygon") return null;
  let best = null;
  let bestScore = 0;
  for (const poly of geometry.coordinates) {
    const ring = poly?.[0];
    const b = getRingLonLatBounds(ring);
    if (!b) continue;
    const score = (b.east - b.west) * (b.north - b.south);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function padLonLatBounds(bounds, padRatio = 0.07) {
  const lonP = (bounds.east - bounds.west) * padRatio;
  const latP = (bounds.north - bounds.south) * padRatio;
  return {
    west: bounds.west - lonP,
    east: bounds.east + lonP,
    south: bounds.south - latP,
    north: bounds.north + latP,
  };
}

function framingBboxForMiniMap(geojson, cityLat, cityLon, viewBbox) {
  const maxSpanOf = (b) => Math.max(b.east - b.west, b.north - b.south);
  const finalize = (raw) => {
    if (!raw || ![raw.south, raw.north, raw.west, raw.east].every(Number.isFinite)) return null;
    let b = padLonLatBounds(raw, 0.08);
    b = unionBboxWithPoint(b, cityLat, cityLon, 0.12);
    return b;
  };

  const mainLand = geojson ? getMainLandLonLatBounds(geojson) : null;
  if (mainLand && maxSpanOf(mainLand) <= 52) {
    return finalize(mainLand);
  }
  if (viewBbox) {
    const vs = maxSpanOf(viewBbox);
    if (vs <= 58) {
      return finalize(viewBbox);
    }
  }
  if (mainLand) {
    return finalize(mainLand);
  }
  if (viewBbox) {
    return finalize(viewBbox);
  }
  return bboxAroundPoint(cityLat, cityLon, 6.5, 8);
}

async function fetchDestinationGuide(city) {
  const cityStem = extractCityPrompt(city) || String(city || "").trim();
  if (cityStem.length < 2) return null;
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return null;

  const wikiSummaryP = (async () => {
    try {
      const summaryResp = await fetch(
        `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(safeCity)}`
      );
      if (!summaryResp.ok) return { summaryText: "", thumb: "", lat: NaN, lon: NaN };
      const summaryJson = await summaryResp.json();
      return {
        summaryText: String(summaryJson?.extract || ""),
        thumb: String(summaryJson?.thumbnail?.source || ""),
        lat: Number(summaryJson?.coordinates?.lat),
        lon: Number(summaryJson?.coordinates?.lon),
      };
    } catch (_e) {
      return { summaryText: "", thumb: "", lat: NaN, lon: NaN };
    }
  })();

  /** Ne pas utiliser les titres d’articles Wikipédia comme « lieux » : la recherche renvoie souvent films, homonymes, pages sans lien (ex. New York → titres français). Les pastilles viennent de Gemini. */
  const wikiPlaceTitlesP = Promise.resolve([]);

  const nominatimP = (async () => {
    try {
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=fr&q=${encodeURIComponent(
          safeCity
        )}`
      );
      if (!geoResp.ok) return { lat: NaN, lon: NaN, country: "", countryCode: "", region: "" };
      const geoJson = await geoResp.json();
      const first = Array.isArray(geoJson) && geoJson.length > 0 ? geoJson[0] : null;
      const addr = first?.address && typeof first.address === "object" ? first.address : {};
      const region = String(
        addr.state || addr.region || addr.county || addr.state_district || ""
      ).trim();
      return {
        lat: Number(first?.lat),
        lon: Number(first?.lon),
        country: String(addr.country || "").trim(),
        countryCode: String(addr.country_code || "").trim(),
        region,
      };
    } catch (_e) {
      return { lat: NaN, lon: NaN, country: "", countryCode: "", region: "" };
    }
  })();

  const cachedImageP = getCachedCityImage(safeCity);
  const wikiHeroUrlsP = fetchWikipediaHeroImageUrls(safeCity);

  const [summaryPack, places, geoPack, cachedCityImage, wikiHeroUrls] = await Promise.all([
    wikiSummaryP,
    wikiPlaceTitlesP,
    nominatimP,
    cachedImageP,
    wikiHeroUrlsP,
  ]);

  let latitude = summaryPack.lat;
  let longitude = summaryPack.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    if (Number.isFinite(geoPack.lat) && Number.isFinite(geoPack.lon)) {
      latitude = geoPack.lat;
      longitude = geoPack.lon;
    }
  }

  const summaryText = summaryPack.summaryText;
  const bundledUrl = getBundledCityHeroPath(safeCity);
  const storageMirrorUrl = getStorageMirrorHeroUrl(safeCity);
  const commonsCandidates = getCityHeroImageCandidates(safeCity);
  const commonsFirst =
    commonsCandidates.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || commonsCandidates[0] || "";
  const wikiThumbRaw = String(summaryPack.thumb || "").trim();
  const wikiThumbUsable = !!(wikiThumbRaw && !isLikelyWikiFlagOrSealThumb(wikiThumbRaw));
  const cachedUsable = !!(cachedCityImage && !isLikelyWikiFlagOrSealThumb(cachedCityImage));

  const wikiApiOrdered = wikiHeroUrls.filter((u) => u && !isLikelyWikiFlagOrSealThumb(u));
  const wikiApiPrimary = wikiApiOrdered[0] || wikiHeroUrls[0] || "";

  /** Ordre : 1) bundle local 2) miroir Storage 3) Wikipédia (API + résumé) 4) Commons figés 5) cache. */
  let imageUrl =
    bundledUrl ||
    storageMirrorUrl ||
    wikiApiPrimary ||
    (wikiThumbUsable ? wikiThumbRaw : "") ||
    commonsFirst ||
    "";
  let landscapeImageUrl = imageUrl;

  if (!imageUrl && cachedUsable) {
    landscapeImageUrl = cachedCityImage;
    imageUrl = cachedCityImage;
  }

  if (imageUrl) {
    const prev = String(cachedCityImage || "").trim();
    if (prev !== String(imageUrl).trim()) {
      try {
        await persistCityImage(safeCity, imageUrl);
      } catch (_e) {
        // ignore persistence errors
      }
    }
  }

  const heroImageCandidates = dedupeImageUrlChain([
    bundledUrl,
    storageMirrorUrl,
    ...commonsCandidates,
    ...wikiHeroUrls,
    ...(wikiThumbUsable ? [wikiThumbRaw] : []),
    ...(cachedUsable ? [cachedCityImage] : []),
  ]);

  const tips = buildTravelTips(safeCity);
  const suggestedActivities = buildSuggestedActivitiesForCity(safeCity);

  const displayCountry = String(geoPack.country || "").trim();
  const displayRegion = String(geoPack.region || "").trim();
  const countryCodeNorm = String(geoPack.countryCode || "")
    .trim()
    .toLowerCase();
  let situationMap = null;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    let countryMap = null;
    if (displayCountry) {
      countryMap = await fetchCountryMapData(displayCountry, countryCodeNorm);
    }
    let bbox = null;
    if (countryMap?.bbox) {
      bbox = expandBoundingBox(countryMap.bbox);
      bbox = unionBboxWithPoint(bbox, latitude, longitude);
    } else {
      bbox = bboxAroundPoint(latitude, longitude);
    }
    const latN = Number(latitude);
    const lonN = Number(longitude);
    situationMap = {
      miniMap: {
        geojson: countryMap?.geojson || null,
        viewBbox: bbox,
      },
      openMapUrl: `https://www.openstreetmap.org/?mlat=${latN}&mlon=${lonN}#map=7/${latN}/${lonN}`,
    };
  }

  return {
    city: safeCity,
    description:
      summaryText ||
      `${safeCity} est une destination populaire avec une forte identite culturelle, de nombreux quartiers a explorer et une scene locale dynamique.`,
    places:
      places.length > 0
        ? places
        : getIconicPlacesFallback(safeCity) ||
          buildExplorationPlacesFallback(safeCity) ||
          [],
    suggestedActivities,
    tips,
    imageUrl,
    landscapeImageUrl,
    heroImageCandidates,
    coordinates:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { lat: latitude, lon: longitude }
        : null,
    country: displayCountry || null,
    adminRegion: displayRegion || null,
    situationMap,
  };
}

function normalizeGeminiGuidePayload(data, destinationHint = "") {
  if (!data || typeof data !== "object") return null;
  const rawPlaces = Array.isArray(data.places)
    ? data.places.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const places = sanitizeMustSeePlaces(rawPlaces, destinationHint);
  const fromActs = Array.isArray(data.suggestedActivities)
    ? data.suggestedActivities
    : Array.isArray(data.activities)
      ? data.activities
      : [];
  const suggestedActivities = fromActs.map((x) => String(x || "").trim()).filter(Boolean);
  const tipsRaw = data.tips && typeof data.tips === "object" ? data.tips : {};
  const tipsDo = Array.isArray(tipsRaw.do)
    ? tipsRaw.do.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const tipsDont = Array.isArray(tipsRaw.dont)
    ? tipsRaw.dont.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  return {
    summary: String(data.summary || "").trim(),
    places,
    tips: { do: tipsDo, dont: tipsDont },
    suggestedActivities,
  };
}

function mergeDestinationGuideWithGemini(baseGuide, geminiNorm) {
  if (!baseGuide) return null;
  const city = String(baseGuide.city || "");
  if (!geminiNorm) {
    return {
      ...baseGuide,
      places: clampPlacesList(baseGuide.places, city),
    };
  }
  const mergedPlaces =
    geminiNorm.places.length > 0 ? geminiNorm.places : baseGuide.places;
  return {
    ...baseGuide,
    description: geminiNorm.summary || baseGuide.description,
    places: clampPlacesList(mergedPlaces, city),
    tips: {
      do: geminiNorm.tips.do.length > 0 ? geminiNorm.tips.do : baseGuide.tips?.do || [],
      dont: geminiNorm.tips.dont.length > 0 ? geminiNorm.tips.dont : baseGuide.tips?.dont || [],
    },
    suggestedActivities:
      geminiNorm.suggestedActivities.length > 0
        ? geminiNorm.suggestedActivities
        : baseGuide.suggestedActivities,
  };
}

function countInclusiveTripDaysClient(startYmd, endYmd) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(startYmd)) || !re.test(String(endYmd)))
    return { ok: false, days: 0, error: "Utilise le format AAAA-MM-JJ." };
  const t0 = Date.parse(`${startYmd}T12:00:00`);
  const t1 = Date.parse(`${endYmd}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return { ok: false, days: 0, error: "Dates invalides." };
  let a = t0;
  let b = t1;
  if (b < a) [a, b] = [b, a];
  const days = Math.round((b - a) / 86400000) + 1;
  if (days > 14) return { ok: false, days: 0, error: "Maximum 14 jours." };
  return { ok: true, days, error: "" };
}

/** Jours AAAA-MM-JJ inclus entre début et fin du voyage. */
function listTripDatesInclusive(startYmd, endYmd) {
  const a = toYMD(startYmd, "");
  const b = toYMD(endYmd, "");
  if (!a || !b) return [];
  let t0 = Date.parse(`${a}T12:00:00`);
  let t1 = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return [];
  if (t1 < t0) [t0, t1] = [t1, t0];
  const out = [];
  const d = new Date(t0);
  while (d.getTime() <= t1) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Répartit N activités sur les jours du voyage (tour à tour). */
function assignActivityDatesRoundRobin(startYmd, endYmd, count) {
  const days = listTripDatesInclusive(startYmd, endYmd);
  const fallback = toYMD(startYmd, getTodayStr());
  if (!days.length) return Array.from({ length: count }, () => fallback);
  return Array.from({ length: count }, (_, i) => days[i % days.length]);
}

function seededPicsumUrl(seedText, width = 240, height = 160) {
  const seed = encodeURIComponent(String(seedText || "activity").toLowerCase());
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

function getActivityImageUrl(activity) {
  const saved = String(activity?.photo_url || activity?.image_url || "").trim();
  if (saved) return saved;
  const prompt = buildActivityImageQuery(activity);
  // Deterministic fallback so each activity gets a consistent-but-different image.
  const seed = `${prompt}|${String(activity?.date || "")}|${String(activity?.time || "")}`;
  return seededPicsumUrl(seed, 240, 160);
}

async function fetchUnsplashImageByQuery(queryInput, options = {}) {
  const q = String(queryInput || "").trim();
  if (!q || !UNSPLASH_ACCESS_KEY) return "";
  const pickFirst = !!options.pickFirst;
  const preferredKeywords = Array.isArray(options.preferredKeywords)
    ? options.preferredKeywords.map((k) => normalizeTextForSearch(k))
    : [];
  const avoidKeywords = Array.isArray(options.avoidKeywords)
    ? options.avoidKeywords.map((k) => normalizeTextForSearch(k))
    : [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      q
    )}&orientation=landscape&per_page=30`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });
    if (!response.ok) return "";
    const json = await response.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    if (results.length === 0) return "";
    const scored = results.map((item, index) => {
      const desc = normalizeTextForSearch(
        `${item?.description || ""} ${item?.alt_description || ""} ${item?.user?.name || ""}`
      );
      const keywordBoost = preferredKeywords.reduce((acc, kw) => (kw && desc.includes(kw) ? acc + 18 : acc), 0);
      const avoidPenalty = avoidKeywords.reduce((acc, kw) => (kw && desc.includes(kw) ? acc + 22 : acc), 0);
      const likes = Number(item?.likes || 0);
      const qualityBoost = Math.min(24, Math.round(likes / 20));
      const firstBias = pickFirst ? Math.max(0, 20 - index) : 0;
      const score = keywordBoost + qualityBoost + firstBias - avoidPenalty;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const picked = scored[0]?.item || results[0];
    return String(picked?.urls?.regular || picked?.urls?.full || "");
  } catch (_e) {
    return "";
  }
}

async function fetchActivityImageFromUnsplash(activityLike) {
  const query = buildActivityImageQuery(activityLike);
  if (!query) return "";
  return fetchUnsplashImageByQuery(`${query} travel activity`, {
    pickFirst: true,
    preferredKeywords: ["activity", "person", "travel", "outdoor", "sport"],
    avoidKeywords: ["logo", "icon", "drawing", "illustration"],
  });
}

function normalizeTrip(trip) {
  const normalizedTitle = formatCityName(trip?.title || trip?.destination || trip?.name || "Voyage");
  const invites = Array.isArray(trip?.invited_emails) ? trip.invited_emails : [];
  return {
    ...trip,
    title: String(normalizedTitle || "Voyage"),
    start_date: toYMD(trip?.start_date, getTodayStr()),
    end_date: toYMD(trip?.end_date, getTodayStr()),
    participants: canonicalParticipants(trip?.participants, invites),
    invited_emails: invites,
    fixed_url: String(trip?.fixed_url || ""),
  };
}

/** Évite les doublons si la liste brute contient deux fois le même id (course requêtes / état). */
function dedupeTripsById(trips) {
  const seen = new Set();
  const out = [];
  for (const t of trips || []) {
    const id = String(t?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(t);
  }
  return out;
}

function formatCityName(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!raw) return "";
  return raw
    .toLocaleLowerCase("fr-FR")
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((seg) => (seg ? seg.charAt(0).toLocaleUpperCase("fr-FR") + seg.slice(1) : seg))
        .join("-")
    )
    .join(" ");
}

/** HH:MM pour champs activité (select ou saisie). */
function normalizeActivityTimeHHMM(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  let min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return "";
  h = Math.min(23, Math.max(0, h));
  min = Math.min(59, Math.max(0, min));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeActivity(activity) {
  const rawTime = String(activity?.time || "");
  const time = rawTime.length >= 5 ? rawTime.slice(0, 5) : rawTime;
  const rawDate =
    activity?.date ??
    activity?.date_key ??
    activity?.scheduled_date ??
    activity?.activity_date ??
    activity?.day;
  const normalizedDate = toYMDLoose(rawDate);
  const cachedDescription = getCachedActivityDescription(activity?.id);
  return {
    ...activity,
    date: normalizedDate,
    date_key: normalizedDate,
    time,
    title: String(activity?.title || activity?.name || "Activite"),
    name: String(activity?.name || activity?.title || "Activite"),
    description: String(activity?.description || activity?.details || activity?.notes || cachedDescription || ""),
  };
}

function userCanSeeTrip(trip, session) {
  const userId = String(session?.user?.id || "");
  const userEmail = String(session?.user?.email || "").toLowerCase().trim();
  const hasOwnerField = Object.prototype.hasOwnProperty.call(trip || {}, "owner_id");
  const hasInvitedField = Object.prototype.hasOwnProperty.call(trip || {}, "invited_emails");
  const ownerId = String(trip?.owner_id || "").trim();
  const invited = Array.isArray(trip?.invited_emails)
    ? trip.invited_emails.map((m) => String(m || "").toLowerCase().trim())
    : [];

  // Schéma sans colonnes owner / invités : ancien mode single-tenant (tout afficher).
  if (!hasOwnerField && !hasInvitedField) return true;

  if (!userId && !userEmail) return false;

  if (ownerId && ownerId === userId) return true;
  if (userEmail && invited.includes(userEmail)) return true;

  // Ligne avec owner_id vide et sans invitation : données démo, autre compte, ou migration incomplète — ne pas mélanger les utilisateurs.
  if (hasOwnerField && !ownerId) return false;

  return false;
}

function visibleTripsForSession(rawTrips, session) {
  const normalized = (rawTrips || []).map(normalizeTrip);
  const visible = normalized.filter((trip) => userCanSeeTrip(trip, session));
  return dedupeTripsById(visible);
}

function toYMD(value, fallback) {
  const s = String(value || "");
  if (!s) return String(fallback || getTodayStr());
  // If it already looks like YYYY-MM-DD (or starts with it), keep it as-is
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** AAAA-MM-JJ depuis l'API ; "" si absent. Aligné sur le calendrier local (même logique que les cases du planning). */
function toYMDLoose(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  // Date seule — ne pas utiliser `Date` (sinon "YYYY-MM-DD" = minuit UTC et jour local faux hors UTC).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Timestamptz / ISO avec heure : le préfixe AAAA-MM-JJ est souvent en UTC → on prend le jour LOCAL.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

/** Évite qu'un refetch juste après insertion écrase les activités (latence lecture / temps réel). */
const ACTIVITY_INSERT_GRACE_MS = 90000;

function mergeActivitiesFromServer(prev, fetched, tripIds, graceRef) {
  const tripIdList = [...new Set((tripIds || []).map((id) => String(id)).filter(Boolean))];
  const tripIdSet = new Set(tripIdList);
  const prevOutside = (prev || []).filter((a) => !tripIdSet.has(String(a.trip_id)));
  const now = Date.now();
  const fetchedIds = new Set((fetched || []).map((a) => String(a.id)).filter(Boolean));
  const g = graceRef?.current;
  if (g && typeof g.forEach === "function") {
    g.forEach((_t, id) => {
      if (fetchedIds.has(id)) g.delete(id);
    });
  }
  const merged = [];
  for (const tid of tripIdList) {
    const serverRows = (fetched || []).filter((a) => String(a.trip_id) === tid);
    const serverIdSet = new Set(serverRows.map((a) => String(a.id)).filter(Boolean));
    const prevRows = (prev || []).filter((a) => String(a.trip_id) === tid);
    const lagRows = prevRows.filter((a) => {
      const id = String(a.id || "");
      if (!id || serverIdSet.has(id)) return false;
      const t0 = g?.get(id);
      return t0 != null && now - t0 < ACTIVITY_INSERT_GRACE_MS;
    });
    merged.push(...serverRows, ...lagRows);
  }
  return [...prevOutside, ...merged];
}

/** Sélection des activités d'un voyage ; replie sans `.order` si la colonne `date` n'existe pas côté Supabase. */
async function fetchActivitiesRowsForTrip(tripId) {
  const tid = String(tripId || "").trim();
  if (!tid) return [];
  const ordered = await supabase
    .from("activities")
    .select("*")
    .eq("trip_id", tid)
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (!ordered.error) return ordered.data || [];
  const plain = await supabase.from("activities").select("*").eq("trip_id", tid);
  return plain.data || [];
}

async function fileToAvatarDataUrl(file) {
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) throw new Error("Le fichier doit etre une image.");
  if (Number(file.size || 0) > 5 * 1024 * 1024) throw new Error("Image trop lourde (max 5 Mo).");

  const originalDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire l'image."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image invalide."));
    image.src = originalDataUrl;
  });

  const maxSize = 160;
  const ratio = Math.max(1, Math.max(img.width, img.height) / maxSize);
  const targetW = Math.max(1, Math.round(img.width / ratio));
  const targetH = Math.max(1, Math.round(img.height / ratio));
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return originalDataUrl;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const compressed = canvas.toDataURL("image/jpeg", 0.82);
  if (compressed.length > 220000) {
    // Last-resort fallback to stronger compression to stay metadata-friendly.
    return canvas.toDataURL("image/jpeg", 0.62);
  }
  return compressed;
}

function classifyTrips(list) {
  const now = [];
  const upcoming = [];
  const memories = [];
  const sortByChronology = (a, b) => {
    const aStart = toYMD(a?.start_date, "9999-12-31");
    const bStart = toYMD(b?.start_date, "9999-12-31");
    if (aStart !== bStart) return aStart.localeCompare(bStart);

    const aEnd = toYMD(a?.end_date, "9999-12-31");
    const bEnd = toYMD(b?.end_date, "9999-12-31");
    if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);

    return String(a?.title || "").localeCompare(String(b?.title || ""));
  };

  (list || []).forEach((trip) => {
    const start = toYMD(trip?.start_date, "");
    const end = toYMD(trip?.end_date, "");
    if (start && end && start <= TODAY_STR && end >= TODAY_STR) now.push(trip);
    else if (start && start > TODAY_STR) upcoming.push(trip);
    else memories.push(trip);
  });
  now.sort(sortByChronology);
  upcoming.sort(sortByChronology);
  memories.sort(sortByChronology);
  return { now, upcoming, memories };
}

async function resolveStableCityImageForCard(canonicalCity) {
  const c = String(canonicalCity || "").trim();
  if (!c) return "";
  const bundled = getBundledCityHeroPath(c);
  if (bundled) return bundled;
  const mirrored = getStorageMirrorHeroUrl(c);
  if (mirrored) return mirrored;
  if (UNSPLASH_ACCESS_KEY) {
    const u = await fetchUnsplashImageByQuery(`${c} city landmark skyline`, { pickFirst: true });
    if (u) return u;
  }
  const wikiUrls = await fetchWikipediaHeroImageUrls(c);
  const preferred = wikiUrls.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || wikiUrls[0] || "";
  if (preferred) return preferred;
  const thumb = await fetchFrenchWikiSummaryThumb(c);
  if (thumb && !isLikelyWikiFlagOrSealThumb(thumb)) return thumb;
  return (
    resolveCityHeroImageUrl(c) ||
    seededPicsumUrl(`${normalizeTextForSearch(c)}|card-resolve`, 1600, 1000)
  );
}

// Atomes UI
function CityImage({ title }) {
  const prompt = resolveCanonicalCity(extractCityPrompt(title));
  const safeTitle = String(prompt || title || "voyage");
  const cacheKey = getCityImageCacheKey(prompt || safeTitle);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [safeTitle, prompt]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const localStorageKey = `tp_city_img_${cacheKey}`;
      const fallbackCommons = buildCityImageUrl(safeTitle);

      if (!prompt) {
        if (!cancelled) setResolvedUrl("");
        return;
      }

      if (cityImageMemoryCache[cacheKey]) {
        if (!cancelled) setResolvedUrl(String(cityImageMemoryCache[cacheKey]));
        return;
      }

      try {
        const persisted = window.localStorage.getItem(localStorageKey);
        if (persisted) {
          cityImageMemoryCache[cacheKey] = persisted;
          if (!cancelled) setResolvedUrl(String(persisted));
          return;
        }
      } catch (_e) {
        // ignore localStorage errors
      }

      try {
        const { data, error } = await supabase
          .from("image_cache")
          .select("url")
          .eq("id", cacheKey)
          .limit(1);

        if (cancelled) return;
        if (!error && data && data.length > 0 && data[0]?.url) {
          const cachedUrl = String(data[0].url);
          cityImageMemoryCache[cacheKey] = cachedUrl;
          try {
            window.localStorage.setItem(localStorageKey, cachedUrl);
          } catch (_e) {
            // ignore localStorage errors
          }
          setResolvedUrl(cachedUrl);
          return;
        }

        const fromWiki = await resolveStableCityImageForCard(prompt);
        const url = fromWiki || fallbackCommons;
        cityImageMemoryCache[cacheKey] = url;
        try {
          window.localStorage.setItem(localStorageKey, url);
        } catch (_e) {
          // ignore localStorage errors
        }
        setResolvedUrl(url);

        try {
          const { error: insErr } = await supabase
            .from("image_cache")
            .upsert({ id: cacheKey, url }, { onConflict: "id" });
          void insErr;
        } catch (_e) {
          // Ignore cache write failures
        }
      } catch (_e) {
        if (!cancelled) setResolvedUrl(fallbackCommons);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTitle, prompt]);

  const primarySrc = resolvedUrl || buildCityImageUrl(safeTitle);
  const displaySrc = loadFailed
    ? seededPicsumUrl(`${cacheKey}|img-err`, 1200, 900)
    : primarySrc;

  return (
    <div className="h-full w-full overflow-hidden rounded-[3rem] bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300">
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={safeTitle}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => {
            if (!loadFailed) setLoadFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}

function TopNav({ onMenu, onAdd, title }) {
  return (
    <header className="sticky top-0 z-30 px-5 pt-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-[2.25rem] bg-white/90 px-6 py-4 shadow-[0_16px_44px_rgba(30,58,95,0.09)] backdrop-blur-xl ring-1 ring-sky-100/55">
        <button onClick={onMenu} className="rounded-full p-3 text-slate-700 hover:bg-slate-100">
          <Menu size={20} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-semibold tracking-[0.08em] text-slate-900">{String(title || "Mes Voyages")}</h1>
        </div>
        <button
          onClick={onAdd}
          className={`rounded-full p-3 text-white transition hover:opacity-90 ${GLASS_BUTTON_CLASS}`}
          style={GLASS_ACCENT_STYLE}
        >
          <Plus size={20} />
        </button>
      </div>
    </header>
  );
}

// Modales
function SideMenu({ open, onClose, userEmail, onOpenAccount, onSignOut, activeTab, onSwitchTab }) {
  return (
    <div className={`fixed inset-0 z-40 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div className={`absolute inset-0 bg-black/20 transition ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        className={`absolute left-0 top-0 h-full w-80 bg-white/80 p-6 shadow-2xl backdrop-blur-xl transition ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Menu</p>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 text-sm text-slate-700">
          <p className="text-xs text-slate-500">{String(userEmail || "")}</p>
          <div className="pt-2">
            <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">Navigation</p>
            <div className="space-y-2">
              {[
                { id: "trips", label: "Mes Voyages" },
                { id: "planner", label: "Calendrier" },
                { id: "destination", label: "Recherche" },
                { id: "budget", label: "Budget" },
                { id: "chat", label: "Chat" },
              ].map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSwitchTab(item.id)}
                    className={`w-full rounded-2xl px-3 py-2 text-left text-xs transition ${
                      active ? "text-white" : "border border-slate-200 bg-white hover:bg-slate-100"
                    }`}
                    style={active ? { backgroundColor: ACCENT } : undefined}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={onOpenAccount}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
          >
            Mon compte
          </button>
          <button
            onClick={onSignOut}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
          >
            Se deconnecter
          </button>
        </div>
      </aside>
    </div>
  );
}

function AuthView() {
  const [mode, setMode] = useState("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [invitePromptOpen, setInvitePromptOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTripName, setInviteTripName] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const invite = params.get("invite");
      const invitedEmail = String(params.get("email") || "").trim();
      const invitedTrip = String(params.get("trip") || "").trim();
      if (invite !== "1" || !invitedEmail) return;
      setInviteEmail(invitedEmail);
      setInviteTripName(invitedTrip);
      setMode("signup");
      setInvitePromptOpen(true);
    } catch (_e) {
      // ignore malformed URL params
    }
  }, []);

  const clearInviteParams = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      url.searchParams.delete("email");
      url.searchParams.delete("trip");
      window.history.replaceState({}, "", url.toString());
    } catch (_e) {
      // ignore history issues
    }
  };

  const submit = async () => {
    const safeEmail = String(email || "").trim();
    const safePassword = String(password || "");
    const safeFirstName = String(firstName || "").trim();
    const safeLastName = String(lastName || "").trim();
    if (!safeEmail || !safePassword) {
      setMsg("Email et mot de passe requis.");
      return;
    }
    if (mode === "signup" && (!safeFirstName || !safeLastName)) {
      setMsg("Nom et prenom requis pour creer le compte.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      if (mode === "signup") {
        let avatarUrl = "";
        if (profilePhotoFile) {
          avatarUrl = await fileToAvatarDataUrl(profilePhotoFile);
        }
        const { error } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            data: {
              first_name: safeFirstName,
              last_name: safeLastName,
              full_name: `${safeFirstName} ${safeLastName}`.trim(),
              avatar_url: avatarUrl || "",
            },
          },
        });
        if (error) throw error;
        setMsg("Compte cree. Verifie ton email puis connecte-toi.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: safeEmail,
          password: safePassword,
        });
        if (error) throw error;
      }
    } catch (e) {
      const raw = String(e?.message || "");
      if (raw.toLowerCase().includes("invalid login credentials")) {
        setMsg("Email ou mot de passe invalide.");
      } else {
        setMsg(raw || "Erreur authentification.");
      }
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const safeEmail = String(email || "").trim();
    if (!safeEmail) {
      setMsg("Entre ton email pour reinitialiser le mot de passe.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const redirectTo = `${window.location.origin}`;
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, { redirectTo });
      if (error) throw error;
      setMsg("Email de reinitialisation envoye. Verifie ta boite mail.");
    } catch (e) {
      setMsg(String(e?.message || "Erreur envoi email de reinitialisation."));
    } finally {
      setLoading(false);
    }
  };

  const completeInviteSignup = async () => {
    const safeFirst = String(inviteFirstName || "").trim();
    const safeLast = String(inviteLastName || "").trim();
    const safePassword = String(invitePassword || "");
    const safeInviteEmail = String(inviteEmail || "").trim();
    if (!safeInviteEmail || !safeFirst || !safeLast || !safePassword) {
      setMsg("Prenom, nom et mot de passe sont requis pour rejoindre ce voyage.");
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const { error } = await supabase.auth.signUp({
        email: safeInviteEmail,
        password: safePassword,
        options: {
          data: {
            first_name: safeFirst,
            last_name: safeLast,
            full_name: `${safeFirst} ${safeLast}`.trim(),
            invited_email: safeInviteEmail,
            invited_trip: String(inviteTripName || "").trim(),
          },
        },
      });
      if (error) throw error;

      setFirstName(safeFirst);
      setLastName(safeLast);
      setEmail(safeInviteEmail);
      setPassword("");
      setInvitePromptOpen(false);
      clearInviteParams();
      setMsg("Compte cree. Verifie ton email puis connecte-toi.");
    } catch (e) {
      setMsg(String(e?.message || "Impossible de creer le compte invitation."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8" style={{ background: BG, color: TEXT }}>
      <div className="mx-auto mt-10 w-full max-w-lg rounded-[4.5rem] bg-white/80 p-8 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50">
        <h1 className="mb-2 text-center text-xs uppercase tracking-[0.4em] text-slate-500">
          Travel Planner
        </h1>
        <p className="mb-6 text-center text-lg font-semibold">
          {mode === "signin" ? "Se connecter" : "S'inscrire"}
        </p>
        <div className="space-y-3">
          {mode === "signup" ? (
            <>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prenom"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Photo de profil (optionnel)</p>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                    {profilePhotoPreview ? (
                      <img src={profilePhotoPreview} alt="Apercu profil" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-slate-500">
                        <UserRound size={18} />
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setProfilePhotoFile(f);
                      if (!f) {
                        setProfilePhotoPreview("");
                        return;
                      }
                      try {
                        const preview = URL.createObjectURL(f);
                        setProfilePhotoPreview(preview);
                      } catch (_e) {
                        setProfilePhotoPreview("");
                      }
                    }}
                    className="w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>
              </div>
            </>
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            onClick={submit}
            disabled={loading}
            className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {loading ? "Chargement..." : mode === "signin" ? "Se connecter" : "Creer mon compte"}
          </button>
        </div>
        <button
          onClick={() =>
            setMode((m) => {
              if (invitePromptOpen) return "signup";
              const next = m === "signin" ? "signup" : "signin";
              if (next === "signin") {
                setFirstName("");
                setLastName("");
                setProfilePhotoFile(null);
                setProfilePhotoPreview("");
              }
              return next;
            })
          }
          className="mt-4 w-full text-sm text-slate-600 underline"
        >
          {invitePromptOpen
            ? "Invitation en cours - creation de compte requise"
            : mode === "signin"
            ? "Pas de compte ? Creer un compte"
            : "Deja un compte ? Se connecter"}
        </button>
        {mode === "signin" && !invitePromptOpen ? (
          <button
            onClick={forgotPassword}
            disabled={loading}
            className="mt-2 w-full text-sm text-slate-600 underline disabled:opacity-60"
          >
            Mot de passe oublie ?
          </button>
        ) : null}
        {msg ? (
          <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            {String(msg)}
          </div>
        ) : null}
      </div>
      {invitePromptOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[3rem] bg-white/95 p-6 shadow-2xl ring-1 ring-slate-200/70">
            <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">Invitation voyage</h3>
            <p className="mt-2 text-sm text-slate-700">
              {inviteTripName ? `Tu as ete invite(e) au voyage ${inviteTripName}.` : "Tu as ete invite(e) a un voyage."}
            </p>
            <p className="mt-1 text-xs text-slate-500">Email invite: {String(inviteEmail || "-")}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <input
                value={inviteFirstName}
                onChange={(e) => setInviteFirstName(e.target.value)}
                placeholder="Prenom"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                value={inviteLastName}
                onChange={(e) => setInviteLastName(e.target.value)}
                placeholder="Nom"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </div>
            <input
              type="password"
              value={invitePassword}
              onChange={(e) => setInvitePassword(e.target.value)}
              placeholder="Mot de passe"
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
            <div className="mt-4">
              <button
                onClick={completeInviteSignup}
                disabled={loading}
                className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                {loading ? "Creation..." : "Creer mon compte pour rejoindre le voyage"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TripFormModal({ open, onClose, onCreate }) {
  const today = getTodayStr();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [inviteInput, setInviteInput] = useState("");
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset form on each opening after previous creation/close.
    const now = getTodayStr();
    setTitle("");
    setStartDate(now);
    setEndDate(now);
    setInviteInput("");
    setInvitedEmails([]);
  }, [open]);

  if (!open) return null;
  const addInvites = () => {
    const parsed = parseEmails(inviteInput);
    if (!parsed.length) return;
    setInvitedEmails((prev) => [...new Set([...(prev || []), ...parsed])]);
    setInviteInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[3.5rem] bg-white/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Nouveau voyage</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Destination"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
            <div className="flex items-center justify-center">
              <div className="rounded-full bg-slate-100/90 p-2 text-slate-500 shadow-sm">
                <Plane size={14} className="animate-bounce" />
              </div>
            </div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInvites();
                }
              }}
              placeholder="Ajouter un e-mail invite (ex: ami@mail.com)"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
            <button
              type="button"
              onClick={addInvites}
              className="rounded-2xl border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition hover:bg-slate-100"
              title="Ajouter aux invites"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
            <p className="text-xs text-slate-600">
              Personnes invitees: <span className="font-semibold text-slate-800">{invitedEmails.length}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Ajoute chaque e-mail avec le bouton + (ou touche Entree).
            </p>
            {invitedEmails.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {invitedEmails.map((mail) => (
                  <span
                    key={mail}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-700 ring-1 ring-slate-200"
                  >
                    {mail}
                    <button
                      type="button"
                      onClick={() => setInvitedEmails((prev) => (prev || []).filter((m) => String(m) !== String(mail)))}
                      className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100"
                      title="Retirer"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              if (submitting) return;
              setSubmitting(true);
              try {
                await onCreate({
                  title,
                  start_date: startDate,
                  end_date: endDate,
                  invited_emails: invitedEmails,
                });
              } finally {
                setSubmitting(false);
              }
            }}
            className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
            style={GLASS_ACCENT_STYLE}
          >
            {submitting ? "Creation…" : "Creer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteEmailsModal({ open, onClose, title, initialEmails, onSave }) {
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState([]);

  useEffect(() => {
    if (!open) return;
    setEmailInput("");
    setEmails(Array.isArray(initialEmails) ? [...new Set(initialEmails.map((m) => String(m || "").trim()).filter(Boolean))] : []);
  }, [open, initialEmails]);

  if (!open) return null;

  const addEmail = () => {
    const parsed = parseEmails(emailInput);
    const one = parsed[0];
    if (!one) return;
    setEmails((prev) => [...new Set([...(prev || []), one])]);
    setEmailInput("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[3rem] bg-white/95 p-6 shadow-2xl ring-1 ring-slate-200/70">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.32em] text-slate-500">{String(title || "Inviter des participants")}</h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="email@exemple.com"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            onClick={addEmail}
            className={`rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            Ajouter
          </button>
        </div>

        <div className="mt-4 flex min-h-12 flex-wrap gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
          {emails.length > 0 ? emails.map((mail) => (
            <span key={mail} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
              {String(mail)}
              <button
                onClick={() => setEmails((prev) => prev.filter((m) => String(m) !== String(mail)))}
                className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={12} />
              </button>
            </span>
          )) : <p className="text-xs text-slate-500">Aucun participant invite.</p>}
        </div>

        <button
          onClick={() => onSave(Array.isArray(emails) ? emails : [])}
          className={`mt-4 w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
          style={GLASS_ACCENT_STYLE}
        >
          Enregistrer les invitations
        </button>
      </div>
    </div>
  );
}

function EditTripModal({ open, onClose, trip, onSave }) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [fixedUrl, setFixedUrl] = useState("");
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  useEffect(() => {
    if (!trip) return;
    setTitle(String(trip?.title || ""));
    setStartDate(toYMD(trip?.start_date, getTodayStr()));
    setEndDate(toYMD(trip?.end_date, getTodayStr()));
    setFixedUrl(String(trip?.fixed_url || ""));
    setInvitedEmails(Array.isArray(trip?.invited_emails) ? trip.invited_emails : []);
  }, [trip]);

  if (!open || !trip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[3.5rem] bg-white/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Modifier voyage</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Destination"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </div>
          <input
            value={fixedUrl}
            onChange={(e) => setFixedUrl(e.target.value)}
            placeholder="Lien partage (optionnel)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm text-slate-700">
              Invites: <span className="font-semibold">{invitedEmails.length}</span>
            </p>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100"
              title="Inviter par email"
            >
              <Mail size={14} />
            </button>
          </div>
          <button
            onClick={() =>
              onSave({
                ...trip,
                title: String(title || "").trim(),
                start_date: startDate,
                end_date: endDate,
                fixed_url: String(fixedUrl || "").trim(),
                invited_emails: invitedEmails,
              })
            }
            className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            Enregistrer les modifications
          </button>
        </div>
      </div>
      <InviteEmailsModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Inviter des participants"
        initialEmails={invitedEmails}
        onSave={(emails) => {
          setInvitedEmails(Array.isArray(emails) ? emails : []);
          setInviteModalOpen(false);
        }}
      />
    </div>
  );
}

function ShareModal({ open, onClose, trip }) {
  const [copyState, setCopyState] = useState("");
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState("");
  if (!open || !trip) return null;

  const invitedEmails = Array.isArray(trip?.invited_emails) ? trip.invited_emails : [];
  const recap = `Voyage: ${String(trip?.title || "Voyage")}\nDates: ${formatDate(trip?.start_date)} - ${formatDate(
    trip?.end_date
  )}\nLien: ${String(trip.fixed_url || "Aucun lien")}\nInvites: ${
    invitedEmails.length > 0 ? invitedEmails.join(", ") : "Aucun"
  }`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recap);
      setCopyState("copied");
      return;
    } catch (_e) {
      // fallback below
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = recap;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyState(ok ? "copied" : "error");
    } catch (_err) {
      setCopyState("error");
    }
  };

  const sendInvitesByEmail = async () => {
    if (sending) return;
    if (invitedEmails.length === 0) {
      setSendState("Aucun email invite a envoyer.");
      return;
    }
    setSending(true);
    setSendState("");
    try {
      const resp = await fetch(getInviteApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: invitedEmails,
          invite_base_url: window.location.origin,
          trip: {
            title: String(trip?.title || "Voyage"),
            startDate: formatDate(trip?.start_date),
            endDate: formatDate(trip?.end_date),
            link: String(trip?.fixed_url || ""),
          },
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 404) {
        throw new Error("API mail introuvable. Configure VITE_INVITE_API_BASE_URL ou utilise vercel dev.");
      }
      if (!resp.ok) throw new Error(String(data?.error || "Erreur envoi invitation"));
      setSendState("Invitations envoyees avec succes.");
    } catch (e) {
      setSendState(String(e?.message || "Impossible d'envoyer les invitations."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[3.5rem] bg-white/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Partager</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <pre className="mb-4 whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">{recap}</pre>
        {invitedEmails.length > 0 ? (
          <div className="mb-3 space-y-2">
            {invitedEmails.map((mail) => {
              const subject = encodeURIComponent(`Invitation voyage: ${String(trip.title)}`);
              const body = encodeURIComponent(
                `Salut,\n\nJe t'invite a rejoindre mon voyage "${String(
                  trip.title
                )}" (${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}).\n\nLien: ${String(
                  trip.fixed_url || "Aucun lien"
                )}`
              );
              return (
                <a
                  key={mail}
                  href={`mailto:${encodeURIComponent(mail)}?subject=${subject}&body=${body}`}
                  className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700 hover:bg-slate-200"
                >
                  <Mail size={14} />
                  {String(mail)}
                </a>
              );
            })}
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={copy}
            className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={
              copyState === "copied"
                ? { background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }
                : GLASS_ACCENT_STYLE
            }
          >
            {copyState === "copied"
              ? "Copie"
              : copyState === "error"
                ? "Copie impossible"
                : "Copier recap"}
          </button>
          <button
            onClick={sendInvitesByEmail}
            disabled={sending}
            className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {sending ? "Envoi en cours..." : "Envoyer invitations"}
          </button>
        </div>
        {sendState ? (
          <p className={`mt-3 text-sm ${sendState.includes("succes") ? "text-emerald-700" : "text-rose-700"}`}>
            {sendState}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TricountModal({ open, onClose, trip, onSave }) {
  const [name, setName] = useState("");
  const [list, setList] = useState(["Moi"]);
  useEffect(() => {
    if (trip) {
      const participants = Array.isArray(trip.participants) && trip.participants.length > 0 ? trip.participants : ["Moi"];
      setList(participants);
    }
  }, [trip]);

  if (!open || !trip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[3.5rem] bg-white/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Participants</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ajouter un email participant"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            onClick={() => {
              const v = String(name || "").trim();
              if (!v) return;
              setList((prev) => [...prev, v]);
              setName("");
            }}
            className={`rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {list && list.length > 0
            ? list.map((p, idx) => (
                <div key={`${String(p)}-${idx}`} className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
                  <span>{String(p)}</span>
                  <button onClick={() => setList((prev) => prev.filter((_, i) => i !== idx))} className="rounded-full p-1 hover:bg-slate-200">
                    <X size={16} />
                  </button>
                </div>
              ))
            : null}
        </div>
        <button
          onClick={() => onSave(list.length > 0 ? list : ["Moi"])}
          className={`mt-4 w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
          style={GLASS_ACCENT_STYLE}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ open, trip, onCancel, onConfirm, deleting }) {
  if (!open || !trip) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
        <h2 className="mb-2 text-xs uppercase tracking-[0.4em] text-slate-500">Confirmation</h2>
        <p className="mb-6 text-sm text-slate-700">
          Supprimer le voyage <span className="font-semibold">{String(trip?.title || "Voyage")}</span> ?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-2xl px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "#e11d48" }}
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountModal({
  open,
  onClose,
  session,
  onDeleteAccount,
  onUpdateProfile,
  deleting,
  saving,
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setFirstName(String(session?.user?.user_metadata?.first_name || ""));
    setLastName(String(session?.user?.user_metadata?.last_name || ""));
    setEmail(String(session?.user?.email || ""));
    setPassword("");
  }, [open, session]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Mon compte</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prenom"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Adresse mail"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nouveau mot de passe (optionnel)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            onClick={() =>
              onUpdateProfile({
                first_name: String(firstName || "").trim(),
                last_name: String(lastName || "").trim(),
                email: String(email || "").trim(),
                password: String(password || ""),
              })
            }
            disabled={saving}
            className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {saving ? "Enregistrement..." : "Enregistrer les informations"}
          </button>
        </div>
        <button
          onClick={onDeleteAccount}
          disabled={deleting}
          className="mt-5 w-full rounded-2xl px-4 py-3 text-sm text-white disabled:opacity-60"
          style={{ backgroundColor: "#e11d48" }}
        >
          {deleting ? "Suppression..." : "Supprimer mon compte"}
        </button>
      </div>
    </div>
  );
}

// Vues de listes
function TripCard({ trip, onOpen, onShare, onEdit, onDelete, isNow, muted }) {
  return (
    <article
      className={`group ${muted ? "opacity-60 grayscale-[0.4]" : ""}`}
    >
      <div className="relative aspect-square w-full min-w-0 overflow-hidden rounded-[3rem] shadow-2xl ring-1 ring-slate-200/40">
        <button onClick={() => onOpen(trip)} className="block h-full w-full text-left">
          <div className="h-full w-full overflow-hidden rounded-[3rem] [&_img]:transition-transform [&_img]:duration-500 [&_img]:ease-out group-hover:[&_img]:scale-[1.04]">
            <CityImage title={trip.title} />
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-[3rem] bg-gradient-to-t from-black/58 via-black/14 to-transparent" />
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 text-white">
            <div className="flex w-full flex-col items-start">
              <div className="inline-flex max-w-full items-center rounded-2xl border border-white/35 bg-black/28 px-2.5 py-1 backdrop-blur-md">
              <h3 className="truncate text-[clamp(0.95rem,1.45vw,1.35rem)] font-semibold uppercase leading-[1.02] tracking-[0.01em] text-white">
                {String(trip.title)}
              </h3>
              </div>
              <p className="mt-1 w-full truncate pl-2.5 text-left text-[clamp(0.56rem,0.78vw,0.68rem)] font-medium tracking-[0.04em] text-white/95">
                {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
              </p>
            </div>
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShare(trip);
          }}
          className={`absolute left-5 rounded-full bg-white/88 p-2 text-slate-700 shadow-md backdrop-blur hover:bg-white ${
            "top-5"
          }`}
          title="Partager"
        >
          <Share2 size={14} />
        </button>
        {(onEdit || onDelete) ? (
          <div className="absolute right-5 top-5 flex items-center gap-2">
            {onEdit ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(trip);
                }}
                className="rounded-full bg-white/88 p-2 text-slate-700 shadow-md backdrop-blur hover:bg-white"
                title="Modifier"
              >
                <Pencil size={14} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(trip);
                }}
                className="rounded-full bg-white/88 p-2 text-rose-700 shadow-md backdrop-blur hover:bg-white"
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CitySearchBox({
  value,
  onChange,
  onPick,
  onConfirm,
  placeholder,
  showSuggestions = true,
}) {
  const [focused, setFocused] = useState(false);
  /** `key` = requête normalisée à laquelle `list` correspond (ignore si différent du champ → liste locale seule, immédiat). */
  const [remotePack, setRemotePack] = useState(() => ({ key: "", list: [] }));
  const [suggestLoading, setSuggestLoading] = useState(false);
  const fallbackSuggestions = useMemo(() => getCitySuggestions(value), [value]);
  const remoteSuggestions = useMemo(() => {
    const qk = normalizeTextForSearch(normalizeCityInput(value));
    if (!qk || remotePack.key !== qk) return [];
    return remotePack.list;
  }, [value, remotePack]);
  const suggestions = useMemo(
    () => mergeCitySuggestionLists(fallbackSuggestions, remoteSuggestions, 10),
    [fallbackSuggestions, remoteSuggestions]
  );
  const show = showSuggestions && focused && suggestions.length > 0;
  const dropdownReserve = show ? Math.min(suggestions.length, 6) * 42 + 16 : 0;

  useEffect(() => {
    const q = normalizeCityInput(value);
    if (!showSuggestions || q.length < 2) {
      setRemotePack({ key: "", list: [] });
      setSuggestLoading(false);
      return;
    }

    const key = normalizeTextForSearch(q);
    let cancelled = false;
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const remote = await fetchWorldwideCitySuggestions(q, 8);
        if (!cancelled) setRemotePack({ key, list: remote });
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, showSuggestions]);

  return (
    <div className="relative" style={dropdownReserve ? { marginBottom: dropdownReserve } : undefined}>
      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100/70 shadow-[0_2px_12px_rgba(30,58,95,0.04)]">
        <Search size={16} className="text-sky-400/80" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !onConfirm) return;
            const q = normalizeCityInput(value);
            if (q.length < 2) return;
            e.preventDefault();
            onConfirm(value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      {show ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-64 overflow-auto rounded-2xl bg-white/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl ring-1 ring-slate-200/80">
          {suggestLoading && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Recherche des villes...</p>
          ) : null}
          {suggestions.map((city) => (
            <button
              key={city}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(city);
                setFocused(false);
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
            >
              {city}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Mini-carte en overlay sur la photo : fond verre (même langage que les cartes de l’app), eau/pays + point. */
function DestinationMiniMapOverlay({ city, country, adminRegion, situationMap, coordinates }) {
  const uid = useId().replace(/:/g, "");
  const pinGradId = `wm-p-${uid}`;
  const landDropId = `wm-ld-${uid}`;

  const mini = situationMap?.miniMap;
  const bbox = mini?.viewBbox;
  const lat = Number(coordinates?.lat);
  const lon = Number(coordinates?.lon);
  if (!bbox || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const geojson = mini?.geojson;
  const { svgW, svgH, outlineD, mx, my } = useMemo(() => {
    const b = framingBboxForMiniMap(geojson, lat, lon, bbox);
    const lonSpan = Math.max(Number(b.east) - Number(b.west), 0.0001);
    const latSpan = Math.max(Number(b.north) - Number(b.south), 0.0001);
    const aspect = lonSpan / latSpan;
    const svgHVal = 100;
    const svgWVal = Math.min(120, Math.max(70, Math.round(svgHVal * aspect)));
    const d = geojson ? geoJsonOutlineToPathD(geojson, b, svgWVal, svgHVal) : "";
    const [x, y] = projectLonLatToSvg(lon, lat, b, svgWVal, svgHVal);
    const mxC = Math.max(6, Math.min(svgWVal - 6, x));
    const myC = Math.max(6, Math.min(svgHVal - 6, y));
    return { svgW: svgWVal, svgH: svgHVal, outlineD: d, mx: mxC, my: myC };
  }, [bbox, geojson, lat, lon]);

  const ariaLabel = [city, adminRegion, country].filter(Boolean).join(", ") || String(city);
  const pinR = 4.75;

  const landPath = outlineD ? (
    <path
      d={outlineD}
      fill="#ffffff"
      fillRule="evenodd"
      stroke="rgba(255,255,255,0.55)"
      strokeWidth={0.75}
      strokeLinejoin="round"
      filter={`url(#${landDropId})`}
    />
  ) : (
    <rect
      x={svgW * 0.04}
      y={svgH * 0.06}
      width={svgW * 0.92}
      height={svgH * 0.88}
      rx={svgW * 0.06}
      fill="#ffffff"
      stroke="rgba(255,255,255,0.5)"
      strokeWidth={0.75}
      filter={`url(#${landDropId})`}
    />
  );

  return (
    <figure
      className="pointer-events-none absolute right-3 top-1/2 z-10 flex h-[7.1rem] w-[6.1rem] -translate-y-1/2 items-center justify-center overflow-hidden rounded-[1.35rem] border border-white/28 bg-white/[0.055] shadow-[0_6px_22px_rgba(15,23,42,0.11),inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-xl backdrop-saturate-[1.25] sm:right-4 sm:h-[8rem] sm:w-[6.9rem]"
      aria-label={ariaLabel}
    >
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="block h-[96%] w-[96%] max-h-[100%] max-w-[100%]"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <radialGradient id={pinGradId} cx="32%" cy="28%" r="78%">
            <stop offset="0%" stopColor="#ff8a80" />
            <stop offset="45%" stopColor="#e53935" />
            <stop offset="100%" stopColor="#b71c1c" />
          </radialGradient>
          <filter id={landDropId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.14" />
          </filter>
        </defs>
        {landPath}
        <circle cx={mx} cy={my} r={pinR} fill={`url(#${pinGradId})`} stroke="white" strokeWidth={1.65} />
        <circle cx={mx} cy={my} r={pinR * 0.4} fill="rgba(255,255,255,0.32)" />
      </svg>
    </figure>
  );
}

// Vues principales
function HomeView({ trips, query, onQuery, onPickDestination, onOpenTrip, onShareTrip, greetingName }) {
  const today = getTodayStr();
  const filtered = (trips || []).filter((t) =>
    String(t.title || "")
      .toLowerCase()
      .includes(String(query || "").toLowerCase())
  );
  const sections = classifyTrips(filtered);
  const now = sections.now;
  const upcoming = sections.upcoming;

  return (
    <section className="space-y-8">
      <div className="rounded-[2.2rem] bg-white/92 px-6 py-5 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Accueil</p>
        <h2 className="text-3xl font-semibold text-slate-900">
          Bonjour {String(greetingName || "Voyageur")} <span className="inline-block">👋</span>
        </h2>
      </div>

      <div className="rounded-[2.2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
        <CitySearchBox
          value={query}
          onChange={onQuery}
          onPick={onPickDestination}
          placeholder="Rechercher une destination..."
          showSuggestions
        />
      </div>

      <div>
        <h2 className="mb-4 text-xs uppercase tracking-[0.4em] text-slate-500">Maintenant</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {now && now.length > 0
            ? now.map((trip) => (
                <TripCard
                  key={String(trip.id)}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onShare={onShareTrip}
                  isNow
                  muted={false}
                />
              ))
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">Aucun voyage en cours.</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xs uppercase tracking-[0.4em] text-slate-500">Prochainement</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {upcoming && upcoming.length > 0
            ? upcoming.map((trip) => (
                <TripCard
                  key={String(trip.id)}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onShare={onShareTrip}
                  isNow={false}
                  muted={false}
                />
              ))
            : <p className="text-sm text-slate-500">Aucun voyage planifie.</p>}
        </div>
      </div>
    </section>
  );
}

/** Affichage lisible des erreurs Gemini (429 / quota vs autres). */
function getGeminiErrorUi(raw) {
  const full = String(raw || "").trim();
  const quota = /429|Too Many Requests|quota exceeded|Quota exceeded|exceeded your current quota/i.test(full);
  const modelMatch = full.match(/models\/([^/:]+)/i);
  const modelName = modelMatch ? modelMatch[1] : "";
  if (quota) {
    return {
      quota: true,
      title: "Quota Gemini atteint",
      subtitle: "Ce n’est pas un bug de l’app : Google limite les requêtes (gratuit ou par minute).",
      bullets: [
        modelName ? `Modèle actuel : ${modelName}.` : null,
        "Attends 1 à 2 minutes puis recharge la page, ou change de modèle dans .env.local : GEMINI_MODEL=gemini-2.5-flash-lite (ou gemini-2.5-flash).",
        "Si tu utilises souvent l’IA : facturation / forfait sur Google AI Studio ou Cloud.",
      ].filter(Boolean),
      technical: full,
    };
  }
  return {
    quota: false,
    title: "Suggestions IA indisponibles",
    subtitle: "Affichage des infos Wikipédia ou par défaut.",
    bullets: [],
    technical: full.length > 280 ? `${full.slice(0, 280)}…` : full,
  };
}

/** Message court pour le programme (hors mode dev). */
function userFacingItineraryErrorMessage(raw) {
  const s = String(raw || "");
  if (/403|premium|réservée/i.test(s)) {
    return "Cette fonction n’est pas disponible avec ton compte.";
  }
  if (/429|quota|Too Many Requests|503|502|GEMINI_API_KEY|fetch/i.test(s)) {
    return "Génération indisponible pour le moment. Réessaie plus tard.";
  }
  return "Impossible de générer le programme. Réessaie plus tard.";
}

/** Message court pour le guide destination (hors mode dev). */
function userFacingGeminiGuideError() {
  return "Les suggestions personnalisées ne sont pas disponibles pour le moment. Tu vois tout de même un guide général pour cette destination.";
}

/** Heures proposées dans le modal « Ajouter le voyage » (planning par activité). */
const TRIP_SCHEDULE_TIME_OPTIONS = [
  "09:00",
  "10:00",
  "11:30",
  "13:00",
  "14:30",
  "16:00",
  "18:00",
  "19:30",
  "21:00",
];

/** Repli si l’image ne charge pas : uniquement URLs des 3 couches (pas de photo « générique »). */
function pickNextDestinationGuideImgSrc(el, guide) {
  const city = String(guide?.city || "").trim();
  const tried = new Set(String(el.getAttribute("data-img-tried") || "").split("\x1e").filter(Boolean));
  const cur = String(el.src || "").trim();
  if (cur) tried.add(cur);
  const fromGuide = Array.isArray(guide?.heroImageCandidates) ? guide.heroImageCandidates : [];
  const chain = dedupeImageUrlChain([
    ...fromGuide,
    getBundledCityHeroPath(city),
    getStorageMirrorHeroUrl(city),
    ...getCityHeroImageCandidates(city),
    guide?.landscapeImageUrl,
    guide?.imageUrl,
  ]);
  const next = chain.find((u) => u && !tried.has(u));
  if (next) {
    tried.add(next);
    el.setAttribute("data-img-tried", [...tried].join("\x1e"));
    return next;
  }
  return "";
}

function DestinationGuideView({
  searchInput,
  onSearchInputChange,
  confirmedDestination,
  onConfirmDestination,
  onCreateTrip,
  onBack,
}) {
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [guide, setGuide] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  /** Indices des activités proposées cochées pour le voyage (évite les doublons de libellé). */
  const [pickedActivityIndices, setPickedActivityIndices] = useState(() => new Set());
  /** Par indice d'activité : { date?: 'YYYY-MM-DD', time?: 'HH:MM' } (optionnel ; défaut = répartition sur le séjour). */
  const [activitySchedule, setActivitySchedule] = useState(() => ({}));
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [geminiContent, setGeminiContent] = useState(null);
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [programEndDate, setProgramEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState("");
  const [generatedDayIdeas, setGeneratedDayIdeas] = useState(null);
  const [creatingVoyage, setCreatingVoyage] = useState(false);

  const displayGuide = useMemo(
    () => mergeDestinationGuideWithGemini(guide, geminiContent),
    [guide, geminiContent]
  );

  const tripDatesForModal = useMemo(() => listTripDatesInclusive(startDate, endDate), [startDate, endDate]);

  const sortedPickedIndices = useMemo(
    () => [...pickedActivityIndices].sort((a, b) => a - b),
    [pickedActivityIndices]
  );

  useEffect(() => {
    setGeminiContent(null);
    setGeminiError("");
    setGeneratedDayIdeas(null);
    setItineraryError("");
    setItineraryModalOpen(false);
    const y = new Date().toISOString().slice(0, 10);
    setProgramStartDate(y);
    setProgramEndDate(y);
  }, [confirmedDestination]);

  const addModalWasOpenRef = useRef(false);
  /** Libellés figés au moment du cochet (si la liste Gemini change avant « Créer », on garde le bon titre). */
  const pickedActivityLabelsRef = useRef(new Map());
  useEffect(() => {
    if (addModalOpen) {
      if (!addModalWasOpenRef.current && displayGuide) {
        setPickedActivityIndices(new Set());
        setActivitySchedule({});
        pickedActivityLabelsRef.current = new Map();
      }
      addModalWasOpenRef.current = true;
    } else {
      addModalWasOpenRef.current = false;
    }
  }, [addModalOpen, displayGuide]);

  useEffect(() => {
    const cityStem = extractCityPrompt(confirmedDestination) || normalizeCityInput(confirmedDestination);
    if (cityStem.length < 2) {
      setGuide(null);
      setGuideError("");
      setGuideLoading(false);
      return;
    }

    const instant = buildInstantDestinationGuide(confirmedDestination);
    if (instant) {
      setGuide(instant);
      setGuideError("");
      setGuideLoading(false);
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await fetchDestinationGuide(confirmedDestination);
        if (!cancelled && result) setGuide(result);
      } catch (_e) {
        if (!cancelled && !instant) {
          setGuide(null);
          setGuideError("Impossible de charger le guide destination.");
        }
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [confirmedDestination]);

  useEffect(() => {
    const dest = String(
      extractCityPrompt(confirmedDestination) || normalizeCityInput(confirmedDestination) || ""
    ).trim();
    if (dest.length < 2) return undefined;
    let cancelled = false;
    setGeminiLoading(true);
    setGeminiError("");
    setGeminiContent(null);
    fetchGeminiTripSuggestions({ destination: dest })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.data) {
          const norm = normalizeGeminiGuidePayload(res.data, dest);
          setGeminiContent(norm);
          setGeminiError("");
        } else {
          setGeminiError("Réponse vide du serveur.");
        }
      })
      .catch((e) => {
        if (!cancelled) setGeminiError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setGeminiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirmedDestination]);

  async function handleGenerateItinerary() {
    const dest = String(displayGuide?.city || "").trim();
    if (!dest) return;
    const { ok, error } = countInclusiveTripDaysClient(programStartDate, programEndDate);
    if (!ok) {
      setItineraryError(error);
      return;
    }
    setItineraryLoading(true);
    setItineraryError("");
    try {
      const res = await fetchGeminiItinerary({
        destination: dest,
        startDate: programStartDate,
        endDate: programEndDate,
      });
      if (res?.ok && Array.isArray(res.data?.dayIdeas) && res.data.dayIdeas.length > 0) {
        setGeneratedDayIdeas(res.data.dayIdeas);
        setItineraryModalOpen(false);
      } else {
        setItineraryError("Le programme renvoyé est vide.");
      }
    } catch (e) {
      setItineraryError(String(e?.message || e));
    } finally {
      setItineraryLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.4em] text-sky-900/45">Guide destination</h2>
      </div>

      <div className="rounded-[2.2rem] bg-white/93 p-4 shadow-[0_14px_40px_rgba(30,58,95,0.08)] ring-1 ring-sky-100/55">
        <CitySearchBox
          value={searchInput}
          onChange={onSearchInputChange}
          onPick={onConfirmDestination}
          onConfirm={onConfirmDestination}
          placeholder="Rechercher une destination..."
        />
      </div>

      <div className="overflow-hidden rounded-[2.2rem] bg-white/93 shadow-[0_18px_48px_rgba(30,58,95,0.1)] ring-1 ring-sky-100/50">
        {guideLoading && !guide ? (
          <div className="space-y-4 p-4">
            <div className="h-56 w-full animate-pulse rounded-[2.5rem] bg-slate-100/90" />
            <div className="space-y-3 p-2">
              <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100/90" />
              <div className="h-7 w-44 animate-pulse rounded-xl bg-slate-100/90" />
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100/90" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-slate-100/90" />
              <div className="h-3 w-4/6 animate-pulse rounded-full bg-slate-100/90" />
            </div>
          </div>
        ) : guideError ? (
          <div className="p-6 text-sm text-rose-600">{String(guideError)}</div>
        ) : guide && displayGuide ? (
          <>
            <div className="relative p-4">
              <div className="relative h-56 w-full overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300 ring-1 ring-white/25">
                {(() => {
                  const heroSrc = String(
                    displayGuide.landscapeImageUrl ||
                      displayGuide.imageUrl ||
                      getBundledCityHeroPath(displayGuide.city) ||
                      getStorageMirrorHeroUrl(displayGuide.city) ||
                      resolveCityHeroImageUrl(displayGuide.city) ||
                      ""
                  ).trim();
                  if (!heroSrc) return null;
                  return (
                    <img
                      key={String(displayGuide.city)}
                      src={heroSrc}
                      alt={String(displayGuide.city)}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const next = pickNextDestinationGuideImgSrc(el, displayGuide);
                        if (next) {
                          el.src = next;
                          return;
                        }
                        el.removeAttribute("src");
                        el.style.display = "none";
                      }}
                    />
                  );
                })()}
                {displayGuide.situationMap?.miniMap?.viewBbox && displayGuide.coordinates ? (
                  <DestinationMiniMapOverlay
                    city={displayGuide.city}
                    country={displayGuide.country}
                    adminRegion={displayGuide.adminRegion}
                    situationMap={displayGuide.situationMap}
                    coordinates={displayGuide.coordinates}
                  />
                ) : null}
              </div>
            </div>
            <div className="space-y-6 bg-gradient-to-b from-slate-50/90 via-white to-sky-50/30 px-4 py-6 sm:px-7 sm:py-8">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80 sm:p-6">
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-200/25 blur-3xl"
                  aria-hidden
                />
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-700/90">Destination</p>
                <h3 className="mt-2 font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                  {String(displayGuide.city)}
                </h3>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">{String(displayGuide.description)}</p>
                {geminiLoading ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200/80">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" aria-hidden />
                    {SHOW_GEMINI_DEV_UI
                      ? "Génération des lieux et activités (Gemini)…"
                      : "Personnalisation du guide en cours…"}
                  </p>
                ) : null}
                {geminiError && !geminiLoading ? (
                  SHOW_GEMINI_DEV_UI ? (
                    (() => {
                      const ui = getGeminiErrorUi(geminiError);
                      return (
                        <div className="mt-3 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-3 text-xs text-amber-950">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/90">
                            Mode développeur
                          </p>
                          <p className="font-semibold text-amber-950">{ui.title}</p>
                          <p className="mt-1 leading-relaxed text-amber-900/90">{ui.subtitle}</p>
                          {ui.bullets.length > 0 ? (
                            <ul className="mt-2 list-inside list-disc space-y-1.5 text-[11px] leading-snug text-amber-900/85">
                              {ui.bullets.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 font-mono text-[10px] leading-relaxed text-amber-900/75">{ui.technical}</p>
                          )}
                          {ui.bullets.length > 0 && ui.technical ? (
                            <details className="mt-2 rounded-lg bg-amber-100/40 px-2 py-1 text-[10px] text-amber-900/70">
                              <summary className="cursor-pointer select-none font-medium text-amber-900/80">
                                Détail technique
                              </summary>
                              <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono leading-snug">
                                {ui.technical.length > 600 ? `${ui.technical.slice(0, 600)}…` : ui.technical}
                              </pre>
                            </details>
                          ) : null}
                          {ui.quota ? (
                            <p className="mt-2 text-[10px] text-amber-800/80">
                              <a
                                href="https://ai.google.dev/gemini-api/docs/rate-limits"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-amber-600/60 underline-offset-2 hover:text-amber-950"
                              >
                                Documentation des limites Gemini
                              </a>
                              {" · "}
                              <a
                                href="https://aistudio.google.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-amber-600/60 underline-offset-2 hover:text-amber-950"
                              >
                                Google AI Studio
                              </a>
                            </p>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200/90 bg-slate-50/95 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                      {userFacingGeminiGuideError()}
                    </div>
                  )
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(getTodayStr());
                    setEndDate(getTodayStr());
                    setAddModalOpen(true);
                  }}
                  className={`mt-5 rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] ${GLASS_BUTTON_CLASS}`}
                  style={GLASS_ACCENT_STYLE}
                >
                  Ajouter aux voyages
                </button>
              </div>

              <section className="rounded-[1.75rem] border border-slate-200/70 bg-white/95 p-5 shadow-[0_8px_32px_rgba(30,58,95,0.05)] sm:p-6">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
                    <MapPin className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">Lieux incontournables</h4>
                    <p className="text-[11px] text-slate-500">À ne pas manquer sur place</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(displayGuide.places || []).map((p, i) => (
                    <span
                      key={`place-${i}-${String(p).slice(0, 24)}`}
                      className="inline-flex max-w-full items-center rounded-full border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-medium leading-snug text-slate-800 shadow-sm ring-1 ring-slate-100/80"
                    >
                      {String(p)}
                    </span>
                  ))}
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-2 md:gap-5">
                <section className="flex flex-col rounded-[1.75rem] border border-emerald-200/60 bg-gradient-to-br from-emerald-50/95 to-white p-5 shadow-[0_8px_28px_rgba(5,150,105,0.07)] sm:p-6">
                  <div className="flex items-center gap-2.5 border-b border-emerald-100/90 pb-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70">
                      <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-950/90">À faire</h4>
                      <p className="text-[11px] text-emerald-800/70">Conseils experts</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800">
                    {(displayGuide.tips?.do || []).map((tip, i) => (
                      <li key={`do-${i}-${String(tip).slice(0, 20)}`} className="flex gap-2.5">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                          aria-hidden
                        />
                        <span>{String(tip)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="flex flex-col rounded-[1.75rem] border border-amber-200/60 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-[0_8px_28px_rgba(217,119,6,0.08)] sm:p-6">
                  <div className="flex items-center gap-2.5 border-b border-amber-100/90 pb-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 ring-1 ring-amber-200/70">
                      <AlertTriangle className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-950/90">À éviter</h4>
                      <p className="text-[11px] text-amber-800/75">Pièges & bonnes pratiques</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800">
                    {(displayGuide.tips?.dont || []).map((tip, i) => (
                      <li key={`dont-${i}-${String(tip).slice(0, 20)}`} className="flex gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                        <span>{String(tip)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="rounded-[1.75rem] border border-indigo-200/50 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/40 p-5 shadow-[0_8px_32px_rgba(67,56,202,0.06)] sm:p-6">
                <div className="flex items-center gap-2.5 border-b border-indigo-100/80 pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/60">
                    <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">Activités proposées</h4>
                    <p className="text-[11px] text-slate-500">Idées pour ton séjour</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(displayGuide.suggestedActivities || []).map((a, i) => (
                    <span
                      key={`act-${i}-${String(a).slice(0, 20)}`}
                      className="inline-flex max-w-full items-center rounded-2xl border border-indigo-200/70 bg-white px-3.5 py-2 text-xs font-medium leading-snug text-indigo-950 shadow-sm ring-1 ring-white/80"
                    >
                      {String(a)}
                    </span>
                  ))}
                </div>
              </section>

              {SHOW_DESTINATION_ITINERARY_CTA ? (
                <section className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200/80">
                        <Calendar className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                      </span>
                      <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
                          Programme sur mesure
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Indique tes dates sur place — génération à la demande (max. 14 jours).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setItineraryError("");
                        setItineraryModalOpen(true);
                      }}
                      disabled={itineraryLoading || geminiLoading}
                      className="shrink-0 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                    >
                      {itineraryLoading ? "Génération…" : "Générer un programme"}
                    </button>
                  </div>
                  {itineraryError && !itineraryModalOpen ? (
                    <p className="mt-3 text-xs text-rose-600">
                      {SHOW_GEMINI_DEV_UI ? itineraryError : userFacingItineraryErrorMessage(itineraryError)}
                    </p>
                  ) : null}
                  {Array.isArray(generatedDayIdeas) && generatedDayIdeas.length > 0 ? (
                    <ul className="mt-5 space-y-4">
                      {generatedDayIdeas.map((d) => (
                        <li
                          key={String(d?.day) + String(d?.title)}
                          className="relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 py-4 pl-4 pr-4 shadow-sm ring-1 ring-slate-100/90 before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-2xl before:bg-gradient-to-b before:from-sky-500 before:to-indigo-500 before:content-['']"
                        >
                          <p className="text-sm font-semibold text-slate-900">
                            Jour {Number(d?.day) || "?"} — {String(d?.title || "")}
                          </p>
                          {Array.isArray(d?.bullets) && d.bullets.length > 0 ? (
                            <ul className="mt-3 space-y-2 border-t border-slate-200/60 pt-3 text-sm text-slate-700">
                              {d.bullets.map((b, j) => (
                                <li key={j} className="flex gap-2 pl-0.5">
                                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                                  <span className="leading-relaxed">{String(b)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : generatedDayIdeas === null ? (
                    <p className="mt-4 text-center text-xs text-slate-400">
                      Clique sur « Générer un programme », choisis tes dates, puis valide.
                    </p>
                  ) : null}
                </section>
              ) : (
                <section className="rounded-[1.75rem] border border-dashed border-slate-300/90 bg-slate-50/80 p-5 sm:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200/80 text-slate-600">
                      <Lock className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-700">
                        Programme sur mesure — Premium
                      </h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        Cette fonction sera réservée aux abonnés Premium. Pour le développement, active{" "}
                        <code className="rounded bg-white px-1 ring-1 ring-slate-200">VITE_CREATOR_ITINERARY=true</code> et{" "}
                        <code className="rounded bg-white px-1 ring-1 ring-slate-200">GEMINI_CREATOR_ITINERARY=true</code> dans{" "}
                        <code className="rounded bg-white px-1 ring-1 ring-slate-200">.env.local</code>.
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="relative mx-auto w-full max-w-full min-h-[15rem] h-[min(52svh,22rem)] overflow-hidden rounded-2xl shadow-[0_22px_50px_rgba(8,47,73,0.22)] ring-1 ring-cyan-100/30 sm:h-[22rem] sm:min-h-0 sm:max-h-none sm:rounded-[2.2rem]">
            <img
              src={DESTINATION_GUIDE_HERO_IMAGE_1280}
              srcSet={`${DESTINATION_GUIDE_HERO_IMAGE_1280} 1280w, ${DESTINATION_GUIDE_HERO_IMAGE} 3992w`}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 896px"
              alt="Vue du ciel : vague, sable fin et eau turquoise"
              className="absolute inset-0 h-full w-full object-cover object-[center_34%] sm:object-[center_42%]"
              width={3992}
              height={2242}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_75%_at_50%_48%,rgba(15,118,110,0.12)_0%,rgba(15,23,42,0.38)_100%)]"
              aria-hidden
            />
            <div className="absolute inset-0 z-[1] flex items-center justify-center px-3 py-4 sm:px-10 sm:py-6">
              <div className="w-full max-w-xl rounded-xl border border-white/25 bg-white/[0.14] px-5 py-6 shadow-[0_20px_48px_rgba(0,0,0,0.22)] backdrop-blur-md sm:rounded-[2rem] sm:px-12 sm:py-10">
                <p className="text-center font-serif text-[clamp(1.5rem,7.5vw,3.15rem)] font-medium leading-snug tracking-tight text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.4)] sm:leading-[1.15]">
                  Envie de partir&nbsp;?
                </p>
                <div className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-white/55 to-transparent sm:mt-6 sm:w-16" aria-hidden />
              </div>
            </div>
          </div>
        )}
      </div>

      {itineraryModalOpen && displayGuide && SHOW_DESTINATION_ITINERARY_CTA ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="itinerary-modal-title"
            className="w-full max-w-md rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-2xl sm:p-8"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="itinerary-modal-title" className="text-sm font-semibold text-slate-900">
                Programme à {String(displayGuide.city)}
              </h2>
              <button
                type="button"
                onClick={() => setItineraryModalOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-600">
              Choisis la période de ton séjour sur place. Nous générons un fil jour par jour (jusqu’à 14 jours).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Début
                <input
                  type="date"
                  value={programStartDate}
                  onChange={(e) => setProgramStartDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Fin
                <input
                  type="date"
                  value={programEndDate}
                  onChange={(e) => setProgramEndDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>
            {(() => {
              const prev = countInclusiveTripDaysClient(programStartDate, programEndDate);
              return (
                <p className="mt-3 text-xs text-slate-600">
                  {prev.ok
                    ? `Durée : ${prev.days} jour(s) inclus.`
                    : prev.error || "Vérifie les dates."}
                </p>
              );
            })()}
            {itineraryError ? (
              <p className="mt-3 text-xs leading-relaxed text-rose-600">
                {SHOW_GEMINI_DEV_UI ? itineraryError : userFacingItineraryErrorMessage(itineraryError)}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setItineraryModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleGenerateItinerary}
                disabled={itineraryLoading}
                className="rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:brightness-110 disabled:opacity-50"
              >
                {itineraryLoading ? "Génération…" : "Générer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addModalOpen && displayGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-[3rem] bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">
                Ajouter {String(displayGuide.city)}
              </h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="rounded-full bg-slate-100/90 p-2 text-slate-500 shadow-sm">
                <Plane size={14} className="animate-bounce" />
              </div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
            </div>
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                Activités à inclure
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Coche les activités puis, pour chacune, choisis le <span className="font-medium text-slate-600">jour</span> du
                séjour et l’<span className="font-medium text-slate-600">heure</span> — elles apparaissent ainsi dans le
                calendrier.
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3">
                {(displayGuide.suggestedActivities || []).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Aucune activité proposée pour cette destination — tu pourras en ajouter dans le planning.
                  </p>
                ) : (
                  (displayGuide.suggestedActivities || []).map((a, i) => {
                    const label = String(a);
                    const checked = pickedActivityIndices.has(i);
                    return (
                      <label
                        key={`pick-act-${i}-${label.slice(0, 32)}`}
                        className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100 transition hover:bg-slate-50/90"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setPickedActivityIndices((prev) => {
                              const n = new Set(prev);
                              if (n.has(i)) {
                                n.delete(i);
                                pickedActivityLabelsRef.current.delete(i);
                              } else {
                                n.add(i);
                                pickedActivityLabelsRef.current.set(i, label);
                              }
                              return n;
                            });
                          }}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-sm leading-snug text-slate-800">{label}</span>
                      </label>
                    );
                  })
                )}
              </div>
              {sortedPickedIndices.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-sky-100/90 bg-sky-50/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/90">
                    Jour & heure dans le calendrier
                  </p>
                  {tripDatesForModal.length === 0 ? (
                    <p className="mt-2 text-xs text-rose-600">Indique des dates de séjour valides (début ≤ fin).</p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                      {sortedPickedIndices.map((actIndex, j) => {
                        const label = String(
                          pickedActivityLabelsRef.current.get(actIndex) ||
                            (displayGuide.suggestedActivities || [])[actIndex] ||
                            ""
                        );
                        const defDate =
                          tripDatesForModal[j % tripDatesForModal.length] || startDate;
                        const defTime =
                          TRIP_SCHEDULE_TIME_OPTIONS[j % TRIP_SCHEDULE_TIME_OPTIONS.length];
                        const sched = activitySchedule[String(actIndex)] || {};
                        let dateVal = sched.date || defDate;
                        if (!tripDatesForModal.includes(dateVal)) dateVal = defDate;
                        const timeVal = normalizeActivityTimeHHMM(sched.time) || defTime;
                        return (
                          <li
                            key={`sched-${actIndex}-${label.slice(0, 24)}`}
                            className="flex flex-col gap-2 rounded-xl bg-white/90 px-2.5 py-2 ring-1 ring-sky-100/80 sm:flex-row sm:items-center sm:gap-2"
                          >
                            <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-800">
                              {label}
                            </span>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <select
                                aria-label={`Jour pour ${label}`}
                                value={dateVal}
                                onChange={(e) =>
                                  setActivitySchedule((prev) => ({
                                    ...prev,
                                    [String(actIndex)]: {
                                      ...prev[String(actIndex)],
                                      date: e.target.value,
                                    },
                                  }))
                                }
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800"
                              >
                                {tripDatesForModal.map((d) => (
                                  <option key={d} value={d}>
                                    {new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                    })}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`Heure pour ${label}`}
                                value={timeVal}
                                onChange={(e) =>
                                  setActivitySchedule((prev) => ({
                                    ...prev,
                                    [String(actIndex)]: {
                                      ...prev[String(actIndex)],
                                      time: e.target.value,
                                    },
                                  }))
                                }
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800"
                              >
                                {TRIP_SCHEDULE_TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled={
                creatingVoyage || (sortedPickedIndices.length > 0 && tripDatesForModal.length === 0)
              }
              onClick={async () => {
                if (creatingVoyage) return;
                setCreatingVoyage(true);
                const suggested = displayGuide.suggestedActivities || [];
                const selectedActivitiesWithSchedule = sortedPickedIndices.map((actIndex, j) => {
                  const defDate =
                    tripDatesForModal[j % Math.max(1, tripDatesForModal.length)] || startDate;
                  const defTime =
                    TRIP_SCHEDULE_TIME_OPTIONS[j % TRIP_SCHEDULE_TIME_OPTIONS.length];
                  const sched = activitySchedule[String(actIndex)] || {};
                  let date = sched.date || defDate;
                  if (tripDatesForModal.length > 0 && !tripDatesForModal.includes(date)) date = defDate;
                  const time = normalizeActivityTimeHHMM(sched.time) || defTime;
                  const rawTitle =
                    pickedActivityLabelsRef.current.get(actIndex) ||
                    suggested[actIndex] ||
                    `Activite ${j + 1}`;
                  const title = String(rawTitle).trim() || `Activite ${j + 1}`;
                  return { title, date, time };
                });
                try {
                  const ok = await onCreateTrip({
                    title: String(displayGuide.city || ""),
                    destination: String(displayGuide.city || ""),
                    start_date: startDate,
                    end_date: endDate,
                    selectedActivitiesWithSchedule,
                    selectedActivities: selectedActivitiesWithSchedule.map((r) => r.title),
                  });
                  if (ok) setAddModalOpen(false);
                } finally {
                  setCreatingVoyage(false);
                }
              }}
              className={`mt-5 w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
              style={GLASS_ACCENT_STYLE}
            >
              {creatingVoyage ? "Creation…" : "Creer ce voyage"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AllTripsView({ trips, onOpenTrip, onShareTrip, onEditTrip, onDeleteTrip }) {
  const sections = classifyTrips(trips);
  return (
    <section className="space-y-8">
      <div className="rounded-[2rem] border border-emerald-200/70 bg-emerald-50/45 p-4 shadow-[0_10px_26px_rgba(16,185,129,0.08)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-emerald-700">Maintenant</h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            En cours
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.now && sections.now.length > 0
            ? sections.now.map((trip) => (
                <TripCard
                  key={String(trip.id)}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onShare={onShareTrip}
                  onEdit={onEditTrip}
                  onDelete={onDeleteTrip}
                  isNow
                  muted={false}
                />
              ))
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">Aucun voyage en cours.</p>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-sky-200/70 bg-sky-50/45 p-4 shadow-[0_10px_26px_rgba(14,165,233,0.08)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-sky-700">Prochainement</h2>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            A venir
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.upcoming && sections.upcoming.length > 0
            ? sections.upcoming.map((trip) => (
                <TripCard
                  key={String(trip.id)}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onShare={onShareTrip}
                  onEdit={onEditTrip}
                  onDelete={onDeleteTrip}
                  isNow={false}
                  muted={false}
                />
              ))
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">Aucun voyage a venir.</p>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-slate-50/55 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-600">Souvenirs</h2>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Passes
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sections.memories && sections.memories.length > 0
            ? sections.memories.map((trip) => (
                <TripCard
                  key={String(trip.id)}
                  trip={trip}
                  onOpen={onOpenTrip}
                  onShare={onShareTrip}
                  onEdit={onEditTrip}
                  onDelete={onDeleteTrip}
                  isNow={false}
                  muted
                />
              ))
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">Aucun souvenir.</p>}
        </div>
      </div>
    </section>
  );
}

function PlannerView({
  selectedDate,
  setSelectedDate,
  onSelectDate,
  selectedTrip,
  trips,
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  monthCursor,
  setMonthCursor,
}) {
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editActivityModalOpen, setEditActivityModalOpen] = useState(false);
  const [activityDetailsOpen, setActivityDetailsOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const [viewingActivity, setViewingActivity] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [cost, setCost] = useState("");
  const [activityTime, setActivityTime] = useState("");
  const selectedDateKey = toYMD(selectedDate, "");

  const days = useMemo(() => {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const first = new Date(y, m, 1);
    const leading = (first.getDay() + 6) % 7;
    const length = new Date(y, m + 1, 0).getDate();
    const rows = [];
    for (let i = 0; i < leading; i += 1) rows.push(null);
    for (let d = 1; d <= length; d += 1) rows.push(new Date(y, m, d));
    return rows;
  }, [monthCursor]);

  const selectedTripIdSafe = String(selectedTrip?.id || "").trim();
  const dayActivities = (activities || [])
    .filter(
      (a) =>
        String(a?.trip_id || "").trim() === selectedTripIdSafe &&
        toYMDLoose(a?.date_key || a?.date) === selectedDateKey
    )
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  const activityCountByDay = useMemo(() => {
    const map = {};
    (activities || []).forEach((a) => {
      if (String(a?.trip_id || "").trim() !== selectedTripIdSafe) return;
      const key = toYMDLoose(a?.date_key || a?.date);
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [activities, selectedTripIdSafe]);

  const tripActivityTotal = useMemo(() => {
    if (!selectedTripIdSafe) return 0;
    return (activities || []).filter((a) => String(a?.trip_id || "").trim() === selectedTripIdSafe).length;
  }, [activities, selectedTripIdSafe]);

  const inTrip = (dateStr) => {
    if (!selectedTrip) return false;
    return dateStr >= String(selectedTrip.start_date) && dateStr <= String(selectedTrip.end_date);
  };

  const inAnyTrip = (dateStr) => {
    if (!trips || trips.length === 0) return false;
    return trips.some((trip) => {
      const start = String(trip?.start_date || "");
      const end = String(trip?.end_date || "");
      return start && end && dateStr >= start && dateStr <= end;
    });
  };

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="order-1 rounded-[4.5rem] bg-white/70 p-6 shadow-2xl backdrop-blur-xl lg:order-1 lg:justify-self-start lg:w-full">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-full px-3 py-2 hover:bg-slate-100">
              {"<"}
            </button>
            <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">
              {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </h2>
            <button onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-full px-3 py-2 hover:bg-slate-100">
              {">"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-500">
            {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => (
              <div key={`${x}-${i}`} className="py-2">{x}</div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} className="h-12 rounded-xl bg-slate-50" />;
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
                d.getDate()
              ).padStart(2, "0")}`;
              const selected = dateStr === selectedDate;
              const anyTripDay = inAnyTrip(dateStr);
              const selectedTripDay = inTrip(dateStr);
              const activityCount = Number(activityCountByDay[dateStr] || 0);
              const dayClass = selected
                ? "border-transparent text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                : selectedTripDay
                  ? "border-sky-300 bg-sky-100 text-slate-900"
                  : anyTripDay
                    ? "border-slate-300 bg-white text-slate-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (onSelectDate) onSelectDate(dateStr);
                    else setSelectedDate(dateStr);
                  }}
                  className={`relative h-12 rounded-xl border text-sm transition-all duration-150 ${dayClass}`}
                  style={selected ? { backgroundColor: ACCENT } : undefined}
                >
                  {d.getDate()}
                  {activityCount > 0 ? (
                    <span
                      className={`absolute -right-1 -top-1 min-w-[16px] rounded-full px-1 text-[9px] font-semibold leading-4 ${
                        selected ? "bg-white/90 text-slate-800" : "bg-slate-900 text-white"
                      }`}
                    >
                      {activityCount}
                    </span>
                  ) : null}
                  {anyTripDay ? (
                    <span
                      className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                      style={{ backgroundColor: ACCENT, opacity: selectedTripDay ? 1 : 0.65 }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">
            Chiffre en haut à droite d&apos;une case = nombre d&apos;activités ce jour. Le point en bas = jour inclus dans
            un voyage (pas forcément d&apos;activité).
          </p>
        </div>

        <div className="order-2 px-1 py-1 lg:order-2">
          <h3 className="mb-3 text-xs uppercase tracking-[0.4em] text-slate-500">{selectedDate}</h3>
          <button
            onClick={() => {
              const index = (activities || []).filter(
                (a) => toYMDLoose(a?.date_key || a?.date) === selectedDateKey
              ).length;
              setActivityTime(slots[index % slots.length]);
              setActivityModalOpen(true);
            }}
            className={`mb-4 rounded-2xl px-4 py-2 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            + Ajouter une activite
          </button>
          <div className="space-y-3">
            {dayActivities && dayActivities.length > 0 ? dayActivities.map((a) => (
              <div
                key={String(a.id)}
                className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
                  <div className="min-w-0 pr-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {String(a.time || "--:--")}
                    </p>
                    <p className="truncate font-medium text-slate-900">{String(a?.title || a?.name || "Activite")}</p>
                    <p className="text-xs text-slate-600">
                      <MapPin size={12} className="mr-1 inline" />
                      {String(a?.location || "-")}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-600">{Number(a.cost || 0).toFixed(2)} EUR</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3">
                  <button
                    onClick={() => {
                      setViewingActivity(a);
                      setActivityDetailsOpen(true);
                    }}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50"
                    title="Voir les details"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingActivity(a);
                      setTitle(String(a?.title || a?.name || ""));
                      setDescription(String(a?.description || ""));
                      setLocation(String(a?.location || ""));
                      setCost(String(a?.cost ?? ""));
                      setActivityTime(String(a?.time || ""));
                      setEditActivityModalOpen(true);
                    }}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50"
                    title="Modifier"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setActivityToDelete(a)}
                    className="rounded-full border border-rose-100 bg-white p-2 text-rose-700 shadow-sm transition hover:bg-rose-50"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">Aucune activité à cette date.</p>
                {tripActivityTotal === 0 ? (
                  <p>
                    Aucune activité n&apos;est enregistrée pour ce voyage. Après création depuis la recherche, regarde s&apos;il
                    y a un message d&apos;erreur en haut de l&apos;écran (droits Supabase sur la table des activités, etc.).
                  </p>
                ) : (
                  <p>
                    Ce jour n&apos;a pas d&apos;activité, mais le voyage en a sur d&apos;autres dates : clique les jours du
                    séjour où tu vois un <span className="font-medium text-slate-800">chiffre</span> sur la case.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {activityModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Nouvelle activite</h2>
              <button
                onClick={() => {
                  setActivityModalOpen(false);
                  setActivityTime("");
                }}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Activite"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optionnel)"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                type="time"
                value={activityTime}
                onChange={(e) => setActivityTime(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lieu"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Cout"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  €
                </span>
              </div>
              <button
                onClick={() => {
                  onAddActivity({ title, description, location, cost, time: activityTime });
                  setTitle("");
                  setDescription("");
                  setLocation("");
                  setCost("");
                  setActivityTime("");
                  setActivityModalOpen(false);
                }}
                className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityDetailsOpen && viewingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2.5rem] bg-white/95 p-6 shadow-[0_24px_60px_rgba(2,6,23,0.2)] backdrop-blur-xl sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[11px] uppercase tracking-[0.38em] text-slate-500">Details activite</h2>
              <button
                onClick={() => {
                  setActivityDetailsOpen(false);
                  setViewingActivity(null);
                }}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Activite</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {String(viewingActivity?.title || viewingActivity?.name || "Activite")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Date</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {String(viewingActivity?.date || "-")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Heure</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {String(viewingActivity?.time || "--:--")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Budget</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {Number(viewingActivity?.cost || 0).toFixed(2)} EUR
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Lieu</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {String(viewingActivity?.location || "-")}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:col-span-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {String(viewingActivity?.description || "").trim() || "Aucune description"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editActivityModalOpen && editingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Modifier activite</h2>
              <button
                onClick={() => {
                  setEditActivityModalOpen(false);
                  setEditingActivity(null);
                  setActivityTime("");
                }}
                className="rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Activite"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optionnel)"
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                type="time"
                value={activityTime}
                onChange={(e) => setActivityTime(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lieu"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Cout"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  €
                </span>
              </div>
              <button
                onClick={() => {
                  onUpdateActivity({
                    ...editingActivity,
                    title,
                    description,
                    location,
                    cost,
                    time: activityTime,
                  });
                  setEditActivityModalOpen(false);
                  setEditingActivity(null);
                  setTitle("");
                  setDescription("");
                  setLocation("");
                  setCost("");
                  setActivityTime("");
                }}
                className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
            <h2 className="mb-2 text-xs uppercase tracking-[0.4em] text-slate-500">Confirmation</h2>
            <p className="mb-6 text-sm text-slate-700">
              Supprimer l'activite <span className="font-semibold">{String(activityToDelete?.title || activityToDelete?.name || "Activite")}</span> ?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setActivityToDelete(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  onDeleteActivity(activityToDelete);
                  setActivityToDelete(null);
                }}
                className="rounded-2xl px-4 py-3 text-sm text-white"
                style={{ backgroundColor: "#e11d48" }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TripExpenseDetail({ trip, activities, onOpenTricount, onUpdateExpense, onDeleteExpense }) {
  const [editingExpense, setEditingExpense] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editTime, setEditTime] = useState("");
  const safeActivities = Array.isArray(activities) ? activities : [];
  const total = safeActivities.reduce((sum, a) => sum + Number(a.cost || 0), 0);
  const participants = canonicalParticipants(
    Array.isArray(trip?.participants) ? trip.participants : [],
    Array.isArray(trip?.invited_emails) ? trip.invited_emails : []
  );
  const share = participants.length > 0 ? total / participants.length : total;

  const sortedActivities = [...safeActivities].sort((a, b) => {
    const ad = String(a?.date || "");
    const bd = String(b?.date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.time || "").localeCompare(String(b?.time || ""));
  });

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenTricount(trip)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenTricount(trip);
          }
        }}
        className="cursor-pointer rounded-[3.5rem] bg-white/70 p-5 shadow-2xl backdrop-blur-xl transition hover:bg-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        title="Cliquer pour gerer les participants"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold uppercase tracking-[0.08em]">{String(trip.title)}</h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenTricount(trip);
            }}
            className="rounded-full p-2 hover:bg-slate-100"
            title="Gerer les participants"
          >
            <Users size={18} />
          </button>
        </div>
        <div className="space-y-1 text-sm">
          <p>
            Total: <span className="font-medium">{total.toFixed(2)} EUR</span>
          </p>
          <p>Participants: {participants.length}</p>
          <p>
            Ratio (Total / pers.): <span className="font-medium">{share.toFixed(2)} EUR</span>
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500">Clique sur la carte pour modifier les participants de ce voyage.</p>
          {sortedActivities && sortedActivities.length > 0 ? (
            sortedActivities.map((a, idx) => (
              <div
                key={`${String(a?.id || "a")}-${idx}`}
                className="flex items-start justify-between rounded-2xl bg-slate-100 px-4 py-3"
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate font-medium text-slate-900">
                    {String(a?.title || a?.name || "Depense")}
                  </p>
                  <p className="truncate text-xs text-slate-600">
                    {String(a?.location || "-")}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right">
                    <p className="text-sm text-slate-900">{String(a?.time || "--:--")}</p>
                    <p className="text-xs text-slate-600">{Number(a?.cost || 0).toFixed(2)} EUR</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingExpense(a);
                        setEditTitle(String(a?.title || a?.name || "Depense"));
                        setEditLocation(String(a?.location || ""));
                        setEditCost(String(a?.cost ?? 0));
                        setEditTime(String(a?.time || ""));
                      }}
                      className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-200"
                      title="Modifier la depense"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteExpense(a);
                      }}
                      className="rounded-full p-1.5 text-rose-700 transition hover:bg-rose-100"
                      title="Supprimer la depense"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Aucune depense.</p>
          )}
        </div>
      </div>

      {editingExpense ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          onClick={() => setEditingExpense(null)}
        >
          <div
            className="w-full max-w-lg rounded-[3rem] bg-white/90 p-6 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">Modifier depense</h3>
              <button onClick={() => setEditingExpense(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Activite"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="Lieu"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                />
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder="Cout"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                    €
                  </span>
                </div>
              </div>
              <button
                onClick={async () => {
                  await onUpdateExpense({
                    ...editingExpense,
                    title: String(editTitle || "Depense"),
                    location: String(editLocation || ""),
                    cost: Number(editCost || 0),
                    time: String(editTime || ""),
                  });
                  setEditingExpense(null);
                }}
                className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                Enregistrer la depense
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatHubView({
  trips,
  activities,
  session,
  chatTripId,
  setChatTripId,
  chatMessages,
  chatInput,
  setChatInput,
  onSendMessage,
  votes,
  onVote,
}) {
  const currentUserDisplayName = getCurrentUserDisplayName(session);
  const messagesContainerRef = useRef(null);
  const sortedTrips = useMemo(() => {
    return [...(trips || [])].sort((a, b) => {
      const as = String(a?.start_date || "");
      const bs = String(b?.start_date || "");
      if (as !== bs) return as.localeCompare(bs);
      return String(a?.end_date || "").localeCompare(String(b?.end_date || ""));
    });
  }, [trips]);

  const activeTrip = sortedTrips.find((t) => String(t.id) === String(chatTripId)) || null;
  const tripActivities = (activities || [])
    .filter((a) => String(a.trip_id) === String(chatTripId))
    .sort((a, b) => {
      const ad = String(a?.date || "");
      const bd = String(b?.date || "");
      if (ad !== bd) return ad.localeCompare(bd);
      return String(a?.time || "").localeCompare(String(b?.time || ""));
    });

  const votesByActivity = useMemo(() => {
    const map = {};
    (votes || []).forEach((v) => {
      const key = String(v?.activity_id || "");
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(v);
    });
    return map;
  }, [votes]);

  const currentUserId = String(session?.user?.id || "");

  useEffect(() => {
    if (!activeTrip) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, activeTrip]);

  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] bg-white/92 p-5 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
        <h2 className="text-xs uppercase tracking-[0.35em] text-slate-500">Groupes voyages</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {sortedTrips.length > 0 ? (
            sortedTrips.map((trip) => {
              const active = String(chatTripId) === String(trip.id);
              const participantsRaw = canonicalParticipants(trip?.participants, trip?.invited_emails);
              const participantLabels = participantsRaw.map((p) =>
                String(p).toLowerCase() === "moi" ? currentUserDisplayName : String(p)
              );
              return (
                <button
                  key={String(trip.id)}
                  onClick={() => setChatTripId(String(trip.id))}
                  className={`relative overflow-hidden rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    active
                      ? "border-white/55 text-white shadow-[0_16px_34px_rgba(2,6,23,0.24)]"
                      : "border-white/42 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.2)]"
                  }`}
                >
                  <div
                    className="pointer-events-none absolute inset-[-8px] scale-[1.04] overflow-hidden"
                    style={{
                      filter: active
                        ? "blur(9px) saturate(1.2) brightness(0.95)"
                        : "blur(10px) saturate(1.12) brightness(0.92)",
                    }}
                  >
                    <CityImage title={String(trip?.title || "voyage")} />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        active
                          ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))"
                          : "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 backdrop-blur-[2.5px]"
                    style={{ backgroundColor: active ? "rgba(2,6,23,0.09)" : "rgba(2,6,23,0.075)" }}
                  />
                  <div className="relative">
                    <p className="font-medium">{String(trip.title)}</p>
                    <p className="text-xs text-white/85">
                    {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      {participantLabels.slice(0, 4).map((label) => (
                        <span
                          key={`${String(trip.id)}-${String(label)}`}
                          title={String(label)}
                          className="inline-grid h-6 w-6 place-items-center rounded-full bg-white/25 text-[10px] font-semibold text-white ring-1 ring-white/30"
                        >
                          {initialsFromLabel(label)}
                        </span>
                      ))}
                      {participantLabels.length > 4 ? (
                        <span className="text-[10px] text-white/85">
                          +{participantLabels.length - 4}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-slate-500">Aucun voyage disponible.</p>
          )}
        </div>
      </div>

      {activeTrip ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 backdrop-blur-[2px] sm:p-4">
          <div className="relative h-[92vh] w-full max-w-6xl sm:h-[88vh]">
            <button
              onClick={() => setChatTripId("")}
              className="absolute right-1 top-1 z-10 rounded-full bg-white p-2 text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50 sm:-top-2 sm:right-0"
              title="Fermer la conversation"
            >
              <X size={16} />
            </button>
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[1.2fr_1fr] lg:gap-4">
              <div className="flex min-h-0 flex-col rounded-[2rem] bg-white p-4 shadow-[0_18px_40px_rgba(2,6,23,0.16)] ring-1 ring-slate-200 sm:p-5">
            <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">Discussion - {String(activeTrip.title)}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {canonicalParticipants(activeTrip?.participants, activeTrip?.invited_emails)
                .map((p) => participantDisplayFromRaw(p, currentUserDisplayName))
                .map((label) => (
                  <span
                    key={`active-${String(label)}`}
                    title={String(label)}
                    className="inline-grid h-7 w-7 place-items-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-300"
                  >
                    {initialsFromLabel(label)}
                  </span>
                ))}
            </div>
            <div
              ref={messagesContainerRef}
              className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
            >
              {(chatMessages || []).length > 0 ? (
                chatMessages.map((msg, idx) => {
                  const mine =
                    (currentUserId && String(msg?.author_id || "") === currentUserId) ||
                    (!!session?.user?.email &&
                      String(msg?.author_email || "").toLowerCase() === String(session?.user?.email || "").toLowerCase());
                  const authorLabel = String(msg?.author_name || msg?.author_email || (mine ? "Moi" : "Membre"));
                  return (
                    <div
                      key={`${String(msg?.id || "m")}-${idx}`}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        <p className={`mb-1 px-1 text-[11px] ${mine ? "text-slate-500" : "text-slate-500"}`}>
                          {authorLabel}
                        </p>
                        <div
                          className={`rounded-[1.25rem] px-3 py-2 text-sm shadow-sm ${
                            mine
                              ? "rounded-br-md bg-[#0A84FF] text-white"
                              : "rounded-bl-md bg-slate-200 text-slate-900"
                          }`}
                        >
                          {String(msg?.content || "")}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">Aucun message pour ce voyage.</p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSendMessage();
                  }
                }}
                placeholder="Ecrire un message..."
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[16px] md:text-sm"
              />
              <button
                onClick={onSendMessage}
                className={`rounded-2xl px-4 py-3 text-sm text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                Envoyer
              </button>
            </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-[2rem] bg-white p-4 shadow-[0_18px_40px_rgba(2,6,23,0.16)] ring-1 ring-slate-200 sm:p-5">
                <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">Votes activites</h3>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto space-y-2 pr-1">
                  {tripActivities.length > 0 ? (
                    tripActivities.map((activity) => {
                      const list = votesByActivity[String(activity.id)] || [];
                      const score = list.reduce((sum, v) => sum + Number(v?.value || 0), 0);
                      const mine = list.find((v) => String(v?.voter_id || "") === currentUserId);
                      const mineValue = Number(mine?.value || 0);
                      const votedFor = list.filter((v) => Number(v?.value || 0) === 1);
                      const votedAgainst = list.filter((v) => Number(v?.value || 0) === -1);
                      return (
                        <div key={String(activity.id)} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {String(activity?.title || activity?.name || "Activite")}
                          </p>
                          <p className="text-xs text-slate-500">
                            {String(activity?.date || "")} {String(activity?.time || "")}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-700">
                            Budget: {Number(activity?.cost || 0).toFixed(2)} EUR
                          </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                score > 0
                                  ? "bg-emerald-100 text-emerald-700"
                                  : score < 0
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              Score {score > 0 ? `+${score}` : score}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => onVote(String(activity.id), 1)}
                              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                                mineValue === 1
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              👍 Je vote pour
                            </button>
                            <button
                              onClick={() => onVote(String(activity.id), -1)}
                              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                                mineValue === -1
                                  ? "bg-rose-600 text-white shadow-sm"
                                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              👎 Je vote contre
                            </button>
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500">
                            {mineValue === 1
                              ? "Ton vote: pour"
                              : mineValue === -1
                                ? "Ton vote: contre"
                                : "Tu n'as pas encore vote"}
                          </p>
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] text-emerald-700">
                              Pour:{" "}
                              {votedFor.length > 0
                                ? votedFor.map((v) => resolveVoterLabel(v, session)).join(", ")
                                : "-"}
                            </p>
                            <p className="text-[11px] text-rose-700">
                              Contre:{" "}
                              {votedAgainst.length > 0
                                ? votedAgainst.map((v) => resolveVoterLabel(v, session)).join(", ")
                                : "-"}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">Aucune activite a voter.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/92 px-5 py-6 text-sm text-slate-600 shadow-[0_10px_30px_rgba(2,6,23,0.06)]">
          Selectionne un voyage dans la liste "Groupes voyages" pour ouvrir sa conversation.
        </div>
      )}
    </section>
  );
}

const ACTIVE_TAB_STORAGE_KEY = "tp_active_tab_v1";
const VALID_APP_TABS = new Set(["trips", "planner", "destination", "budget", "chat"]);

function readStoredActiveTab() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (raw && VALID_APP_TABS.has(raw)) return raw;
  } catch (_e) {
    // ignore
  }
  return "trips";
}

const DESTINATION_QUERY_STORAGE_KEY = "tp_destination_query_v1";
const MAX_STORED_DEST_QUERY_LEN = 160;

function readStoredDestinationQuery() {
  try {
    const raw = window.localStorage.getItem(DESTINATION_QUERY_STORAGE_KEY);
    const s = String(raw || "").trim();
    if (!s) return "";
    return s.length > MAX_STORED_DEST_QUERY_LEN ? s.slice(0, MAX_STORED_DEST_QUERY_LEN) : s;
  } catch (_e) {
    return "";
  }
}

// Main App
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => readStoredActiveTab());
  const [menuOpen, setMenuOpen] = useState(false);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [shareTrip, setShareTrip] = useState(null);
  const [tricountTrip, setTricountTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripToDelete, setTripToDelete] = useState(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [notice, setNotice] = useState("");
  const [destinationConfirmed, setDestinationConfirmed] = useState(() => readStoredDestinationQuery());
  const [destinationInput, setDestinationInput] = useState(() => readStoredDestinationQuery());

  const [trips, setTrips] = useState([]);
  const [activities, setActivities] = useState([]);
  const [chatActivities, setChatActivities] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [chatTripId, setChatTripId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatMessagesByTrip, setChatMessagesByTrip] = useState(() => loadChatCacheFromStorage());
  const [chatInput, setChatInput] = useState("");
  const [activityVotes, setActivityVotes] = useState([]);
  const [chatMessagesLocal, setChatMessagesLocal] = useState({});
  const [activityVotesLocal, setActivityVotesLocal] = useState({});
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [monthCursor, setMonthCursor] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [plannerInviteOpen, setPlannerInviteOpen] = useState(false);
  const [budgetUpcomingOpen, setBudgetUpcomingOpen] = useState(false);
  const [budgetMemoriesOpen, setBudgetMemoriesOpen] = useState(false);

  /** Évite de réinitialiser le jour du planning à chaque refetch de `trips` (même voyage, nouvelle référence d'objet). */
  const plannerSyncedTripIdRef = useRef("");
  /** Ids d'activités insérées récemment — fusion avec loadActivities pour éviter l'écrasement par une lecture vide / en retard. */
  const activityInsertGraceRef = useRef(new Map());
  /** Évite double insertion voyage (double clic, double appel concurrent). */
  const createTripInFlightRef = useRef(false);

  const selectedTrip = trips.find((t) => String(t.id) === String(selectedTripId)) || null;
  const uiTitle =
    activeTab === "trips"
      ? "Mes Voyages"
      : activeTab === "planner"
        ? "Planning"
        : activeTab === "chat"
          ? "Chat"
        : activeTab === "destination"
          ? "Recherche"
          : "Budget";

  const openPlannerToday = (tripToOpen = null) => {
    const today = getTodayStr();
    const preferredTripId = String(tripToOpen?.id || "");

    // If user opened planner from a specific trip card, always prioritize that trip.
    if (preferredTripId) {
      const preferredTrip = (trips || []).find((t) => String(t?.id || "") === preferredTripId) || tripToOpen;
      const tripStart = String(preferredTrip?.start_date || "");
      const tripEnd = String(preferredTrip?.end_date || "");
      const inPreferredTripRange = !!tripStart && !!tripEnd && today >= tripStart && today <= tripEnd;
      const targetDate = inPreferredTripRange ? today : toYMD(tripStart, today);
      const d = new Date(`${targetDate}T00:00:00`);

      setSelectedTripId(preferredTripId);
      setSelectedDate(targetDate);
      if (!Number.isNaN(d.getTime())) {
        setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      setActiveTab("planner");
      return;
    }

    const now = new Date();
    setSelectedDate(today);
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    // If a trip is already selected and it matches today, keep it.
    const selectedMatchesToday =
      selectedTrip &&
      String(selectedTrip.start_date || "") <= today &&
      String(selectedTrip.end_date || "") >= today;

    if (!selectedMatchesToday) {
      // Otherwise select the trip that matches today (so the orange dots are visible).
      const sections = classifyTrips(trips);
      const bestTrip =
        (sections.now && sections.now[0]) ||
        (sections.upcoming && sections.upcoming[0]) ||
        (trips && trips[0]) ||
        null;
      if (bestTrip?.id) setSelectedTripId(String(bestTrip.id));
    }
    setActiveTab("planner");
  };

  const handlePlannerDateSelect = (dateStr) => {
    const safeDate = toYMD(dateStr, getTodayStr());
    setSelectedDate(safeDate);
    const matchingTrip = (trips || []).find((trip) => {
      const start = String(trip?.start_date || "");
      const end = String(trip?.end_date || "");
      return !!start && !!end && safeDate >= start && safeDate <= end;
    });
    if (matchingTrip?.id && String(matchingTrip.id) !== String(selectedTripId)) {
      setSelectedTripId(String(matchingTrip.id));
    }
  };

  const replaceTripActivitiesInState = (tripId, freshTripActivities) => {
    const targetTripId = String(tripId || "");
    const fresh = (freshTripActivities || []).map(normalizeActivity);
    setActivities((prev) => {
      const keep = (prev || []).filter((a) => String(a?.trip_id || "") !== targetTripId);
      if (fresh.length === 0) {
        const now = Date.now();
        const lagOnly = (prev || []).filter((a) => {
          if (String(a?.trip_id || "") !== targetTripId) return false;
          const id = String(a.id || "");
          const t0 = activityInsertGraceRef.current.get(id);
          return id && t0 != null && now - t0 < ACTIVITY_INSERT_GRACE_MS;
        });
        return [...keep, ...lagOnly];
      }
      return [...keep, ...fresh];
    });
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) setSession(data?.session || null);
      } catch (e) {
        if (mounted) setNotice(String(e?.message || "Erreur authentification"));
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch (_e) {
      // ignore quota / private mode
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      const q = String(destinationConfirmed || "").trim();
      if (q) {
        const stored = q.length > MAX_STORED_DEST_QUERY_LEN ? q.slice(0, MAX_STORED_DEST_QUERY_LEN) : q;
        window.localStorage.setItem(DESTINATION_QUERY_STORAGE_KEY, stored);
      } else {
        window.localStorage.removeItem(DESTINATION_QUERY_STORAGE_KEY);
      }
    } catch (_e) {
      // ignore
    }
  }, [destinationConfirmed]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setMenuOpen(false);
      setDestinationInput("");
      setDestinationConfirmed("");
      try {
        window.localStorage.removeItem(DESTINATION_QUERY_STORAGE_KEY);
      } catch {
        // ignore
      }
    } catch (e) {
      setNotice(String(e?.message || "Erreur deconnexion"));
    }
  };

  const deleteMyAccount = async () => {
    const ok = window.confirm(
      "Supprimer votre compte ? Cette action supprimera vos voyages et peut etre irreversible."
    );
    if (!ok) return;
    setDeletingAccount(true);
    try {
      const userId = String(session?.user?.id || "");
      const accessToken = String(session?.access_token || "");
      if (!userId || !accessToken) throw new Error("Session invalide.");

      // 1) Delete user-owned trips data first.
      try {
        const { data: ownedTrips } = await supabase
          .from("trips")
          .select("id")
          .eq("owner_id", userId);
        const ids = (ownedTrips || []).map((t) => t.id).filter(Boolean);
        if (ids.length > 0) {
          try {
            await supabase.from("activities").delete().in("trip_id", ids);
          } catch (_e) {
            // ignore child cleanup failure
          }
          await supabase.from("trips").delete().in("id", ids);
        }
      } catch (_e) {
        // If schema differs, continue with auth deletion attempt.
      }

      // 2) Try deleting auth user through RPC (recommended pattern).
      let authDeleted = false;
      try {
        const { error: rpcErr } = await supabase.rpc("delete_my_account");
        if (!rpcErr) authDeleted = true;
      } catch (_e) {
        // continue fallback
      }

      // 3) Fallback: direct Auth endpoint delete.
      if (!authDeleted) {
        try {
          const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: "DELETE",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
            },
          });
          authDeleted = !!resp.ok;
        } catch (_e) {
          authDeleted = false;
        }
      }

      await supabase.auth.signOut();
      setSession(null);
      setActiveTab("trips");
      setAccountOpen(false);
      if (authDeleted) {
        setNotice("");
      } else {
        setNotice(
          "Compte deconnecte et donnees voyage nettoyees. Pour suppression definitive Auth, active la fonction SQL delete_my_account."
        );
      }
    } catch (e) {
      setNotice(
        String(
          e?.message ||
            "Suppression de compte non disponible. Active-la via backend/Edge Function."
        )
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const updateMyAccount = async ({ first_name, last_name, email, password }) => {
    const safeFirstName = String(first_name || "").trim();
    const safeLastName = String(last_name || "").trim();
    const safeEmail = String(email || "").trim();
    const safePassword = String(password || "");
    if (!safeFirstName || !safeLastName || !safeEmail) {
      setNotice("Nom, prenom et email sont obligatoires.");
      return;
    }
    setSavingAccount(true);
    try {
      const payload = {
        email: safeEmail,
        data: {
          first_name: safeFirstName,
          last_name: safeLastName,
          full_name: `${safeFirstName} ${safeLastName}`.trim(),
        },
      };
      if (safePassword) payload.password = safePassword;

      const { data, error } = await supabase.auth.updateUser(payload);
      if (error) throw error;
      if (data?.user) {
        setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
      }
      setNotice("");
      setAccountOpen(false);
    } catch (e) {
      setNotice(String(e?.message || "Erreur mise a jour compte"));
    } finally {
      setSavingAccount(false);
    }
  };

  useEffect(() => {
    const loadTrips = async () => {
      try {
        let data = null;
        let lastError = null;

        for (let i = 0; i < TRIPS_SELECT_ATTEMPTS.length; i += 1) {
          const { data: d, error } = await supabase.from("trips").select(TRIPS_SELECT_ATTEMPTS[i]);
          if (!error) {
            data = d;
            lastError = null;
            break;
          }
          lastError = error;
        }

        if (lastError) throw lastError;

        const visibleTrips = visibleTripsForSession(data, session);
        setTrips(visibleTrips);
        if (visibleTrips.length > 0 && !selectedTripId) setSelectedTripId(String(visibleTrips[0].id));
        if (visibleTrips.length === 0) setSelectedTripId("");
      } catch (e) {
        setNotice(String(e?.message || "Erreur chargement voyages"));
      }
    };
    loadTrips();

    const tripChannel = supabase
      .channel("trips-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, loadTrips)
      .subscribe();
    return () => supabase.removeChannel(tripChannel);
  }, [session]);

  useEffect(() => {
    const loadActivities = async () => {
      try {
        const tripIds = (trips || []).map((t) => String(t?.id || "")).filter(Boolean);
        if (tripIds.length === 0) {
          setActivities([]);
          return;
        }
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .in("trip_id", tripIds);
        if (error) throw error;
        const fetched = (data || []).map(normalizeActivity);
        setActivities((prev) => mergeActivitiesFromServer(prev, fetched, tripIds, activityInsertGraceRef));
      } catch (e) {
        setNotice(String(e?.message || "Erreur chargement activites"));
      }
    };
    loadActivities();

    const actChannel = supabase
      .channel("activities-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, loadActivities)
      .subscribe();
    return () => supabase.removeChannel(actChannel);
  }, [trips, session]);

  useEffect(() => {
    if (!selectedTripId || !selectedTrip) {
      if (!selectedTripId) plannerSyncedTripIdRef.current = "";
      return;
    }
    const id = String(selectedTripId);
    if (plannerSyncedTripIdRef.current === id) return;
    plannerSyncedTripIdRef.current = id;
    const tripStart = toYMD(selectedTrip.start_date, getTodayStr());
    setSelectedDate(tripStart);
    const d = new Date(`${tripStart}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [selectedTripId, selectedTrip]);

  useEffect(() => {
    if (trips.length === 0) {
      setChatTripId("");
      setChatMessages([]);
      setActivityVotes([]);
    }
  }, [trips]);

  useEffect(() => {
    saveChatCacheToStorage(chatMessagesByTrip);
  }, [chatMessagesByTrip]);

  useEffect(() => {
    const loadChatData = async () => {
      if (!chatTripId) {
        setChatMessages([]);
        setActivityVotes([]);
        setChatActivities([]);
        return;
      }

      const cachedMessages = chatMessagesByTrip[chatTripId];
      if (Array.isArray(cachedMessages) && cachedMessages.length > 0) {
        setChatMessages(cachedMessages);
      }

      try {
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .eq("trip_id", chatTripId);
        if (error) throw error;
        setChatActivities((data || []).map(normalizeActivity));
      } catch (_e) {
        setChatActivities([]);
      }

      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("trip_id", chatTripId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        const sortedMessages = (data || []).slice().sort((a, b) =>
          String(a?.created_at || "").localeCompare(String(b?.created_at || ""))
        );
        setChatMessages(sortedMessages);
        setChatMessagesByTrip((prev) => ({ ...prev, [chatTripId]: sortedMessages }));
      } catch (_e) {
        // Keep durable cache first, then in-memory local fallback.
        const cached = chatMessagesByTrip[chatTripId];
        if (Array.isArray(cached) && cached.length > 0) {
          setChatMessages(cached);
        } else {
          setChatMessages(chatMessagesLocal[chatTripId] || []);
        }
      }

      try {
        const { data, error } = await supabase
          .from("activity_votes")
          .select("*")
          .eq("trip_id", chatTripId);
        if (error) throw error;
        setActivityVotes(data || []);
      } catch (_e) {
        setActivityVotes(activityVotesLocal[chatTripId] || []);
      }
    };
    loadChatData();
  }, [chatTripId, chatMessagesLocal, activityVotesLocal]);

  const sendChatMessage = async () => {
    const content = String(chatInput || "").trim();
    if (!content || !chatTripId) return;
    const currentUserId = String(session?.user?.id || "");
    const userEmail = String(session?.user?.email || "");
    const authorName =
      String(session?.user?.user_metadata?.first_name || "").trim() ||
      String(userEmail).split("@")[0] ||
      "Membre";

    let payload = {
      trip_id: chatTripId,
      author_id: currentUserId,
      author_email: userEmail,
      author_name: authorName,
      content,
    };

    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { error } = await supabase.from("chat_messages").insert(payload);
        if (!error) {
          setChatInput("");
          const { data: fresh } = await supabase
            .from("chat_messages")
            .select("*")
            .eq("trip_id", chatTripId)
            .order("created_at", { ascending: true });
          const sortedMessages = (fresh || []).slice().sort((a, b) =>
            String(a?.created_at || "").localeCompare(String(b?.created_at || ""))
          );
          setChatMessages(sortedMessages);
          setChatMessagesByTrip((prev) => ({ ...prev, [chatTripId]: sortedMessages }));
          return;
        }
        const msg = String(error?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
    } catch (_e) {
      const localMsg = {
        id: `local-${Date.now()}`,
        trip_id: chatTripId,
        author_id: currentUserId,
        author_email: userEmail,
        author_name: authorName,
        content,
      };
      setChatMessages((prev) => [...(prev || []), localMsg]);
      setChatMessagesByTrip((prev) => ({
        ...prev,
        [chatTripId]: [...(prev[chatTripId] || []), localMsg],
      }));
      setChatMessagesLocal((prev) => ({
        ...prev,
        [chatTripId]: [...(prev[chatTripId] || []), localMsg],
      }));
      setChatInput("");
    }
  };

  const voteActivity = async (activityId, value) => {
    if (!chatTripId || !activityId) return;
    const currentUserId = String(session?.user?.id || "");
    const userEmail = String(session?.user?.email || "");
    const voterName =
      String(session?.user?.user_metadata?.first_name || "").trim() ||
      String(userEmail).split("@")[0] ||
      "Membre";
    const v = Number(value) >= 0 ? 1 : -1;
    let payload = {
      trip_id: chatTripId,
      activity_id: activityId,
      voter_id: currentUserId,
      value: v,
      voter_name: voterName,
      voter_email: userEmail,
    };

    try {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { error } = await supabase.from("activity_votes").upsert(payload, {
          onConflict: "trip_id,activity_id,voter_id",
        });
        if (!error) break;
        const msg = String(error?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
      const { data: fresh } = await supabase
        .from("activity_votes")
        .select("*")
        .eq("trip_id", chatTripId);
      setActivityVotes(fresh || []);
    } catch (_e) {
      setActivityVotes((prev) => {
        const rest = (prev || []).filter(
          (x) => !(String(x?.activity_id) === String(activityId) && String(x?.voter_id) === currentUserId)
        );
        const next = [...rest, payload];
        setActivityVotesLocal((m) => ({ ...m, [chatTripId]: next }));
        return next;
      });
    }
  };

  const insertActivitiesFromGuideSelection = async (tripId, items, startYmd, endYmd, userId) => {
    const raw = Array.isArray(items) ? items : [];
    const normalizedItems = raw
      .map((item) => {
        if (typeof item === "string") {
          return { title: String(item || "").trim(), date: "", time: "" };
        }
        return {
          title: String(item?.title || "").trim(),
          date:
            item?.date != null && String(item.date).trim() !== ""
              ? toYMDLoose(item.date) || toYMD(item.date, "")
              : "",
          time: String(item?.time || "").trim(),
        };
      })
      .filter((x) => x.title);
    if (!tripId || normalizedItems.length === 0) return true;
    const tripDayList = listTripDatesInclusive(startYmd, endYmd);
    const tripDaySet = new Set(tripDayList);
    const fallbackDates = assignActivityDatesRoundRobin(startYmd, endYmd, normalizedItems.length);
    const insertErrorMsgs = [];
    for (let i = 0; i < normalizedItems.length; i += 1) {
      const { title, date: inDate, time: inTime } = normalizedItems[i];
      const safeDate =
        inDate && tripDaySet.has(inDate)
          ? inDate
          : toYMD(fallbackDates[i], toYMD(startYmd, getTodayStr()));
      const assignedTime =
        normalizeActivityTimeHHMM(inTime) || String(slots[i % slots.length]).slice(0, 5);
      const activityPrompt = `${title} ${safeDate} ${assignedTime}`;
      const fallbackPhoto =
        seededPicsumUrl(activityPrompt, 1200, 800) || seededPicsumUrl(`${title}|${tripId}`, 1200, 800);
      let actPayload = {
        trip_id: String(tripId),
        date: safeDate,
        date_key: safeDate,
        activity_date: safeDate,
        time: assignedTime,
        title,
        name: title,
        description: "",
        details: "",
        notes: "",
        cost: 0,
        location: "",
        owner_id: String(userId || ""),
        photo_url: String(fallbackPhoto || ""),
        image_url: String(fallbackPhoto || ""),
      };
      let insertFailed = true;
      let lastInsertErr = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: insRow, error: actErr } = await supabase
          .from("activities")
          .insert(actPayload)
          .select("id")
          .limit(1);
        if (!actErr) {
          insertFailed = false;
          const newId = String(insRow?.[0]?.id || "");
          if (newId) activityInsertGraceRef.current.set(newId, Date.now());
          setActivities((prev) => [
            ...(prev || []).filter((a) => String(a.id) !== newId),
            normalizeActivity({
              id: newId,
              trip_id: String(tripId),
              date: safeDate,
              date_key: safeDate,
              time: assignedTime,
              title,
              name: title,
              cost: 0,
              location: "",
              description: "",
              details: "",
              notes: "",
              photo_url: String(actPayload.photo_url || ""),
              image_url: String(actPayload.image_url || ""),
            }),
          ]);
          break;
        }
        lastInsertErr = actErr;
        const msg = String(actErr?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(actPayload, missing)) {
          const { [missing]: _removed, ...rest } = actPayload;
          actPayload = rest;
          continue;
        }
        break;
      }
      if (insertFailed && lastInsertErr) {
        insertErrorMsgs.push(String(lastInsertErr.message || "Impossible d'enregistrer une activite."));
      }
    }
    if (insertErrorMsgs.length > 0) {
      setNotice(
        insertErrorMsgs.length === 1
          ? insertErrorMsgs[0]
          : `${insertErrorMsgs.length} activite(s) non enregistree(s). ${insertErrorMsgs[0]}`
      );
    }
    try {
      const fresh = await fetchActivitiesRowsForTrip(tripId);
      replaceTripActivitiesInState(String(tripId), fresh);
    } catch (_e) {
      /* ignore */
    }
    return insertErrorMsgs.length === 0;
  };

  const createTrip = async (payload) => {
    const safeTitle = formatCityName(payload?.title || "");
    if (!safeTitle) {
      setNotice("Destination obligatoire.");
      return false;
    }
    if (String(payload.start_date || "") > String(payload.end_date || "")) {
      setNotice("Date de debut invalide.");
      return false;
    }
    if (createTripInFlightRef.current) {
      setNotice("Creation du voyage en cours…");
      return false;
    }
    createTripInFlightRef.current = true;
    try {
      // Certains schémas ont owner_id NOT NULL.
      // Avec signInAnonymously(), l'utilisateur est "authenticated" et a un id.
      let ownerId = "";
      try {
        const { data: userData } = await supabase.auth.getUser();
        ownerId = String(userData?.user?.id || "");
      } catch (_e) {
        ownerId = "";
      }

      let body = {
        invited_emails:
          Array.isArray(payload?.invited_emails) && payload.invited_emails.length > 0
            ? payload.invited_emails
            : [],
        title: safeTitle,
        name: safeTitle,
        destination: formatCityName(payload?.destination || payload?.title || safeTitle),
        start_date: String(payload.start_date || getTodayStr()),
        end_date: String(payload.end_date || getTodayStr()),
        participants: canonicalParticipants(
          [],
          Array.isArray(payload?.invited_emails) && payload.invited_emails.length > 0
            ? payload.invited_emails
            : []
        ),
        fixed_url: String(payload.fixed_url || ""),
        owner_id: ownerId,
      };

      // If the DB schema cache is stale or columns are missing,
      // retry the insert while removing the missing column from payload.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: insertedRows, error } = await supabase.from("trips").insert(body).select("id");
        if (!error) {
          const newTripId = String(insertedRows?.[0]?.id || "").trim();
          const withSchedule = Array.isArray(payload?.selectedActivitiesWithSchedule)
            ? payload.selectedActivitiesWithSchedule
                .map((row) => {
                  const title = String(row?.title || "").trim();
                  const dateRaw = row?.date;
                  const dateYmd =
                    dateRaw != null && String(dateRaw).trim() !== ""
                      ? toYMDLoose(dateRaw) || toYMD(dateRaw, "")
                      : "";
                  return { title, date: dateYmd, time: String(row?.time || "").trim() };
                })
                .filter((r) => r.title)
            : [];
          const selectedActs = Array.isArray(payload?.selectedActivities)
            ? payload.selectedActivities.map((x) => String(x || "").trim()).filter(Boolean)
            : [];
          const itemsToInsert =
            withSchedule.length > 0 ? withSchedule : selectedActs.map((t) => ({ title: t, date: "", time: "" }));
          let activitiesInsertOk = true;
          if (newTripId && itemsToInsert.length > 0) {
            activitiesInsertOk = await insertActivitiesFromGuideSelection(
              newTripId,
              itemsToInsert,
              String(body.start_date || ""),
              String(body.end_date || ""),
              ownerId
            );
          }

          setTripModalOpen(false);
          // Pas de message "success" : on laisse l'UI se mettre à jour via le fetch/les subscriptions.
          if (activitiesInsertOk) setNotice("");
          // Force immediate UI refresh (subscription can lag).
          try {
            let data = null;
            let lastError = null;

            for (let i = 0; i < TRIPS_SELECT_ATTEMPTS.length; i += 1) {
              const { data: d, error: selErr } = await supabase
                .from("trips")
                .select(TRIPS_SELECT_ATTEMPTS[i]);
              if (!selErr) {
                data = d;
                lastError = null;
                break;
              }
              lastError = selErr;
            }

            if (lastError) throw lastError;

            const visibleAfterCreate = visibleTripsForSession(data, session);
            setTrips(visibleAfterCreate);
            // Select the newly created trip so the Calendar marks appear immediately.
            try {
              const wantedStart = toYMD(body.start_date, "");
              const wantedEnd = toYMD(body.end_date, "");
              const wantedTitle = String(body.destination || body.title || safeTitle || "");
              const match =
                visibleAfterCreate.find((t) => {
                  const tStart = String(t.start_date || "");
                  const tEnd = String(t.end_date || "");
                  const tTitle = String(t.title || "");
                  return (
                    tStart === wantedStart &&
                    tEnd === wantedEnd &&
                    (tTitle === wantedTitle || tTitle.toLowerCase() === wantedTitle.toLowerCase())
                  );
                }) ||
                visibleAfterCreate.find((t) => String(t.start_date || "") === wantedStart && String(t.end_date || "") === wantedEnd) ||
                visibleAfterCreate[0];

              if (match?.id) {
                setSelectedTripId(String(match.id));
                const tripStart = toYMD(body.start_date, getTodayStr());
                setSelectedDate(tripStart);
                const md = new Date(`${tripStart}T12:00:00`);
                if (!Number.isNaN(md.getTime())) {
                  setMonthCursor(new Date(md.getFullYear(), md.getMonth(), 1));
                }
              }
            } catch (_matchErr) {
              if (visibleAfterCreate.length > 0) setSelectedTripId(String(visibleAfterCreate[0].id));
            }

            if (newTripId && itemsToInsert.length > 0) {
              try {
                const actRows = await fetchActivitiesRowsForTrip(newTripId);
                replaceTripActivitiesInState(newTripId, actRows);
              } catch (_actRefetchErr) {
                /* ignore */
              }
            }
          } catch (_refreshErr) {
            // keep success message; user will retry once
          }
          return true;
        }

        const msg = String(error?.message || "");
        // Example: Could not find the 'end_date' column of 'trips' in the schema cache
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        if (m1?.[1] && Object.prototype.hasOwnProperty.call(body, m1[1])) {
          const missing = m1[1];
          // eslint-disable-next-line no-unused-vars
          const { [missing]: _removed, ...rest } = body;
          body = rest;
          continue;
        }

        // Example fallback from Postgres: column "end_date" does not exist
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        if (m2?.[1] && Object.prototype.hasOwnProperty.call(body, m2[1])) {
          const missing = m2[1];
          // eslint-disable-next-line no-unused-vars
          const { [missing]: _removed, ...rest } = body;
          body = rest;
          continue;
        }

        throw error;
      }
    } catch (e) {
      setNotice(String(e?.message || "Erreur creation voyage"));
    } finally {
      createTripInFlightRef.current = false;
    }
    return false;
  };

  const addActivity = async (input) => {
    if (!selectedTripId) {
      setNotice("Selectionne un voyage.");
      return;
    }
    try {
      const userId = String(session?.user?.id || "");
      const safeSelectedDate = toYMD(selectedDate, getTodayStr());
      const index = (activities || []).filter((a) => toYMDLoose(a?.date_key || a?.date) === safeSelectedDate).length;
      const manualTime = String(input?.time || "").trim();
      const assignedTime = manualTime || slots[index % slots.length];
      const activityPrompt = String(
        `${input.title || ""} ${input.location || ""} ${safeSelectedDate} ${assignedTime}`
      ).trim();
      // Fast-first UX: insert immediately with deterministic fallback image,
      // then improve photo in background if Unsplash returns a better match.
      const fallbackPhoto =
        seededPicsumUrl(
          activityPrompt || `${input.title || input.name || "activity"} ${input.location || ""}`,
          1200,
          800
        ) ||
        getActivityImageUrl({
          title: input.title,
          name: input.name,
          location: input.location || selectedTrip?.title || activityPrompt,
          date: selectedDate,
          time: assignedTime,
        });
      let payload = {
        trip_id: selectedTripId,
        date: safeSelectedDate,
        time: assignedTime,
        title: String(input.title || input.name || "Activite"),
        name: String(input.title || input.name || "Activite"),
        description: String(input.description || ""),
        details: String(input.description || ""),
        notes: String(input.description || ""),
        cost: Number(input.cost || 0),
        location: String(input.location || ""),
        owner_id: userId,
        photo_url: String(fallbackPhoto || ""),
        image_url: String(fallbackPhoto || ""),
      };

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { data: inserted, error } = await supabase
          .from("activities")
          .insert(payload)
          .select("id")
          .limit(1);
        if (!error) {
          const insertedId = String(inserted?.[0]?.id || "");
          if (insertedId) activityInsertGraceRef.current.set(insertedId, Date.now());
          // Immediate refresh to avoid waiting for realtime sync.
          try {
            const { data: fresh, error: freshErr } = await supabase
              .from("activities")
              .select("*")
              .eq("trip_id", selectedTripId)
              .order("date", { ascending: true })
              .order("time", { ascending: true });
            if (!freshErr) replaceTripActivitiesInState(selectedTripId, fresh || []);
          } catch (_e) {
            // ignore refresh error
          }
              cacheActivityDescription(insertedId, input?.description || "");

          // Background upgrade: fetch better visual and patch only this row.
          if (insertedId) {
            (async () => {
              try {
                const betterPhoto = await fetchActivityImageFromUnsplash({
                  title: input.title,
                  name: input.name,
                  location: input.location,
                });
                if (!betterPhoto || String(betterPhoto) === String(fallbackPhoto)) return;
                await supabase
                  .from("activities")
                  .update({ photo_url: String(betterPhoto), image_url: String(betterPhoto) })
                  .eq("id", insertedId);
                // Silent local refresh for visual improvement.
                try {
                  const { data: fresh2, error: freshErr2 } = await supabase
                    .from("activities")
                    .select("*")
                    .eq("trip_id", selectedTripId)
                    .order("date", { ascending: true })
                    .order("time", { ascending: true });
                  if (!freshErr2) replaceTripActivitiesInState(selectedTripId, fresh2 || []);
                } catch (_refreshErr) {
                  // ignore refresh error
                }
              } catch (_bgErr) {
                // ignore background photo failures
              }
            })();
          }

          setNotice("");
          return;
        }

        const msg = String(error?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
    } catch (e) {
      setNotice(String(e?.message || "Erreur ajout activite"));
    }
  };

  const updateActivity = async (activity) => {
    if (!activity?.id) return;
    try {
      const desiredDescription = String(activity?.description || "");
      const refreshedPhoto =
        (await fetchActivityImageFromUnsplash({
          title: activity?.title,
          name: activity?.name,
          location: activity?.location,
        })) ||
        getActivityImageUrl(activity);
      let payload = {
        title: String(activity?.title || activity?.name || "Activite"),
        name: String(activity?.title || activity?.name || "Activite"),
        description: String(activity?.description || ""),
        details: String(activity?.description || ""),
        notes: String(activity?.description || ""),
        location: String(activity?.location || ""),
        cost: Number(activity?.cost || 0),
        time: String(activity?.time || ""),
        photo_url: String(refreshedPhoto || ""),
        image_url: String(refreshedPhoto || ""),
      };
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { error } = await supabase.from("activities").update(payload).eq("id", activity.id);
        if (!error) {
          cacheActivityDescription(activity.id, desiredDescription);
          setActivities((prev) =>
            (prev || []).map((a) =>
              String(a.id) === String(activity.id)
                ? normalizeActivity({ ...a, ...payload, description: desiredDescription })
                : a
            )
          );
          setNotice("");
          return;
        }
        const msg = String(error?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
    } catch (e) {
      setNotice(String(e?.message || "Erreur modification activite"));
    }
  };

  const deleteActivity = async (activity) => {
    if (!activity?.id) return;
    try {
      const { error } = await supabase.from("activities").delete().eq("id", activity.id);
      if (error) throw error;
      cacheActivityDescription(activity.id, "");
      setActivities((prev) => (prev || []).filter((a) => String(a.id) !== String(activity.id)));
      setNotice("");
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression activite"));
    }
  };

  const saveParticipants = async (list) => {
    if (!tricountTrip) return;
    try {
      const existingInvited = Array.isArray(tricountTrip?.invited_emails)
        ? tricountTrip.invited_emails.map((m) => String(m || "").trim().toLowerCase()).filter((m) => isValidEmail(m))
        : [];
      const existingInvitedSet = new Set(existingInvited);
      const rawList = Array.isArray(list) ? list : [];
      const newlyAddedInviteEmails = [...new Set(
        rawList
          .map((p) => String(p || "").trim().toLowerCase())
          .filter((p) => isValidEmail(p) && !existingInvitedSet.has(p))
      )];
      const nextInvitedEmails = [...new Set([...existingInvited, ...newlyAddedInviteEmails])];

      const participants = canonicalParticipants(
        list && list.length > 0 ? list : [],
        nextInvitedEmails
      );
      const { error } = await supabase
        .from("trips")
        .update({ participants, invited_emails: nextInvitedEmails })
        .eq("id", tricountTrip.id);
      if (error) throw error;
      setTrips((prev) =>
        (prev || []).map((trip) =>
          String(trip?.id) === String(tricountTrip?.id)
            ? normalizeTrip({ ...trip, participants, invited_emails: nextInvitedEmails })
            : trip
        )
      );
      if (newlyAddedInviteEmails.length > 0) {
        try {
          const inviteResp = await fetch(getInviteApiUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: newlyAddedInviteEmails,
              invite_base_url: window.location.origin,
              trip: {
                title: String(tricountTrip?.title || "Voyage"),
                startDate: formatDate(tricountTrip?.start_date),
                endDate: formatDate(tricountTrip?.end_date),
                link: String(tricountTrip?.fixed_url || ""),
              },
            }),
          });
          const inviteData = await inviteResp.json().catch(() => ({}));
          if (!inviteResp.ok) {
            throw new Error(String(inviteData?.error || "Erreur envoi invitations"));
          }
          setNotice(`${newlyAddedInviteEmails.length} participant(s) invite(s) par email.`);
        } catch (inviteErr) {
          setNotice(
            `Participants enregistres, mais envoi mail impossible: ${String(
              inviteErr?.message || "erreur inconnue"
            )}`
          );
        }
      } else {
        setNotice("");
      }
      setTricountTrip(null);
    } catch (e) {
      setNotice(String(e?.message || "Erreur participants"));
    }
  };

  const updateTrip = async (trip) => {
    const safeTitle = formatCityName(trip?.title || "");
    if (!safeTitle) {
      setNotice("Destination obligatoire.");
      return;
    }
    if (String(trip.start_date || "") > String(trip.end_date || "")) {
      setNotice("Date de debut invalide.");
      return;
    }
    try {
      const currentTrip = (trips || []).find((t) => String(t?.id) === String(trip?.id)) || trip || {};
      const previousInvitedEmails = Array.isArray(currentTrip?.invited_emails) ? currentTrip.invited_emails : [];
      const previousInvitedSet = new Set(previousInvitedEmails.map((m) => String(m || "").toLowerCase().trim()).filter(Boolean));

      let payload = {
        invited_emails:
          Array.isArray(trip?.invited_emails) && trip.invited_emails.length > 0
            ? trip.invited_emails
            : [],
        title: safeTitle,
        name: safeTitle,
        destination: safeTitle,
        start_date: String(trip.start_date || getTodayStr()),
        end_date: String(trip.end_date || getTodayStr()),
        participants: canonicalParticipants(
          Array.isArray(currentTrip?.participants) ? currentTrip.participants : [],
          Array.isArray(trip?.invited_emails) && trip.invited_emails.length > 0
            ? trip.invited_emails
            : []
        ),
        fixed_url: String(trip.fixed_url || ""),
      };
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const { error } = await supabase.from("trips").update(payload).eq("id", trip.id);
        if (!error) {
          const nextStart = toYMD(payload?.start_date || trip?.start_date, getTodayStr());
          const nextEnd = toYMD(payload?.end_date || trip?.end_date, nextStart);
          const nextTitle = String(payload?.title || trip?.title || "Voyage");
          const nextInvited =
            Array.isArray(payload?.invited_emails) && payload.invited_emails.length > 0
              ? payload.invited_emails
              : Array.isArray(trip?.invited_emails)
                ? trip.invited_emails
                : [];
          const nextFixedUrl = String(payload?.fixed_url || trip?.fixed_url || "");
          const nextParticipants =
            Array.isArray(payload?.participants) && payload.participants.length > 0
              ? payload.participants
              : canonicalParticipants(
                  Array.isArray(currentTrip?.participants) ? currentTrip.participants : [],
                  nextInvited
                );
          const newlyAddedInvites = nextInvited.filter((mail) => {
            const lower = String(mail || "").toLowerCase().trim();
            return !!lower && !previousInvitedSet.has(lower);
          });

          setTrips((prev) =>
            (prev || []).map((t) =>
              String(t.id) === String(trip.id)
                ? normalizeTrip({
                    ...t,
                    title: nextTitle,
                    name: nextTitle,
                    destination: nextTitle,
                    start_date: nextStart,
                    end_date: nextEnd,
                    participants: nextParticipants,
                    invited_emails: nextInvited,
                    fixed_url: nextFixedUrl,
                  })
                : t
            )
          );

          if (String(selectedTripId) === String(trip.id)) {
            setSelectedDate(nextStart);
            const d = new Date(`${nextStart}T00:00:00`);
            if (!Number.isNaN(d.getTime())) {
              setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
            }
          }

          if (newlyAddedInvites.length > 0) {
            try {
              const inviteResp = await fetch(getInviteApiUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: newlyAddedInvites,
                  invite_base_url: window.location.origin,
                  trip: {
                    title: nextTitle,
                    startDate: formatDate(nextStart),
                    endDate: formatDate(nextEnd),
                    link: nextFixedUrl,
                  },
                }),
              });
              const inviteData = await inviteResp.json().catch(() => ({}));
              if (inviteResp.status === 404) {
                throw new Error("API mail introuvable. Configure VITE_INVITE_API_BASE_URL ou utilise vercel dev.");
              }
              if (!inviteResp.ok) {
                throw new Error(String(inviteData?.error || "Erreur envoi invitations."));
              }
              setNotice(`Voyage modifie. ${newlyAddedInvites.length} invitation(s) envoyee(s).`);
            } catch (inviteErr) {
              setNotice(
                `Voyage modifie, mais l'envoi mail a echoue: ${String(
                  inviteErr?.message || "erreur inconnue"
                )}`
              );
            }
          } else {
            setNotice("");
          }

          setEditingTrip(null);
          return;
        }
        const msg = String(error?.message || "");
        const m1 = msg.match(/Could not find the '([^']+)' column/i);
        const m2 = msg.match(/column "([^"]+)" does not exist/i);
        const missing = (m1 && m1[1]) || (m2 && m2[1]) || "";
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
    } catch (e) {
      setNotice(String(e?.message || "Erreur modification voyage"));
    }
  };

  const deleteTrip = async (trip) => {
    if (deletingTrip) return;
    setTripToDelete(trip);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete || deletingTrip) return;
    const tid = tripToDelete.id;
    if (tid == null || tid === "") return;
    const idStr = String(tid);
    setDeletingTrip(true);
    try {
      // Enfants d’abord : sinon la FK peut faire échouer la suppression ou laisser l’UI attendre le realtime.
      const childTables = ["activity_votes", "chat_messages", "activities"];
      for (const table of childTables) {
        await supabase.from(table).delete().eq("trip_id", idStr);
      }
      const { error } = await supabase.from("trips").delete().eq("id", tid);
      if (error) throw error;

      setTrips((prev) => (prev || []).filter((t) => String(t?.id) !== idStr));
      setActivities((prev) => (prev || []).filter((a) => String(a?.trip_id) !== idStr));
      setChatMessagesByTrip((prev) => {
        const next = { ...(prev || {}) };
        delete next[idStr];
        return next;
      });
      if (String(chatTripId) === idStr) {
        setChatTripId("");
        setChatMessages([]);
        setActivityVotes([]);
        setChatActivities([]);
      }
      if (String(selectedTripId) === idStr) {
        setSelectedTripId("");
      }
      setEditingTrip((t) => (t && String(t.id) === idStr ? null : t));
      setShareTrip((t) => (t && String(t.id) === idStr ? null : t));
      setTricountTrip((t) => (t && String(t.id) === idStr ? null : t));

      setNotice("");
      setTripToDelete(null);
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression voyage"));
    } finally {
      setDeletingTrip(false);
    }
  };

  const tabs = [
    { id: "trips", icon: Briefcase, label: "Mes Voyages" },
    { id: "planner", icon: Calendar, label: "Calendrier" },
    { id: "destination", icon: Search, label: "Recherche" },
    { id: "budget", icon: DollarSign, label: "Budget" },
    { id: "chat", icon: MessageCircle, label: "Chat" },
  ];

  /** Efface seulement les notices ; la ville / la recherche reste (persistée + après refresh). */
  const resetDestinationView = () => {
    setNotice("");
  };

  /** Ouvre Recherche, ou revient à l’état initial (champ vide, pas de guide) si on reclique la loupe. */
  const openOrResetDestinationTab = () => {
    resetDestinationView();
    if (activeTab === "destination") {
      setDestinationInput("");
      setDestinationConfirmed("");
    }
    setActiveTab("destination");
  };

  /** Ne pas vider la destination confirmée pendant la saisie : le guide reste sur la ville actuelle jusqu’à une nouvelle confirmation. */
  const handleDestinationSearchChange = (v) => {
    setDestinationInput(v);
  };

  const handleConfirmDestination = (raw) => {
    const resolved = normalizeDestinationConfirm(raw);
    if (!resolved) return;
    setDestinationConfirmed(resolved);
    setDestinationInput(resolved);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: BG, color: TEXT }}>
        <div className="rounded-[3.5rem] bg-white/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
          Connexion...
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthView />;
  }

  return (
    <div
      className="min-h-screen pb-28"
      style={{
        color: TEXT,
        background:
          "radial-gradient(circle at 18% -8%, #ffffff 0%, #eef4fa 40%, #e3edf6 100%)",
      }}
    >
      <TopNav title={uiTitle} onMenu={() => setMenuOpen(true)} onAdd={() => setTripModalOpen(true)} />

      <main className="mx-auto mt-5 w-full max-w-6xl px-5">
        {notice ? (
          <div className="mb-4 rounded-[1.25rem] bg-white/90 px-4 py-3 text-sm shadow-[0_10px_28px_rgba(2,6,23,0.08)] ring-1 ring-slate-200/70">
            {String(notice)}
          </div>
        ) : null}

        {activeTab === "destination" ? (
          <DestinationGuideView
            searchInput={destinationInput}
            onSearchInputChange={handleDestinationSearchChange}
            confirmedDestination={destinationConfirmed}
            onConfirmDestination={handleConfirmDestination}
            onBack={() => setActiveTab("trips")}
            onCreateTrip={async (payload) => {
              const ok = await createTrip(payload);
              if (ok) setActiveTab("planner");
              return ok;
            }}
          />
        ) : null}

        {activeTab === "trips" ? (
          <AllTripsView
            trips={trips}
            onOpenTrip={(trip) => {
              openPlannerToday(trip);
            }}
            onShareTrip={setShareTrip}
            onEditTrip={setEditingTrip}
            onDeleteTrip={deleteTrip}
          />
        ) : null}

        {activeTab === "planner" ? (
          <div className="space-y-4">
            <div className="rounded-[2rem] bg-white/92 p-5 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
              {selectedTrip ? (
                <div className="relative overflow-hidden rounded-2xl border border-white/50 px-4 py-3 shadow-[0_12px_28px_rgba(2,6,23,0.12)]">
                  <div
                    className="pointer-events-none absolute inset-[-8px] scale-[1.04] overflow-hidden"
                    style={{ filter: "blur(10px) saturate(1.15) brightness(0.94)" }}
                  >
                    <CityImage title={String(selectedTrip?.title || "voyage")} />
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
                    }}
                  />
                  <div
                    className="pointer-events-none absolute inset-0 backdrop-blur-[2.5px]"
                    style={{ backgroundColor: "rgba(2,6,23,0.11)" }}
                  />
                  <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.34em] text-slate-200">Voyage actif</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white" style={{ backgroundColor: ACCENT }}>
                        <MapPin size={10} className="mr-1" />
                        Destination
                      </span>
                    </div>
                    <h3 className="mt-2 text-2xl font-extrabold uppercase leading-none tracking-[0.02em] text-white">
                      {String(selectedTrip.title || "Voyage")}
                    </h3>
                    <p className="mt-1 text-xs text-white/85">
                      {formatDate(selectedTrip.start_date)} - {formatDate(selectedTrip.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center -space-x-2">
                      {(Array.isArray(selectedTrip?.invited_emails) ? selectedTrip.invited_emails : []).slice(0, 5).map((mail) => (
                        <div
                          key={String(mail)}
                          title={String(mail)}
                          className="h-9 w-9 overflow-hidden rounded-full bg-white/85 ring-2 ring-white/85 shadow-sm"
                        >
                          <img
                            src={buildParticipantAvatarUrl(mail)}
                            alt={String(mail)}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setPlannerInviteOpen(true)}
                      className="rounded-full border border-white/55 bg-white/85 p-2 text-slate-700 hover:bg-white"
                      title="Inviter par email"
                    >
                      <Mail size={16} />
                    </button>
                  </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Aucun voyage selectionne.</p>
              )}
            </div>
            <PlannerView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectDate={handlePlannerDateSelect}
              selectedTrip={selectedTrip}
              trips={trips}
              activities={activities}
              onAddActivity={addActivity}
              onUpdateActivity={updateActivity}
              onDeleteActivity={deleteActivity}
              monthCursor={monthCursor}
              setMonthCursor={setMonthCursor}
            />
          </div>
        ) : null}

        {activeTab === "budget" ? (
          <section>
            <h2 className="mb-4 text-xs uppercase tracking-[0.4em] text-slate-500">Budget</h2>
            <div className="space-y-7">
              {(() => {
                const sections = classifyTrips(trips || []);
                const renderBudgetTrip = (trip) => (
                  <TripExpenseDetail
                    key={String(trip.id)}
                    trip={trip}
                    activities={(activities || []).filter((a) => String(a.trip_id) === String(trip.id))}
                    onOpenTricount={setTricountTrip}
                    onUpdateExpense={updateActivity}
                    onDeleteExpense={deleteActivity}
                  />
                );
                return (
                  <>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-emerald-200/70 bg-emerald-50/45 p-4 shadow-[0_10px_26px_rgba(16,185,129,0.08)]">
                        <h3 className="mb-3 text-xs uppercase tracking-[0.3em] text-emerald-700">Maintenant</h3>
                        <div className="grid gap-4">
                        {sections.now.length > 0
                          ? sections.now.map(renderBudgetTrip)
                          : <p className="text-sm text-slate-500">Aucun voyage en cours.</p>}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-sky-200/70 bg-sky-50/45 p-4 shadow-[0_10px_26px_rgba(14,165,233,0.08)]">
                        <button
                          onClick={() => setBudgetUpcomingOpen((v) => !v)}
                          className="mb-3 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
                        >
                          <h3 className="text-xs uppercase tracking-[0.3em] text-sky-700">Prochainement</h3>
                          {budgetUpcomingOpen ? (
                            <ChevronDown size={16} className="text-sky-700" />
                          ) : (
                            <ChevronRight size={16} className="text-sky-700" />
                          )}
                        </button>
                        {budgetUpcomingOpen ? (
                          <div className="grid gap-4">
                            {sections.upcoming.length > 0
                              ? sections.upcoming.map(renderBudgetTrip)
                              : <p className="text-sm text-slate-500">Aucun voyage a venir.</p>}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-slate-200 bg-slate-50/55 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <button
                          onClick={() => setBudgetMemoriesOpen((v) => !v)}
                          className="mb-3 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
                        >
                          <h3 className="text-xs uppercase tracking-[0.3em] text-slate-600">Souvenirs</h3>
                          {budgetMemoriesOpen ? (
                            <ChevronDown size={16} className="text-slate-600" />
                          ) : (
                            <ChevronRight size={16} className="text-slate-600" />
                          )}
                        </button>
                        {budgetMemoriesOpen ? (
                          <div className="grid gap-4">
                            {sections.memories.length > 0
                              ? sections.memories.map(renderBudgetTrip)
                              : <p className="text-sm text-slate-500">Aucun souvenir.</p>}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </section>
        ) : null}

        {activeTab === "chat" ? (
          <ChatHubView
            trips={trips}
            activities={chatActivities}
            session={session}
            chatTripId={chatTripId}
            setChatTripId={setChatTripId}
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendMessage={sendChatMessage}
            votes={activityVotes}
            onVote={voteActivity}
          />
        ) : null}
      </main>

      <nav className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-[2.2rem] bg-white/92 p-2 shadow-[0_18px_44px_rgba(2,6,23,0.12)] backdrop-blur-xl ring-1 ring-slate-200/70">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "planner") {
                    openPlannerToday();
                    return;
                  }
                  if (t.id === "destination") {
                    openOrResetDestinationTab();
                    return;
                  }
                  setActiveTab(t.id);
                }}
                className={`flex items-center justify-center rounded-[2rem] px-2 py-3 text-xs ${
                  active ? "text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
                style={active ? { backgroundColor: ACCENT } : undefined}
                title={String(t.label)}
                aria-label={String(t.label)}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>
      </nav>

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userEmail={session?.user?.email || ""}
        activeTab={activeTab}
        onSwitchTab={(tabId) => {
          setMenuOpen(false);
          if (tabId === "destination") {
            openOrResetDestinationTab();
            return;
          }
          if (tabId === "planner") {
            openPlannerToday();
            return;
          }
          setActiveTab(tabId);
        }}
        onOpenAccount={() => {
          setMenuOpen(false);
          setAccountOpen(true);
        }}
        onSignOut={signOut}
      />
      <TripFormModal open={tripModalOpen} onClose={() => setTripModalOpen(false)} onCreate={createTrip} />
      <EditTripModal
        open={!!editingTrip}
        onClose={() => setEditingTrip(null)}
        trip={editingTrip}
        onSave={updateTrip}
      />
      <InviteEmailsModal
        open={plannerInviteOpen && !!selectedTrip}
        onClose={() => setPlannerInviteOpen(false)}
        title="Inviter des participants"
        initialEmails={selectedTrip?.invited_emails || []}
        onSave={async (emails) => {
          if (!selectedTrip) {
            setPlannerInviteOpen(false);
            return;
          }
          await updateTrip({
            ...selectedTrip,
            invited_emails: Array.isArray(emails) ? emails : [],
          });
          setPlannerInviteOpen(false);
        }}
      />
      <ShareModal open={!!shareTrip} onClose={() => setShareTrip(null)} trip={shareTrip} />
      <TricountModal open={!!tricountTrip} onClose={() => setTricountTrip(null)} trip={tricountTrip} onSave={saveParticipants} />
      <ConfirmDeleteModal
        open={!!tripToDelete}
        trip={tripToDelete}
        deleting={deletingTrip}
        onCancel={() => {
          if (!deletingTrip) setTripToDelete(null);
        }}
        onConfirm={confirmDeleteTrip}
      />
      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        session={session}
        onDeleteAccount={deleteMyAccount}
        onUpdateProfile={updateMyAccount}
        deleting={deletingAccount}
        saving={savingAccount}
      />
    </div>
  );
}
