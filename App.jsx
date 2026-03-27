import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

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
  "Paris", "Lyon", "Marseille", "Nice", "Bordeaux", "Toulouse", "Lille", "Nantes",
  "Tokyo", "Kyoto", "Osaka", "Seoul", "Bangkok", "Singapore", "Bali", "Jakarta", "Beijing", "Shanghai",
  "New York", "Los Angeles", "San Francisco", "Miami", "Chicago", "Toronto", "Vancouver",
  "London", "Barcelona", "Madrid", "Rome", "Milan", "Venise", "Berlin", "Amsterdam",
  "Bruxelles", "Lisbonne", "Porto", "Prague", "Vienne", "Budapest", "Athènes", "Istanbul",
  "Dubai", "Doha", "Abu Dhabi", "Le Caire", "Marrakech", "Tunis", "Alger",
  "Sydney", "Melbourne", "Auckland", "Cape Town", "Rio de Janeiro", "Sao Paulo",
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

const BG = "#F3F5F7";
const TEXT = "#0B1220";
const ACCENT = "#0F172A";
const slots = ["09:30", "14:00", "18:30", "21:00"];
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

function buildCityImageUrl(prompt) {
  const q = String(prompt || "").trim();
  if (!q) return "";
  // Deterministic fallback based on city landmarks.
  const sig = encodeURIComponent(String(q).toLowerCase());
  const landmarkQuery = encodeURIComponent(`${q} landmarks skyline cityscape`);
  return `https://source.unsplash.com/1400x900/?${landmarkQuery}&sig=${sig}`;
}

function getCityImageCacheKey(cityInput) {
  return `v4:${String(extractCityPrompt(cityInput) || cityInput || "")
    .trim()
    .toLowerCase()}`;
}

function getCityImageProfile(cityInput) {
  const city = String(extractCityPrompt(cityInput) || cityInput || "").trim();
  const norm = normalizeTextForSearch(city);
  const profileMap = {
    paris: {
      query: "Paris Eiffel Tower travel golden hour sunset",
      preferredKeywords: ["eiffel", "sunset", "golden", "night", "landmark", "paris"],
      avoidKeywords: ["aerial", "drone", "gray", "fog", "industrial"],
    },
    "new york": {
      query: "New York skyline Manhattan sunset travel",
      preferredKeywords: ["manhattan", "sunset", "skyline", "bridge", "night"],
      avoidKeywords: ["fog", "industrial"],
    },
    london: {
      query: "London Tower Bridge Big Ben sunset travel",
      preferredKeywords: ["tower bridge", "big ben", "sunset", "landmark"],
      avoidKeywords: ["industrial"],
    },
    tokyo: {
      query: "Tokyo city lights Shibuya night travel",
      preferredKeywords: ["night", "lights", "tokyo tower", "shibuya"],
      avoidKeywords: ["industrial"],
    },
    venise: {
      query: "Venice canals gondola sunset romantic travel",
      preferredKeywords: ["canal", "gondola", "sunset", "romantic"],
      avoidKeywords: ["industrial"],
    },
    nice: {
      query: "Nice French Riviera promenade des anglais sunset travel photography",
      preferredKeywords: ["riviera", "promenade", "mediterranean", "sunset", "coast"],
      avoidKeywords: ["industrial", "fog", "gray"],
    },
    monaco: {
      query: "Monaco Monte Carlo harbor luxury travel photography golden hour",
      preferredKeywords: ["harbor", "monte carlo", "luxury", "sunset", "coast"],
      avoidKeywords: ["industrial", "fog", "gray"],
    },
    lille: {
      query: "Lille old town grand place france travel photography",
      preferredKeywords: ["old town", "grand place", "street", "architecture", "lights"],
      avoidKeywords: ["industrial", "warehouse"],
    },
    paphos: {
      query: "Paphos Cyprus coast harbor travel photography turquoise water",
      preferredKeywords: ["cyprus", "coast", "harbor", "turquoise", "beach"],
      avoidKeywords: ["industrial", "fog", "gray"],
    },
  };
  if (profileMap[norm]) return profileMap[norm];
  return {
    query: `${city} travel destination landmarks golden hour`,
    preferredKeywords: ["sunset", "golden", "landmark", "travel", String(norm || "")],
    avoidKeywords: ["industrial", "gray", "fog"],
  };
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

const WORLD_MAP_BASE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/9/9c/BlankMap-World-Continents-Coloured.PNG";

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

async function fetchDestinationGuide(city) {
  const safeCity = resolveCanonicalCity(city);
  if (!safeCity) return null;

  const fallbackImage = buildCityImageUrl(safeCity);
  let summaryText = "";
  let imageUrl = fallbackImage;
  let landscapeImageUrl = fallbackImage;
  let places = [];
  let latitude = null;
  let longitude = null;

  // 1) Summary + thumbnail from Wikipedia REST
  try {
    const summaryResp = await fetch(
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(safeCity)}`
    );
    if (summaryResp.ok) {
      const summaryJson = await summaryResp.json();
      summaryText = String(summaryJson?.extract || "");
      imageUrl = String(summaryJson?.thumbnail?.source || fallbackImage);
      latitude = Number(summaryJson?.coordinates?.lat);
      longitude = Number(summaryJson?.coordinates?.lon);
    }
  } catch (_e) {
    // ignore, fallback below
  }

  // 2) Suggested "incontournables" from Wikipedia search results
  try {
    const searchResp = await fetch(
      `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${safeCity} monuments incontournables`
      )}&format=json&origin=*`
    );
    if (searchResp.ok) {
      const searchJson = await searchResp.json();
      const hits = Array.isArray(searchJson?.query?.search) ? searchJson.query.search : [];
      places = hits.slice(0, 5).map((h) => String(h?.title || "")).filter(Boolean);
    }
  } catch (_e) {
    // ignore, fallback list used below
  }

  // 3) Persisted city image: cache first, fetch once if missing.
  try {
    const cachedCityImage = await getCachedCityImage(safeCity);
    if (cachedCityImage) {
      landscapeImageUrl = cachedCityImage;
      imageUrl = cachedCityImage;
    } else {
      const unsplashLandscape = await fetchCityImageFromUnsplash(safeCity);
      if (unsplashLandscape) {
        landscapeImageUrl = unsplashLandscape;
        imageUrl = unsplashLandscape;
        await persistCityImage(safeCity, unsplashLandscape);
      }
    }
  } catch (_e) {
    // ignore and keep current image
  }

  // 4) Coordinates fallback using OSM Nominatim if Wikipedia has no coordinates
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    try {
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(safeCity)}`
      );
      if (geoResp.ok) {
        const geoJson = await geoResp.json();
        const first = Array.isArray(geoJson) && geoJson.length > 0 ? geoJson[0] : null;
        const parsedLat = Number(first?.lat);
        const parsedLon = Number(first?.lon);
        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
          latitude = parsedLat;
          longitude = parsedLon;
        }
      }
    } catch (_e) {
      // ignore, map will be hidden
    }
  }

  const tips = buildTravelTips(safeCity);
  const suggestedActivities = buildSuggestedActivitiesForCity(safeCity);

  return {
    city: safeCity,
    description:
      summaryText ||
      `${safeCity} est une destination populaire avec une forte identite culturelle, de nombreux quartiers a explorer et une scene locale dynamique.`,
    places:
      places.length > 0
        ? places
        : [`Centre-ville de ${safeCity}`, `Quartier historique`, "Musee principal", "Point de vue iconique"],
    suggestedActivities,
    tips,
    imageUrl,
    landscapeImageUrl,
    coordinates:
      Number.isFinite(latitude) && Number.isFinite(longitude)
        ? { lat: latitude, lon: longitude }
        : null,
  };
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

async function fetchCityImageFromUnsplash(prompt) {
  const q = String(prompt || "").trim();
  if (!q) return "";
  const profile = getCityImageProfile(q);
  const primary = await fetchUnsplashImageByQuery(profile.query, {
    pickFirst: true,
    preferredKeywords: profile.preferredKeywords,
    avoidKeywords: profile.avoidKeywords,
  });
  if (primary) return primary;
  const secondary = await fetchUnsplashImageByQuery(`${q} postcard travel photography cityscape`, {
    pickFirst: true,
    preferredKeywords: ["postcard", "travel", "sunset", "landmark", "cityscape", "coast"],
    avoidKeywords: ["industrial", "fog", "gray"],
  });
  if (secondary) return secondary;
  return fetchUnsplashImageByQuery(`${q} best travel destination photo`, {
    pickFirst: true,
    preferredKeywords: ["travel", "beautiful", "landmark", "sunset"],
    avoidKeywords: ["industrial", "fog", "gray"],
  });
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

function normalizeActivity(activity) {
  const rawTime = String(activity?.time || "");
  const time = rawTime.length >= 5 ? rawTime.slice(0, 5) : rawTime;
  const normalizedDate = toYMD(activity?.date, "");
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

  // Backward-compatible mode: some schemas may not have owner/invited columns yet.
  // In that case, do not hide rows client-side.
  if (!hasOwnerField && !hasInvitedField) return true;

  // Legacy rows without ownership metadata should stay visible for the signed-in user.
  if (hasOwnerField && !ownerId && (!hasInvitedField || invited.length === 0)) return true;

  if (!userId && !userEmail) return false;
  return ownerId === userId || (userEmail && invited.includes(userEmail));
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

// Atomes UI
function CityImage({ title }) {
  const prompt = resolveCanonicalCity(extractCityPrompt(title));
  const safeTitle = String(prompt || title || "voyage");
  const cacheKey = getCityImageCacheKey(prompt || safeTitle);
  const [resolvedUrl, setResolvedUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      // Deterministic city fallback that still looks travel-related.
      const fallbackSrc = buildCityImageUrl(safeTitle);
      const localStorageKey = `tp_city_img_${cacheKey}`;

      if (!prompt) {
        if (!cancelled) setResolvedUrl(fallbackSrc);
        return;
      }

      // 1) Fast path in-memory cache (stable while app runs)
      if (cityImageMemoryCache[cacheKey]) {
        if (!cancelled) setResolvedUrl(String(cityImageMemoryCache[cacheKey]));
        return;
      }

      // 2) Persistent browser cache (stable across tab switches/reloads)
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
        // Try to use cached URL in Supabase.
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

        // Cache miss: prefer Unsplash Search API (true city match), then deterministic fallback.
        const fromUnsplash = await fetchCityImageFromUnsplash(prompt);
        const url = fromUnsplash || fallbackSrc;
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
          // Ignore insertion errors (RLS/schema duplicates).
          void insErr;
        } catch (_e) {
          // Ignore cache write failures
        }
      } catch (_e) {
        if (!cancelled) setResolvedUrl(fallbackSrc);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTitle, prompt]);

  return (
    <div className="h-full w-full overflow-hidden rounded-[3rem]">
      <img
        src={
          resolvedUrl || buildCityImageUrl(safeTitle)
        }
        alt={safeTitle}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.src = buildCityImageUrl("travel destination");
        }}
      />
    </div>
  );
}

function TopNav({ onMenu, onAdd, title }) {
  return (
    <header className="sticky top-0 z-30 px-5 pt-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between rounded-[2.25rem] bg-white/88 px-6 py-4 shadow-[0_16px_40px_rgba(2,6,23,0.08)] backdrop-blur-xl ring-1 ring-slate-200/70">
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
    <div className="min-h-screen px-5 py-8" style={{ backgroundColor: BG, color: TEXT }}>
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
            onClick={() =>
              onCreate({
                title,
                start_date: startDate,
                end_date: endDate,
                invited_emails: invitedEmails,
              })
            }
            className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            Creer
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

function ConfirmDeleteModal({ open, trip, onCancel, onConfirm }) {
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
            onClick={onCancel}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="rounded-2xl px-4 py-3 text-sm text-white"
            style={{ backgroundColor: "#e11d48" }}
          >
            Supprimer
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

function CitySearchBox({ value, onChange, onPick, placeholder, showSuggestions = true }) {
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const fallbackSuggestions = useMemo(() => getCitySuggestions(value), [value]);
  const suggestions = useMemo(
    () => (remoteSuggestions.length > 0 ? remoteSuggestions : fallbackSuggestions),
    [remoteSuggestions, fallbackSuggestions]
  );
  const show = showSuggestions && focused && suggestions.length > 0;
  const dropdownReserve = show ? Math.min(suggestions.length, 6) * 42 + 16 : 0;

  useEffect(() => {
    const q = normalizeCityInput(value);
    if (!showSuggestions || q.length < 2) {
      setRemoteSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSuggestLoading(true);
      const remote = await fetchWorldwideCitySuggestions(q, 8);
      if (!cancelled) {
        setRemoteSuggestions(remote);
        setSuggestLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, showSuggestions]);

  return (
    <div className="relative" style={dropdownReserve ? { marginBottom: dropdownReserve } : undefined}>
      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
        <Search size={16} className="text-slate-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>
      {show ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-64 overflow-auto rounded-2xl bg-white/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl ring-1 ring-slate-200/80">
          {suggestLoading ? <p className="px-3 py-2 text-xs text-slate-500">Recherche des villes...</p> : null}
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

function WorldMapMarker({ coordinates, city }) {
  const [imageError, setImageError] = useState(false);
  const lat = Number(coordinates?.lat);
  const lon = Number(coordinates?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const leftPct = ((lon + 180) / 360) * 100;
  const topPct = ((90 - lat) / 180) * 100;

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-full ring-1 ring-slate-200 shadow-[inset_0_-18px_30px_rgba(15,23,42,0.16)]">
      {!imageError ? (
        <img
          src={WORLD_MAP_BASE_URL}
          alt={`Globe ${String(city || "")}`}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="h-full w-full bg-[linear-gradient(180deg,#dbeafe_0%,#f8fafc_100%)]" />
      )}
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.25)]"
        style={{ left: `${leftPct}%`, top: `${topPct}%` }}
        title={`${String(city || "Ville")} (${lat.toFixed(4)}, ${lon.toFixed(4)})`}
      />
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),rgba(255,255,255,0)_40%)]" />
    </div>
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

function DestinationGuideView({ query, onQuery, onPickDestination, onCreateTrip, onBack }) {
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [guide, setGuide] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  useEffect(() => {
    const city = normalizeCityInput(query);
    if (city.length < 2) {
      setGuide(null);
      setGuideError("");
      setGuideLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setGuideLoading(true);
      setGuideError("");
      try {
        const result = await fetchDestinationGuide(city);
        if (!cancelled) setGuide(result);
      } catch (_e) {
        if (!cancelled) {
          setGuide(null);
          setGuideError("Impossible de charger le guide destination.");
        }
      } finally {
        if (!cancelled) setGuideLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Guide destination</h2>
      </div>

      <div className="rounded-[2.2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
        <CitySearchBox
          value={query}
          onChange={onQuery}
          onPick={onPickDestination}
          placeholder="Rechercher une destination..."
        />
      </div>

      <div className="overflow-hidden rounded-[2.2rem] bg-white/92 shadow-[0_16px_40px_rgba(2,6,23,0.08)] ring-1 ring-slate-200/70">
        {guideLoading ? (
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
        ) : guide ? (
          <>
            <div className="relative p-4">
              <div className="h-56 w-full overflow-hidden rounded-[2.5rem]">
                <img
                  src={String(guide.landscapeImageUrl || guide.imageUrl || buildCityImageUrl(guide.city))}
                  alt={String(guide.city)}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = seededPicsumUrl(guide.city, 1200, 800);
                  }}
                />
              </div>
              {guide.coordinates ? (
                <div className="absolute right-7 top-1/2 w-24 -translate-y-1/2 md:w-32">
                  <div className="relative">
                    <WorldMapMarker coordinates={guide.coordinates} city={guide.city} />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-5 p-6">
              <div>
                <h3 className="text-sm uppercase tracking-[0.4em] text-slate-500">Destination</h3>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{String(guide.city)}</p>
                <p className="mt-2 text-sm text-slate-700">{String(guide.description)}</p>
                {guide.coordinates ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Position: {Number(guide.coordinates.lat).toFixed(4)}, {Number(guide.coordinates.lon).toFixed(4)}
                  </p>
                ) : null}
                  <button
                    onClick={() => {
                      setStartDate(getTodayStr());
                      setEndDate(getTodayStr());
                      setAddModalOpen(true);
                    }}
                    className={`mt-4 rounded-2xl px-4 py-2 text-sm text-white ${GLASS_BUTTON_CLASS}`}
                    style={GLASS_ACCENT_STYLE}
                  >
                    Ajouter aux voyages
                  </button>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-[0.4em] text-slate-500">Lieux incontournables</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(guide.places || []).map((p) => (
                    <span key={p} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {String(p)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-xs uppercase tracking-[0.4em] text-slate-500">Conseils experts - A faire</h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {(guide.tips?.do || []).map((tip) => (
                      <li key={tip}>- {String(tip)}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-[0.4em] text-slate-500">A eviter</h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {(guide.tips?.dont || []).map((tip) => (
                      <li key={tip}>- {String(tip)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-[0.4em] text-slate-500">Activites proposees</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(guide.suggestedActivities || []).map((a) => (
                    <span key={a} className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">
                      {String(a)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : <div className="h-56 sm:h-72" />}
      </div>

      {addModalOpen && guide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[3.5rem] bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">
                Ajouter {String(guide.city)}
              </h2>
              <button
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
            <button
              onClick={async () => {
                const ok = await onCreateTrip({
                  title: String(guide.city || ""),
                  start_date: startDate,
                  end_date: endDate,
                });
                if (ok) setAddModalOpen(false);
              }}
              className={`mt-4 w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
              style={GLASS_ACCENT_STYLE}
            >
              Creer ce voyage
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

  const selectedTripIdSafe = String(selectedTrip?.id || "");
  const dayActivities = (activities || [])
    .filter(
      (a) =>
        String(a?.trip_id || "") === selectedTripIdSafe &&
        toYMD(a?.date_key || a?.date, "") === selectedDateKey
    )
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  const activityCountByDay = useMemo(() => {
    const map = {};
    (activities || []).forEach((a) => {
      if (String(a?.trip_id || "") !== selectedTripIdSafe) return;
      const key = toYMD(a?.date_key || a?.date, "");
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
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
        </div>

        <div className="order-2 px-1 py-1 lg:order-2">
          <h3 className="mb-3 text-xs uppercase tracking-[0.4em] text-slate-500">{selectedDate}</h3>
          <button
            onClick={() => {
              const index = (activities || []).filter((a) => String(a.date) === selectedDate).length;
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
            )) : <p className="text-sm text-slate-500">Aucune activite.</p>}
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

// Main App
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("trips");
  const [menuOpen, setMenuOpen] = useState(false);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [shareTrip, setShareTrip] = useState(null);
  const [tricountTrip, setTricountTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripToDelete, setTripToDelete] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

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

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setMenuOpen(false);
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
        const selects = ["*", "id,title,start_date", "id,title", "id"];
        let data = null;
        let lastError = null;

        for (let i = 0; i < selects.length; i += 1) {
          const { data: d, error } = await supabase.from("trips").select(selects[i]);
          if (!error) {
            data = d;
            lastError = null;
            break;
          }
          lastError = error;
        }

        if (lastError) throw lastError;

        const normalized = (data || []).map(normalizeTrip);
        const visibleTrips = normalized.filter((trip) => userCanSeeTrip(trip, session));
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
  }, [selectedTripId, session]);

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
        setActivities((data || []).map(normalizeActivity));
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
    if (!selectedTrip) return;
    const tripStart = toYMD(selectedTrip.start_date, getTodayStr());
    const targetDate = tripStart;
    setSelectedDate(targetDate);
    const d = new Date(`${targetDate}T00:00:00`);
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
        const { error } = await supabase.from("trips").insert(body);
        if (!error) {
          setTripModalOpen(false);
          // Pas de message "success" : on laisse l'UI se mettre à jour via le fetch/les subscriptions.
          setNotice("");
          // Force immediate UI refresh (subscription can lag).
          try {
            const selects = ["*", "id,title,start_date", "id,title", "id"];
            let data = null;
            let lastError = null;

            for (let i = 0; i < selects.length; i += 1) {
              const { data: d, error: selErr } = await supabase
                .from("trips")
                .select(selects[i]);
              if (!selErr) {
                data = d;
                lastError = null;
                break;
              }
              lastError = selErr;
            }

            if (lastError) throw lastError;

            const normalized = (data || []).map(normalizeTrip);
            setTrips(normalized);
            // Select the newly created trip so the Calendar marks appear immediately.
            try {
              const wantedStart = toYMD(body.start_date, "");
              const wantedEnd = toYMD(body.end_date, "");
              const wantedTitle = String(body.destination || body.title || safeTitle || "");
              const match =
                normalized.find((t) => {
                  const tStart = String(t.start_date || "");
                  const tEnd = String(t.end_date || "");
                  const tTitle = String(t.title || "");
                  return (
                    tStart === wantedStart &&
                    tEnd === wantedEnd &&
                    (tTitle === wantedTitle || tTitle.toLowerCase() === wantedTitle.toLowerCase())
                  );
                }) ||
                normalized.find((t) => String(t.start_date || "") === wantedStart && String(t.end_date || "") === wantedEnd) ||
                normalized[0];

              if (match?.id) setSelectedTripId(String(match.id));
            } catch (_matchErr) {
              if (normalized.length > 0) setSelectedTripId(String(normalized[0].id));
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
      const index = (activities || []).filter((a) => toYMD(a?.date_key || a?.date, "") === safeSelectedDate).length;
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
    setTripToDelete(trip);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;
    try {
      const { error } = await supabase.from("trips").delete().eq("id", tripToDelete.id);
      if (error) throw error;
      setNotice("");
      if (String(selectedTripId) === String(tripToDelete.id)) {
        setSelectedTripId("");
      }
      setTripToDelete(null);
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression voyage"));
    }
  };

  const tabs = [
    { id: "trips", icon: Briefcase, label: "Mes Voyages" },
    { id: "planner", icon: Calendar, label: "Calendrier" },
    { id: "destination", icon: Search, label: "Recherche" },
    { id: "budget", icon: DollarSign, label: "Budget" },
    { id: "chat", icon: MessageCircle, label: "Chat" },
  ];

  const resetDestinationView = () => {
    setQuery("");
    setNotice("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ backgroundColor: BG, color: TEXT }}>
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
          "radial-gradient(circle at 20% -10%, #ffffff 0%, #f3f5f7 45%, #edf1f4 100%)",
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
            query={query}
            onQuery={(value) => setQuery(value)}
            onPickDestination={(city) => setQuery(city)}
            onBack={() => setActiveTab("trips")}
            onCreateTrip={async (payload) => {
              const ok = await createTrip(payload);
              if (ok) setActiveTab("trips");
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
                    resetDestinationView();
                    setActiveTab("destination");
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
            resetDestinationView();
            setActiveTab("destination");
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
        onCancel={() => setTripToDelete(null)}
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
