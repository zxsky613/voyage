import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Sparkles,
  Lightbulb,
  Lock,
  Wallet,
  Receipt,
  ArrowRight,
  ArrowLeft,
  ThumbsUp,
} from "lucide-react";
import { resolveTravelTips } from "./travelTipsData.js";
import {
  fetchGeminiTripSuggestions,
  fetchGeminiSuggestedActivities,
  fetchGeminiItinerary,
  fetchGroqItinerary,
  fetchGroqTips,
} from "./geminiClient.js";
import { sanitizeMustSeePlaces } from "./placeGuards.js";
import { ICONIC_PLACES_CANONICAL } from "./iconicPlacesData.js";
import { computeTricountBalances, simplifyTricountDebts } from "./tricountLogic.js";
import {
  buildCityDronePromptFR,
  buildCityUnsplashStockQuery,
  normalizeCityDroneKey,
} from "./cityDroneImagePrompt.js";
import { WIKIMEDIA_CURATED_CITY_HEROES } from "./cityWikimediaHeroes.js";
import { useI18n, LanguageSelector, LanguageFab } from "./i18n/I18nContext.jsx";
import { getAppDateLocale } from "./i18n/dateLocale.js";
import { catalogCityHitsForLocalizedQuery, displayCityForLocale } from "./i18n/cityDisplay.js";
import { activityTitleSaveValue, displayActivityTitleForLocale } from "./i18n/activityDisplay.js";
import {
  OnboardingTour,
  hasSeenOnboardingForUser,
  markSignupExpectsOnboarding,
  consumePendingOnboardingIntent,
  clearSignupOnboardingMarkers,
} from "./OnboardingTour.jsx";
import { TripDateRangeField } from "./TripDateRangeField.jsx";

/** Si true : seuls les abonnés Premium (metadata) ou le bypass créateur peuvent générer un programme ; les autres voient une modale au clic. Côté serveur : GEMINI_ITINERARY_PREMIUM_ONLY + GEMINI_CREATOR_ITINERARY. */
const VITE_ITINERARY_PREMIUM_ONLY =
  import.meta.env.VITE_ITINERARY_PREMIUM_ONLY === "true" ||
  import.meta.env.VITE_ITINERARY_PREMIUM_ONLY === "1";
const VITE_CREATOR_ITINERARY =
  import.meta.env.VITE_CREATOR_ITINERARY === "true" ||
  import.meta.env.VITE_CREATOR_ITINERARY === "1";

function isPremiumSubscriber(session) {
  const u = session?.user;
  if (!u) return false;
  const m = u.user_metadata || {};
  if (m.premium === true || m.premium === "true" || m.premium === 1) return true;
  const tier = String(m.subscription_tier || m.plan || m.subscription || "").toLowerCase();
  if (tier === "premium" || tier === "pro") return true;
  const app = u.app_metadata || {};
  if (app.premium === true || app.premium === "true") return true;
  return false;
}

/** Accès à « Générer un programme » : ouvert à tous si pas de gate env ; sinon créateur (dev) ou abonné premium. */
function userCanUseItineraryGeneration(session) {
  if (!VITE_ITINERARY_PREMIUM_ONLY) return true;
  if (VITE_CREATOR_ITINERARY) return true;
  return isPremiumSubscriber(session);
}

/** Quand true : encarts quota Gemini, .env, détails techniques. À activer seulement dans .env.local du développeur — pas pour les utilisateurs finaux. */
const SHOW_GEMINI_DEV_UI =
  import.meta.env.VITE_SHOW_GEMINI_DEV_ERRORS === "true" ||
  import.meta.env.VITE_SHOW_GEMINI_DEV_ERRORS === "1";

/**
 * Si true : appelle Gemini pour lieux / conseils / activités sur l’écran recherche destination (coûte des tokens à chaque ville).
 * Par défaut : false — le guide utilise Wikipédia + données locales (répertoire emblématique, activités & conseils génériques).
 * Le programme jour par jour (« Générer un programme ») reste séparé et n’est pas affecté.
 */
const GEMINI_DESTINATION_ENRICH =
  import.meta.env.VITE_GEMINI_DESTINATION_ENRICH === "true" ||
  import.meta.env.VITE_GEMINI_DESTINATION_ENRICH === "1";

/** Si false : pas d’appel Gemini pour les seules activités proposées (économie max ; lieux/conseils déjà locaux). */
const GEMINI_SUGGESTED_ACTIVITIES =
  import.meta.env.VITE_GEMINI_SUGGESTED_ACTIVITIES === "true" ||
  import.meta.env.VITE_GEMINI_SUGGESTED_ACTIVITIES === "1";

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

/** Date locale du jour (AAAA-MM-JJ). Toujours recalculée — évite une date « figée » au chargement du bundle. */
function getTodayStr() {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const da = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function formatDate(value) {
  const s = String(value || "");
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(getAppDateLocale(), { day: "2-digit", month: "short", year: "numeric" });
}

function getInviteApiUrl() {
  const base = String(import.meta.env.VITE_INVITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/api/send-invite` : "/api/send-invite";
}

function getInviteApiAbsoluteSameOriginUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin.replace(/\/$/, "")}/api/send-invite`;
}

/** Ordre : d’abord l’API sur le même domaine que la page (évite VITE_INVITE_API_BASE_URL obsolète), puis l’URL configurée. */
function buildInviteSendUrlList() {
  const list = [];
  const seen = new Set();
  const add = (u) => {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    list.push(s);
  };
  if (typeof window !== "undefined") {
    add(getInviteApiAbsoluteSameOriginUrl());
  }
  const configured = getInviteApiUrl();
  const absolute =
    configured.startsWith("http")
      ? configured
      : typeof window !== "undefined"
        ? new URL(configured, window.location.origin).href
        : configured;
  add(absolute);
  return list;
}

/** Affiché à la place de toute erreur technique (ex. « Failed to fetch »). */
const NOTICE_INVITE_EMAIL_FAILED =
  "Invitations enregistrées. L'envoi automatique des e-mails n'a pas abouti — utilise « Partager » ou réessaie plus tard.";

function buildParticipantAvatarUrl(seed) {
  const safe = encodeURIComponent(String(seed || "participant"));
  return `https://api.dicebear.com/9.x/initials/svg?seed=${safe}`;
}

function isValidEmail(value) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(value || "").trim());
}

async function postTripInvitesToApi({ to, tripTitle, startYmd, endYmd, fixedUrl, programmeText }) {
  const emails = Array.isArray(to)
    ? [...new Set(to.map((x) => String(x || "").trim().toLowerCase()).filter((m) => isValidEmail(m)))]
    : [];
  if (emails.length === 0) return { ok: true, skipped: true };

  const payload = {
    to: emails,
    invite_base_url: typeof window !== "undefined" ? window.location.origin : "",
    trip: {
      title: String(tripTitle || "Voyage"),
      startDate: formatDate(startYmd),
      endDate: formatDate(endYmd),
      link: String(fixedUrl || ""),
    },
  };
  const pt = String(programmeText || "").trim();
  if (pt) payload.programme_text = pt;

  const urlsToTry = buildInviteSendUrlList();

  let inviteResp = null;
  for (let i = 0; i < urlsToTry.length; i += 1) {
    const url = urlsToTry[i];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const canRetry404 = r.status === 404 && i < urlsToTry.length - 1;
      if (canRetry404) continue;
      inviteResp = r;
      break;
    } catch {
      inviteResp = null;
    }
  }

  if (!inviteResp) {
    return { ok: false, error: NOTICE_INVITE_EMAIL_FAILED };
  }

  const inviteData = await inviteResp.json().catch(() => ({}));
  if (inviteResp.status === 404 || !inviteResp.ok) {
    const apiMsg = String(inviteData?.error || "").trim();
    return { ok: false, error: apiMsg || NOTICE_INVITE_EMAIL_FAILED };
  }
  return { ok: true, sent: emails.length };
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

/** Pastilles invités (planning) : sans invited_joined_emails (héritage) = tous les invited_emails ; sinon seulement les comptes ayant rejoint. */
function invitedEmailsForAvatarStrip(trip) {
  const all = Array.isArray(trip?.invited_emails)
    ? trip.invited_emails.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const joined = trip?.invited_joined_emails;
  if (!Array.isArray(joined)) return all;
  const jset = new Set(joined.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));
  return all.filter((e) => jset.has(String(e).trim().toLowerCase()));
}

/** Pastilles participants (chat, etc.) : même règle que invitedEmailsForAvatarStrip pour les e-mails. */
function participantsForAvatarRow(trip) {
  const legacy = !Array.isArray(trip?.invited_joined_emails);
  const parts = canonicalParticipants(trip?.participants, trip?.invited_emails);
  if (legacy) return parts;
  const jset = new Set(
    trip.invited_joined_emails.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
  );
  return parts.filter((p) => {
    const s = String(p || "").trim();
    if (s.toLowerCase() === "moi") return true;
    if (!isValidEmail(s)) return true;
    return jset.has(s.toLowerCase());
  });
}

async function tryMarkInviteeJoinedTrips(supabaseClient) {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.rpc("mark_invitee_joined_for_me");
    if (!error) return;
  } catch (_e) {
    /* RPC absente tant que la migration SQL n’est pas appliquée */
  }
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

/** Open-Meteo Geocoding : langue des résultats (aligné sur les codes app). */
function openMeteoLanguageParam(appLang) {
  const c = String(appLang || "fr")
    .toLowerCase()
    .split("-")[0]
    .slice(0, 2);
  return ["fr", "en", "de", "es", "it", "zh"].includes(c) ? c : "en";
}

const CITY_CATALOG = [
  "Paris", "Lyon", "Marseille", "Nice", "Monaco", "Bordeaux", "Toulouse", "Lille", "Nantes",
  "Tokyo", "Kyoto", "Osaka", "Seoul", "Bangkok", "Singapore", "Bali", "Jakarta", "Beijing", "Shanghai", "Guangzhou",
  "New York", "Los Angeles", "San Francisco", "Miami", "Chicago", "Toronto", "Vancouver",
  "London", "Barcelona", "Madrid", "Rome", "Milan", "Venise", "Berlin", "Amsterdam",
  "Bruxelles", "Berne", "Lisbonne", "Porto", "Prague", "Vienne", "Budapest", "Athènes", "Istanbul",
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
  Milan: ["Milano"],
  Berne: ["Bern"],
};

const CITY_SEARCH_ENTRIES = CITY_CATALOG.flatMap((canonical) => {
  const aliases = Array.isArray(CITY_ALIASES[canonical]) ? CITY_ALIASES[canonical] : [];
  return [{ label: canonical, canonical }, ...aliases.map((alias) => ({ label: alias, canonical }))];
});

/**
 * Requête « pays » → villes du catalogue (suggestions). Clés = normalizeTextForSearch (sans accents).
 */
/**
 * Requête type « pays » : `match` / `cities` comme avant.
 * `geoCountries` = libellés pays renvoyés par Open-Meteo (language=fr), normalisés comme normalizeTextForSearch.
 */
const COUNTRY_QUERY_GROUPS = [
  {
    match: ["france", "republique francaise"],
    cities: ["Paris", "Lyon", "Marseille", "Nice", "Monaco", "Bordeaux", "Toulouse", "Lille", "Nantes"],
    geoCountries: ["france"],
  },
  {
    match: ["italie", "italy"],
    cities: ["Rome", "Milan", "Venise", "Florence", "Naples", "Turin", "Palermo"],
    geoCountries: ["italie", "italy", "italia"],
  },
  { match: ["espagne", "spain"], cities: ["Barcelona", "Madrid"], geoCountries: ["espagne", "spain", "espana"] },
  {
    match: ["royaume-uni", "united kingdom", "angleterre", "england", "ecosse", "scotland"],
    cities: ["London"],
    geoCountries: ["royaume-uni", "united kingdom", "angleterre", "england", "ecosse", "scotland"],
  },
  {
    match: ["allemagne", "germany", "deutschland"],
    cities: ["Berlin"],
    geoCountries: ["allemagne", "germany", "deutschland"],
  },
  {
    match: ["pays-bas", "netherlands", "hollande", "holland"],
    cities: ["Amsterdam"],
    geoCountries: ["pays-bas", "netherlands", "hollande", "holland"],
  },
  { match: ["belgique", "belgium"], cities: ["Bruxelles"], geoCountries: ["belgique", "belgium"] },
  {
    match: ["suisse", "switzerland", "schweiz"],
    cities: ["Berne"],
    geoCountries: ["suisse", "switzerland", "schweiz"],
  },
  { match: ["portugal"], cities: ["Lisbonne", "Porto"], geoCountries: ["portugal"] },
  {
    match: ["autriche", "austria", "osterreich"],
    cities: ["Vienne"],
    geoCountries: ["autriche", "austria", "osterreich"],
  },
  {
    match: ["tchequie", "czechia", "czech republic", "republique tcheque"],
    cities: ["Prague"],
    geoCountries: ["tchequie", "czechia", "republique tcheque", "czech republic"],
  },
  { match: ["hongrie", "hungary"], cities: ["Budapest"], geoCountries: ["hongrie", "hungary"] },
  { match: ["grece", "greece", "hellas"], cities: ["Athènes"], geoCountries: ["grece", "greece", "hellas"] },
  {
    match: ["turquie", "turkey", "turkiye"],
    cities: ["Istanbul"],
    geoCountries: ["turquie", "turkey", "turkiye"],
  },
  {
    match: ["emirats arabes unis", "uae", "emirats"],
    cities: ["Dubai", "Abu Dhabi"],
    geoCountries: ["emirats arabes unis", "united arab emirates"],
  },
  { match: ["qatar"], cities: ["Doha"], geoCountries: ["qatar"] },
  { match: ["egypte", "egypt"], cities: ["Le Caire"], geoCountries: ["egypte", "egypt"] },
  { match: ["maroc", "morocco"], cities: ["Marrakech"], geoCountries: ["maroc", "morocco"] },
  { match: ["tunisie", "tunisia"], cities: ["Tunis"], geoCountries: ["tunisie", "tunisia"] },
  { match: ["algerie", "algeria"], cities: ["Alger"], geoCountries: ["algerie", "algeria"] },
  { match: ["japon", "japan", "nihon"], cities: ["Tokyo", "Kyoto", "Osaka"], geoCountries: ["japon", "japan"] },
  {
    match: ["coree du sud", "south korea", "korea", "coree"],
    cities: ["Seoul"],
    geoCountries: ["coree du sud", "south korea", "korea"],
  },
  { match: ["thailande", "thailand", "siam"], cities: ["Bangkok", "Phuket"], geoCountries: ["thailande", "thailand"] },
  { match: ["singapour", "singapore"], cities: ["Singapore"], geoCountries: ["singapour", "singapore"] },
  { match: ["indonesie", "indonesia"], cities: ["Bali", "Jakarta"], geoCountries: ["indonesie", "indonesia"] },
  { match: ["chine", "china", "rpc"], cities: ["Beijing", "Shanghai", "Guangzhou"], geoCountries: ["chine", "china"] },
  {
    match: ["etats-unis", "usa", "united states", "amerique", "u.s.a", "us"],
    cities: ["New York", "Los Angeles", "San Francisco", "Miami", "Chicago"],
    geoCountries: ["etats-unis", "united states of america", "united states", "usa"],
  },
  { match: ["canada"], cities: ["Toronto", "Vancouver"], geoCountries: ["canada"] },
  { match: ["australie", "australia"], cities: ["Sydney", "Melbourne"], geoCountries: ["australie", "australia"] },
  {
    match: ["nouvelle-zelande", "new zealand", "aotearoa"],
    cities: ["Auckland"],
    geoCountries: ["nouvelle-zelande", "new zealand"],
  },
  {
    match: ["afrique du sud", "south africa"],
    cities: ["Cape Town"],
    geoCountries: ["afrique du sud", "south africa"],
  },
  {
    match: ["bresil", "brazil", "brasil"],
    cities: ["Rio de Janeiro", "Sao Paulo"],
    geoCountries: ["bresil", "brazil", "brasil"],
  },
  { match: ["mexique", "mexico"], cities: [], geoCountries: ["mexique", "mexico"] },
  { match: ["inde", "india"], cities: [], geoCountries: ["inde", "india"] },
  { match: ["vietnam"], cities: [], geoCountries: ["vietnam", "viet nam"] },
  { match: ["philippines"], cities: [], geoCountries: ["philippines"] },
  { match: ["malaisie", "malaysia"], cities: ["Singapore"], geoCountries: ["malaisie", "malaysia"] },
];

function stripLeadingCountryArticle(nstem) {
  return String(nstem || "")
    .replace(/^(le |la |les |l'|the )/, "")
    .trim();
}

/** Entrée Entrée seule sur un nom de pays : pas de fiche — il faut choisir une ville. */
function isExclusiveCountryIntent(nstem) {
  const n = stripLeadingCountryArticle(nstem);
  for (const g of COUNTRY_QUERY_GROUPS) {
    for (const m of g.match) {
      if (n !== m) continue;
      if (m.length >= 4) return true;
      if (m === "usa" || m === "uae" || m === "us" || m === "uk" || m === "rpc") return true;
    }
  }
  return false;
}

/** Groupes pays dont la saisie `q` (déjà normalisée) correspond au nom du pays. */
function countryGroupsMatchingQuery(q) {
  if (!q || q.length < 2) return [];
  const out = [];
  for (const g of COUNTRY_QUERY_GROUPS) {
    let hit = false;
    for (const m of g.match) {
      if (m.length < 2) continue;
      if (
        m === q ||
        (q.length >= 3 && m.startsWith(q)) ||
        (m.length >= 3 && q.startsWith(m) && q.length <= m.length + 2)
      ) {
        hit = true;
        break;
      }
    }
    if (hit) out.push(g);
  }
  return out;
}

/** Villes à proposer quand la saisie ressemble à un pays. */
function citiesForCountrySearchQuery(q) {
  if (!q || q.length < 2) return [];
  const seen = new Set();
  const out = [];
  for (const g of countryGroupsMatchingQuery(q)) {
    for (const c of g.cities) {
      const k = normalizeTextForSearch(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function geoCountryHintsSet(groups) {
  const set = new Set();
  for (const g of groups) {
    const hints =
      Array.isArray(g.geoCountries) && g.geoCountries.length > 0 ? g.geoCountries : [g.match[0]];
    for (const h of hints) {
      const n = normalizeTextForSearch(h);
      if (n) set.add(n);
    }
  }
  return set;
}

/** Exclut « Italie, Italie » : le lieu a le même libellé que le pays. */
function isGeoRowNameSameAsCountry(row) {
  const nn = normalizeTextForSearch(row.name);
  const nc = normalizeTextForSearch(row.country);
  return Boolean(nn && nc && nn === nc);
}

/**
 * Quand la requête est un pays : ne garder que les lignes Open-Meteo dans ce pays,
 * et pas le pays lui-même comme « ville ».
 */
function filterOpenMeteoRowsForCountrySearchQuery(qNormalized, rows) {
  const groups = countryGroupsMatchingQuery(qNormalized);
  if (!groups.length) return rows;
  const hints = geoCountryHintsSet(groups);
  return (rows || []).filter((row) => {
    const cn = normalizeTextForSearch(row.country);
    if (!hints.has(cn)) return false;
    if (isGeoRowNameSameAsCountry(row)) return false;
    return true;
  });
}

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
  const fromLocalized = catalogCityHitsForLocalizedQuery(input);
  const q = normalizeTextForSearch(input);
  if (q.length < 2 && fromLocalized.length === 0) return [];
  const groupsHit = countryGroupsMatchingQuery(q);
  const fromCountry = citiesForCountrySearchQuery(q);
  /** Pas de fuzzy global sur le catalogue quand on tape un pays : évite Bali pour « italie », etc. */
  if (groupsHit.length > 0) {
    const exactCanon = [
      ...new Set(
        CITY_SEARCH_ENTRIES.filter((e) => normalizeTextForSearch(e.label) === q).map((e) => e.canonical)
      ),
    ];
    return mergeCitySuggestionLists(fromLocalized, mergeCitySuggestionLists(fromCountry, exactCanon, 12), 12);
  }
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
  const mergedStrict = mergeCitySuggestionLists(fromCountry, strict, 12);
  if (mergedStrict.length > 0) return mergeCitySuggestionLists(fromLocalized, mergedStrict, 12);

  // Fallback: always keep a few closest results, to avoid empty suggestion list.
  const loose = [...new Set(ranked.filter((x) => x.score > 0).map((x) => x.city))].slice(0, 5);
  return mergeCitySuggestionLists(fromLocalized, mergeCitySuggestionLists(fromCountry, loose, 12), 12);
}

const OPEN_METEO_ROWS_CACHE = {};

async function queryOpenMeteoLocations(input, limit = 12, appLanguage = "fr") {
  const q = normalizeCityInput(input);
  if (q.length < 2) return [];
  const lim = Math.min(Math.max(Number(limit) || 12, 1), 20);
  const oml = openMeteoLanguageParam(appLanguage);
  const cacheKey = `${normalizeTextForSearch(q)}::${lim}::${oml}`;
  if (OPEN_METEO_ROWS_CACHE[cacheKey]) return OPEN_METEO_ROWS_CACHE[cacheKey];
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      q
    )}&count=${lim}&language=${encodeURIComponent(oml)}&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) {
      OPEN_METEO_ROWS_CACHE[cacheKey] = [];
      return [];
    }
    const json = await resp.json();
    const rows = Array.isArray(json?.results) ? json.results : [];
    const mapped = rows
      .map((row) => {
        const name = String(row?.name || "").trim();
        if (!name) return null;
        return {
          name,
          admin1: String(row?.admin1 || "").trim(),
          country: String(row?.country || "").trim(),
        };
      })
      .filter(Boolean);
    OPEN_METEO_ROWS_CACHE[cacheKey] = mapped;
    return mapped;
  } catch (_e) {
    OPEN_METEO_ROWS_CACHE[cacheKey] = [];
    return [];
  }
}

function formatGeoResultLabel(row) {
  const parts = [row.name];
  if (row.admin1 && normalizeTextForSearch(row.admin1) !== normalizeTextForSearch(row.name)) parts.push(row.admin1);
  if (row.country) parts.push(row.country);
  return parts.join(", ");
}

async function fetchWorldwideCitySuggestions(input, limit = 8, appLanguage = "fr") {
  const q = normalizeCityInput(input);
  if (q.length < 2) return [];
  const qn = normalizeTextForSearch(q);
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 12);
  const countryHit = countryGroupsMatchingQuery(qn).length > 0;
  const fetchCount = Math.min(20, Math.max(lim, 10) + (countryHit ? 14 : 0));
  const rows = await queryOpenMeteoLocations(input, fetchCount, appLanguage);
  const filtered = filterOpenMeteoRowsForCountrySearchQuery(qn, rows);
  const labels = [...new Set(filtered.map(formatGeoResultLabel))];
  return labels.slice(0, lim);
}

/**
 * Valide une saisie libre (Entrée) : catalogue, suggestions locales, puis Open-Meteo.
 * Retourne une chaîne exploitable par le guide, ou null si rien n’est reconnu.
 */
async function resolveValidatedDestination(raw, uiLanguage = "fr") {
  const stem = extractCityPrompt(raw) || normalizeCityInput(raw);
  const trimmed = normalizeCityInput(stem);
  if (trimmed.length < 2) return null;
  const nstem = normalizeTextForSearch(trimmed);

  if (isExclusiveCountryIntent(nstem)) return null;

  const catHit = CITY_SEARCH_ENTRIES.find((e) => normalizeTextForSearch(e.label) === nstem);
  if (catHit) return catHit.canonical;

  const locHits = catalogCityHitsForLocalizedQuery(trimmed);
  if (locHits.length === 1) return locHits[0];

  const localMerged = mergeCitySuggestionLists(citiesForCountrySearchQuery(nstem), getCitySuggestions(raw), 16);
  const localExact = localMerged.find((c) => normalizeTextForSearch(extractCityPrompt(c) || c) === nstem);
  if (localExact) return resolveCanonicalCity(localExact);

  const rowsRaw = await queryOpenMeteoLocations(trimmed, 14, uiLanguage);
  const rows = filterOpenMeteoRowsForCountrySearchQuery(nstem, rowsRaw);
  if (!rows.length) return null;

  const exactGeo = rows.find((r) => normalizeTextForSearch(r.name) === nstem);
  if (exactGeo) return formatGeoResultLabel(exactGeo);

  const top = rows[0];
  const tn = normalizeTextForSearch(top.name);
  if (nstem.length >= 3 && tn.startsWith(nstem)) return formatGeoResultLabel(top);
  if (nstem.length >= 4 && levenshteinDistance(nstem, tn) <= 1) return formatGeoResultLabel(top);

  return null;
}

/** Fond écrans auth / chargement — aligné bleu-gris carte */
const BG = "#eef3f8";
/** Plage / mer (Unsplash — Sean Oulashin) : fond écran d’accueil connexion. */
const AUTH_LANDING_BG =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80";

function authHasInviteLink() {
  try {
    const p = new URLSearchParams(window.location.search || "");
    return p.get("invite") === "1" && !!String(p.get("email") || "").trim();
  } catch (_e) {
    return false;
  }
}
const TEXT = "#0B1220";
const ACCENT = "#0F172A";
const slots = ["09:30", "14:00", "18:30", "21:00"];

/** Chargement `trips` : inclure owner_id / invited_emails pour que userCanSeeTrip filtre (base Supabase partagée). */
const TRIPS_SELECT_ATTEMPTS = [
  "*",
  "id,title,name,destination,start_date,end_date,fixed_url,participants,owner_id,invited_emails,invited_joined_emails",
  "id,title,start_date,end_date,owner_id,invited_emails,invited_joined_emails",
  "id,title,start_date,end_date,owner_id,invited_emails",
  "id,title,start_date,end_date,owner_id",
];

const GLASS_BUTTON_CLASS =
  "border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_14px_35px_rgba(15,23,42,0.3)] transition hover:brightness-110";
const GLASS_ACCENT_STYLE = {
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.92) 55%, rgba(15,23,42,0.96) 100%)",
};

/** Grille 2 colonnes dans modales : évite le débordement des inputs (date, montant…) sur mobile. */
const MODAL_GRID_2 = "grid w-full min-w-0 grid-cols-2 gap-2 sm:gap-3";
/** Conteneur date : overflow-hidden + .modal-date-field (CSS) pour coins arrondis sur WebKit/iOS. */
function ModalDateField({ value, onChange, min, max, className: wrapClass = "", inputClassName = "" }) {
  return (
    <div
      className={`modal-date-field rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] overflow-hidden ${wrapClass}`.trim()}
    >
      <input
        type="date"
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        className={`min-w-0 w-full max-w-full border-0 bg-transparent px-4 py-3 text-base leading-normal outline-none focus:ring-0 focus-visible:outline-none [color-scheme:light] ${inputClassName}`.trim()}
      />
    </div>
  );
}

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
  berne: "Bern",
});

/** Titre de page Wikipédia FR quand il diffère du nom canon dans l’app. */
const WIKI_FR_PAGE_TITLE = Object.freeze({
  london: "Londres",
  athenes: "Athènes",
  vienne: "Vienne",
  lisbonne: "Lisbonne",
  lisbon: "Lisbonne",
  "le caire": "Le Caire",
  cairo: "Le Caire",
  beijing: "Pékin",
  pekin: "Pékin",
  canton: "Guangzhou",
  guangzhou: "Guangzhou",
  barcelona: "Barcelone",
  moscow: "Moscou",
  moscou: "Moscou",
  venice: "Venise",
  venise: "Venise",
  athens: "Athènes",
  vienna: "Vienne",
  brussels: "Bruxelles",
  bruxelles: "Bruxelles",
  dubai: "Dubaï",
  singapore: "Singapour",
  seoul: "Séoul",
  florence: "Florence",
  naples: "Naples",
  milan: "Milan",
  rome: "Rome",
  marrakesh: "Marrakech",
  "cape town": "Le Cap",
  montreal: "Montréal",
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

async function fetchWikiPageImageApi(wikiHost, title, thumbSize = 3200) {
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
    const thumb = String(page.thumbnail?.source || "").trim();
    return thumb ? upgradeLandscapeImageUrl(thumb) : "";
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
    const frTitle = WIKI_FR_PAGE_TITLE[normalizeTextForSearch(safeCity)] || safeCity;
    const r = await fetch(
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(frTitle)}`
    );
    if (!r.ok) return "";
    const j = await r.json();
    const thumbFr = String(j?.thumbnail?.source || "").trim();
    return thumbFr ? upgradeLandscapeImageUrl(thumbFr) : "";
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
  tokyo: "/destinations/tokyo.jpg",
  london: "/destinations/london.jpg",
  "new york": "/destinations/new-york.jpg",
  dubai: "/destinations/dubai.jpg",
  sydney: "/destinations/sydney.jpg",
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

const WIKIMEDIA_THUMB_MIN_WIDTH = 1920;
const WIKIMEDIA_THUMB_MAX_WIDTH = 4096;

/**
 * Passe les miniatures Commons (/320px-, /800px-, …) à une largeur adaptée aux cartes HD / mobile retina.
 * Aucune clé API : même fichier sur upload.wikimedia.org.
 */
function upgradeWikimediaCommonsThumbUrl(url) {
  const u = String(url || "").trim();
  if (!u.includes("upload.wikimedia.org") || !u.includes("/thumb/")) return u;
  return u.replace(/\/(\d{2,4})px-([^/?#]+)$/i, (full, w, rest) => {
    const cur = parseInt(w, 10) || 0;
    if (cur >= WIKIMEDIA_THUMB_MIN_WIDTH) return full;
    const nw = Math.min(
      Math.max(WIKIMEDIA_THUMB_MIN_WIDTH, cur),
      WIKIMEDIA_THUMB_MAX_WIDTH
    );
    return `/${nw}px-${rest}`;
  });
}

/** Unsplash : élargit w= dans l’URL (regular ~1080px → ~2400px si la photo le permet). */
function upgradeUnsplashDisplayUrl(url) {
  let u = String(url || "").trim();
  if (!/images\.unsplash\.com/i.test(u)) return u;
  if (/[?&]w=(?:2[4-9]\d{2}|[3-9]\d{3})/i.test(u)) return u;
  if (/([?&])w=\d+/i.test(u)) {
    return u.replace(/([?&])w=\d+/i, "$1w=2400");
  }
  return `${u}${u.includes("?") ? "&" : "?"}w=2400&fit=max&q=88&auto=format`;
}

/** Qualité maximale avec les sources déjà branchées (Commons + Unsplash). */
function upgradeLandscapeImageUrl(url) {
  let u = String(url || "").trim();
  if (!u) return u;
  u = upgradeWikimediaCommonsThumbUrl(u);
  u = upgradeUnsplashDisplayUrl(u);
  return u;
}

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

/** Logo / wordmark / charte — à éviter pour le bandeau « lieu » (ex. The Met). */
function isLikelyWikiBrandOrLogoImage(url, fileTitle = "") {
  const u = String(url || "").toLowerCase();
  const ft = String(fileTitle || "")
    .toLowerCase()
    .replace(/^file:/i, "");
  if (!u && !ft) return false;
  if (isLikelyWikiFlagOrSealThumb(url)) return true;
  const hay = `${u} ${ft}`;
  if (/wordmark|lockup|branding|brand_mark|charte_graphique/i.test(hay)) return true;
  if (/logo\.svg|_logo\.|\/logo\.|_logo_|\/logos?\//i.test(hay)) return true;
  if (/\blogo\b/i.test(ft) && /\.(svg|png|gif)/i.test(ft)) return true;
  if (u.includes(".svg.png") && /logo|wordmark|emblem|icon/i.test(hay)) return true;
  if (/^file:[^|]+_logo\.(svg|png)/i.test(String(fileTitle || ""))) return true;
  return false;
}

function largestSrcFromWikiMediaSrcset(srcset) {
  if (!Array.isArray(srcset) || srcset.length === 0) return "";
  let best = "";
  let bestW = 0;
  for (const entry of srcset) {
    const src = String(entry?.src || "").trim();
    if (!src) continue;
    const m = src.match(/(\d+)px-/);
    const parsed = m ? Number(m[1]) : 0;
    const w = Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
    if (w > bestW) {
      bestW = w;
      best = src.startsWith("//") ? `https:${src}` : src;
    }
  }
  return best;
}

function scoreWikiMediaItemForPlaceHero(fileTitle, pageUrl, sectionId) {
  const ft = String(fileTitle || "").toLowerCase().replace(/^file:/i, "");
  const u = String(pageUrl || "").toLowerCase();
  if (isLikelyWikiBrandOrLogoImage(pageUrl, fileTitle)) return -1000;
  let s = 0;
  if (/\.(jpe?g|webp)(\?|$)/i.test(u) || /\/\d+px-[^/]+\.(jpe?g|webp)/i.test(u)) s += 42;
  if (u.includes(".svg.png")) s -= 30;
  if (
    /exterior|facade|façade|building|aerial|panoram|panoramio|view of|night view|plaza|square|frontage|great hall|main hall|entrance|facade|skyline|street view|central park|_nyc|manhattan|fifth.?avenue|5th.?avenue|museum.*\.(jpe?g|webp)/i.test(
      `${ft} ${u}`
    )
  )
    s += 38;
  if (/museum|cathedral|basilica|palace|château|castle|tower|bridge|gallery|monument|memorial/i.test(`${ft} ${u}`)) s += 22;
  const sec = Number(sectionId);
  if (Number.isFinite(sec)) {
    if (sec <= 1) s += 18;
    if (sec >= 4 && sec < 48) s -= 12;
    if (sec >= 49) s -= 40;
  }
  if (/_met_dt|_met_dp|_met_ada|_dp\d|_dt\d|standing_hippopotamus|pendant_mask|oil_on_canvas|portrait of|by_|\bminiature\b/i.test(`${ft} ${u}`)) s -= 28;
  return s;
}

/**
 * Remplace la vignette « lead » Wikipédia (souvent un logo) par une photo du lieu via media-list.
 */
async function resolveWikipediaPlaceHeaderImage(wikiLang, pageTitle, summaryThumb) {
  const lang = String(wikiLang || "en").toLowerCase().split("-")[0];
  const pt = String(pageTitle || "").trim();
  const thumb = String(summaryThumb || "").trim();
  if (thumb && !isLikelyWikiBrandOrLogoImage(thumb, "")) {
    return upgradeLandscapeImageUrl(thumb);
  }
  if (!pt) return thumb && !isLikelyWikiBrandOrLogoImage(thumb, "") ? upgradeLandscapeImageUrl(thumb) : "";

  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(pt)}`
    );
    if (!r.ok) return thumb && !isLikelyWikiBrandOrLogoImage(thumb, "") ? upgradeLandscapeImageUrl(thumb) : "";
    const json = await r.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    const scored = [];
    for (const it of items) {
      if (String(it?.type || "") !== "image") continue;
      const fileTitle = String(it?.title || "");
      const src = largestSrcFromWikiMediaSrcset(it?.srcset);
      if (!src) continue;
      const sc = scoreWikiMediaItemForPlaceHero(fileTitle, src, it?.section_id);
      if (sc <= -500) continue;
      scored.push({ src: upgradeLandscapeImageUrl(src), sc });
    }
    scored.sort((a, b) => b.sc - a.sc);
    if (scored.length > 0) return scored[0].src;
  } catch (_e) {
    /* ignore */
  }
  return thumb && !isLikelyWikiBrandOrLogoImage(thumb, "") ? upgradeLandscapeImageUrl(thumb) : "";
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
    const curated = WIKIMEDIA_CURATED_CITY_HEROES[k];
    if (Array.isArray(curated)) {
      for (const u of curated) {
        const s = String(u || "").trim();
        if (s && !seen.has(s)) {
          seen.add(s);
          urls.push(s);
        }
      }
    }
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

/** Image carte voyage : bundle / Storage / Commons figés (sans Picsum : seeds souvent hors-sujet type nature abstraite). */
function buildCityImageUrl(prompt) {
  const p = String(extractCityPrompt(prompt) || prompt || "").trim();
  if (!p) return "";
  const primary =
    resolveCityHeroImageUrl(p) || getBundledCityHeroPath(p) || getStorageMirrorHeroUrl(p);
  if (primary) return primary;
  return "";
}

function getCityImageCacheKey(cityInput) {
  return `v32:${String(extractCityPrompt(cityInput) || cityInput || "")
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
  const display = String(city || "").trim() || "la destination";
  const canonical = resolveCanonicalCity(display);
  const key = normalizeTextForSearch(canonical);
  const label = String(canonical || display).trim() || display;
  const places = getIconicPlacesFallback(display) || [];
  return resolveTravelTips(key, label, places);
}

function dedupeTipLines(lines) {
  const seen = new Set();
  const out = [];
  for (const x of lines || []) {
    const s = String(x || "").trim();
    if (!s) continue;
    const k = s.slice(0, 120).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Fusionne conseils Gemini + base catalogue ; garantit au moins 3 conseils « do » pertinents. */
function mergeTipsDoFromGemini(baseDo, geminiDo, cityName) {
  const g = dedupeTipLines(geminiDo);
  const b = dedupeTipLines(baseDo);
  let merged = dedupeTipLines([...g, ...b]);
  if (merged.length < 3) {
    const city = String(cityName || "").trim();
    const canonical = resolveCanonicalCity(city);
    const key = normalizeTextForSearch(canonical);
    const label = String(canonical || city).trim() || city;
    const fill = resolveTravelTips(key, label, getIconicPlacesFallback(city) || []).do;
    merged = dedupeTipLines([...merged, ...fill]);
  }
  return merged.slice(0, 12);
}

function buildSuggestedActivitiesForCity(city) {
  const c = String(city || "").toLowerCase();
  const label = String(city || "").trim() || "la destination";
  /** Suggestion locale avec coût indicatif (repli sans Gemini). */
  const act = (title, estimatedCostEur, costNote = "", location = "") => {
    const o = { title, estimatedCostEur: clampActivityCostEUR(estimatedCostEur) };
    const note = String(costNote || "").trim();
    if (note) o.costNote = note;
    const loc = String(location || "").trim();
    if (loc) o.location = loc;
    return o;
  };
  const base = [
    act("Visite des quartiers historiques", 0, "Variable (gratuit ou billets sur place)", label),
    act("Tour culinaire local", 35, "", label),
    act("Point de vue au coucher du soleil", 0, "Souvent gratuit", label),
    act("Musee ou galerie incontournable", 18, "Entrée type — selon lieu", label),
  ];
  if (c.includes("tokyo")) {
    return [
      act("Shibuya & Shinjuku", 0, "Gratuit (déplacements en sus)", "Tokyo"),
      act("Temple Senso-ji", 0, "Gratuit (temple)", "Tokyo"),
      act("Sushi local", 45, "Repas type", "Tokyo"),
      act("Vue depuis Shibuya Sky", 24, "", "Tokyo"),
    ];
  }
  if (c.includes("paris")) {
    return [
      act("Tour Eiffel", 29, "", "Paris"),
      act("Musée du Louvre", 22, "", "Paris"),
      act("Croisière sur la Seine", 16, "", "Paris"),
      act("Montmartre", 0, "Gratuit (balade — musées / funiculaire en sus)", "Paris"),
    ];
  }
  if (c.includes("bali")) {
    return [
      act("Temple Uluwatu", 5, "Entrée indicative", "Bali"),
      act("Rizières de Tegallalang", 3, "Don / parking selon accès", "Bali"),
      act("Plage de Canggu", 0, "Gratuit", "Bali"),
      act("Session surf", 25, "Cours / location board — ordre de grandeur", "Bali"),
    ];
  }
  if (c.includes("new york")) {
    return [
      act("Central Park", 0, "Gratuit", "New York"),
      act("Brooklyn Bridge", 0, "Gratuit", "New York"),
      act("Top of the Rock", 44, "", "New York"),
      act("SoHo & Greenwich", 0, "Gratuit (shopping / repas en sus)", "New York"),
    ];
  }
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
  const imgRaw = buildCityImageUrl(safeCity);
  const img = imgRaw ? upgradeLandscapeImageUrl(imgRaw) : "";
  const instantCandidates = dedupeImageUrlChain([
    ...getCityHeroImageCandidates(safeCity),
    getBundledCityHeroPath(safeCity),
    getStorageMirrorHeroUrl(safeCity),
  ]).map((u) => upgradeLandscapeImageUrl(String(u || "")));
  return {
    city: safeCity,
    description: `${safeCity} est une destination populaire avec une forte identite culturelle, de nombreux quartiers a explorer et une scene locale dynamique.`,
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
/**
 * Récupère le contour GeoJSON du pays via reverse geocoding (zoom=3).
 * Plus fiable que la recherche par nom : on passe les coordonnées de la ville,
 * Nominatim remonte directement la frontière du pays correspondant.
 */
async function fetchCountryMapData(countryName, countryCode, cityLat, cityLon) {
  const cc = String(countryCode || "").trim().toLowerCase();
  const cacheKey = cc || String(countryName || "").toLowerCase();
  if (!cacheKey) return null;
  if (countryMapCache[cacheKey]) return countryMapCache[cacheKey];

  try {
    let first = null;

    // Stratégie 1 : reverse geocoding avec coordonnées ville (zoom=3 → niveau pays)
    if (Number.isFinite(cityLat) && Number.isFinite(cityLon)) {
      const revUrl =
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${cityLat}&lon=${cityLon}` +
        `&zoom=3&polygon_geojson=1&addressdetails=0`;
      const revResp = await fetch(revUrl);
      if (revResp.ok) {
        const revJson = await revResp.json();
        if (revJson?.geojson && revJson?.boundingbox) first = revJson;
      }
    }

    // Stratégie 2 : recherche par code pays ISO (plus précis que le nom en français)
    if (!first && cc.length === 2) {
      const searchUrl =
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&polygon_geojson=1` +
        `&addressdetails=0&featuretype=country&countrycodes=${cc}&q=${encodeURIComponent(cc)}`;
      const r2 = await fetch(searchUrl);
      if (r2.ok) {
        const arr2 = await r2.json();
        first = Array.isArray(arr2) && arr2.length > 0 ? arr2[0] : null;
      }
    }

    if (!first) return null;

    // Bounding box : soit tableau [s,n,w,e], soit objet avec propriétés
    let south, north, west, east;
    const bb = first?.boundingbox;
    if (Array.isArray(bb) && bb.length >= 4) {
      [south, north, west, east] = bb.map(Number);
    } else {
      return null;
    }
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

const WIKI_LANG_CODES = { fr: "fr", en: "en", de: "de", es: "es", it: "it", zh: "zh" };

/**
 * Récupère la description de la ville depuis Wikivoyage (guide de voyage).
 * Wikivoyage > Wikipedia pour un contexte voyage (culture, vibe, quartiers).
 * Tente la langue UI, puis l'anglais, puis le français en fallback.
 * Utilise l'API MediaWiki (exintro) pour obtenir le paragraphe d'intro complet.
 */
async function fetchWikivoyageSummaryText(safeCity, uiLang) {
  const wikiLang = WIKI_LANG_CODES[String(uiLang || "fr").toLowerCase()] || "fr";
  const norm = normalizeTextForSearch(safeCity);

  // Candidates ordered by priority: UI language first, then en, then fr
  const seen = new Set();
  const candidates = [];
  const addCandidate = (lang, title) => {
    const key = `${lang}:${title}`;
    if (!seen.has(key)) { seen.add(key); candidates.push({ lang, title }); }
  };

  if (wikiLang === "en") {
    addCandidate("en", WIKI_EN_PAGE_TITLE[norm] || safeCity);
  } else if (wikiLang === "fr") {
    // Ne pas tomber sur l'article EN — on préfère "" (→ Groq/Wikipedia FR prendront le relai)
    addCandidate("fr", WIKI_FR_PAGE_TITLE[norm] || safeCity);
  } else {
    const localTitle = displayCityForLocale(safeCity, wikiLang) || safeCity;
    addCandidate(wikiLang, localTitle);
    // Pas de fallback EN pour les langues non-EN
  }

  for (const { lang, title } of candidates) {
    try {
      const url =
        `https://${lang}.wikivoyage.org/w/api.php` +
        `?action=query&titles=${encodeURIComponent(title)}` +
        `&prop=extracts&exintro=1&explaintext=1&format=json&origin=*&redirects=1`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const json = await resp.json();
      const pages = json?.query?.pages || {};
      const page = Object.values(pages)[0];
      if (!page || page.missing !== undefined) continue;
      // Wikivoyage prepends "CityName\n" as a title line — strip it
      const raw = String(page.extract || "").trim();
      const text = raw.replace(/^[^\n]+\n/, "").trim() || raw;
      if (text.length > 80) return text;
    } catch (_e) {
      // try next candidate
    }
  }
  return "";
}

async function fetchWikiSummaryForLang(safeCity, uiLang) {
  const wikiLang = WIKI_LANG_CODES[String(uiLang || "fr").toLowerCase()] || "fr";
  const norm = normalizeTextForSearch(safeCity);
  try {
    let title;
    if (wikiLang === "fr") {
      title = WIKI_FR_PAGE_TITLE[norm] || safeCity;
    } else if (wikiLang === "en") {
      title = WIKI_EN_PAGE_TITLE[norm] || safeCity;
    } else {
      title = displayCityForLocale(safeCity, wikiLang) || safeCity;
    }
    const resp = await fetch(
      `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (resp.ok) {
      const json = await resp.json();
      const text = String(json?.extract || "");
      if (text) return { summaryText: text, thumb: String(json?.thumbnail?.source || ""), lat: Number(json?.coordinates?.lat), lon: Number(json?.coordinates?.lon) };
    }
    if (wikiLang !== "fr") {
      const frTitle = WIKI_FR_PAGE_TITLE[norm] || safeCity;
      const frResp = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(frTitle)}`);
      if (frResp.ok) {
        const frJson = await frResp.json();
        return { summaryText: String(frJson?.extract || ""), thumb: String(frJson?.thumbnail?.source || ""), lat: Number(frJson?.coordinates?.lat), lon: Number(frJson?.coordinates?.lon) };
      }
    }
    return { summaryText: "", thumb: "", lat: NaN, lon: NaN };
  } catch (_e) {
    return { summaryText: "", thumb: "", lat: NaN, lon: NaN };
  }
}

/** Découpe les libellés type « A & B » ou « A / B » pour matcher des articles distincts. */
function expandMustSeePlaceSegments(rawTitle) {
  const p = String(rawTitle || "").trim();
  if (!p) return [];
  const chunks = p
    .split(/\s*&\s*/)
    .flatMap((x) => x.split(/\s*\/\s*/))
    .map((x) => x.trim())
    .filter(Boolean);
  const ordered = [];
  const add = (s) => {
    const t = String(s || "").trim();
    if (!t || ordered.includes(t)) return;
    ordered.push(t);
  };
  if (chunks.length > 1) {
    for (const c of chunks) add(c);
  }
  add(chunks[0] || p);
  if (chunks.length > 1) add(p);
  return ordered;
}

/** Titres anglais usuels quand le catalogue est en français (essais sur en.wikipedia uniquement). */
function enWikipediaAliasTitles(segment) {
  const s = String(segment || "").trim();
  if (!s) return [];
  const lower = s.toLowerCase();
  const out = [];
  const push = (x) => {
    const t = String(x || "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (/statue\s+de\s+la\s+libert/i.test(s)) push("Statue of Liberty");
  if (/ellis\s+island/i.test(lower)) push("Ellis Island");
  if (/one\s*world\s*(trade|center|tower)/i.test(lower)) push("One World Trade Center");
  if (/high\s*line/i.test(lower)) push("High Line");
  if (/times\s*square/i.test(lower)) push("Times Square");
  if (/brooklyn\s*bridge/i.test(lower)) push("Brooklyn Bridge");
  if (/central\s*park/i.test(lower)) push("Central Park");
  if (/empire\s*state/i.test(lower)) push("Empire State Building");
  return out;
}

/** Premier titre d’article via OpenSearch (CORS origin=*). */
async function wikiOpenSearchFirstTitle(lang, searchQuery) {
  const q = String(searchQuery || "").trim();
  if (q.length < 2) return "";
  try {
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=opensearch` +
      `&search=${encodeURIComponent(q)}&limit=8&namespace=0&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) return "";
    const j = await r.json();
    const titles = Array.isArray(j?.[1]) ? j[1] : [];
    for (const raw of titles) {
      const t = String(raw || "").trim();
      if (!t) continue;
      const tl = t.toLowerCase();
      if (tl.includes("disambiguation") || tl.includes("homonymie") || tl.includes("disambigua")) continue;
      return t;
    }
    return "";
  } catch (_e) {
    return "";
  }
}

/** Post-traitement vignette (logo → photo) — réutilisable en parallèle avec d’autres requêtes. */
async function finalizeWikiPlaceThumb(lang, res) {
  if (!res) return res;
  const out = { ...res };
  out.thumb = await resolveWikipediaPlaceHeaderImage(lang, out.wikiTitle, out.thumb);
  if (!out.thumb && out.wikiTitle) {
    const img = await fetchWikiPageImageApi(`${lang}.wikipedia.org`, out.wikiTitle);
    if (img) out.thumb = await resolveWikipediaPlaceHeaderImage(lang, out.wikiTitle, img);
  }
  return out;
}

/**
 * Piste image en parallèle du texte : OpenSearch EN + FR sur les premiers segments, puis media-list.
 */
async function fetchWikiPlaceHeroImageEarly(placeTitle, cityLabel, uiLang) {
  const wikiLang = WIKI_LANG_CODES[String(uiLang || "fr").toLowerCase()] || "fr";
  const place = String(placeTitle || "").trim();
  const city = String(cityLabel || "").trim();
  if (!place) return "";
  const segments = expandMustSeePlaceSegments(place);
  const langsTry = [wikiLang, "en", "fr"].filter((l, i, arr) => arr.indexOf(l) === i);

  async function tryLang(lang) {
    for (const seg of segments.slice(0, 3)) {
      const qCity = city ? `${seg} ${city}` : seg;
      const t = await wikiOpenSearchFirstTitle(lang, qCity);
      if (t) {
        const u = await resolveWikipediaPlaceHeaderImage(lang, t, "");
        if (u) return u;
      }
      const t2 = await wikiOpenSearchFirstTitle(lang, seg);
      if (t2 && t2 !== t) {
        const u = await resolveWikipediaPlaceHeaderImage(lang, t2, "");
        if (u) return u;
      }
    }
    return "";
  }

  const urls = await Promise.all(langsTry.map((l) => tryLang(l)));
  return urls.find((u) => String(u || "").trim()) || "";
}

const _MUST_SEE_MODAL_CACHE = new Map();
const _MUST_SEE_MODAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const _MUST_SEE_MODAL_CACHE_MAX = 48;

function mustSeePlaceModalCacheKey(rawName, city, lang) {
  const L = String(lang || "fr").toLowerCase().split("-")[0];
  return `${String(rawName || "").trim()}\x1e${String(city || "").trim().toLowerCase()}\x1e${L}`;
}

function readMustSeePlaceModalCache(rawName, city, lang) {
  const k = mustSeePlaceModalCacheKey(rawName, city, lang);
  const row = _MUST_SEE_MODAL_CACHE.get(k);
  if (!row || Date.now() - row.ts > _MUST_SEE_MODAL_CACHE_TTL_MS) {
    if (row) _MUST_SEE_MODAL_CACHE.delete(k);
    return null;
  }
  return row;
}

function writeMustSeePlaceModalCache(rawName, city, lang, extract, imageUrl) {
  const k = mustSeePlaceModalCacheKey(rawName, city, lang);
  if (_MUST_SEE_MODAL_CACHE.size >= _MUST_SEE_MODAL_CACHE_MAX) {
    const first = _MUST_SEE_MODAL_CACHE.keys().next().value;
    if (first) _MUST_SEE_MODAL_CACHE.delete(first);
  }
  _MUST_SEE_MODAL_CACHE.set(k, {
    extract: String(extract || ""),
    imageUrl: String(imageUrl || ""),
    ts: Date.now(),
  });
}

/**
 * Résumé Wikipédia pour un lieu (nom brut du guide) + vignette ; plusieurs titres / langues.
 * Utilisé par le modal « lieu incontournable » (desktop & tactile).
 * @param {{ resolveImage?: boolean }} options — si false, pas de media-list (pour enchaîner en parallèle).
 */
async function fetchWikiPlaceSummaryForPlace(placeTitle, cityLabel, uiLang, options = {}) {
  const resolveImage = options.resolveImage !== false;
  const wikiLang = WIKI_LANG_CODES[String(uiLang || "fr").toLowerCase()] || "fr";
  const place = String(placeTitle || "").trim();
  const city = String(cityLabel || "").trim();
  if (!place) return { extract: "", thumb: "", wikiTitle: "", wikiHostLang: "" };

  const langsOrder = [wikiLang, "en", "fr"].filter((l, i, arr) => arr.indexOf(l) === i);
  const segments = expandMustSeePlaceSegments(place);

  const tryFetch = async (lang, title) => {
    try {
      const resp = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      if (json?.type === "disambiguation") return null;
      const extract = String(json?.extract || "").trim();
      if (extract.length < 24) return null;
      const thumbRaw = String(json?.thumbnail?.source || "").trim();
      const resolvedTitle = String(json?.titles?.normalized || json?.title || title).trim();
      return {
        extract,
        thumb: thumbRaw ? upgradeLandscapeImageUrl(thumbRaw) : "",
        wikiTitle: resolvedTitle || title,
        wikiHostLang: lang,
      };
    } catch (_e) {
      return null;
    }
  };

  const seen = new Set();
  const candidates = [];
  const push = (lang, title) => {
    const t = String(title || "").trim();
    if (!t) return;
    const k = `${lang}|${t}`;
    if (seen.has(k)) return;
    seen.add(k);
    candidates.push({ lang, title: t });
  };

  for (const seg of segments) {
    for (const lang of langsOrder) {
      push(lang, seg);
      if (city) push(lang, `${seg} (${city})`);
    }
    for (const alias of enWikipediaAliasTitles(seg)) {
      push("en", alias);
      if (city) push("en", `${alias} (${city})`);
    }
  }

  const done = async (lang, res) => {
    if (!res) return res;
    return resolveImage ? finalizeWikiPlaceThumb(lang, res) : res;
  };

  for (const { lang, title } of candidates) {
    const res = await tryFetch(lang, title);
    if (res) return done(lang, res);
  }

  for (const seg of segments) {
    for (const lang of langsOrder) {
      const qCity = city ? `${seg} ${city}` : seg;
      const t1 = await wikiOpenSearchFirstTitle(lang, qCity);
      if (t1) {
        const res = await tryFetch(lang, t1);
        if (res) return done(lang, res);
      }
      const t2 = await wikiOpenSearchFirstTitle(lang, seg);
      if (t2 && t2 !== t1) {
        const res = await tryFetch(lang, t2);
        if (res) return done(lang, res);
      }
    }
  }

  for (const seg of segments) {
    const [frImg, enImg] = await Promise.all([
      fetchWikiPageImageApi("fr.wikipedia.org", seg),
      fetchWikiPageImageApi("en.wikipedia.org", seg),
    ]);
    let thumbOnly = frImg || enImg || "";
    if (thumbOnly && isLikelyWikiBrandOrLogoImage(thumbOnly, "")) thumbOnly = "";
    if (!thumbOnly) {
      for (const lang of ["en", "fr", wikiLang].filter((l, i, a) => a.indexOf(l) === i)) {
        const t = await wikiOpenSearchFirstTitle(lang, city ? `${seg} ${city}` : seg);
        if (!t) continue;
        const img = await fetchWikiPageImageApi(`${lang}.wikipedia.org`, t);
        thumbOnly = await resolveWikipediaPlaceHeaderImage(lang, t, img || "");
        if (thumbOnly) break;
      }
    }
    if (thumbOnly) return { extract: "", thumb: thumbOnly, wikiTitle: "", wikiHostLang: "" };
  }

  const [frImg, enImg] = await Promise.all([
    fetchWikiPageImageApi("fr.wikipedia.org", place),
    fetchWikiPageImageApi("en.wikipedia.org", place),
  ]);
  let thumbOnly = frImg || enImg || "";
  if (thumbOnly && isLikelyWikiBrandOrLogoImage(thumbOnly, "")) thumbOnly = "";
  return { extract: "", thumb: thumbOnly, wikiTitle: "", wikiHostLang: "" };
}

// ─── Foursquare Places — estimation de coût d'après les catégories ────────────
function fsqEstimateCost(categories) {
  const names = (categories || []).map((c) => String(c?.name || "").toLowerCase());
  const has = (...kw) => names.some((n) => kw.some((k) => n.includes(k)));

  // Gratuit / accès libre
  if (has("park", "garden", "plaza", "square", "piazza", "beach", "promenade", "boardwalk",
          "viewpoint", "lookout", "scenic", "church", "cathedral", "mosque", "temple",
          "shrine", "chapel", "monastery", "market", "street art", "hiking", "trail"))
    return 0;

  // Gastronomie
  if (has("restaurant", "bistro", "brasserie", "trattoria", "taverna", "steakhouse",
          "sushi", "ramen", "dim sum", "tapas", "gastro"))
    return 30;
  if (has("café", "cafe", "coffee", "bakery", "patisserie", "boulangerie", "crêperie"))
    return 10;
  if (has("bar", "pub", "cocktail", "wine bar", "beer", "brewery", "taproom", "nightclub",
          "lounge", "rooftop bar"))
    return 18;
  if (has("food tour", "culinary tour", "cooking class", "wine tasting", "degustation"))
    return 55;

  // Culture & patrimoine
  if (has("museum", "gallery", "aquarium", "planetarium", "observatory"))
    return 14;
  if (has("historic site", "heritage", "monument", "castle", "palace", "ruins", "archaeological"))
    return 10;
  if (has("cultural", "art center", "exhibition", "expo"))
    return 12;
  if (has("theater", "theatre", "opera", "concert", "music venue", "cinema", "show"))
    return 22;

  // Divertissement
  if (has("amusement park", "theme park", "water park", "fun park"))
    return 35;
  if (has("zoo", "safari", "wildlife", "botanical"))
    return 20;
  if (has("escape room", "bowling", "laser", "arcade", "virtual reality"))
    return 20;

  // Sport & nature
  if (has("sport", "stadium", "arena", "tennis", "golf", "climbing", "diving", "surfing",
          "kayak", "boat tour", "boat rental", "cycling", "bike tour", "ski"))
    return 40;

  // Bien-être
  if (has("spa", "wellness", "massage", "hammam", "sauna", "thermal", "hot spring"))
    return 65;

  // Shopping
  if (has("shopping", "boutique", "souvenir", "department store", "mall", "outlet"))
    return 0;

  // Tours & visites guidées
  if (has("tour", "guided", "walking tour", "bus tour", "day trip", "excursion"))
    return 35;

  return 0;
}

/**
 * Récupère les POIs Foursquare via le proxy serveur /api/foursquare/places.
 * La clé API reste côté serveur (FOURSQUARE_API_KEY dans .env, sans préfixe VITE_).
 * Retourne { places: string[], activities: ActivityObj[] }.
 */
async function fetchFoursquarePlaces(lat, lon) {
  try {
    const resp = await fetch("/api/foursquare/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, limit: 20 }),
    });
    if (!resp.ok) return { places: [], activities: [] };
    const json = await resp.json();
    if (!json.ok || !Array.isArray(json.results)) return { places: [], activities: [] };

    // Dédupe par nom
    const seen = new Set();
    const valid = json.results.filter((r) => {
      const name = String(r?.name || "").trim();
      if (name.length < 3) return false;
      const k = name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Lieux incontournables : top 7
    const places = valid.slice(0, 7).map((r) => String(r.name));

    // Activités : top 6 avec coût estimé et localité
    const activities = valid.slice(0, 6).map((r) => {
      const cost = fsqEstimateCost(r.categories);
      const names = (r.categories || []).map((c) => String(c?.name || "").toLowerCase());
      const has = (...kw) => names.some((n) => kw.some((k) => n.includes(k)));
      let costNote = "";
      if (cost === 0 && has("park", "garden", "beach", "promenade", "viewpoint", "church",
                             "cathedral", "mosque", "temple", "shrine", "plaza", "square")) {
        costNote = "free";
      } else if (cost > 0 && has("restaurant", "bistro", "brasserie", "café", "cafe", "sushi", "tapas")) {
        costNote = "per person avg";
      } else if (cost > 0 && has("tour", "guided", "walking tour", "bus tour", "excursion")) {
        costNote = "per person";
      }
      return {
        title: String(r.name),
        estimatedCostEur: cost,
        costNote,
        location: String(r?.location?.locality || r?.location?.neighborhood || ""),
      };
    });

    return { places, activities };
  } catch (_e) {
    return { places: [], activities: [] };
  }
}

/**
 * Génère une description courte et engageante via Groq (2 phrases, style magazine).
 * Lancée en parallèle des appels Wikipedia/Wikivoyage → pas de latence supplémentaire.
 * Retourne "" si Groq est indisponible ou sans clé (fallback Wikivoyage/Wikipedia).
 */
async function fetchGroqCityDescription(cityName, uiLang) {
  try {
    const resp = await fetch("/api/groq/description", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: cityName, language: uiLang }),
    });
    if (!resp.ok) return "";
    const json = await resp.json();
    return String(json?.description || "").trim();
  } catch (_e) {
    return "";
  }
}

/**
 * Tronque un texte à la dernière phrase complète avant maxChars.
 * Évite les descriptions trop longues qui découragent la lecture.
 */
function truncateDescription(text, maxChars = 320) {
  const s = String(text || "").trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastEnd = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf(".\n"),
  );
  if (lastEnd > 80) return s.slice(0, lastEnd + 1).trim();
  return cut.trimEnd() + "…";
}

async function fetchDestinationGuide(city, uiLanguage = "fr") {
  const cityStem = extractCityPrompt(city) || String(city || "").trim();
  if (cityStem.length < 2) return null;
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return null;

  const wikiSummaryP = fetchWikiSummaryForLang(safeCity, uiLanguage);
  // Wikivoyage : description orientée voyage (prioritaire sur Wikipedia si disponible)
  const wikivoyageP = fetchWikivoyageSummaryText(safeCity, uiLanguage);
  // Groq : description courte + engageante (2 phrases style magazine) — lancée en parallèle
  const groqDescP = fetchGroqCityDescription(safeCity, uiLanguage);

  /** Pas de titres Wikipédia bruts comme « lieux » (homonymes / hors sujet). Lieux = répertoire emblématique + repli exploration ; enrichissement IA optionnel via VITE_GEMINI_DESTINATION_ENRICH. */
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

  const [summaryPack, wikivoyageText, groqDesc, places, geoPack, cachedCityImage, wikiHeroUrls] = await Promise.all([
    wikiSummaryP,
    wikivoyageP,
    groqDescP,
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

  // Wikivoyage si disponible (description voyage > encyclopédie Wikipedia)
  const summaryText = wikivoyageText || summaryPack.summaryText;

  // Foursquare : POIs réels via proxy serveur (appel séquentiel — nécessite lat/lon)
  const otmData =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? await fetchFoursquarePlaces(latitude, longitude)
      : { places: [], activities: [] };

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

  /** Ordre : 1) Commons curatés / figés 2) bundle 3) miroir Storage 4) Wikipédia 5) cache (évite JPG locaux hors-sujet qui masquaient Commons). */
  let imageUrl =
    commonsFirst ||
    bundledUrl ||
    storageMirrorUrl ||
    wikiApiPrimary ||
    (wikiThumbUsable ? wikiThumbRaw : "") ||
    "";
  let landscapeImageUrl = imageUrl;

  if (!imageUrl && cachedUsable) {
    landscapeImageUrl = cachedCityImage;
    imageUrl = cachedCityImage;
  }

  if (imageUrl) {
    imageUrl = upgradeLandscapeImageUrl(imageUrl);
    landscapeImageUrl = imageUrl;
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
    ...commonsCandidates,
    bundledUrl,
    storageMirrorUrl,
    ...wikiHeroUrls,
    ...(wikiThumbUsable ? [wikiThumbRaw] : []),
    ...(cachedUsable ? [cachedCityImage] : []),
  ]).map((u) => upgradeLandscapeImageUrl(String(u || "")));

  const tips = buildTravelTips(safeCity);
  // OTM en priorité si disponible, sinon données locales
  const suggestedActivities =
    otmData.activities.length > 0
      ? otmData.activities
      : buildSuggestedActivitiesForCity(safeCity);

  const displayCountry = String(geoPack.country || "").trim();
  const displayRegion = String(geoPack.region || "").trim();
  const countryCodeNorm = String(geoPack.countryCode || "")
    .trim()
    .toLowerCase();
  let situationMap = null;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    let countryMap = null;
    // Passer les coordonnées pour le reverse geocoding (beaucoup plus fiable)
    countryMap = await fetchCountryMapData(displayCountry, countryCodeNorm, latitude, longitude);
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
    description: groqDesc
      // Groq : 2 phrases engageantes style magazine (prioritaire)
      ? groqDesc
      // Wikivoyage / Wikipedia : tronqués si trop longs
      : truncateDescription(
          wikivoyageText ||
          summaryPack.summaryText ||
          `${safeCity} est une destination populaire avec une forte identite culturelle, de nombreux quartiers a explorer et une scene locale dynamique.`
        ),
    places:
      places.length > 0
        ? places
        // 1) Foursquare — POIs réels triés par popularité (prioritaire)
        : (otmData.places.length > 0 ? otmData.places : null) ||
          // 2) Catalogue curé (iconicPlacesData.js) — fallback si Foursquare vide/indisponible
          getIconicPlacesFallback(safeCity) ||
          // 3) Texte générique — dernier recours
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

/** Coût activité en EUR : borne et arrondi pour la base. */
function clampActivityCostEUR(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(99999, Math.round(x * 100) / 100);
}

/** Extrait un nombre depuis nombre, chaîne "15", "15,5", "15 €", etc. */
function parseFlexibleCostEUR(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v) {
    const nested = v.eur ?? v.EUR ?? v.amount ?? v.value;
    if (nested != null && nested !== v) return parseFlexibleCostEUR(nested);
  }
  const s = String(v)
    .trim()
    .replace(/€/gi, "")
    .replace(/\s+/g, "")
    .replace(/(\d),(\d)/g, "$1.$2");
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return NaN;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Activité proposée : chaîne (ancien format) ou objet Gemini { title, location, estimatedCostEur, … }.
 */
function normalizeSuggestedActivityShape(raw, destinationHint = "") {
  const dest = String(destinationHint || "").trim();
  if (raw == null) return { title: "", location: "", cost: 0, description: "", costNote: "" };
  if (typeof raw === "string") {
    const title = String(raw).trim();
    return { title, location: dest || "", cost: 0, description: "", costNote: "" };
  }
  if (typeof raw !== "object") return { title: "", location: "", cost: 0, description: "", costNote: "" };
  const o = raw;
  const title = String(o.title ?? o.name ?? o.label ?? o.activity ?? "").trim();
  let location = String(o.location ?? o.lieu ?? o.place ?? o.where ?? o.address ?? "").trim();
  if (!location && dest) location = dest;
  let rawCost =
    o.estimatedCostEur ??
    o.estimated_cost_eur ??
    o.estimatedCost ??
    o.estimated_cost ??
    o.costEur ??
    o.cost_eur ??
    o.price_eur ??
    o.budget ??
    o.budgetEur ??
    o.montant ??
    o.prix;
  if ((rawCost == null || rawCost === "") && typeof o.price === "number") rawCost = o.price;
  if (rawCost == null || rawCost === "") rawCost = o.cost;
  if ((rawCost == null || rawCost === "") && o.price && typeof o.price === "object") {
    rawCost = o.price.eur ?? o.price.EUR ?? o.price.amount;
  }
  const parsed = parseFlexibleCostEUR(rawCost);
  let cost = 0;
  if (Number.isFinite(parsed)) cost = clampActivityCostEUR(parsed);
  else {
    const n = Number(rawCost);
    if (Number.isFinite(n)) cost = clampActivityCostEUR(n);
  }
  const description = String(o.description ?? o.summary ?? "").trim();
  const costNote = String(o.costNote ?? o.cost_note ?? o.priceNote ?? o.price_note ?? "").trim();
  return { title, location, cost, description, costNote };
}

function normalizeSuggestedActivitiesList(list, destinationHint = "") {
  if (!Array.isArray(list)) return [];
  return list.map((x) => normalizeSuggestedActivityShape(x, destinationHint)).filter((x) => x.title);
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
  const suggestedActivities = normalizeSuggestedActivitiesList(fromActs, destinationHint);
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

/** Payload route /api/gemini/suggested-activities → liste normalisée pour l’UI. */
function normalizeGeminiSuggestedActivitiesPayload(data, destinationHint = "") {
  if (!data || typeof data !== "object") return [];
  const fromActs = Array.isArray(data.suggestedActivities)
    ? data.suggestedActivities
    : Array.isArray(data.activities)
      ? data.activities
      : [];
  return normalizeSuggestedActivitiesList(fromActs, destinationHint);
}

function mergeDestinationGuideWithGemini(baseGuide, geminiNorm) {
  if (!baseGuide) return null;
  const city = String(baseGuide.city || "");
  if (!geminiNorm) {
    return {
      ...baseGuide,
      places: clampPlacesList(baseGuide.places, city),
      suggestedActivities: normalizeSuggestedActivitiesList(baseGuide.suggestedActivities, city),
    };
  }
  const mergedPlaces =
    geminiNorm.places.length > 0 ? geminiNorm.places : baseGuide.places;
  return {
    ...baseGuide,
    // Description = Wikipédia / repli local uniquement (pas de résumé Gemini : économie de tokens).
    description: baseGuide.description,
    places: clampPlacesList(mergedPlaces, city),
    tips: {
      do: mergeTipsDoFromGemini(baseGuide.tips?.do, geminiNorm.tips.do, city),
      dont: geminiNorm.tips.dont.length > 0 ? geminiNorm.tips.dont : baseGuide.tips?.dont || [],
    },
    suggestedActivities:
      geminiNorm.suggestedActivities.length > 0
        ? geminiNorm.suggestedActivities
        : normalizeSuggestedActivitiesList(baseGuide.suggestedActivities, city),
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
  const cityBoost = Array.isArray(options.cityBoostTokens)
    ? options.cityBoostTokens.map((t) => normalizeTextForSearch(t)).filter(Boolean)
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
      const cityBoostScore = cityBoost.reduce(
        (acc, tok) => (tok && desc.includes(tok) ? acc + 45 : acc),
        0
      );
      const likes = Number(item?.likes || 0);
      const qualityBoost = Math.min(24, Math.round(likes / 20));
      const firstBias = pickFirst ? Math.max(0, 14 - index) : 0;
      const score = keywordBoost + qualityBoost + firstBias + cityBoostScore - avoidPenalty;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (cityBoost.length > 0 && best && best.score < 8) {
      return "";
    }
    const picked = best?.item || results[0];
    const rawU = picked?.urls?.raw;
    const fullU = picked?.urls?.full;
    const regU = picked?.urls?.regular;
    let out = "";
    if (rawU && String(rawU).includes("images.unsplash.com")) {
      out = String(rawU);
      out += out.includes("?") ? "&" : "?";
      out += "w=2400&fit=max&q=88&auto=format";
    } else {
      out = String(fullU || regU || "");
    }
    return out ? upgradeLandscapeImageUrl(out) : "";
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
  const jRaw = trip?.invited_joined_emails;
  const invited_joined_emails = Array.isArray(jRaw)
    ? [...new Set(jRaw.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))]
    : undefined;
  return {
    ...trip,
    title: String(normalizedTitle || "Voyage"),
    start_date: toYMD(trip?.start_date, getTodayStr()),
    end_date: toYMD(trip?.end_date, getTodayStr()),
    participants: canonicalParticipants(trip?.participants, invites),
    invited_emails: invites,
    invited_joined_emails,
    fixed_url: String(trip?.fixed_url || ""),
  };
}

/** Id voyage / FK activité — toujours comparer avec ça (évite activités « invisibles » si selectedTrip est null). */
function normTripId(id) {
  return String(id ?? "").trim();
}

/** Évite les doublons si la liste brute contient deux fois le même id (course requêtes / état). */
function dedupeTripsById(trips) {
  const seen = new Set();
  const out = [];
  for (const t of trips || []) {
    const id = normTripId(t?.id);
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
  const tag = getAppDateLocale();
  return raw
    .toLocaleLowerCase(tag)
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((seg) => (seg ? seg.charAt(0).toLocaleUpperCase(tag) + seg.slice(1) : seg))
        .join("-")
    )
    .join(" ");
}

/** HH:MM pour champs activité (select, saisie ou input type="time" navigateur → souvent HH:MM:SS). */
function normalizeActivityTimeHHMM(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
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

/** Chevauchement de plages [début, fin] inclusives (AAAA-MM-JJ). */
function ymdRangesOverlap(startA, endA, startB, endB) {
  const a0 = String(startA || "").slice(0, 10);
  const a1 = String(endA || a0).slice(0, 10);
  const b0 = String(startB || "").slice(0, 10);
  const b1 = String(endB || b0).slice(0, 10);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(a0) || !re.test(a1) || !re.test(b0) || !re.test(b1)) return false;
  return a0 <= b1 && b0 <= a1;
}

/** Voyages dont la plage de dates croise [startYmd, endYmd] (exclut excludeTripId si fourni). */
function findTripsOverlappingDateRange(tripList, startYmd, endYmd, excludeTripId = null) {
  const s = String(startYmd || "").slice(0, 10);
  const e = String(endYmd || s).slice(0, 10);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(s) || !re.test(e)) return [];
  return (tripList || []).filter((t) => {
    if (excludeTripId != null && String(t?.id) === String(excludeTripId)) return false;
    const ts = toYMD(t?.start_date, "");
    const te = toYMD(t?.end_date, ts);
    if (!ts || !te) return false;
    return ymdRangesOverlap(s, e, ts, te);
  });
}

function tripDestinationDisplayName(trip) {
  const d = String(trip?.destination || "").trim();
  const ti = String(trip?.title || "").trim();
  const n = String(trip?.name || "").trim();
  return d || ti || n;
}

/** Évite qu'un refetch juste après insertion écrase les activités (latence lecture / temps réel). */
const ACTIVITY_INSERT_GRACE_MS = 90000;

/** Colonne absente du cache schéma PostgREST (ex. PGRST204) — lit message, details et hint. */
function parseMissingSchemaColumnName(err) {
  const blob = [err?.message, err?.details, err?.hint].filter(Boolean).map(String).join("\n");
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /Could not find the "([^"]+)" column/i,
    /column "([^"]+)" does not exist/i,
    /column '([^']+)' does not exist/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m?.[1]) return String(m[1]).trim();
  }
  return "";
}

function mergeActivitiesFromServer(prev, fetched, tripIds, graceRef) {
  const tripIdList = [...new Set((tripIds || []).map((id) => normTripId(id)).filter(Boolean))];
  const tripIdSet = new Set(tripIdList);
  const prevOutside = (prev || []).filter((a) => !tripIdSet.has(normTripId(a.trip_id)));
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
    const serverRows = (fetched || []).filter((a) => normTripId(a.trip_id) === tid);
    const serverIdSet = new Set(serverRows.map((a) => String(a.id)).filter(Boolean));
    const prevRows = (prev || []).filter((a) => normTripId(a.trip_id) === tid);
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
  const tid = normTripId(tripId);
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
    const today = getTodayStr();
    if (start && end && start <= today && end >= today) now.push(trip);
    else if (start && start > today) upcoming.push(trip);
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
  const curated = resolveCityHeroImageUrl(c);
  if (curated) return upgradeLandscapeImageUrl(curated);
  const bundled = getBundledCityHeroPath(c);
  if (bundled) return bundled;
  const mirrored = getStorageMirrorHeroUrl(c);
  if (mirrored) return mirrored;
  const wikiUrls = await fetchWikipediaHeroImageUrls(c);
  const preferred = wikiUrls.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || wikiUrls[0] || "";
  if (preferred) return upgradeLandscapeImageUrl(preferred);
  const thumb = await fetchFrenchWikiSummaryThumb(c);
  if (thumb && !isLikelyWikiFlagOrSealThumb(thumb)) return upgradeLandscapeImageUrl(thumb);
  if (UNSPLASH_ACCESS_KEY) {
    const stockQ = buildCityUnsplashStockQuery(c);
    const cityTok = normalizeCityDroneKey(c).split(/\s+/).filter((t) => t.length > 2);
    const u = await fetchUnsplashImageByQuery(stockQ, {
      pickFirst: false,
      preferredKeywords: [
        "aerial",
        "drone",
        "skyline",
        "landmark",
        "cityscape",
        "cathedral",
        "tower",
        "downtown",
        "urban",
        "beach",
        "harbor",
        "harbour",
      ],
      avoidKeywords: [
        "logo",
        "icon",
        "drawing",
        "illustration",
        "map",
        "diagram",
        "grass",
        "lawn",
        "meadow",
        "field",
        "macro",
        "texture",
        "bokeh",
        "abstract",
        "pattern",
        "fabric",
        "skin",
        "portrait",
        "wedding",
        "food",
        "coffee",
        "pet",
        "flower",
        "leaf",
        "forest",
        "woodland",
        "mountain trail",
      ],
      cityBoostTokens: [...cityTok, normalizeTextForSearch(c).split(/\s+/)[0]].filter(Boolean),
    });
    if (u) return upgradeLandscapeImageUrl(u);
  }
  return "";
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
        if (url) {
          try {
            window.localStorage.setItem(localStorageKey, url);
          } catch (_e) {
            // ignore localStorage errors
          }
          try {
            const { error: insErr } = await supabase
              .from("image_cache")
              .upsert({ id: cacheKey, url }, { onConflict: "id" });
            void insErr;
          } catch (_e) {
            // Ignore cache write failures
          }
        }
        setResolvedUrl(url);
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

  const primarySrc = upgradeLandscapeImageUrl(
    String(resolvedUrl || buildCityImageUrl(safeTitle) || "").trim()
  );
  const displaySrc = loadFailed ? "" : primarySrc;
  const dronePromptFr = buildCityDronePromptFR(prompt || safeTitle);

  return (
    <div className="h-full w-full overflow-hidden rounded-[3rem] bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300">
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={`${safeTitle} — vue aérienne drone, photo de voyage`}
          title={dronePromptFr}
          className="h-full w-full object-cover object-center"
          referrerPolicy="no-referrer"
          onError={() => {
            if (!loadFailed) setLoadFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}

/** Fond photo ville + flou / verre (même recette que l’onglet Chat). */
function TripLiquidGlassShell({ imageTitle, active = false, className = "", children }) {
  return (
    <div className={`relative overflow-hidden ring-1 ring-inset ring-white/10 ${className}`.trim()}>
      {/* Photo de la ville — flou léger pour garder la transparence premium */}
      <div
        className="pointer-events-none absolute inset-[-6px] scale-[1.03] overflow-hidden"
        style={{
          filter: active
            ? "blur(2.5px) saturate(1.5) brightness(0.82)"
            : "blur(2px) saturate(1.4) brightness(0.85)",
        }}
      >
        <CityImage title={String(imageTitle || "voyage")} />
      </div>

      {/* Voile sombre — lisibilité du texte sans masquer la photo */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: active
            ? "linear-gradient(160deg, rgba(2,6,23,0.38) 0%, rgba(2,6,23,0.55) 100%)"
            : "linear-gradient(160deg, rgba(2,6,23,0.30) 0%, rgba(2,6,23,0.48) 100%)",
        }}
      />

      {/* Shimmer blanc en haut pour l'effet "liquid glass" */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.0) 65%)",
        }}
      />

      <div className="relative">{children}</div>
    </div>
  );
}

function TopNav({ onMenu, onAdd, title }) {
  return (
    <header className="sticky top-0 z-30 min-w-0 px-3 pt-4 sm:px-5">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center justify-between gap-2 rounded-[2.25rem] bg-white/90 px-3 py-3 shadow-[0_16px_44px_rgba(30,58,95,0.09)] backdrop-blur-xl ring-1 ring-sky-100/55 sm:px-6 sm:py-4">
        <button
          type="button"
          onClick={onMenu}
          className="shrink-0 rounded-full p-2.5 text-slate-700 hover:bg-slate-100 sm:p-3"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1 px-1 text-center">
          <h1 className="truncate text-sm font-semibold tracking-[0.06em] text-slate-900 sm:text-base sm:tracking-[0.08em]">
            {String(title || "Mes Voyages")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onAdd}
          data-tour-id="plus-button"
          className={`shrink-0 rounded-full p-2.5 text-white transition hover:opacity-90 sm:p-3 ${GLASS_BUTTON_CLASS}`}
          style={GLASS_ACCENT_STYLE}
        >
          <Plus size={20} />
        </button>
      </div>
    </header>
  );
}

/** Prénom / premier mot du nom complet / partie locale de l'e-mail pour la salutation du menu. */
function getMenuGreetingName(user) {
  if (!user) return "";
  const meta = user.user_metadata || {};
  const first = String(meta.first_name || "").trim();
  if (first) return first;
  const full = String(meta.full_name || "").trim();
  if (full) {
    const w = full.split(/\s+/)[0];
    if (w) return w;
  }
  const email = String(user.email || "").trim();
  if (email.includes("@")) return email.split("@")[0];
  return email;
}

// Modales
function SideMenu({ open, onClose, user, onOpenAccount, onSignOut, activeTab, onSwitchTab, onShowTour }) {
  const { t } = useI18n();
  const greetingName = getMenuGreetingName(user);
  const navItems = [
    { id: "trips", key: "nav.trips" },
    { id: "planner", key: "nav.planner" },
    { id: "destination", key: "nav.search" },
    { id: "budget", key: "nav.budget" },
    { id: "chat", key: "nav.chat" },
  ];
  return (
    <div className={`fixed inset-0 z-40 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div className={`absolute inset-0 bg-black/20 transition ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        className={`absolute left-0 top-0 h-full w-[min(20rem,calc(100vw-1rem))] max-w-[100vw] overflow-x-hidden overflow-y-auto bg-white/80 p-5 shadow-2xl backdrop-blur-xl transition sm:w-80 sm:p-6 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{t("menu.title")}</p>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label={t("menu.closeMenu")}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 text-sm text-slate-700">
          <p className="text-sm font-medium text-slate-700">
            {greetingName
              ? t("menu.greeting", { name: greetingName })
              : t("menu.greetingNoName")}
          </p>
          <LanguageSelector className="pt-1" />
          <div className="pt-2">
            <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">{t("menu.navigation")}</p>
            <div className="space-y-2">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSwitchTab(item.id)}
                    className={`w-full rounded-2xl px-3 py-2 text-left text-xs transition ${
                      active ? "text-white" : "border border-slate-200 bg-white hover:bg-slate-100"
                    }`}
                    style={active ? { backgroundColor: ACCENT } : undefined}
                  >
                    {t(item.key)}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenAccount}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
          >
            {t("menu.account")}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm hover:bg-slate-100"
          >
            {t("menu.signOut")}
          </button>
          {/* ── Aide ── */}
          <div className="mt-4 pt-4 border-t border-slate-200/70">
            <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-slate-500">{t("menu.help")}</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowTour?.();
              }}
              className="w-full flex items-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <span className="text-base leading-none">🧭</span>
              {t("menu.howItWorks")}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Erreur GoTrue / Supabase : inscription avec un e-mail déjà enregistré. */
/**
 * Retire le fond blanc du PNG logo sur l’écran d’accueil auth (canvas, même origine).
 * Seuil souple pour l’anti-crénelage ; l’oiseau bleu foncé reste opaque.
 */
function AuthLandingLogoImg({ src, alt, className }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const minBright = 242;
        const maxChroma = 14;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          if (mx >= minBright && mx - mn <= maxChroma) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        const out = c.toDataURL("image/png");
        if (!cancelled) {
          setDataUrl(out);
          setReady(true);
        }
      } catch (_e) {
        if (!cancelled) setReady(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) setReady(true);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img
      src={dataUrl || src}
      alt={alt}
      className={`${className} transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`.trim()}
      width={280}
      height={280}
      decoding="async"
    />
  );
}

function isAuthSignupDuplicateEmailError(err) {
  const m = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase().replace(/_/g, "");
  if (code.includes("useralreadyexists") || code.includes("emailalready")) return true;
  const status = err?.status ?? err?.statusCode;
  if (status === 422 || String(status) === "422") return true;
  if (!m) return false;
  if (m.includes("already registered")) return true;
  if (m.includes("already been registered")) return true;
  if (m.includes("email address is already")) return true;
  if (m.includes("user already exists")) return true;
  if (m.includes("a user with this email")) return true;
  if (m.includes("database error saving new user") && m.includes("unique")) return true;
  return false;
}

function AuthView() {
  const { t } = useI18n();
  const [showAuthLanding, setShowAuthLanding] = useState(() => !authHasInviteLink());
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
  const [inviteFromName, setInviteFromName] = useState("");
  const [inviteStartDate, setInviteStartDate] = useState("");
  const [inviteEndDate, setInviteEndDate] = useState("");
  const [inviteAccepted, setInviteAccepted] = useState(false);
  const [emailExistsModalOpen, setEmailExistsModalOpen] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const invite = params.get("invite");
      const invitedEmail = String(params.get("email") || "").trim();
      const invitedTrip = String(params.get("trip") || "").trim();
      if (invite !== "1" || !invitedEmail) return;
      setInviteEmail(invitedEmail);
      setInviteTripName(invitedTrip);
      setInviteFromName(String(params.get("from") || "").trim());
      setInviteStartDate(String(params.get("start") || "").trim());
      setInviteEndDate(String(params.get("end") || "").trim());
      setInviteAccepted(false);
      setMode("signup");
      setInvitePromptOpen(true);
    } catch (_e) {
      // ignore malformed URL params
    }
  }, []);

  const clearInviteParams = () => {
    try {
      const url = new URL(window.location.href);
      ["invite", "email", "trip", "from", "start", "end"].forEach((k) => url.searchParams.delete(k));
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
      setMsg(t("auth.errEmailPassword"));
      return;
    }
    if (mode === "signup" && (!safeFirstName || !safeLastName)) {
      setMsg(t("auth.errNameRequired"));
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
        // Avant signUp pour que SIGNED_IN (immédiat) voie encore le marqueur.
        markSignupExpectsOnboarding(safeEmail);
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
        if (error) {
          clearSignupOnboardingMarkers();
          throw error;
        }
        setMsg(t("auth.accountCreated"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: safeEmail,
          password: safePassword,
        });
        if (error) throw error;
      }
    } catch (e) {
      if (mode === "signup") clearSignupOnboardingMarkers();
      if (mode === "signup" && isAuthSignupDuplicateEmailError(e)) {
        setEmailExistsModalOpen(true);
        setMsg("");
      } else {
        const raw = String(e?.message || "");
        if (raw.toLowerCase().includes("invalid login credentials")) {
          setMsg(t("auth.invalidCredentials"));
        } else {
          setMsg(raw || t("auth.errGeneric"));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    const safeEmail = String(email || "").trim();
    if (!safeEmail) {
      setMsg(t("auth.forgotNeedEmail"));
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const redirectTo = `${window.location.origin}`;
      const { error } = await supabase.auth.resetPasswordForEmail(safeEmail, { redirectTo });
      if (error) throw error;
      setMsg(t("auth.resetSent"));
    } catch (e) {
      setMsg(String(e?.message || t("auth.resetErr")));
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
      setMsg(t("auth.inviteNeedFields"));
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      markSignupExpectsOnboarding(safeInviteEmail);
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
      if (error) {
        clearSignupOnboardingMarkers();
        throw error;
      }
      setFirstName(safeFirst);
      setLastName(safeLast);
      setEmail(safeInviteEmail);
      setPassword("");
      setInvitePromptOpen(false);
      clearInviteParams();
      setMsg(t("auth.inviteCreated"));
    } catch (e) {
      clearSignupOnboardingMarkers();
      if (isAuthSignupDuplicateEmailError(e)) {
        setEmailExistsModalOpen(true);
        setMsg("");
      } else {
        setMsg(String(e?.message || t("auth.inviteErr")));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showAuthLanding ? (
        <div className="relative min-h-[100dvh] overflow-x-hidden" style={{ color: TEXT }}>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${AUTH_LANDING_BG})` }}
            role="presentation"
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/45 to-slate-950/88" aria-hidden />
          <div
            className="relative z-10 flex min-h-[100dvh] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]"
          >
            <div className="flex flex-1 flex-col items-center pt-6 sm:pt-10">
              <div className="flex flex-col items-center gap-0 leading-none">
                <AuthLandingLogoImg
                  src="/LogoTriPlanner.png"
                  alt={t("auth.logoAlt")}
                  className="block h-[13.5rem] w-[13.5rem] max-w-[min(96vw,14rem)] object-contain object-top align-top drop-shadow-[0_6px_28px_rgba(0,0,0,0.45)] sm:h-[17.5rem] sm:w-[17.5rem] sm:max-w-[18rem] -mb-[5.25rem] sm:-mb-[6.5rem]"
                />
                <h1 className="relative z-[1] text-center text-[1.75rem] font-bold leading-none tracking-tight text-white sm:text-4xl">
                  {t("auth.brand")}
                </h1>
              </div>
              <p className="mt-8 max-w-[22rem] text-center text-[0.95rem] leading-snug text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] sm:mt-10 sm:text-base">
                {t("auth.landingTagline")}
              </p>
            </div>
            <div className="mx-auto mt-8 w-full max-w-sm shrink-0 space-y-3 sm:mt-10">
              <button
                type="button"
                onClick={() => {
                  setShowAuthLanding(false);
                  setMode("signin");
                  setMsg("");
                }}
                className="w-full rounded-full bg-white px-6 py-4 text-center text-base font-semibold text-slate-900 shadow-lg transition hover:bg-white/95 active:scale-[0.99]"
              >
                {t("auth.landingSignIn")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAuthLanding(false);
                  setMode("signup");
                  setMsg("");
                }}
                className={`w-full rounded-full px-6 py-4 text-center text-base font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.35)] transition hover:brightness-110 active:scale-[0.99] ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                {t("auth.landingSignUp")}
              </button>
            </div>
            <div className="mt-8 flex justify-center pb-2">
              <LanguageFab placement="authFooter" />
            </div>
          </div>
        </div>
      ) : (
    <div className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-5" style={{ background: BG, color: TEXT }}>
      <div className="relative mx-auto mt-10 min-w-0 w-full max-w-lg overflow-x-clip overflow-y-visible rounded-[2.5rem] bg-white/80 p-4 pb-6 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50 sm:rounded-[4.5rem] sm:p-8 sm:pb-8">
        {!invitePromptOpen ? (
          <button
            type="button"
            onClick={() => {
              setShowAuthLanding(true);
              setMsg("");
            }}
            className="mb-3 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100/80 hover:text-slate-900"
          >
            <ArrowLeft size={18} className="shrink-0" aria-hidden />
            {t("auth.backToWelcome")}
          </button>
        ) : null}
        <h1 className="mb-2 text-center text-xs uppercase tracking-[0.4em] text-slate-500">{t("auth.brand")}</h1>
        <p className="mb-6 text-center text-lg font-semibold">
          {mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
        </p>
        <div className="space-y-3">
          {mode === "signup" ? (
            <>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("auth.firstName")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("auth.lastName")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">{t("auth.profilePhotoOptional")}</p>
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                    {profilePhotoPreview ? (
                      <img src={profilePhotoPreview} alt={t("auth.previewAlt")} className="h-full w-full object-cover" />
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
                    className="min-w-0 flex-1 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>
              </div>
            </>
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {loading
              ? t("auth.loading")
              : mode === "signin"
                ? t("auth.submitSignIn")
                : t("auth.submitSignUp")}
          </button>
        </div>
        <button
          type="button"
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
            ? t("auth.inviteFlowNote")
            : mode === "signin"
              ? t("auth.toggleSignUp")
              : t("auth.toggleSignIn")}
        </button>
        {mode === "signin" && !invitePromptOpen ? (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={loading}
            className="mt-2 w-full text-sm text-slate-600 underline disabled:opacity-60"
          >
            {t("auth.forgotPassword")}
          </button>
        ) : null}
        {msg ? (
          <div className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            {String(msg)}
          </div>
        ) : null}
        <footer className="mt-6 border-t border-slate-200/60 pt-4">
          <LanguageFab placement="authFooter" />
        </footer>
      </div>
      {invitePromptOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setInvitePromptOpen(false); setInviteAccepted(false); clearInviteParams(); } }}>
          <div
            className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
            style={{ maxHeight: "92svh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle mobile */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            {!inviteAccepted ? (
              /* ── Étape 1 : détails + Accept/Decline ── */
              <div className="px-5 pb-8 pt-4 sm:px-6 sm:pt-5">
                {/* Icône + titre */}
                <div className="mb-5 flex items-center gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-2xl shadow-sm">
                    ✈️
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {t("auth.inviteTitle")}
                    </p>
                    <h3 className="text-[17px] font-bold leading-tight text-slate-900">
                      {inviteFromName
                        ? t("auth.inviteFrom", { name: inviteFromName })
                        : t("auth.inviteFromGeneric")}
                    </h3>
                  </div>
                </div>

                {/* Carte détails voyage */}
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100 space-y-2.5">
                  {inviteTripName && (
                    <div className="flex items-center gap-2.5">
                      <MapPin size={14} className="shrink-0 text-indigo-500" />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {t("auth.inviteDestination")}
                        </p>
                        <p className="text-[14px] font-bold text-slate-900">{inviteTripName}</p>
                      </div>
                    </div>
                  )}
                  {inviteStartDate && inviteEndDate && (
                    <div className="flex items-center gap-2.5">
                      <Calendar size={14} className="shrink-0 text-indigo-500" />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Dates</p>
                        <p className="text-[13px] font-semibold text-slate-800">
                          {t("auth.inviteDates", {
                            start: formatDate(inviteStartDate),
                            end: formatDate(inviteEndDate),
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 border-t border-slate-100 pt-2.5">
                    <Mail size={13} className="shrink-0 text-slate-400" />
                    <p className="break-all text-[11px] text-slate-500">
                      {t("auth.inviteEmailLine", { email: String(inviteEmail || "-") })}
                    </p>
                  </div>
                </div>

                {/* Boutons Accept / Decline */}
                <div className="mt-5 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setInvitePromptOpen(false);
                      clearInviteParams();
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
                  >
                    {t("auth.inviteDecline")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteAccepted(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <span>🎉</span>
                    {t("auth.inviteAccept")}
                  </button>
                </div>

                <footer className="mt-5 border-t border-slate-100 pt-4">
                  <LanguageFab placement="authFooter" />
                </footer>
              </div>
            ) : (
              /* ── Étape 2 : formulaire création compte ── */
              <div className="px-5 pb-8 pt-5 sm:px-6">
                <button
                  type="button"
                  onClick={() => setInviteAccepted(false)}
                  className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-600"
                >
                  <span>←</span> Retour
                </button>
                <h3 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {t("auth.inviteTitle")}
                </h3>
                <p className="mb-4 text-[15px] font-bold text-slate-900">{t("auth.inviteSignupStep")}</p>
                <div className={`space-y-3`}>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={inviteFirstName}
                      onChange={(e) => setInviteFirstName(e.target.value)}
                      placeholder={t("auth.firstName")}
                      className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[13px]"
                    />
                    <input
                      value={inviteLastName}
                      onChange={(e) => setInviteLastName(e.target.value)}
                      placeholder={t("auth.lastName")}
                      className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[13px]"
                    />
                  </div>
                  <input
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder={t("auth.password")}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={completeInviteSignup}
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? t("auth.inviteCreating") : t("auth.inviteSubmit")}
                  </button>
                </div>
                <footer className="mt-5 border-t border-slate-100 pt-4">
                  <LanguageFab placement="authFooter" />
                </footer>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {emailExistsModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-email-exists-title"
          onClick={(e) => { if (e.target === e.currentTarget) setEmailExistsModalOpen(false); }}
        >
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200/80 sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h2
              id="auth-email-exists-title"
              className="text-lg font-semibold text-slate-900"
            >
              {t("auth.emailAlreadyUsedTitle")}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {t("auth.emailAlreadyUsedBody")}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="order-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:order-1 sm:w-auto"
                onClick={() => {
                  setEmailExistsModalOpen(false);
                }}
              >
                {t("common.close")}
              </button>
              <button
                type="button"
                className="order-1 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 sm:order-2 sm:w-auto"
                onClick={() => {
                  setEmailExistsModalOpen(false);
                  setInvitePromptOpen(false);
                  clearInviteParams();
                  setMode("signin");
                }}
              >
                {t("auth.emailAlreadyUsedGoSignIn")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
      )}
    </>
  );
}

function TripFormModal({ open, onClose, onCreate }) {
  const { t } = useI18n();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-[min(36rem,calc(100vw-1.5rem))] overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">{t("tripForm.title")}</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
          <CitySearchBox
            value={title}
            onChange={setTitle}
            onPick={(city) => setTitle(String(city || ""))}
            placeholder={t("tripForm.destination")}
            showSuggestions
            suggestPortal
          />
          <TripDateRangeField
            startDate={startDate}
            endDate={endDate}
            onRangeChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
          <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_2.75rem] items-stretch gap-2">
            <input
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInvites();
                }
              }}
              placeholder={t("tripForm.invitePlaceholder")}
              className="min-w-0 w-full max-w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
            />
            <button
              type="button"
              onClick={addInvites}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100"
              title={t("tripForm.addInviteTitle")}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
            <p className="text-xs text-slate-600">
              {t("tripForm.invitedLine", { count: invitedEmails.length })}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{t("tripForm.inviteHint")}</p>
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
                      title={t("tripForm.removeTitle")}
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
            {submitting ? t("tripForm.creating") : t("tripForm.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteEmailsModal({ open, onClose, title, initialEmails, onSave }) {
  const { t } = useI18n();
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-2xl ring-1 ring-slate-200/70 sm:rounded-[3rem] sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="min-w-0 text-xs uppercase tracking-[0.32em] text-slate-500">
            {String(title || t("modals.inviteParticipantsTitle"))}
          </h3>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex min-w-0 gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={t("modals.inviteEmailPlaceholder")}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
          />
          <button
            onClick={addEmail}
            className={`shrink-0 rounded-2xl px-3 py-3 text-sm text-white sm:px-4 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {t("common.add")}
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
          )) : <p className="text-xs text-slate-500">{t("modals.noInviteesYet")}</p>}
        </div>

        <button
          onClick={() => onSave(Array.isArray(emails) ? emails : [])}
          className={`mt-4 w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
          style={GLASS_ACCENT_STYLE}
        >
          {t("modals.saveInvitations")}
        </button>
      </div>
    </div>
  );
}

function EditTripModal({ open, onClose, trip, onSave }) {
  const { t, language } = useI18n();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [fixedUrl, setFixedUrl] = useState("");
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  useEffect(() => {
    if (!trip) return;
    const rawTitle = String(trip?.title || "");
    const shown = displayCityForLocale(rawTitle, language) || rawTitle;
    setTitle(shown);
    setStartDate(toYMD(trip?.start_date, getTodayStr()));
    setEndDate(toYMD(trip?.end_date, getTodayStr()));
    setFixedUrl(String(trip?.fixed_url || ""));
    setInvitedEmails(Array.isArray(trip?.invited_emails) ? trip.invited_emails : []);
  }, [trip, language]);

  if (!open || !trip) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-[min(36rem,calc(100vw-1.5rem))] overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">{t("modals.editTripTitle")}</h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
          <CitySearchBox
            value={title}
            onChange={setTitle}
            onPick={(city) => setTitle(String(city || ""))}
            placeholder={t("tripForm.destination")}
            showSuggestions
            suggestPortal
          />
          <TripDateRangeField
            startDate={startDate}
            endDate={endDate}
            onRangeChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
          <input
            value={fixedUrl}
            onChange={(e) => setFixedUrl(e.target.value)}
            placeholder={t("modals.optionalShareLink")}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm text-slate-700">
              {t("modals.invitesLine", { count: invitedEmails.length })}
            </p>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100"
              title={t("modals.inviteByEmailTitle")}
            >
              <Mail size={14} />
            </button>
          </div>
          <button
            onClick={() => {
              const rawTripTitle = String(trip?.title || "").trim();
              const localizedBaseline = String(
                displayCityForLocale(rawTripTitle, language) || rawTripTitle
              ).trim();
              const nextTitle = String(title || "").trim();
              const titleToSave =
                nextTitle === localizedBaseline ? rawTripTitle : nextTitle;
              onSave({
                ...trip,
                title: titleToSave,
                start_date: startDate,
                end_date: endDate,
                fixed_url: String(fixedUrl || "").trim(),
                invited_emails: invitedEmails,
              });
            }}
            className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {t("modals.editTripSave")}
          </button>
        </div>
      </div>
      <InviteEmailsModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title={t("modals.inviteParticipantsTitle")}
        initialEmails={invitedEmails}
        onSave={(emails) => {
          setInvitedEmails(Array.isArray(emails) ? emails : []);
          setInviteModalOpen(false);
        }}
      />
    </div>
  );
}

// ── InviteEmailModal ──────────────────────────────────────────────────────────
function InviteEmailModal({ open, onClose, trip, activities, inviterName }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");

  useEffect(() => { if (open) { setEmail(""); setState("idle"); } }, [open]);

  if (!open || !trip) return null;

  const tripTitle = String(trip?.title || t("modals.tripDefault"));
  const startDate = String(trip?.start_date || "");
  const endDate = String(trip?.end_date || "");
  const dateRange = `${formatDate(startDate)} \u2014 ${formatDate(endDate)}`;

  const buildProgramme = () => {
    const rows = (activities || []).slice().sort((a, b) => {
      const d = String(a.date || "").localeCompare(String(b.date || ""));
      return d !== 0 ? d : String(a.time || "").localeCompare(String(b.time || ""));
    });
    if (!rows.length) return "";
    const byDay = {};
    rows.forEach((r) => { const k = String(r.date || ""); if (!byDay[k]) byDay[k] = []; byDay[k].push(r); });
    return Object.entries(byDay).map(([date, acts]) =>
      [`\uD83D\uDCC5 ${formatDate(date)}`, ...acts.map((a) => `  ${String(a.time || "--:--").slice(0, 5)}  ${String(a.title || "")}`)].join("\n")
    ).join("\n\n");
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setState("sending");
    const programme = buildProgramme();
    const inv = await postTripInvitesToApi({
      to: [trimmed],
      tripTitle,
      startYmd: startDate,
      endYmd: endDate,
      fixedUrl: String(trip?.fixed_url || ""),
      programmeText: programme,
    });
    if (inv.ok && !inv.skipped) {
      setState("sent");
      setTimeout(onClose, 1500);
      return;
    }
    const inviteParams = new URLSearchParams({
      invite: "1",
      email: trimmed,
      trip: tripTitle,
      ...(inviterName ? { from: inviterName } : {}),
      ...(startDate ? { start: startDate } : {}),
      ...(endDate ? { end: endDate } : {}),
    });
    const inviteUrl = `${window.location.origin}?${inviteParams.toString()}`;
    const subj = encodeURIComponent(`\u2708\uFE0F ${inviterName ? `${inviterName} vous invite` : "Invitation"} : ${tripTitle}`);
    const bodyLines = [
      `Bonjour,`, ``,
      `${inviterName ? `${inviterName} vous` : "Vous"} invite(nt) \u00e0 rejoindre le voyage "${tripTitle}" !`, ``,
      `\uD83D\uDCC5 Dates : ${dateRange}`,
      programme ? `\n\uD83D\uDCCB Programme :\n${programme}` : "",
      ``,
      `\uD83D\uDD17 Acc\u00e9dez aux d\u00e9tails et rejoignez le voyage directement :`,
      inviteUrl,
      ``,
      `\u00c0 bient\u00f4t ! \uD83C\uDF0D`,
    ].join("\n");
    window.location.href = `mailto:${encodeURIComponent(trimmed)}?subject=${subj}&body=${encodeURIComponent(bodyLines)}`;
    setState("sent");
    setTimeout(onClose, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <Mail size={16} strokeWidth={2.5} />
            </span>
            <h2 className="text-[15px] font-bold text-slate-900">{t("modals.shareInviteEmailTitle")}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X size={15} /></button>
        </div>
        <div className="px-5 pb-6 space-y-4">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-100">
            <MapPin size={13} className="shrink-0 text-indigo-500" />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-slate-800">{tripTitle}</p>
              <p className="text-[11px] text-slate-400">{dateRange}</p>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">E-mail</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder={t("modals.shareInviteEmailPlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              autoFocus
            />
          </div>
          <p className="flex gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-sky-700 ring-1 ring-sky-100">
            <span className="mt-0.5 shrink-0">ℹ️</span>
            <span>{t("modals.shareInviteEmailHint")}</span>
          </p>
          <button
            type="button" onClick={handleSend} disabled={state === "sent"}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {state === "sent" ? `\u2713 ${t("modals.shareInviteEmailSent")}` : state === "sending" ? t("modals.shareInviteEmailSending") : t("modals.shareInviteEmailSend")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ShareModal ────────────────────────────────────────────────────────────────
function ShareModal({ open, onClose, trip, activities, inviterName }) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => { if (!open) setInviteOpen(false); }, [open]);

  if (!open || !trip) return null;

  const invitedEmails = Array.isArray(trip?.invited_emails) ? trip.invited_emails : [];
  const tripTitle = String(trip?.title || t("modals.tripDefault"));
  const dateRange = `${formatDate(trip?.start_date)} \u2014 ${formatDate(trip?.end_date)}`;

  const sortedActs = (activities || []).slice().sort((a, b) => {
    const d = String(a.date || "").localeCompare(String(b.date || ""));
    return d !== 0 ? d : String(a.time || "").localeCompare(String(b.time || ""));
  });
  const byDay = {};
  sortedActs.forEach((r) => { const k = String(r.date || ""); if (!byDay[k]) byDay[k] = []; byDay[k].push(r); });
  const dayEntries = Object.entries(byDay);

  const buildRecap = () => {
    const lines = [`\u2708\uFE0F ${tripTitle}`, `\uD83D\uDCC5 ${dateRange}`];
    if (dayEntries.length) {
      lines.push("", `\u2500\u2500 ${t("modals.shareProgramSection")} \u2500\u2500`);
      dayEntries.forEach(([date, acts]) => {
        lines.push(`\n${formatDate(date)}`);
        acts.forEach((a) => lines.push(`  ${String(a.time || "--:--").slice(0, 5)}  ${String(a.title || "")}`));
      });
    }
    if (invitedEmails.length) lines.push("", `\u2500\u2500 ${t("modals.shareGuestsSection")} \u2500\u2500`, invitedEmails.join(", "));
    const link = String(trip?.fixed_url || "").trim();
    if (link) lines.push("", `\uD83D\uDD17 ${link}`);
    return lines.join("\n");
  };

  const copy = async () => {
    const text = buildRecap();
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); return; } catch (_e) { /* fallback */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-9999px";
      document.body.appendChild(ta); ta.select();
      setCopyState(document.execCommand("copy") ? "copied" : "error");
      document.body.removeChild(ta);
    } catch (_err) { setCopyState("error"); }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[1.75rem]"
          style={{ maxHeight: "90svh" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-slate-200" />
          </div>
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t("modals.shareTitle")}</p>
              <h2 className="text-[17px] font-bold leading-tight text-slate-900">{tripTitle}</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">{dateRange}</p>
            </div>
            <button onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
          <div className="h-px shrink-0 bg-slate-100 mx-5" />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 pt-4 pb-2 sm:px-6">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("modals.shareProgramSection")}</p>
              {dayEntries.length === 0 ? (
                <p className="text-[12px] italic text-slate-400">{t("modals.shareNoActivities")}</p>
              ) : (
                <ol className="space-y-5">
                  {dayEntries.map(([date, acts], di) => (
                    <li key={date}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-600 to-indigo-700 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                          {t("modals.shareDay", { n: di + 1 })}
                        </span>
                        <span className="text-[12px] font-semibold text-slate-600">{formatDate(date)}</span>
                      </div>
                      <ul className="space-y-2 pl-1">
                        {acts.map((a, ai) => (
                          <li key={ai} className="flex items-start gap-3">
                            <span className="mt-0.5 shrink-0 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums text-slate-500">
                              {String(a.time || "--:--").slice(0, 5)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium leading-snug text-slate-800">{String(a.title || "")}</p>
                              {String(a.location || "") ? (
                                <p className="text-[11px] text-slate-400">{String(a.location)}</p>
                              ) : null}
                            </div>
                            {Number(a.cost) > 0 ? (
                              <span className="shrink-0 text-[11px] font-semibold text-slate-400">~{Number(a.cost)}&euro;</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {invitedEmails.length > 0 && (
              <div className="px-5 pt-4 pb-2 sm:px-6">
                <div className="h-px bg-slate-100 mb-4" />
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("modals.shareGuestsSection")}</p>
                <div className="flex flex-wrap gap-2">
                  {invitedEmails.map((mail) => (
                    <span key={mail} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-700">
                      <Mail size={11} className="shrink-0 text-slate-400" />{String(mail)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="h-4" />
          </div>
          <div className="shrink-0 border-t border-slate-100 px-5 pb-6 pt-3 flex items-center gap-2.5 sm:px-6 sm:pb-4">
            <button
              onClick={copy}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              {copyState === "copied"
                ? <><span className="text-emerald-600">✓</span> {t("modals.copied")}</>
                : <><span>📋</span> {t("modals.copyRecap")}</>}
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-2.5 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              <Mail size={15} strokeWidth={2.5} />
              {t("modals.shareInviteByEmail")}
            </button>
          </div>
        </div>
      </div>
      <InviteEmailModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        trip={trip}
        activities={activities}
        inviterName={inviterName}
      />
    </>
  );
}

function TripParticipantsModal({ open, onClose, trip, onSave }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xs uppercase tracking-[0.4em] text-slate-500">Participants</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Ils servent au <span className="font-medium text-slate-800">partage des dépenses</span> et aux{' '}
              <span className="font-medium text-slate-800">soldes</span> affichés dans le budget de ce voyage.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100" aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 flex min-w-0 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="E-mail du participant"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
          />
          <button
            onClick={() => {
              const v = String(name || "").trim();
              if (!v) return;
              setList((prev) => [...prev, v]);
              setName("");
            }}
            className={`shrink-0 rounded-2xl px-3 py-3 text-sm text-white sm:px-4 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {list && list.length > 0
            ? list.map((p, idx) => (
                <div
                  key={`${String(p)}-${idx}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-slate-100 px-3 py-3 sm:px-4"
                >
                  <span className="min-w-0 break-all text-sm">{String(p)}</span>
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
  const { t } = useI18n();
  if (!open || !trip) return null;
  const delTitle = String(trip?.title || t("modals.tripDefault"));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}>
      <div className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-xs uppercase tracking-[0.4em] text-slate-500">{t("common.confirmation")}</h2>
        <p className="mb-6 break-words text-sm text-slate-700">
          {t("modals.deleteTripQuestion", { title: delTitle })}
        </p>
        <div className={MODAL_GRID_2}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-w-0 rounded-2xl border border-slate-200 px-2 py-3 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="min-w-0 rounded-2xl px-2 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
            style={{ backgroundColor: "#e11d48" }}
          >
            {deleting ? t("modals.deleting") : t("modals.delete")}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !deleting && !saving) onClose(); }}>
      <div className="min-w-0 w-full max-w-xl overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">Mon compte</h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 space-y-3">
          <div className={MODAL_GRID_2}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prenom"
              className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
              className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Adresse mail"
            className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3"
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
  const { t, language } = useI18n();
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
                  {displayCityForLocale(String(trip.title || ""), language) || t("modals.tripDefault")}
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
          title={t("tripCard.share")}
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
                title={t("tripCard.edit")}
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
                title={t("tripCard.delete")}
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

function formatCitySuggestionDisplay(suggestion, lang) {
  const s = String(suggestion || "").trim();
  if (!s) return "";
  const i = s.indexOf(",");
  if (i === -1) return displayCityForLocale(s, lang);
  const cityPart = s.slice(0, i).trim();
  const rest = s.slice(i + 1).trim();
  const locCity = displayCityForLocale(cityPart, lang);
  return rest ? `${locCity}, ${rest}` : locCity;
}

function CitySearchBox({
  value,
  onChange,
  onPick,
  onConfirm,
  placeholder,
  showSuggestions = true,
  suggestPortal = false,
  className = "",
}) {
  const { language: uiLanguage } = useI18n();
  const wrapRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  /** `key` = requête normalisée à laquelle `list` correspond (ignore si différent du champ → liste locale seule, immédiat). */
  const [remotePack, setRemotePack] = useState(() => ({ key: "", list: [] }));
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [portalPos, setPortalPos] = useState(null);
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
  const dropdownReserve = !suggestPortal && show ? Math.min(suggestions.length, 6) * 42 + 16 : 0;

  const updatePortalPos = useCallback(() => {
    if (!suggestPortal || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const gap = 8;
    const maxH = Math.min(256, Math.max(120, window.innerHeight - r.bottom - gap - 16));
    setPortalPos({ top: r.bottom + gap, left: r.left, width: r.width, maxHeight: maxH });
  }, [suggestPortal]);

  useLayoutEffect(() => {
    if (!show || !suggestPortal) {
      setPortalPos(null);
      return;
    }
    updatePortalPos();
    window.addEventListener("resize", updatePortalPos);
    window.addEventListener("scroll", updatePortalPos, true);
    return () => {
      window.removeEventListener("resize", updatePortalPos);
      window.removeEventListener("scroll", updatePortalPos, true);
    };
  }, [show, suggestPortal, updatePortalPos, suggestions.length, value]);

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
        const remote = await fetchWorldwideCitySuggestions(q, 8, uiLanguage);
        if (!cancelled) setRemotePack({ key, list: remote });
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, showSuggestions, uiLanguage]);

  const dropdownClass =
    "max-h-64 overflow-auto rounded-2xl bg-white/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl ring-1 ring-slate-200/80";

  const suggestionButtons = suggestions.map((city) => (
    <button
      key={city}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (onPick) onPick(city);
        else onChange(city);
        setFocused(false);
      }}
      className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
    >
      {formatCitySuggestionDisplay(city, uiLanguage)}
    </button>
  ));

  const portalDropdown =
    show && suggestPortal && portalPos && typeof document !== "undefined"
      ? createPortal(
          <div
            className={`z-[70] ${dropdownClass}`}
            style={{
              position: "fixed",
              top: portalPos.top,
              left: portalPos.left,
              width: portalPos.width,
              maxHeight: portalPos.maxHeight,
            }}
          >
            {suggestionButtons}
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={wrapRef}
      className={`relative min-w-0 w-full ${className}`.trim()}
      style={dropdownReserve ? { marginBottom: dropdownReserve } : undefined}
    >
      <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100/70 shadow-[0_2px_12px_rgba(30,58,95,0.04)]">
        <Search size={16} className="shrink-0 text-sky-400/80" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key !== "Enter" || !onConfirm) return;
            const q = normalizeCityInput(value);
            if (q.length < 2) return;
            e.preventDefault();
            if (confirmBusy) return;
            setConfirmBusy(true);
            try {
              await Promise.resolve(onConfirm(value));
            } finally {
              setConfirmBusy(false);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          disabled={confirmBusy}
          className="min-w-0 w-full bg-transparent text-base outline-none disabled:opacity-60 sm:text-sm"
        />
      </div>
      {portalDropdown}
      {show && !suggestPortal ? (
        <div className={`absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 ${dropdownClass}`}>{suggestionButtons}</div>
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
  const { t } = useI18n();
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
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{t("home.label")}</p>
        <h2 className="text-3xl font-semibold text-slate-900">
          {t("home.greeting", { name: String(greetingName || t("common.traveler")) })}{" "}
          <span className="inline-block">👋</span>
        </h2>
      </div>

      <div className="rounded-[2.2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70">
        <CitySearchBox
          value={query}
          onChange={onQuery}
          onPick={onPickDestination}
          placeholder={t("home.searchPlaceholder")}
          showSuggestions
        />
      </div>

      <div>
        <h2 className="mb-4 text-xs uppercase tracking-[0.4em] text-slate-500">{t("home.now")}</h2>
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
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">{t("home.noCurrentTrip")}</p>}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-xs uppercase tracking-[0.4em] text-slate-500">{t("home.upcoming")}</h2>
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
            : <p className="text-sm text-slate-500">{t("home.noUpcoming")}</p>}
        </div>
      </div>
    </section>
  );
}

/** Quota / limite de requêtes API Gemini (message utilisateur : « Veuillez réessayer plus tard »). */
function isGeminiQuotaError(raw) {
  const full = String(raw || "").trim();
  return /429|Too Many Requests|quota exceeded|Quota exceeded|exceeded your current quota|generate_content_free_tier/i.test(
    full
  );
}

/** Affichage lisible des erreurs Gemini (429 / quota vs autres). */
function getGeminiErrorUi(raw) {
  const full = String(raw || "").trim();
  const quota = isGeminiQuotaError(full);
  const modelMatch = full.match(/models\/([^/:]+)/i);
  const modelName = modelMatch ? modelMatch[1] : "";
  if (quota) {
    return {
      quota: true,
      title: "Quota Gemini atteint",
      subtitle: "Ce n’est pas un bug de l’app : Google limite les requêtes (gratuit ou par minute).",
      bullets: [
        modelName ? `Modèle actuel : ${modelName}.` : null,
        "En gratuit, le quota est souvent par modèle (ex. flash-lite ~20 req/j). Dans .env.local : GEMINI_MODEL=gemini-2.5-flash ou gemini-2.0-flash, redémarre npm run dev, puis réessaie. Sinon attends ou active la facturation sur Google AI Studio.",
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

/** Message court pour le programme (affiché à tous les utilisateurs). */
function userFacingItineraryErrorMessage(raw, tFn) {
  const s = String(raw || "");
  const fb = (key, fallbackStr) => (typeof tFn === "function" ? tFn(key) : fallbackStr);
  if (/403|premium|réservée/i.test(s)) {
    return fb("destination.premiumBody", "Cette fonctionnalité est réservée au service Premium.");
  }
  if (isGeminiQuotaError(s)) {
    return fb("destination.quotaRetryLater", "Veuillez réessayer plus tard.");
  }
  if (/503|502|GEMINI_API_KEY|fetch/i.test(s)) {
    return fb("destination.itineraryGenerateError", "Service unavailable, please try again later.");
  }
  if (/JSON|invalide|guillemet|array element/i.test(s)) {
    return fb("destination.itineraryFormatError", "The response was incomplete. Try again or shorten the period.");
  }
  return fb("destination.itineraryGenerateError", "Unable to generate. Please try again later.");
}

/** Bloc erreur programme : toujours le texte utilisateur ; détail brut seulement en mode dev (repliable). */
function ItineraryErrorNotice({ raw }) {
  const text = String(raw || "").trim();
  if (!text) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs leading-relaxed text-rose-600">{userFacingItineraryErrorMessage(text, t)}</p>
      {SHOW_GEMINI_DEV_UI ? (
        <details className="rounded-lg border border-rose-100 bg-rose-50/50 px-2 py-1.5 text-[10px] text-rose-900/80">
          <summary className="cursor-pointer select-none font-medium text-rose-800/90">Détail technique (dev)</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono leading-snug text-rose-950/90">
            {text.length > 4000 ? `${text.slice(0, 4000)}…` : text}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

// ─── TripPrefsModal ────────────────────────────────────────────────────────────
function TripPrefsModal({ onConfirm, onSkip, onClose, cityLabel }) {
  const { t } = useI18n();
  const [pace, setPace] = useState("moderate");
  const [styles, setStyles] = useState([]);
  const [travelers, setTravelers] = useState("couple");
  const [budget, setBudget] = useState("medium");
  const [wishes, setWishes] = useState("");

  const toggleStyle = (s) =>
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const radioCard = (group, val, current, setter, label) => (
    <button
      key={val}
      type="button"
      onClick={() => setter(val)}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] transition-all ${
        current === val
          ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-300"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${current === val ? "border-indigo-500 bg-indigo-500" : "border-slate-300"}`} />
      {label}
    </button>
  );

  const checkCard = (val, label) => (
    <button
      key={val}
      type="button"
      onClick={() => toggleStyle(val)}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition-all ${
        styles.includes(val)
          ? "border-sky-400 bg-sky-50 font-semibold text-sky-700 ring-1 ring-sky-300"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] ${styles.includes(val) ? "border-sky-500 bg-sky-500 text-white" : "border-slate-300"}`}>
        {styles.includes(val) ? "✓" : ""}
      </span>
      {label}
    </button>
  );

  const handleConfirm = () =>
    onConfirm({ pace, styles, travelers, budget, wishes: wishes.trim() });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-2xl"
        style={{ maxHeight: "92svh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t("destination.prefsTitle")}</h2>
            {cityLabel && (
              <p className="mt-0.5 text-[11px] text-slate-400 font-medium">{cityLabel}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">{t("destination.prefsSubtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={17} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Rythme */}
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{t("destination.prefsPace")}</p>
            <div className="space-y-2">
              {radioCard("pace", "relaxed",   pace, setPace, t("destination.prefsPaceRelaxed"))}
              {radioCard("pace", "moderate",  pace, setPace, t("destination.prefsPaceModerate"))}
              {radioCard("pace", "intensive", pace, setPace, t("destination.prefsPaceIntensive"))}
            </div>
          </section>

          {/* Style */}
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{t("destination.prefsStyle")}</p>
            <div className="flex flex-wrap gap-2">
              {checkCard("cultural",    t("destination.prefsStyleCultural"))}
              {checkCard("gastronomy",  t("destination.prefsStyleGastronomy"))}
              {checkCard("nature",      t("destination.prefsStyleNature"))}
              {checkCard("relaxation",  t("destination.prefsStyleRelaxation"))}
              {checkCard("adventure",   t("destination.prefsStyleAdventure"))}
              {checkCard("nightlife",   t("destination.prefsStyleNightlife"))}
              {checkCard("shopping",    t("destination.prefsStyleShopping"))}
            </div>
          </section>

          {/* Voyageurs */}
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{t("destination.prefsTravelers")}</p>
            <div className="grid grid-cols-2 gap-2">
              {radioCard("travelers", "solo",    travelers, setTravelers, t("destination.prefsTravelersSolo"))}
              {radioCard("travelers", "couple",  travelers, setTravelers, t("destination.prefsTravelerCouple"))}
              {radioCard("travelers", "family",  travelers, setTravelers, t("destination.prefsTravelersFamily"))}
              {radioCard("travelers", "friends", travelers, setTravelers, t("destination.prefsTravelersFriends"))}
            </div>
          </section>

          {/* Budget */}
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{t("destination.prefsBudget")}</p>
            <div className="space-y-2">
              {radioCard("budget", "low",    budget, setBudget, t("destination.prefsBudgetLow"))}
              {radioCard("budget", "medium", budget, setBudget, t("destination.prefsBudgetMedium"))}
              {radioCard("budget", "high",   budget, setBudget, t("destination.prefsBudgetHigh"))}
              {radioCard("budget", "luxury", budget, setBudget, t("destination.prefsBudgetLuxury"))}
            </div>
          </section>

          {/* Souhaits libres */}
          <section className="space-y-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{t("destination.prefsWishes")}</p>
            <textarea
              rows={3}
              value={wishes}
              onChange={(e) => setWishes(e.target.value)}
              placeholder={t("destination.prefsWishesPlaceholder")}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 sm:w-auto"
          >
            {t("destination.prefsSkip")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-110 sm:w-auto"
          >
            {t("destination.prefsGenerate")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ItineraryResultModal ──────────────────────────────────────────────────────
function ItineraryResultModal({ dayIdeas, cityLabel, startDate, endDate, prefs, onClose, onRegenerate, onSaveToCalendar }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const days = Array.isArray(dayIdeas) ? dayIdeas : [];

  const totalCost = days.reduce((sum, d) => sum + (Number(d?.costEur) || 0), 0);
  const hasCostData = days.some((d) => Number(d?.costEur) > 0);

  const budgetTierLabel = (() => {
    const tier = prefs?.budget;
    if (!tier) return null;
    const key = `destination.itineraryBudget${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
    return t(key);
  })();

  const dateRange = startDate && endDate && startDate !== endDate
    ? `${startDate} – ${endDate}`
    : startDate || "";

  const handleSave = async () => {
    if (!onSaveToCalendar || saving) return;
    setSaving(true);
    try { await onSaveToCalendar(); } finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[1.75rem]"
        style={{ maxHeight: "92svh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Handle (mobile) ── */}
        <div className="flex shrink-0 justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* ── Header iOS-style ── */}
        <div className="shrink-0 px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-sky-600 to-indigo-700 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                  {t("destination.itineraryResultSubtitle")}
                </span>
              </div>
              <h2 className="mt-2 text-[1.35rem] font-bold leading-tight tracking-tight text-slate-900">
                {cityLabel || t("destination.itineraryResultTitle")}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {dateRange && (
                  <span className="text-[12px] text-slate-500">{dateRange}</span>
                )}
                {days.length > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[12px] text-slate-500">{t("destination.itineraryResultDays", { n: days.length })}</span>
                  </>
                )}
                {budgetTierLabel && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[12px] text-slate-500 capitalize">{budgetTierLabel}</span>
                  </>
                )}
                {hasCostData && totalCost > 0 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="bg-gradient-to-r from-sky-600 to-indigo-700 bg-clip-text text-[12px] font-bold text-transparent">~{totalCost}€</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
              aria-label={t("destination.itineraryResultClose")}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px shrink-0 bg-slate-100 mx-5" />

        {/* ── Liste des jours ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ol className="divide-y divide-slate-100">
            {days.map((d, idx) => {
              const dayNum = Number(d?.day) || idx + 1;
              const cost = Number(d?.costEur) || 0;
              return (
                <li key={`day-${dayNum}`} className="px-5 py-4 sm:px-6">
                  {/* Ligne titre du jour */}
                  <div className="flex items-center gap-3">
                    <span className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-sky-600 to-indigo-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                      {t("destination.itineraryDayLabel")} {dayNum}
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900">
                      {String(d?.title || "")}
                    </p>
                    {cost > 0 && (
                      <span className="shrink-0 text-[12px] font-semibold text-slate-500">
                        ~{cost}€
                      </span>
                    )}
                  </div>
                  {/* Activités du jour */}
                  {Array.isArray(d?.bullets) && d.bullets.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 pl-10">
                      {d.bullets.map((b, j) => (
                        <li key={j} className="flex gap-2 text-[12px] leading-relaxed text-slate-500">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                          <span>{String(b)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0">
          {/* Total */}
          {hasCostData && totalCost > 0 && (
            <div className="mx-5 mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-100">
              <span className="text-[12px] font-medium text-slate-500">{t("destination.itineraryTotalCost")}</span>
              <span className="bg-gradient-to-r from-sky-600 to-indigo-700 bg-clip-text text-[13px] font-bold text-transparent">~{totalCost}€</span>
            </div>
          )}
          {/* Boutons */}
          <div className="flex items-center gap-2.5 border-t border-slate-100 px-5 pb-6 pt-3 sm:pb-4">
            <button
              type="button"
              onClick={onRegenerate}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              {t("destination.itineraryResultRegenerate")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden />
              {saving ? t("destination.itineraryAdding") : t("destination.itineraryAddToCalendar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
    ...getCityHeroImageCandidates(city),
    getBundledCityHeroPath(city),
    getStorageMirrorHeroUrl(city),
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

/* ─── Cache localStorage pour DestinationGuideView ───────────────────────── */
const _GUIDE_LS_KEY = "tp_guide_cache_v2";
const _GUIDE_LS_TTL = 2 * 60 * 60 * 1000; // 2h

function _readGuideCache(city, lang) {
  try {
    const raw = window.localStorage.getItem(_GUIDE_LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d?.ts || !d?.city || !d?.lang) return null;
    const normLang = (s) => String(s || "fr").toLowerCase().split("-")[0];
    if (normLang(d.lang) !== normLang(lang)) return null;
    const normCity = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
    if (normCity(d.city) !== normCity(city)) return null;
    if (Date.now() - d.ts > _GUIDE_LS_TTL) return null;
    return d;
  } catch { return null; }
}

function _writeGuideCache(city, lang, guide, geminiContent, geminiAiActs, geminiTips) {
  try {
    if (!city || !guide) return;
    const { countryMap: _cm, ...guideSlim } = guide; // exclure le GeoJSON trop volumineux
    window.localStorage.setItem(_GUIDE_LS_KEY, JSON.stringify({
      city,
      lang: String(lang || "fr").toLowerCase().split("-")[0],
      guide: guideSlim,
      geminiContent: geminiContent ?? null,
      geminiAiActs: geminiAiActs ?? null,
      geminiTips: geminiTips ?? null,
      ts: Date.now(),
    }));
  } catch { /* quota / navigation privée — ignorer */ }
}
/* ─────────────────────────────────────────────────────────────────────────── */

function MustSeePlaceModal({ open, onClose, rawName, displayName, city, language }) {
  const { t } = useI18n();
  const titleId = useId();
  const [textLoading, setTextLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [extract, setExtract] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!open || !rawName) {
      setExtract("");
      setImageUrl("");
      setTextLoading(false);
      setImageLoading(false);
      return;
    }
    const cached = readMustSeePlaceModalCache(rawName, city, language);
    if (cached) {
      setExtract(cached.extract);
      setImageUrl(cached.imageUrl);
      setTextLoading(false);
      setImageLoading(false);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setImageLoading(true);
    setExtract("");
    setImageUrl("");

    const textP = fetchWikiPlaceSummaryForPlace(rawName, city, language, { resolveImage: false }).catch(
      () => ({ extract: "", thumb: "", wikiTitle: "", wikiHostLang: "" })
    );
    const imgEarlyP = fetchWikiPlaceHeroImageEarly(rawName, city, language).catch(() => "");
    const imgMetaP = textP
      .then(async (d) => {
        if (!d?.wikiTitle) return "";
        const fin = await finalizeWikiPlaceThumb(d.wikiHostLang, d);
        return String(fin?.thumb || "").trim();
      })
      .catch(() => "");

    textP.then((d) => {
      if (cancelled) return;
      setExtract(String(d?.extract || ""));
      setTextLoading(false);
    });

    imgEarlyP.then((u) => {
      if (cancelled || !u) return;
      setImageUrl((prev) => (prev ? prev : String(u).trim()));
    });

    imgMetaP.then((u) => {
      if (cancelled || !u) return;
      setImageUrl(String(u).trim());
    });

    (async () => {
      try {
        const [data, early, meta] = await Promise.all([textP, imgEarlyP, imgMetaP]);
        if (cancelled) return;
        let img = String(meta || early || data?.thumb || "").trim();
        if (!img && UNSPLASH_ACCESS_KEY) {
          const c = String(city || "").trim();
          const q = c ? `${rawName} ${c} landmark travel` : `${rawName} landmark travel`;
          const u = await fetchUnsplashImageByQuery(q, {
            pickFirst: true,
            preferredKeywords: ["landmark", "travel", "architecture"],
            avoidKeywords: ["logo", "icon", "map", "diagram"],
          });
          img = String(u || "").trim();
        }
        if (!cancelled) {
          if (img) setImageUrl(img);
          writeMustSeePlaceModalCache(rawName, city, language, String(data?.extract || ""), img);
        }
      } finally {
        if (!cancelled) setImageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, rawName, city, language]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[min(88vh,720px)] sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 bg-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-44 w-full object-cover sm:h-52"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {imageLoading && !imageUrl ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 sm:h-52">
              <span className="text-sm text-slate-500">{t("destination.mustSeePlaceLoading")}</span>
            </div>
          ) : null}
          {!imageLoading && !imageUrl ? (
            <div className="flex h-36 items-center justify-center bg-gradient-to-br from-sky-100 to-indigo-100 sm:h-44">
              <MapPin className="h-12 w-12 text-sky-400/80" strokeWidth={1.5} aria-hidden />
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-600 shadow-md ring-1 ring-black/5 hover:bg-white"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          <h2 id={titleId} className="pr-10 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
            {displayName}
          </h2>
          <div className="mt-4">
            {textLoading ? (
              <p className="text-sm leading-relaxed text-slate-500">{t("destination.mustSeePlaceLoading")}</p>
            ) : extract ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{extract}</p>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500">{t("destination.mustSeePlaceNoDesc")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white active:scale-[0.99] sm:hidden"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DestinationGuideView({
  session,
  searchInput,
  onSearchInputChange,
  confirmedDestination,
  onConfirmDestination,
  onCreateTrip,
  onBack,
}) {
  const { t, language } = useI18n();

  // Nombre de "crédits" pour sauter le clear initial si on a des données en cache
  const skipClearsRef = useRef(0);

  const [guideError, setGuideError] = useState("");
  const [guide, setGuide] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    if (c?.guide) {
      skipClearsRef.current = 3; // 3 effets vont essayer de vider l'état
      return c.guide;
    }
    return null;
  });
  const [addModalOpen, setAddModalOpen] = useState(false);
  /** Libellé brut du lieu (clé API / catalogue) pour le modal détail. */
  const [mustSeePlaceModalRaw, setMustSeePlaceModalRaw] = useState(null);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  /** Indices des activités proposées cochées pour le voyage (évite les doublons de libellé). */
  const [pickedActivityIndices, setPickedActivityIndices] = useState(() => new Set());
  /** Par indice d'activité : { date?: 'YYYY-MM-DD', time?: 'HH:MM' } (optionnel ; défaut = répartition sur le séjour). */
  const [activitySchedule, setActivitySchedule] = useState(() => ({}));
  const [geminiError, setGeminiError] = useState("");
  const [geminiContent, setGeminiContent] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    return c?.geminiContent ?? null;
  });
  /** Activités issues de /suggested-activities quand enrichissement complet désactivé. */
  const [geminiAiSuggestedActivities, setGeminiAiSuggestedActivities] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    return c?.geminiAiActs ?? null;
  });
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);
  const [itineraryPremiumGateOpen, setItineraryPremiumGateOpen] = useState(false);
  const [itineraryQuotaModalOpen, setItineraryQuotaModalOpen] = useState(false);
  const [tripPrefsOpen, setTripPrefsOpen] = useState(false);
  const [pendingTripRequest, setPendingTripRequest] = useState(null);
  const [itineraryResultOpen, setItineraryResultOpen] = useState(false);
  const [lastItineraryPrefs, setLastItineraryPrefs] = useState(null);

  // ── sessionStorage helpers ────────────────────────────────────────────────
  const ITIN_SS_KEY = "tp_last_itinerary_result";
  const ssNorm = (s) => String(s || "").trim().toLowerCase();
  const saveItineraryToSession = useCallback((dest, dayIdeas, prefs, startDate, endDate, popupOpen) => {
    try {
      sessionStorage.setItem(ITIN_SS_KEY, JSON.stringify({ destination: dest, dayIdeas, prefs, startDate, endDate, popupOpen }));
    } catch { /* quota / private browsing — ignore */ }
  }, []);
  const setItineraryResultOpenPersist = useCallback((isOpen) => {
    setItineraryResultOpen(isOpen);
    try {
      const raw = sessionStorage.getItem(ITIN_SS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        sessionStorage.setItem(ITIN_SS_KEY, JSON.stringify({ ...data, popupOpen: isOpen }));
      }
    } catch { /* ignore */ }
  }, []);
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [programEndDate, setProgramEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState("");
  const [generatedDayIdeas, setGeneratedDayIdeas] = useState(null);
  const [creatingVoyage, setCreatingVoyage] = useState(false);
  /** Tips en langue UI (Gemini) — utilisés quand la langue n'est pas le français et que GEMINI_DESTINATION_ENRICH est désactivé. */
  const [geminiLangTips, setGeminiLangTips] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    return c?.geminiTips ?? null;
  });

  const displayGuide = useMemo(() => {
    if (!guide) return null;
    let base;
    if (GEMINI_DESTINATION_ENRICH) {
      base = mergeDestinationGuideWithGemini(guide, geminiContent);
    } else if (geminiAiSuggestedActivities && geminiAiSuggestedActivities.length > 0) {
      const city = String(guide.city || "");
      base = {
        ...guide,
        places: clampPlacesList(guide.places, city),
        suggestedActivities: geminiAiSuggestedActivities,
        tips: guide.tips,
      };
    } else {
      base = mergeDestinationGuideWithGemini(guide, null);
    }
    if (geminiLangTips && !GEMINI_DESTINATION_ENRICH) {
      return { ...base, tips: geminiLangTips };
    }
    return base;
  }, [guide, geminiContent, geminiAiSuggestedActivities, geminiLangTips]);

  // Sauvegarder le guide en localStorage dès que les données sont disponibles
  // → permet de restaurer instantanément après veille téléphone / changement d'app
  useEffect(() => {
    if (!guide || !confirmedDestination) return;
    _writeGuideCache(
      confirmedDestination, language,
      guide, geminiContent, geminiAiSuggestedActivities, geminiLangTips
    );
  }, [guide, geminiContent, geminiAiSuggestedActivities, geminiLangTips, confirmedDestination, language]);

  const tripDatesForModal = useMemo(() => listTripDatesInclusive(startDate, endDate), [startDate, endDate]);

  const sortedPickedIndices = useMemo(
    () => [...pickedActivityIndices].sort((a, b) => a - b),
    [pickedActivityIndices]
  );

  useEffect(() => {
    // Si des données en cache ont été restaurées, sauter le clear initial
    if (skipClearsRef.current > 0) {
      skipClearsRef.current--;
      return;
    }
    setGeminiContent(null);
    setGeminiAiSuggestedActivities(null);
    setGeminiError("");
    setGeneratedDayIdeas(null);
    setItineraryError("");
    setItineraryModalOpen(false);
    setItineraryPremiumGateOpen(false);
    setItineraryQuotaModalOpen(false);
    setGeminiLangTips(null);
    setMustSeePlaceModalRaw(null);
    const y = new Date().toISOString().slice(0, 10);
    setProgramStartDate(y);
    setProgramEndDate(y);
    // Supprimer sessionStorage si la destination a changé
    try {
      const raw = sessionStorage.getItem(ITIN_SS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (ssNorm(data?.destination) !== ssNorm(confirmedDestination)) {
          sessionStorage.removeItem(ITIN_SS_KEY);
        }
      }
    } catch { /* ignore */ }
  }, [confirmedDestination]);

  // Restaurer l'itinéraire depuis sessionStorage au montage (changement d'onglet → retour)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ITIN_SS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!confirmedDestination || !data?.destination) return;
      if (ssNorm(data.destination) !== ssNorm(confirmedDestination)) {
        sessionStorage.removeItem(ITIN_SS_KEY);
        return;
      }
      if (Array.isArray(data.dayIdeas) && data.dayIdeas.length > 0) {
        setGeneratedDayIdeas(data.dayIdeas);
        if (data.prefs)      setLastItineraryPrefs(data.prefs);
        if (data.startDate)  setProgramStartDate(data.startDate);
        if (data.endDate)    setProgramEndDate(data.endDate);
        if (data.popupOpen)  setItineraryResultOpen(true);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return;
    }

    const instant = buildInstantDestinationGuide(confirmedDestination);
    if (instant) {
      setGuide(instant);
      setGuideError("");
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchDestinationGuide(confirmedDestination, language);
        if (!cancelled && result) setGuide(result);
      } catch (_e) {
        if (!cancelled && !instant) {
          setGuide(null);
          setGuideError(t("destination.guideLoadError"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [confirmedDestination, language, t]);

  useEffect(() => {
    const dest = String(
      extractCityPrompt(confirmedDestination) || normalizeCityInput(confirmedDestination) || ""
    ).trim();
    if (dest.length < 2) return undefined;
    let cancelled = false;
    setGeminiError("");
    // Ne pas vider les données si on a restauré depuis le cache
    if (skipClearsRef.current > 0) {
      skipClearsRef.current--;
    } else {
      setGeminiContent(null);
      setGeminiAiSuggestedActivities(null);
    }

    if (GEMINI_DESTINATION_ENRICH) {
      fetchGeminiTripSuggestions({ destination: dest, language })
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
        });
      return () => {
        cancelled = true;
      };
    }

    if (!GEMINI_SUGGESTED_ACTIVITIES) {
      return () => {
        cancelled = true;
      };
    }

    fetchGeminiSuggestedActivities({ destination: dest, language })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.data) {
          const norm = normalizeGeminiSuggestedActivitiesPayload(res.data, dest);
          setGeminiAiSuggestedActivities(norm.length > 0 ? norm : null);
          setGeminiError("");
        } else {
          setGeminiError(t("destination.guideLoadError"));
        }
      })
      .catch((e) => {
        if (!cancelled) setGeminiError(String(e?.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [confirmedDestination, language, t]);

  useEffect(() => {
    // Ne pas vider les tips si on a restauré depuis le cache
    if (skipClearsRef.current > 0) {
      skipClearsRef.current--;
    } else {
      setGeminiLangTips(null);
    }
    if (GEMINI_DESTINATION_ENRICH) return;
    const lang = String(language || "fr").toLowerCase().split("-")[0];
    if (lang === "fr") return;
    const dest = String(
      extractCityPrompt(confirmedDestination) || normalizeCityInput(confirmedDestination) || ""
    ).trim();
    if (dest.length < 2) return;
    let cancelled = false;
    // Groq en priorité pour les conseils — fallback Gemini si Groq indisponible
    fetchGroqTips({ destination: dest, language })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.data?.tips) {
          const tipsDo   = Array.isArray(res.data.tips.do)   ? res.data.tips.do.filter(Boolean)   : [];
          const tipsDont = Array.isArray(res.data.tips.dont) ? res.data.tips.dont.filter(Boolean) : [];
          if (tipsDo.length > 0 || tipsDont.length > 0) {
            setGeminiLangTips({ do: tipsDo, dont: tipsDont });
            return;
          }
        }
        // Fallback Gemini
        return fetchGeminiTripSuggestions({ destination: dest, language });
      })
      .then((res) => {
        if (cancelled || !res) return;
        if (res?.ok && res.data) {
          const norm = normalizeGeminiGuidePayload(res.data, dest);
          if (norm?.tips && (norm.tips.do?.length > 0 || norm.tips.dont?.length > 0)) {
            setGeminiLangTips(norm.tips);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [confirmedDestination, language]);

  async function handleGenerateItinerary() {
    if (!userCanUseItineraryGeneration(session)) {
      setItineraryPremiumGateOpen(true);
      setItineraryModalOpen(false);
      return;
    }
    const dest = String(displayGuide?.city || "").trim();
    if (!dest) return;
    const { ok, error } = countInclusiveTripDaysClient(programStartDate, programEndDate);
    if (!ok) {
      setItineraryError(error);
      return;
    }
    // Valider les dates puis ouvrir le modal de préférences
    setPendingTripRequest({ dest, startDate: programStartDate, endDate: programEndDate });
    setItineraryModalOpen(false);
    setTripPrefsOpen(true);
  }

  async function handleGenerateWithPrefs(prefs) {
    if (!pendingTripRequest) return;
    const { dest, startDate, endDate } = pendingTripRequest;
    setTripPrefsOpen(false);
    setLastItineraryPrefs(prefs);
    setItineraryLoading(true);
    setItineraryError("");
    try {
      let res = null;
      try {
        res = await fetchGroqItinerary({ destination: dest, startDate, endDate, language, prefs });
      } catch (_groqErr) {
        res = await fetchGeminiItinerary({ destination: dest, startDate, endDate, language, prefs });
      }
      if (res?.ok && Array.isArray(res.data?.dayIdeas) && res.data.dayIdeas.length > 0) {
        setGeneratedDayIdeas(res.data.dayIdeas);
        setItineraryResultOpen(true);
        saveItineraryToSession(dest, res.data.dayIdeas, prefs, startDate, endDate, true);
      } else {
        setItineraryError("Le programme renvoyé est vide.");
      }
    } catch (e) {
      const msg = String(e?.message || e);
      setItineraryError(msg);
      if (isGeminiQuotaError(msg)) {
        setItineraryQuotaModalOpen(true);
      } else if (/403|premium|réservée/i.test(msg)) {
        setItineraryPremiumGateOpen(true);
        setItineraryModalOpen(false);
      }
    } finally {
      setItineraryLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.4em] text-sky-900/45">{t("destination.guideHeading")}</h2>
      </div>

      <div className="rounded-[2.2rem] bg-white/93 p-4 shadow-[0_14px_40px_rgba(30,58,95,0.08)] ring-1 ring-sky-100/55">
        <CitySearchBox
          value={searchInput}
          onChange={onSearchInputChange}
          onPick={onConfirmDestination}
          onConfirm={onConfirmDestination}
          placeholder={t("destination.searchPlaceholder")}
        />
      </div>

      <div className="overflow-hidden rounded-[2.2rem] bg-white/93 shadow-[0_18px_48px_rgba(30,58,95,0.1)] ring-1 ring-sky-100/50">
        {guideError ? (
          <div className="p-6 text-sm text-rose-600">{String(guideError)}</div>
        ) : guide && displayGuide ? (
          <>
            <div className="relative p-4">
              <div className="relative h-56 w-full overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300 ring-1 ring-white/25 sm:h-60">
                {(() => {
                  const heroSrc = String(
                    displayGuide.landscapeImageUrl ||
                      displayGuide.imageUrl ||
                      resolveCityHeroImageUrl(displayGuide.city) ||
                      getBundledCityHeroPath(displayGuide.city) ||
                      getStorageMirrorHeroUrl(displayGuide.city) ||
                      ""
                  ).trim();
                  if (!heroSrc) return null;
                  return (
                    <img
                      key={String(displayGuide.city)}
                      src={heroSrc}
                      alt={displayCityForLocale(String(displayGuide.city), language)}
                      className="h-full w-full object-cover object-center"
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-700/90">
                  {t("destination.badgeDestination")}
                </p>
                <h3 className="mt-2 font-serif text-[1.65rem] font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
                  {displayCityForLocale(String(displayGuide.city), language)}
                </h3>
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-600">{String(displayGuide.description)}</p>
                {geminiError ? (
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
                  ) : isGeminiQuotaError(geminiError) ? (
                    <p className="mt-3 text-[15px] leading-relaxed text-slate-600" role="status">
                      {t("destination.quotaRetryLater")}
                    </p>
                  ) : null
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
                  {t("destination.addToTrips")}
                </button>
              </div>

              <section className="rounded-[1.75rem] border border-slate-200/70 bg-white/95 p-5 shadow-[0_8px_32px_rgba(30,58,95,0.05)] sm:p-6">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/60">
                    <MapPin className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
                      {t("destination.mustSeeTitle")}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t("destination.mustSeeSubtitle")}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(displayGuide.places || []).map((p, i) => {
                    const raw = String(p || "").trim();
                    return (
                      <button
                        key={`place-${i}-${raw.slice(0, 24)}`}
                        type="button"
                        onClick={() => setMustSeePlaceModalRaw(raw)}
                        className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-slate-200/90 bg-white px-3.5 py-1.5 text-left text-xs font-medium leading-snug text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-sky-200/90 hover:bg-sky-50/40 hover:ring-sky-100/80 active:scale-[0.98]"
                      >
                        {displayActivityTitleForLocale(raw, language)}
                      </button>
                    );
                  })}
                </div>
              </section>

              {(() => {
                const uiLang = String(language || "fr").toLowerCase().split("-")[0];
                // Only use Gemini/base tips when they are in the correct language (fr base, or geminiLangTips has overridden them)
                const doList = (uiLang === "fr" || geminiLangTips != null)
                  ? (displayGuide.tips?.do || []).map(String).filter(Boolean)
                  : [];
                const cityLabel = String(displayGuide.city || "").trim();
                const canonical = resolveCanonicalCity(cityLabel);
                const fill = resolveTravelTips(
                  normalizeTextForSearch(canonical),
                  String(canonical || cityLabel).trim() || cityLabel,
                  getIconicPlacesFallback(cityLabel) || [],
                  language
                ).do;
                const expertTips = dedupeTipLines([...doList, ...fill]).slice(0, 3);
                const threeTips = expertTips;
                return (
                  <section
                    className="rounded-[2rem] border border-slate-700/40 bg-slate-900 p-6 shadow-[0_16px_48px_rgba(15,23,42,0.22)] sm:p-8"
                    aria-labelledby="destination-expert-tips-heading"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/60 pb-4">
                      <Lightbulb
                        className="h-5 w-5 shrink-0 text-amber-400"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <h4
                        id="destination-expert-tips-heading"
                        className="text-[11px] font-bold uppercase tracking-[0.32em] text-slate-300"
                      >
                        {t("destination.tipsTitle")}
                      </h4>
                      <Sparkles className="h-4 w-4 shrink-0 text-amber-400/90" strokeWidth={2} aria-hidden />
                      <span className="sr-only">{t("destination.tipsSr")}</span>
                    </div>
                    <ul className="mt-6 space-y-6 text-sm leading-relaxed text-slate-100">
                      {threeTips.map((tip, i) => (
                        <li key={`expert-${i}-${String(tip).slice(0, 24)}`} className="flex gap-4">
                          <span
                            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                            aria-hidden
                          />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })()}

              <section className="rounded-[1.75rem] border border-indigo-200/50 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/40 p-5 shadow-[0_8px_32px_rgba(67,56,202,0.06)] sm:p-6">
                <div className="flex items-center gap-2.5 border-b border-indigo-100/80 pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/60">
                    <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
                      {t("destination.activitiesTitle")}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t("destination.activitiesSubtitle")}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(displayGuide.suggestedActivities || []).map((a, i) => {
                    const cell = normalizeSuggestedActivityShape(a, displayGuide.city);
                    const isFreeNote = /gratuit|free|kostenlos|gratis|gratuito|免费/i.test(String(cell.costNote || ""));
                    const costBadge =
                      cell.cost > 0
                        ? `~${cell.cost}€`
                        : isFreeNote
                          ? t("destination.activityFree")
                          : null;
                    const isFreeBadge = costBadge != null && cell.cost === 0;
                    return (
                      <span
                        key={`act-${i}-${cell.title.slice(0, 20)}`}
                        className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-indigo-200/70 bg-white px-3.5 py-2 text-xs font-medium leading-snug text-indigo-950 shadow-sm ring-1 ring-white/80"
                      >
                        <span>{displayActivityTitleForLocale(cell.title, language)}</span>
                        {costBadge != null && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isFreeBadge
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                            }`}
                          >
                            {costBadge}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200/80">
                      <Calendar className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
                        {t("destination.itineraryTitle")}
                        {VITE_ITINERARY_PREMIUM_ONLY ? (
                          <span className="ml-2 font-sans text-[10px] font-semibold normal-case tracking-normal text-amber-800/90">
                            Premium
                          </span>
                        ) : null}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {t("destination.itinerarySubtitle")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setItineraryError("");
                      if (!userCanUseItineraryGeneration(session)) {
                        setItineraryPremiumGateOpen(true);
                        return;
                      }
                      setItineraryModalOpen(true);
                    }}
                    disabled={itineraryLoading}
                    className="shrink-0 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                  >
                    {itineraryLoading ? t("destination.itineraryGenerating") : t("destination.itineraryGenerate")}
                  </button>
                </div>
                {itineraryError && !itineraryModalOpen ? <ItineraryErrorNotice raw={itineraryError} /> : null}
                {Array.isArray(generatedDayIdeas) && generatedDayIdeas.length > 0 ? (
                  <div className="mt-5">
                    {/* Aperçu condensé — invite à ouvrir le popup */}
                    <div className="overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-950 p-5 shadow-[0_8px_32px_rgba(99,102,241,0.25)]">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={2.5} aria-hidden />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                          {t("destination.itineraryResultTitle")}
                        </p>
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {generatedDayIdeas.slice(0, 3).map((d) => (
                          <li key={String(d?.day) + String(d?.title)} className="flex items-center gap-2.5 text-sm text-slate-300">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white ring-1 ring-white/20">
                              {Number(d?.day) || "·"}
                            </span>
                            <span className="font-medium text-white/90">{String(d?.title || "")}</span>
                          </li>
                        ))}
                        {generatedDayIdeas.length > 3 && (
                          <li className="pl-7 text-xs text-slate-500">
                            +{generatedDayIdeas.length - 3} {t("destination.itineraryResultDays", { n: "" }).trim().replace(/\s*\d*\s*/, "")}…
                          </li>
                        )}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setItineraryResultOpenPersist(true)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20"
                      >
                        <Calendar className="h-4 w-4" strokeWidth={2} aria-hidden />
                        {t("destination.itineraryResultView")}
                      </button>
                    </div>
                  </div>
                ) : generatedDayIdeas === null ? (
                  <p className="mt-4 text-center text-xs text-slate-400">
                    {t("destination.itineraryHint")}
                  </p>
                ) : null}
              </section>
            </div>
          </>
        ) : (
          <div className="relative mx-auto w-full max-w-full min-h-[15rem] h-[min(52svh,22rem)] overflow-hidden rounded-2xl shadow-[0_22px_50px_rgba(8,47,73,0.22)] ring-1 ring-cyan-100/30 sm:h-[22rem] sm:min-h-0 sm:max-h-none sm:rounded-[2.2rem]">
            <img
              src={DESTINATION_GUIDE_HERO_IMAGE_1280}
              srcSet={`${DESTINATION_GUIDE_HERO_IMAGE_1280} 1280w, ${DESTINATION_GUIDE_HERO_IMAGE} 3992w`}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 896px"
              alt={t("destination.heroImageAlt")}
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
                  {t("destination.heroTagline")}
                </p>
                <div className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-white/55 to-transparent sm:mt-6 sm:w-16" aria-hidden />
              </div>
            </div>
          </div>
        )}
      </div>

      {tripPrefsOpen && pendingTripRequest ? (
        <TripPrefsModal
          cityLabel={displayCityForLocale(String(pendingTripRequest.dest), language)}
          onConfirm={handleGenerateWithPrefs}
          onSkip={() => handleGenerateWithPrefs(null)}
          onClose={() => { setTripPrefsOpen(false); setPendingTripRequest(null); }}
        />
      ) : null}

      {itineraryResultOpen && Array.isArray(generatedDayIdeas) && generatedDayIdeas.length > 0 ? (
        <ItineraryResultModal
          dayIdeas={generatedDayIdeas}
          cityLabel={displayGuide ? displayCityForLocale(String(displayGuide.city || ""), language) : ""}
          startDate={programStartDate}
          endDate={programEndDate}
          prefs={lastItineraryPrefs}
          onClose={() => setItineraryResultOpenPersist(false)}
          onRegenerate={() => {
            setItineraryResultOpenPersist(false);
            setItineraryModalOpen(true);
          }}
          onSaveToCalendar={async () => {
            // Build activities list from dayIdeas
            const timeMap = (bullet) => {
              const b = String(bullet || "").trim().toLowerCase();
              if (/^matin|^morning|^morgen|^ma[ñn]ana|^mattina|^上午|^早/.test(b)) return "09:00";
              if (/^après-midi|^afternoon|^nachmittag|^tarde|^pomeriggio|^下午/.test(b)) return "14:00";
              if (/^soir|^soirée|^evening|^abend|^noche|^sera|^serata|^晚/.test(b)) return "19:00";
              return null;
            };
            const stripPrefix = (bullet) =>
              String(bullet || "").replace(/^[^:：]+[:：]\s*/, "").trim() || String(bullet || "").trim();
            const addDaysToDate = (ymd, n) => {
              const d = new Date(`${ymd}T12:00:00`);
              d.setDate(d.getDate() + n);
              return d.toISOString().slice(0, 10);
            };
            const SLOT_DEFAULTS = ["09:00", "14:00", "19:00"];
            const schedule = [];
            for (const d of generatedDayIdeas) {
              const dayNum = Number(d?.day) || 1;
              const actDate = addDaysToDate(programStartDate, dayNum - 1);
              const bullets = Array.isArray(d?.bullets) ? d.bullets : [];
              const perActCost = bullets.length > 0 && Number(d?.costEur) > 0
                ? Math.round(Number(d.costEur) / bullets.length)
                : 0;
              bullets.forEach((b, j) => {
                schedule.push({
                  title: stripPrefix(b),
                  date: actDate,
                  time: timeMap(b) || SLOT_DEFAULTS[j % SLOT_DEFAULTS.length],
                  location: String(displayGuide?.city || ""),
                  cost: perActCost,
                  description: `Jour ${dayNum} — ${String(d?.title || "")}`,
                });
              });
            }
            const dest = String(displayGuide?.city || confirmedDestination || "");
            const ok = await onCreateTrip({
              title: dest,
              destination: dest,
              start_date: programStartDate,
              end_date: programEndDate,
              selectedActivitiesWithSchedule: schedule,
              selectedActivities: schedule.map((r) => r.title),
            });
            if (ok) setItineraryResultOpenPersist(false);
          }}
        />
      ) : null}

      {itineraryModalOpen && displayGuide ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setItineraryModalOpen(false); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="itinerary-modal-title"
            className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] border border-slate-200/80 bg-white p-4 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="itinerary-modal-title" className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900">
                {t("destination.itineraryModalTitle", {
                  city: displayCityForLocale(String(displayGuide.city), language),
                })}
              </h2>
              <button
                type="button"
                onClick={() => setItineraryModalOpen(false)}
                className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-600">
              {t("destination.itineraryModalDesc")}
            </p>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {t("destination.itineraryStart")}
                <ModalDateField
                  wrapClass="mt-1"
                  value={programStartDate}
                  onChange={(e) => setProgramStartDate(e.target.value)}
                />
              </label>
              <label className="block min-w-0 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {t("destination.itineraryEnd")}
                <ModalDateField
                  wrapClass="mt-1"
                  value={programEndDate}
                  onChange={(e) => setProgramEndDate(e.target.value)}
                />
              </label>
            </div>
            {(() => {
              const prev = countInclusiveTripDaysClient(programStartDate, programEndDate);
              return (
                <p className="mt-3 text-xs text-slate-600">
                  {prev.ok
                    ? t("destination.itineraryDuration", { n: prev.days })
                    : prev.error || t("destination.itineraryDatesError")}
                </p>
              );
            })()}
            {itineraryError ? <ItineraryErrorNotice raw={itineraryError} /> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setItineraryModalOpen(false)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
              >
                {t("destination.itineraryCancel")}
              </button>
              <button
                type="button"
                onClick={handleGenerateItinerary}
                disabled={itineraryLoading}
                className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:brightness-110 disabled:opacity-50 sm:w-auto"
              >
                {itineraryLoading ? t("destination.itineraryGenerating") : t("destination.itineraryNext")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itineraryPremiumGateOpen ? (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setItineraryPremiumGateOpen(false);
              setItineraryError("");
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="itinerary-premium-gate-title"
            className="min-w-0 w-full max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80 sm:max-w-md"
          >
            <div className="bg-gradient-to-b from-amber-50/90 via-white to-white px-5 pb-8 pt-9 sm:px-9 sm:pb-9 sm:pt-10">
              <div className="flex flex-col items-center text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-amber-200/70"
                  aria-hidden
                >
                  <Lock className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <h2
                  id="itinerary-premium-gate-title"
                  className="mt-5 text-lg font-semibold leading-snug tracking-tight text-slate-900"
                >
                  {t("destination.premiumTitle")}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
                  {t("destination.premiumBody")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItineraryPremiumGateOpen(false);
                  setItineraryError("");
                }}
                className={`mt-8 w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(14,116,144,0.35)] transition hover:brightness-105 active:scale-[0.99] ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                J’ai compris
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itineraryQuotaModalOpen ? (
        <div
          className="fixed inset-0 z-[66] flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setItineraryQuotaModalOpen(false);
              setItineraryError("");
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="itinerary-quota-modal-title"
            className="min-w-0 w-full max-w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80 sm:max-w-md"
          >
            <div className="bg-gradient-to-b from-sky-50/90 via-white to-white px-5 pb-8 pt-9 sm:px-9 sm:pb-9 sm:pt-10">
              <div className="flex flex-col items-center text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-sky-200/70"
                  aria-hidden
                >
                  <Sparkles className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <h2
                  id="itinerary-quota-modal-title"
                  className="mt-5 text-lg font-semibold leading-snug tracking-tight text-slate-900"
                >
                  {t("destination.quotaTitle")}
                </h2>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-600">
                  Veuillez réessayer plus tard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItineraryQuotaModalOpen(false);
                  setItineraryError("");
                }}
                className={`mt-8 w-full rounded-2xl py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(14,116,144,0.35)] transition hover:brightness-105 active:scale-[0.99] ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                J’ai compris
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mustSeePlaceModalRaw ? (
        <MustSeePlaceModal
          open
          onClose={() => setMustSeePlaceModalRaw(null)}
          rawName={mustSeePlaceModalRaw}
          displayName={displayActivityTitleForLocale(mustSeePlaceModalRaw, language)}
          city={String(displayGuide?.city || "").trim() || String(confirmedDestination || "").trim()}
          language={language}
        />
      ) : null}

      {addModalOpen && displayGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}>
          <div className="max-h-[min(90vh,40rem)] min-w-0 w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">
                {t("destination.addCityHeading", {
                  city: displayCityForLocale(String(displayGuide.city), language),
                })}
              </h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="shrink-0 rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
              <ModalDateField value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <div className="flex shrink-0 justify-center py-0.5 sm:px-0.5 sm:py-0">
                <div className="rounded-full bg-slate-100/90 p-1.5 text-slate-500 shadow-sm sm:p-2">
                  <Plane size={14} className="animate-bounce" />
                </div>
              </div>
              <ModalDateField value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                {t("destination.addActivitiesTitle")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("destination.addActivitiesHint")}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {t("destination.addActivitiesBudgetHint")}
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3">
                {(displayGuide.suggestedActivities || []).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {t("destination.noActivitiesProposed")}
                  </p>
                ) : (
                  (displayGuide.suggestedActivities || []).map((a, i) => {
                    const cell = normalizeSuggestedActivityShape(a, displayGuide.city);
                    const rawLabel = cell.title;
                    const displayLabel = displayActivityTitleForLocale(rawLabel, language);
                    const checked = pickedActivityIndices.has(i);
                    const isFreeNote = /gratuit|free|kostenlos|gratis|gratuito|免费/i.test(String(cell.costNote || ""));
                    const costBadge =
                      cell.cost > 0
                        ? `~${cell.cost}€`
                        : isFreeNote
                          ? t("destination.activityFree")
                          : null;
                    const isFreeBadge = costBadge != null && cell.cost === 0;
                    return (
                      <label
                        key={`pick-act-${i}-${rawLabel.slice(0, 32)}`}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition ${
                          checked
                            ? "bg-sky-50/80 ring-sky-200"
                            : "bg-white ring-slate-100 hover:bg-slate-50/90"
                        }`}
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
                                pickedActivityLabelsRef.current.set(i, rawLabel);
                              }
                              return n;
                            });
                          }}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-900">{displayLabel}</span>
                        {costBadge != null ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isFreeBadge
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200"
                            }`}
                          >
                            {costBadge}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-slate-300">—</span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
              {sortedPickedIndices.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-sky-100/90 bg-sky-50/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/90">
                      {t("destination.scheduleTitle")}
                    </p>
                    {(() => {
                      const total = sortedPickedIndices.reduce((sum, actIndex) => {
                        const cell = normalizeSuggestedActivityShape(
                          (displayGuide.suggestedActivities || [])[actIndex],
                          displayGuide.city
                        );
                        return sum + Number(cell.cost || 0);
                      }, 0);
                      return total > 0 ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                          {t("destination.activitiesTotalEst")} ~{total}€
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {tripDatesForModal.length === 0 ? (
                    <p className="mt-2 text-xs text-rose-600">{t("destination.scheduleDatesError")}</p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                      {sortedPickedIndices.map((actIndex, j) => {
                        const cell = normalizeSuggestedActivityShape(
                          (displayGuide.suggestedActivities || [])[actIndex],
                          displayGuide.city
                        );
                        const rawPick = String(
                          pickedActivityLabelsRef.current.get(actIndex) || cell.title || ""
                        );
                        const label = displayActivityTitleForLocale(rawPick, language);
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
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-800">
                                {label}
                              </span>
                              {cell.cost > 0 ? (
                                <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 ring-1 ring-indigo-200">
                                  ~{cell.cost}€
                                </span>
                              ) : /gratuit|free|kostenlos|gratis|gratuito|免费/i.test(String(cell.costNote || "")) ? (
                                <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                  {t("destination.activityFree")}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <select
                                aria-label={t("destination.dayFor", { label })}
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
                                    {new Date(`${d}T12:00:00`).toLocaleDateString(getAppDateLocale(), {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                    })}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={t("destination.hourFor", { label })}
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
                  const cell = normalizeSuggestedActivityShape(suggested[actIndex], displayGuide.city);
                  const rawTitle = pickedActivityLabelsRef.current.get(actIndex) || cell.title;
                  const title = String(rawTitle).trim() || `Activite ${j + 1}`;
                  const description = [cell.description, cell.costNote].filter(Boolean).join("\n\n");
                  return {
                    title,
                    date,
                    time,
                    location: cell.location,
                    cost: cell.cost,
                    description,
                  };
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
              {creatingVoyage ? t("destination.creating") : t("destination.createTrip")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AllTripsView({ trips, onOpenTrip, onShareTrip, onEditTrip, onDeleteTrip }) {
  const { t } = useI18n();
  const sections = classifyTrips(trips);
  return (
    <section className="space-y-8">
      <div className="rounded-[2rem] border border-emerald-200/70 bg-emerald-50/45 p-4 shadow-[0_10px_26px_rgba(16,185,129,0.08)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-emerald-700">{t("home.now")}</h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            {t("trips.badgeInProgress")}
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
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("home.noCurrentTrip")}</p>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-sky-200/70 bg-sky-50/45 p-4 shadow-[0_10px_26px_rgba(14,165,233,0.08)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-sky-700">{t("home.upcoming")}</h2>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700">
            {t("trips.badgeUpcoming")}
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
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("trips.noUpcomingList")}</p>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-slate-50/55 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-2.5 flex items-center justify-between pl-3">
          <h2 className="text-xs uppercase tracking-[0.4em] text-slate-600">{t("trips.memories")}</h2>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            {t("trips.badgePast")}
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
            : <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500">{t("trips.noMemories")}</p>}
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
  /** Id voyage côté App (indispensable si selectedTrip est null — sinon filtre trip_id vide et aucune activité). */
  selectedTripId: selectedTripIdProp,
  trips,
  activities,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  monthCursor,
  setMonthCursor,
}) {
  const { t, language } = useI18n();
  const plannerWeekdayLabels = useMemo(() => {
    const tag = getAppDateLocale();
    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return d.toLocaleDateString(tag, { weekday: "narrow" });
    });
  }, [language]);
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
  const [savingNewActivity, setSavingNewActivity] = useState(false);
  const [activityFormError, setActivityFormError] = useState("");
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

  const resolvedTrip =
    selectedTrip ||
    (trips || []).find((t) => normTripId(t?.id) === normTripId(selectedTripIdProp)) ||
    null;
  const selectedTripIdSafe = normTripId(resolvedTrip?.id || selectedTripIdProp || "");
  const dayActivities = (activities || [])
    .filter(
      (a) =>
        normTripId(a?.trip_id) === selectedTripIdSafe &&
        toYMDLoose(a?.date_key || a?.date) === selectedDateKey
    )
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

  const activityCountByDay = useMemo(() => {
    const map = {};
    (activities || []).forEach((a) => {
      if (normTripId(a?.trip_id) !== selectedTripIdSafe) return;
      const key = toYMDLoose(a?.date_key || a?.date);
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [activities, selectedTripIdSafe]);

  const inTrip = (dateStr) => {
    if (!resolvedTrip) return false;
    return dateStr >= String(resolvedTrip.start_date) && dateStr <= String(resolvedTrip.end_date);
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
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="order-1 min-w-0 rounded-[2rem] bg-white/70 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3rem] sm:p-5 md:rounded-[4.5rem] md:p-6 lg:order-1 lg:justify-self-start lg:w-full">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-1">
            <button onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-full px-3 py-2 hover:bg-slate-100">
              {"<"}
            </button>
            <h2 className="min-w-0 truncate px-1 text-center text-[10px] uppercase tracking-[0.28em] text-slate-500 sm:text-xs sm:tracking-[0.4em]">
              {monthCursor.toLocaleDateString(getAppDateLocale(), { month: "long", year: "numeric" })}
            </h2>
            <button onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-full px-3 py-2 hover:bg-slate-100">
              {">"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500 sm:gap-2 sm:text-xs">
            {plannerWeekdayLabels.map((x, i) => (
              <div key={`wd-${i}-${x}`} className="py-2">
                {x}
              </div>
            ))}
            {days.map((d, i) => {
              if (!d) return <div key={`empty-${i}`} className="h-10 rounded-lg bg-slate-50 sm:h-12 sm:rounded-xl" />;
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
                  className={`relative h-10 rounded-lg border text-xs transition-all duration-150 sm:h-12 sm:rounded-xl sm:text-sm ${dayClass}`}
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
          <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">{t("planner.calendarLegend")}</p>
        </div>

        <div className="order-2 min-w-0 px-0 py-1 sm:px-1 lg:order-2">
          <h3 className="mb-3 break-all text-xs uppercase tracking-[0.4em] text-slate-500">
            {formatDate(selectedDate)}
          </h3>
          <button
            onClick={() => {
              setActivityFormError("");
              const index = (activities || []).filter(
                (a) => toYMDLoose(a?.date_key || a?.date) === selectedDateKey
              ).length;
              setActivityTime(slots[index % slots.length]);
              setActivityModalOpen(true);
            }}
            className={`mb-4 rounded-2xl px-4 py-2 text-white ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {t("planner.addActivity")}
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
                    <p className="truncate font-medium text-slate-900">
                      {String(a?.title || a?.name || "").trim()
                        ? displayActivityTitleForLocale(String(a?.title || a?.name || ""), language)
                        : t("planner.activityNamePlaceholder")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3">
                  <button
                    onClick={() => {
                      setViewingActivity(a);
                      setActivityDetailsOpen(true);
                    }}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50"
                    title={t("planner.viewDetails")}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingActivity(a);
                      const rawAct = String(a?.title || a?.name || "").trim();
                      setTitle(
                        rawAct
                          ? displayActivityTitleForLocale(rawAct, language)
                          : ""
                      );
                      setDescription(String(a?.description || ""));
                      setLocation(String(a?.location || ""));
                      setCost(String(a?.cost ?? ""));
                      setActivityTime(String(a?.time || ""));
                      setEditActivityModalOpen(true);
                    }}
                    className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50"
                    title={t("tripCard.edit")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setActivityToDelete(a)}
                    className="rounded-full border border-rose-100 bg-white p-2 text-rose-700 shadow-sm transition hover:bg-rose-50"
                    title={t("tripCard.delete")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-700">{t("planner.noActivitiesThisDate")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {activityModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setActivityModalOpen(false); setActivityTime(""); setActivityFormError(""); } }}>
          <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">{t("planner.newActivityTitle")}</h2>
              <button
                onClick={() => {
                  setActivityModalOpen(false);
                  setActivityTime("");
                  setActivityFormError("");
                }}
                className="shrink-0 rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            {activityFormError ? (
              <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100">
                {activityFormError}
              </p>
            ) : null}
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("planner.activityNamePlaceholder")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("planner.descriptionPlaceholder")}
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
                placeholder={t("planner.locationPlaceholder")}
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
                  placeholder={t("planner.costPlaceholder")}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  €
                </span>
              </div>
              <button
                type="button"
                disabled={savingNewActivity}
                onClick={async () => {
                  if (savingNewActivity) return;
                  setActivityFormError("");
                  setSavingNewActivity(true);
                  try {
                    const result = await onAddActivity({
                      title,
                      description,
                      location,
                      cost,
                      time: activityTime,
                    });
                    const added = result === true || result?.ok === true;
                    if (added) {
                      setTitle("");
                      setDescription("");
                      setLocation("");
                      setCost("");
                      setActivityTime("");
                      setActivityModalOpen(false);
                    } else {
                      const detail =
                        result && typeof result === "object" && String(result.error || "").trim()
                          ? String(result.error).trim()
                          : "";
                      setActivityFormError(detail || t("planner.activitySaveRejected"));
                    }
                  } finally {
                    setSavingNewActivity(false);
                  }
                }}
                className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                style={GLASS_ACCENT_STYLE}
              >
                {savingNewActivity ? t("planner.saving") : t("planner.addButton")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityDetailsOpen && viewingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setActivityDetailsOpen(false); setViewingActivity(null); } }}>
          <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.2)] backdrop-blur-xl sm:rounded-[2.5rem] sm:p-7" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-[11px] uppercase tracking-[0.38em] text-slate-500">{t("planner.detailsTitle")}</h2>
              <button
                onClick={() => {
                  setActivityDetailsOpen(false);
                  setViewingActivity(null);
                }}
                className="shrink-0 rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("planner.activityFieldLabel")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {String(viewingActivity?.title || viewingActivity?.name || "").trim()
                  ? displayActivityTitleForLocale(
                      String(viewingActivity?.title || viewingActivity?.name || ""),
                      language
                    )
                  : t("planner.activityNamePlaceholder")}
              </p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("planner.dateField")}</p>
                <p className="mt-1 break-all text-sm font-medium text-slate-900">
                  {viewingActivity?.date ? formatDate(viewingActivity.date) : "-"}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("planner.timeField")}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {String(viewingActivity?.time || "--:--")}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("planner.budgetField")}</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {Number(viewingActivity?.cost || 0).toFixed(2)} {t("planner.currencyEur")}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4 sm:col-span-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("planner.locationField")}</p>
                <p className="mt-1 break-words text-sm font-medium text-slate-900">
                  {String(viewingActivity?.location || "-")}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:col-span-2 sm:px-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("planner.descriptionField")}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {String(viewingActivity?.description || "").trim() || t("planner.noDescriptionYet")}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editActivityModalOpen && editingActivity ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setEditActivityModalOpen(false); setEditingActivity(null); setActivityTime(""); } }}>
          <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 text-xs uppercase tracking-[0.4em] text-slate-500">{t("planner.editActivityTitle")}</h2>
              <button
                onClick={() => {
                  setEditActivityModalOpen(false);
                  setEditingActivity(null);
                  setActivityTime("");
                }}
                className="shrink-0 rounded-full p-2 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("planner.activityNamePlaceholder")}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("planner.descriptionPlaceholder")}
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
                placeholder={t("planner.locationPlaceholder")}
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
                  placeholder={t("planner.costPlaceholder")}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  €
                </span>
              </div>
              <button
                onClick={() => {
                  const rawStored = String(editingActivity?.title || editingActivity?.name || "");
                  const titleOut =
                    activityTitleSaveValue(rawStored, title, language) ||
                    t("planner.activityNamePlaceholder");
                  onUpdateActivity({
                    ...editingActivity,
                    title: titleOut,
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
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activityToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setActivityToDelete(null); }}>
          <div className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-xs uppercase tracking-[0.4em] text-slate-500">{t("planner.confirmTitle")}</h2>
            <p className="mb-6 break-words text-sm text-slate-700">
              {t("planner.deleteActivityQuestion", {
                name: String(activityToDelete?.title || activityToDelete?.name || "").trim()
                  ? displayActivityTitleForLocale(
                      String(activityToDelete?.title || activityToDelete?.name || ""),
                      language
                    )
                  : t("planner.activityNamePlaceholder"),
              })}
            </p>
            <div className={MODAL_GRID_2}>
              <button
                onClick={() => setActivityToDelete(null)}
                className="min-w-0 rounded-2xl border border-slate-200 px-2 py-3 text-sm hover:bg-slate-100 sm:px-4"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  onDeleteActivity(activityToDelete);
                  setActivityToDelete(null);
                }}
                className="min-w-0 rounded-2xl px-2 py-3 text-sm text-white sm:px-4"
                style={{ backgroundColor: "#e11d48" }}
              >
                {t("tripCard.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatEuroFR(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function normalizeTripExpenseRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: String(row.id || ""),
    trip_id: String(row.trip_id || ""),
    title: String(row.title || "").trim() || "Dépense",
    amount: Math.max(0, Number(row.amount) || 0),
    paid_by: String(row.paid_by || "Moi"),
    split_between: Array.isArray(row.split_between) ? row.split_between.map(String) : [],
    expense_date: row.expense_date ? String(row.expense_date).slice(0, 10) : null,
  };
}

function GroupExpenseModal({ open, onClose, trip, participants, displayForParticipant, initial, onSave, saving }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("Moi");
  const [splitSet, setSplitSet] = useState(() => new Set());
  const [expenseDate, setExpenseDate] = useState("");

  const participantsKey = (Array.isArray(participants) ? participants : []).join("|");
  useEffect(() => {
    if (!open) return;
    const parts = Array.isArray(participants) && participants.length > 0 ? participants : ["Moi"];
    if (initial && initial.id) {
      setTitle(String(initial.title || ""));
      setAmount(String(initial.amount ?? ""));
      setPaidBy(String(initial.paid_by || "Moi"));
      const sb = Array.isArray(initial.split_between) && initial.split_between.length > 0 ? initial.split_between : parts;
      setSplitSet(new Set(sb.map(String)));
      setExpenseDate(initial.expense_date ? String(initial.expense_date).slice(0, 10) : "");
    } else {
      setTitle("");
      setAmount("");
      setPaidBy(parts.includes("Moi") ? "Moi" : parts[0]);
      setSplitSet(new Set(parts));
      setExpenseDate("");
    }
  }, [open, initial?.id, participantsKey]);

  if (!open || !trip) return null;

  const parts = Array.isArray(participants) && participants.length > 0 ? participants : ["Moi"];
  const toggleSplit = (p) => {
    setSplitSet((prev) => {
      const n = new Set(prev);
      if (n.has(p)) {
        if (n.size <= 1) return n;
        n.delete(p);
      } else {
        n.add(p);
      }
      return n;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-slate-200/80 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-xs uppercase tracking-[0.35em] text-slate-500">
            {initial?.id ? t("budget.editExpense") : t("budget.newExpenseModal")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 hover:bg-slate-100"
            aria-label={t("menu.closeMenu")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("budget.expenseTitlePh")}
            className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm sm:px-4"
          />
          <div className={MODAL_GRID_2}>
            <div className="relative min-w-0">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("budget.amountPh")}
                className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 pr-9 text-sm sm:px-4 sm:pr-10"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 sm:right-4">
                €
              </span>
            </div>
            <ModalDateField
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              inputClassName="text-sm"
            />
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("budget.paidBySection")}</p>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              {parts.map((p) => (
                <option key={p} value={p}>
                  {displayForParticipant(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("budget.splitBetween")}</p>
            <p className="mb-2 text-[11px] text-slate-500">{t("budget.splitBetweenHint")}</p>
            <div className="flex flex-wrap gap-2">
              {parts.map((p) => (
                <label
                  key={p}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    splitSet.has(p)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-950"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={splitSet.has(p)}
                    onChange={() => toggleSplit(p)}
                  />
                  {displayForParticipant(p)}
                </label>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const splitArr = [...splitSet];
              if (splitArr.length === 0) return;
              const amt = Number(String(amount).replace(",", "."));
              if (!Number.isFinite(amt) || amt <= 0) return;
              onSave({
                id: initial?.id,
                trip_id: trip.id,
                title: String(title || "").trim() || t("budget.expenseDefaultTitle"),
                amount: amt,
                paid_by: paidBy,
                split_between: splitArr.length === parts.length ? [] : splitArr,
                expense_date: expenseDate.trim() || null,
              });
            }}
            className={`w-full rounded-2xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {saving ? t("planner.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetTripSummaryCard({ trip, activities, groupExpenses, groupExpensesEnabled, onOpenDetail }) {
  const { t, language } = useI18n();
  const acts = (activities || []).filter((a) => String(a.trip_id) === String(trip.id));
  const exps = (groupExpenses || []).filter((e) => String(e.trip_id) === String(trip.id));
  const totalPlanner = acts.reduce((s, a) => s + Number(a.cost || 0), 0);
  const totalGroup = exps.reduce((s, e) => s + Number(e.amount || 0), 0);
  const rawLabel = String(trip?.destination || trip?.title || "").trim();
  const label = rawLabel ? displayCityForLocale(rawLabel, language) : t("modals.tripDefault");
  const imageTitle = String(trip?.destination || trip?.title || "voyage");
  const dr =
    trip?.start_date && trip?.end_date
      ? `${String(trip.start_date)} — ${String(trip.end_date)}`
      : "";

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="group w-full rounded-[2rem] p-0 text-left shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-200"
    >
      <TripLiquidGlassShell
        imageTitle={imageTitle}
        active={false}
        className="rounded-[2rem] border border-white/42 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition group-hover:border-white/55"
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3.5 sm:gap-3 sm:px-4 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-semibold tracking-tight text-white drop-shadow-sm">{label}</h3>
            {dr ? <p className="mt-0.5 break-all text-xs text-white/85">{dr}</p> : null}
            {groupExpensesEnabled ? (
              <div className="mt-2.5 flex flex-col gap-1 text-xs text-white/88 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
                <span className="min-w-0">
                  <span className="text-white/75">{t("budget.sharedExpensesLabel")}</span>{" "}
                  <span className="font-semibold tabular-nums text-white">{formatEuroFR(totalGroup)}</span>
                </span>
                <span className="hidden text-white/40 sm:inline" aria-hidden>
                  ·
                </span>
                <span className="min-w-0">
                  <span className="text-white/75">{t("budget.plannerRefLabel")}</span>{" "}
                  <span className="font-semibold tabular-nums text-white">{formatEuroFR(totalPlanner)}</span>
                </span>
              </div>
            ) : (
              <p className="mt-2.5 text-xs text-white/88">
                <span className="text-white/75">{t("budget.plannerRefLabel")}</span>{" "}
                <span className="font-semibold tabular-nums text-white">{formatEuroFR(totalPlanner)}</span>
              </p>
            )}
            <p className="mt-2 text-[11px] font-medium text-white/95 underline decoration-white/35 underline-offset-2">
              {t("budget.openTripBudget")}
            </p>
          </div>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
        </div>
      </TripLiquidGlassShell>
    </button>
  );
}

function BudgetTripDetailShell({ trip, onClose, children }) {
  const { t, language } = useI18n();
  if (!trip) return null;
  const rawLabel = String(trip?.destination || trip?.title || "").trim();
  const label = rawLabel ? displayCityForLocale(rawLabel, language) : t("modals.tripDefault");
  const dr =
    trip?.start_date && trip?.end_date
      ? `${String(trip.start_date)} — ${String(trip.end_date)}`
      : "";
  return (
    <div
      className="fixed inset-0 z-[45] flex items-end justify-center bg-black/40 p-0 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-trip-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[min(92dvh,100svh)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-t-[2.25rem] bg-white shadow-[0_-12px_48px_rgba(2,6,23,0.2)] sm:max-h-[90vh] sm:rounded-[2rem] sm:shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 pb-3 pt-4 sm:gap-3 sm:px-6">
          <div className="min-w-0 flex-1 pr-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t("budget.tripDetailTitle")}</p>
            <h2
              id="budget-trip-detail-title"
              className="mt-1 line-clamp-2 break-words text-lg font-semibold leading-snug text-slate-900"
            >
              {label}
            </h2>
            {dr ? <p className="mt-0.5 break-all text-xs text-slate-500">{dr}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label={t("menu.closeMenu")}
          >
            <X size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">{children}</div>
      </div>
    </div>
  );
}

function TripExpenseDetail({
  trip,
  session,
  activities,
  groupExpenses,
  groupExpensesEnabled,
  onOpenParticipants,
  onUpdateActivity,
  onDeleteActivity,
  onAddGroupExpense,
  onUpdateGroupExpense,
  onDeleteGroupExpense,
}) {
  const { t, language } = useI18n();
  const [editingActivity, setEditingActivity] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editTime, setEditTime] = useState("");
  const [groupModal, setGroupModal] = useState(null);
  const [groupSaving, setGroupSaving] = useState(false);
  const [importingPlanner, setImportingPlanner] = useState(false);

  const safeActivities = Array.isArray(activities) ? activities : [];
  const safeGroup = Array.isArray(groupExpenses) ? groupExpenses : [];
  const participants = canonicalParticipants(
    Array.isArray(trip?.participants) ? trip.participants : [],
    Array.isArray(trip?.invited_emails) ? trip.invited_emails : []
  );
  const displayName = (p) => participantDisplayFromRaw(p, getCurrentUserDisplayName(session));

  const totalPlanner = safeActivities.reduce((sum, a) => sum + Number(a.cost || 0), 0);
  const totalGroup = safeGroup.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const balances = useMemo(
    () => computeTricountBalances(participants, groupExpensesEnabled ? safeGroup : []),
    [participants, safeGroup, groupExpensesEnabled]
  );
  const settlements = useMemo(() => simplifyTricountDebts(balances), [balances]);
  const balanceEntries = useMemo(() => Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0])), [balances]);

  const tripLabelRaw = String(trip?.destination || trip?.title || "").trim();
  const tripLabel = tripLabelRaw ? displayCityForLocale(tripLabelRaw, language) : t("modals.tripDefault");
  const dateRange =
    trip?.start_date && trip?.end_date
      ? `${String(trip.start_date)} → ${String(trip.end_date)}`
      : "";

  const sortedActivities = [...safeActivities].sort((a, b) => {
    const ad = String(a?.date || "");
    const bd = String(b?.date || "");
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.time || "").localeCompare(String(b?.time || ""));
  });

  const sortedGroup = [...safeGroup].sort((a, b) => {
    const da = String(a?.expense_date || "");
    const db = String(b?.expense_date || "");
    if (da !== db) return db.localeCompare(da);
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });

  const plannerWithCost = sortedActivities.filter((a) => Number(a.cost || 0) > 0);

  return (
    <>
      <div className="max-w-full overflow-x-hidden rounded-[2rem] border border-slate-200/80 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-semibold tracking-tight text-slate-900">{tripLabel}</h3>
            {dateRange ? (
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-400">{dateRange}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenParticipants(trip)}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-100 sm:w-auto"
          >
            <Users size={18} className="text-slate-600" strokeWidth={2} />
            {t("budget.participants")}
          </button>
        </div>

        {!groupExpensesEnabled ? (
          <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">{t("budget.groupDisabledTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/85">
              {t("budget.groupDisabledBody")}
            </p>
          </div>
        ) : null}

        {groupExpensesEnabled ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50/80 px-4 py-3.5 ring-1 ring-indigo-200/50">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-800/80">{t("budget.totalShared")}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-indigo-950">{formatEuroFR(totalGroup)}</p>
                <p className="mt-1 text-[11px] leading-snug text-indigo-900/70">{t("budget.totalSharedHint")}</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 px-4 py-3.5 ring-1 ring-slate-200/60">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{t("budget.plannerRefLabel")}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{formatEuroFR(totalPlanner)}</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{t("budget.plannerRefHint")}</p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t("budget.balances")}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t("budget.balancesHint")}</p>
              <ul className="mt-3 space-y-2">
                {balanceEntries.map(([person, bal]) => {
                  const b = Number(bal) || 0;
                  const pos = b > 0.01;
                  const neg = b < -0.01;
                  return (
                    <li
                      key={person}
                      className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-100"
                    >
                      <span className="min-w-0 truncate font-medium text-slate-800">{displayName(person)}</span>
                      <span
                        className={`shrink-0 tabular-nums font-semibold ${
                          pos ? "text-emerald-700" : neg ? "text-rose-700" : "text-slate-500"
                        }`}
                      >
                        {pos ? "+" : ""}
                        {formatEuroFR(b)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {settlements.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800">{t("budget.settlementsTitle")}</p>
                <p className="mt-1 text-[11px] text-emerald-900/70">{t("budget.settlementsHint")}</p>
                <ul className="mt-3 space-y-2">
                  {settlements.map((s, i) => (
                    <li
                      key={`${s.from}-${s.to}-${i}`}
                      className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 ring-1 ring-emerald-100/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words font-medium">{displayName(s.from)}</span>
                        <ArrowRight size={14} className="shrink-0 text-emerald-600" aria-hidden />
                        <span className="break-words font-medium">{displayName(s.to)}</span>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-emerald-800">{formatEuroFR(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setGroupModal({ mode: "add" })}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                <Plus size={18} />
                {t("budget.newExpense")}
              </button>
              <button
                type="button"
                disabled={importingPlanner || plannerWithCost.length === 0}
                onClick={async () => {
                  if (plannerWithCost.length === 0) return;
                  setImportingPlanner(true);
                  try {
                    for (const a of plannerWithCost) {
                      const ymd = toYMDLoose(a?.date_key || a?.date);
                      await onAddGroupExpense({
                        trip_id: trip.id,
                        title: t("budget.importLineTitle", {
                          activity: String(a?.title || a?.name || "").trim()
                            ? displayActivityTitleForLocale(String(a?.title || a?.name || ""), language)
                            : t("planner.activityNamePlaceholder"),
                        }),
                        amount: Number(a.cost || 0),
                        paid_by: "Moi",
                        split_between: [],
                        expense_date: ymd || null,
                      });
                    }
                  } finally {
                    setImportingPlanner(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importingPlanner
                  ? t("budget.importingPlanner")
                  : t("budget.importPlanner", { count: plannerWithCost.length })}
              </button>
            </div>

            <div className="mb-6 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <Receipt size={16} className="text-slate-400" strokeWidth={2} aria-hidden />
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t("budget.expenseList")}</p>
              </div>
              {sortedGroup.length > 0 ? (
                <ul className="space-y-2">
                  {sortedGroup.map((e) => {
                    const splitLabel =
                      Array.isArray(e.split_between) && e.split_between.length > 0
                        ? e.split_between.map(displayName).join(", ")
                        : participants.map(displayName).join(", ");
                    return (
                      <li
                        key={String(e.id)}
                        className="flex items-start justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium text-slate-900">{e.title}</p>
                          <p className="mt-0.5 break-words text-xs text-slate-500">
                            {t("budget.paidBy")}{" "}
                            <span className="font-medium text-slate-700">{displayName(e.paid_by)}</span>
                            {" · "}
                            {t("budget.splitLabel")} {splitLabel}
                          </p>
                          {e.expense_date ? (
                            <p className="mt-1 text-[10px] text-slate-400">{e.expense_date}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <p className="pt-0.5 text-sm font-semibold tabular-nums text-slate-800">{formatEuroFR(e.amount)}</p>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setGroupModal({ mode: "edit", expense: e })}
                              className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-200"
                              title={t("tripCard.edit")}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteGroupExpense(e)}
                              className="rounded-full p-1.5 text-rose-700 transition hover:bg-rose-100"
                              title={t("tripCard.delete")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500">
                  {t("budget.noGroupExpenses")}
                </p>
              )}
            </div>
          </>
        ) : null}

        <div className={groupExpensesEnabled ? "border-t border-slate-100 pt-4" : ""}>
          <div className="mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" strokeWidth={2} aria-hidden />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{t("budget.plannerActivities")}</p>
          </div>
          {sortedActivities && sortedActivities.length > 0 ? (
            <ul className="space-y-2">
              {sortedActivities.map((a, idx) => (
                <li
                  key={`${String(a?.id || "a")}-${idx}`}
                  className="flex items-start justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {String(a?.title || a?.name || "").trim()
                        ? displayActivityTitleForLocale(String(a?.title || a?.name || ""), language)
                        : t("planner.activityNamePlaceholder")}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {String(a?.location || t("budget.locationUnknown"))}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      {a?.date ? (
                        <span className="rounded-md bg-white px-2 py-0.5 font-medium ring-1 ring-slate-200/80">
                          {String(a.date)}
                        </span>
                      ) : null}
                      {a?.time ? <span>{String(a.time)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <p className="pt-0.5 text-sm font-semibold tabular-nums text-slate-800">{formatEuroFR(a?.cost)}</p>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingActivity(a);
                          const rawA = String(a?.title || a?.name || "").trim();
                          setEditTitle(
                            rawA
                              ? displayActivityTitleForLocale(rawA, language)
                              : t("planner.activityNamePlaceholder")
                          );
                          setEditLocation(String(a?.location || ""));
                          setEditCost(String(a?.cost ?? 0));
                          setEditTime(String(a?.time || ""));
                        }}
                        className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-200"
                        title={t("budget.editActivityCostHint")}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteActivity(a)}
                        className="rounded-full p-1.5 text-rose-700 transition hover:bg-rose-100"
                        title={t("budget.removeFromPlannerHint")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500">
              {t("budget.noActivitiesPlanner", { plannerTab: t("nav.planner") })}
            </p>
          )}
        </div>
      </div>

      <GroupExpenseModal
        open={!!groupModal}
        onClose={() => !groupSaving && setGroupModal(null)}
        trip={trip}
        participants={participants}
        displayForParticipant={displayName}
        initial={groupModal?.mode === "edit" ? groupModal.expense : null}
        saving={groupSaving}
        onSave={async (payload) => {
          setGroupSaving(true);
          try {
            if (payload.id) await onUpdateGroupExpense(payload);
            else await onAddGroupExpense(payload);
            setGroupModal(null);
          } finally {
            setGroupSaving(false);
          }
        }}
      />

      {editingActivity ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setEditingActivity(null)}
        >
          <div
            className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3rem] sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="min-w-0 text-xs uppercase tracking-[0.35em] text-slate-500">{t("planner.editActivityTitle")}</h3>
              <button
                type="button"
                onClick={() => setEditingActivity(null)}
                className="shrink-0 rounded-full p-2 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-w-0 space-y-3">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t("planner.activityNamePlaceholder")}
                className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
              />
              <input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder={t("budget.locationOptionalPh")}
                className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
              />
              <div className={MODAL_GRID_2}>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-2 py-3 text-sm sm:px-4"
                />
                <div className="relative min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder={t("planner.costPlaceholder")}
                    className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 pr-9 text-sm sm:px-4 sm:pr-10"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 sm:right-4">
                    €
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const rawStored = String(editingActivity?.title || editingActivity?.name || "");
                  const titleOut =
                    activityTitleSaveValue(rawStored, editTitle, language) ||
                    t("planner.activityNamePlaceholder");
                  await onUpdateActivity({
                    ...editingActivity,
                    title: titleOut,
                    location: String(editLocation || ""),
                    cost: Number(editCost || 0),
                    time: String(editTime || ""),
                  });
                  setEditingActivity(null);
                }}
                className={`w-full rounded-2xl px-4 py-3 text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                {t("common.save")}
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
  const { t, language } = useI18n();
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

  const activeTrip = sortedTrips.find((tr) => String(tr.id) === String(chatTripId)) || null;
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

  /** Une seule vue à la fois : discussion d’abord, votes via l’onglet (surtout mobile). */
  const [hubSubView, setHubSubView] = useState("chat");

  const currentUserId = String(session?.user?.id || "");

  useEffect(() => {
    setHubSubView("chat");
  }, [chatTripId]);

  useEffect(() => {
    if (!activeTrip) return;
    if (hubSubView !== "chat") return;
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, activeTrip, hubSubView]);

  return (
    <section className="space-y-5">
      <div className="rounded-[2rem] bg-white/92 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70 sm:p-5">
        <h2 className="text-xs uppercase tracking-[0.35em] text-slate-500">{t("chat.groupsTitle")}</h2>
        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
          {sortedTrips.length > 0 ? (
            sortedTrips.map((trip) => {
              const active = String(chatTripId) === String(trip.id);
              const participantsRaw = participantsForAvatarRow(trip);
              const participantLabels = participantsRaw.map((p) =>
                String(p).toLowerCase() === "moi" ? currentUserDisplayName : String(p)
              );
              return (
                <button
                  key={String(trip.id)}
                  onClick={() => setChatTripId(String(trip.id))}
                  className={`w-full text-left text-sm transition ${
                    active
                      ? "text-white shadow-[0_16px_34px_rgba(2,6,23,0.24)]"
                      : "text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.2)]"
                  }`}
                >
                  <TripLiquidGlassShell
                    imageTitle={String(trip?.destination || trip?.title || "voyage")}
                    active={active}
                    className={`rounded-2xl border px-4 py-3 ${
                      active ? "border-white/55" : "border-white/42"
                    }`}
                  >
                    <p className="font-medium">
                      {displayCityForLocale(String(trip.title || ""), language) || t("modals.tripDefault")}
                    </p>
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
                        <span className="text-[10px] text-white/85">+{participantLabels.length - 4}</span>
                      ) : null}
                    </div>
                  </TripLiquidGlassShell>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-slate-500">{t("chat.noTrips")}</p>
          )}
        </div>
      </div>

      {activeTrip ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-x-hidden bg-black/45 p-3 backdrop-blur-[2px] sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setChatTripId(""); }}>
          <div
            className="relative flex max-h-[min(92dvh,100svh)] w-full min-w-0 max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/90 sm:max-h-[88vh]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tp-chat-hub-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-3 pt-4 sm:px-5 sm:pb-3.5 sm:pt-5">
              <div className="min-w-0 flex-1 pr-1">
                <h2
                  id="tp-chat-hub-title"
                  className="break-words text-base font-semibold leading-snug tracking-tight text-slate-900 sm:text-lg"
                >
                  {displayCityForLocale(String(activeTrip.title || ""), language) || t("modals.tripDefault")}
                </h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  {formatDate(activeTrip.start_date)} — {formatDate(activeTrip.end_date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatTripId("")}
                className="shrink-0 rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                title={t("chat.closeShort")}
                aria-label={t("chat.closeLabel")}
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="shrink-0 px-3 pb-2 pt-2 sm:px-4 sm:pt-3">
              <div
                role="tablist"
                aria-label={`${t("chat.tabDiscussion")} / ${t("chat.tabVotesLong")}`}
                className="flex gap-1.5 rounded-2xl bg-slate-100/95 p-1.5 ring-1 ring-slate-200/80 sm:gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={hubSubView === "chat"}
                  onClick={() => setHubSubView("chat")}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
                    hubSubView === "chat"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-100/80"
                  }`}
                >
                  <MessageCircle size={18} className="shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{t("chat.tabDiscussion")}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={hubSubView === "votes"}
                  onClick={() => setHubSubView("votes")}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
                    hubSubView === "votes"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-transparent text-slate-600 hover:bg-slate-100/80"
                  }`}
                >
                  <ThumbsUp size={18} className="shrink-0 opacity-90" aria-hidden />
                  <span className="truncate sm:hidden">{t("chat.tabVotesShort")}</span>
                  <span className="hidden truncate sm:inline">{t("chat.tabVotesLong")}</span>
                  {tripActivities.length > 0 ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        hubSubView === "votes" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {tripActivities.length}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
              {hubSubView === "chat" ? (
                <>
                  <h3 className="break-words text-xs uppercase tracking-[0.35em] text-slate-500">
                    {t("chat.messagesHeading")}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                      {participantsForAvatarRow(activeTrip)
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
                      className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
                    >
                      {(chatMessages || []).length > 0 ? (
                        chatMessages.map((msg, idx) => {
                          const mine =
                            (currentUserId && String(msg?.author_id || "") === currentUserId) ||
                            (!!session?.user?.email &&
                              String(msg?.author_email || "").toLowerCase() ===
                                String(session?.user?.email || "").toLowerCase());
                          const authorLabel = String(
                            msg?.author_name || msg?.author_email || (mine ? "Moi" : "Membre")
                          );
                          return (
                            <div
                              key={`${String(msg?.id || "m")}-${idx}`}
                              className={`flex ${mine ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`min-w-0 max-w-[min(78%,100%)] ${mine ? "items-end" : "items-start"} flex flex-col`}
                              >
                                <p
                                  className={`mb-1 max-w-full truncate px-1 text-[11px] ${mine ? "text-slate-500" : "text-slate-500"}`}
                                >
                                  {authorLabel}
                                </p>
                                <div
                                  className={`max-w-full break-words rounded-[1.25rem] px-3 py-2 text-sm shadow-sm ${
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
                        <p className="text-sm text-slate-500">{t("chat.noMessages")}</p>
                      )}
                    </div>
                    <div className="mt-3 flex min-w-0 shrink-0 gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onSendMessage();
                          }
                        }}
                        placeholder={t("chat.writePlaceholder")}
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[16px] md:px-4 md:text-sm"
                      />
                      <button
                        type="button"
                        onClick={onSendMessage}
                        className={`shrink-0 rounded-2xl px-3 py-3 text-sm text-white sm:px-4 ${GLASS_BUTTON_CLASS}`}
                        style={GLASS_ACCENT_STYLE}
                      >
                        {t("chat.send")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.35em] text-slate-500">{t("chat.votesHeading")}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{t("chat.votesHint")}</p>
                    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
                      {tripActivities.length > 0 ? (
                        tripActivities.map((activity) => {
                          const list = votesByActivity[String(activity.id)] || [];
                          const score = list.reduce((sum, v) => sum + Number(v?.value || 0), 0);
                          const mine = list.find((v) => String(v?.voter_id || "") === currentUserId);
                          const mineValue = Number(mine?.value || 0);
                          const votedFor = list.filter((v) => Number(v?.value || 0) === 1);
                          const votedAgainst = list.filter((v) => Number(v?.value || 0) === -1);
                          const scoreDisplay = score > 0 ? `+${score}` : String(score);
                          return (
                            <div
                              key={String(activity.id)}
                              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-semibold text-slate-900">
                                    {String(activity?.title || activity?.name || "").trim()
                                      ? displayActivityTitleForLocale(
                                          String(activity?.title || activity?.name || ""),
                                          language
                                        )
                                      : t("planner.activityNamePlaceholder")}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {String(activity?.date || "")} {String(activity?.time || "")}
                                  </p>
                                  <p className="mt-0.5 text-xs font-medium text-slate-700">
                                    {t("chat.activityBudget", {
                                      amount: Number(activity?.cost || 0).toFixed(2),
                                      currency: t("planner.currencyEur"),
                                    })}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    score > 0
                                      ? "bg-emerald-100 text-emerald-700"
                                      : score < 0
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {t("chat.voteScore", { score: scoreDisplay })}
                                </span>
                              </div>
                              <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => onVote(String(activity.id), 1)}
                                  className={`min-w-0 rounded-xl px-2 py-2 text-[11px] font-medium leading-snug transition sm:px-3 sm:text-xs ${
                                    mineValue === 1
                                      ? "bg-emerald-600 text-white shadow-sm"
                                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {t("chat.voteButtonFor")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onVote(String(activity.id), -1)}
                                  className={`min-w-0 rounded-xl px-2 py-2 text-[11px] font-medium leading-snug transition sm:px-3 sm:text-xs ${
                                    mineValue === -1
                                      ? "bg-rose-600 text-white shadow-sm"
                                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                                  }`}
                                >
                                  {t("chat.voteButtonAgainst")}
                                </button>
                              </div>
                              <p className="mt-2 text-[11px] text-slate-500">
                                {mineValue === 1
                                  ? t("chat.yourVoteFor")
                                  : mineValue === -1
                                    ? t("chat.yourVoteAgainst")
                                    : t("chat.notVotedYet")}
                              </p>
                              <div className="mt-2 space-y-1 break-words">
                                <p className="text-[11px] text-emerald-700">
                                  {t("chat.talliesFor")}{" "}
                                  {votedFor.length > 0
                                    ? votedFor.map((v) => resolveVoterLabel(v, session)).join(", ")
                                    : t("chat.talliesDash")}
                                </p>
                                <p className="text-[11px] text-rose-700">
                                  {t("chat.talliesAgainst")}{" "}
                                  {votedAgainst.length > 0
                                    ? votedAgainst.map((v) => resolveVoterLabel(v, session)).join(", ")
                                    : t("chat.talliesDash")}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-slate-500">{t("chat.noActivities")}</p>
                      )}
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/92 px-5 py-6 text-sm text-slate-600 shadow-[0_10px_30px_rgba(2,6,23,0.06)]">
          {t("chat.selectTrip")}
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

/** Dernier voyage choisi pour le planning (sinon au F5 `selectedTripId` est vide → 1er voyage de la liste, ex. Istanbul). */
const SELECTED_TRIP_STORAGE_KEY = "tp_selected_trip_v1";

function readStoredSelectedTripId() {
  try {
    return normTripId(window.localStorage.getItem(SELECTED_TRIP_STORAGE_KEY));
  } catch (_e) {
    return "";
  }
}

const PLANNER_DATE_STORAGE_KEY = "tp_planner_date_v1";
const PLANNER_MONTH_STORAGE_KEY = "tp_planner_month_v1";

function readStoredPlannerDate() {
  try {
    const s = String(window.localStorage.getItem(PLANNER_DATE_STORAGE_KEY) || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch (_e) {
    // ignore
  }
  return "";
}

function readStoredPlannerMonthCursor() {
  try {
    const raw = String(window.localStorage.getItem(PLANNER_MONTH_STORAGE_KEY) || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (_e) {
    return null;
  }
}

function monthCursorFromPlannerDate(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Main App
export default function App() {
  const { t, language } = useI18n();
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => readStoredActiveTab());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [shareTrip, setShareTrip] = useState(null);
  const [tricountTrip, setTricountTrip] = useState(null);
  /** Voyage dont le panneau budget détaillé est ouvert (onglet Budget). */
  const [budgetDetailTrip, setBudgetDetailTrip] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [tripToDelete, setTripToDelete] = useState(null);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [notice, setNotice] = useState("");
  const [destinationConfirmed, setDestinationConfirmed] = useState(() => readStoredDestinationQuery());
  const [destinationInput, setDestinationInput] = useState(() => readStoredDestinationQuery());
  /** true dès que l'onglet Recherche est visité une 1ère fois — garde le composant monté (display:none) par la suite */
  const [destTabReady, setDestTabReady] = useState(() => readStoredActiveTab() === "destination");
  const [destinationInvalidModalOpen, setDestinationInvalidModalOpen] = useState(false);
  const [destinationInvalidMessage, setDestinationInvalidMessage] = useState("");
  const [tripDateConflictModalOpen, setTripDateConflictModalOpen] = useState(false);
  const [tripDateConflictTrips, setTripDateConflictTrips] = useState([]);

  const [trips, setTrips] = useState([]);
  const [activities, setActivities] = useState([]);
  const [chatActivities, setChatActivities] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(() => readStoredSelectedTripId());
  const [chatTripId, setChatTripId] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatMessagesByTrip, setChatMessagesByTrip] = useState(() => loadChatCacheFromStorage());
  const [chatInput, setChatInput] = useState("");
  const [activityVotes, setActivityVotes] = useState([]);
  const [chatMessagesLocal, setChatMessagesLocal] = useState({});
  const [activityVotesLocal, setActivityVotesLocal] = useState({});
  const [selectedDate, setSelectedDate] = useState(() => readStoredPlannerDate() || getTodayStr());
  const [monthCursor, setMonthCursor] = useState(() => {
    const sm = readStoredPlannerMonthCursor();
    if (sm) return sm;
    return monthCursorFromPlannerDate(readStoredPlannerDate() || getTodayStr());
  });
  const [plannerInviteOpen, setPlannerInviteOpen] = useState(false);
  const [budgetUpcomingOpen, setBudgetUpcomingOpen] = useState(false);
  const [budgetMemoriesOpen, setBudgetMemoriesOpen] = useState(false);

  /** Ids d'activités insérées récemment — fusion avec loadActivities pour éviter l'écrasement par une lecture vide / en retard. */
  const activityInsertGraceRef = useRef(new Map());
  /** Évite double insertion voyage (double clic, double appel concurrent). */
  const createTripInFlightRef = useRef(false);
  /** Dernière liste voyages — lectures async (temps réel, fetch) toujours alignées sur l’état actuel. */
  const tripsRef = useRef(trips);
  tripsRef.current = trips;
  /** Date du calendrier au moment d’un refetch voyages (évite Paris « sélectionné » le 29 alors que le séjour commence le 30). */
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  /** Ignore les réponses `activities` arrivées après un chargement plus récent (courses requêtes). */
  const loadActivitiesGenRef = useRef(0);
  const loadTripExpensesGenRef = useRef(0);

  const [tripExpenses, setTripExpenses] = useState([]);
  /** False si la table `trip_expenses` n’existe pas encore (script SQL non exécuté). */
  const [tripExpensesTableReady, setTripExpensesTableReady] = useState(true);

  const selectedTrip =
    trips.find((t) => normTripId(t.id) === normTripId(selectedTripId)) || null;
  const uiTitle =
    activeTab === "trips"
      ? t("nav.trips")
      : activeTab === "planner"
        ? t("nav.planning")
        : activeTab === "chat"
          ? t("nav.chat")
          : activeTab === "destination"
            ? t("nav.search")
            : t("nav.budget");

  const openPlannerToday = (tripToOpen = null) => {
    const today = getTodayStr();
    const preferredTripId = String(tripToOpen?.id || "");

    // If user opened planner from a specific trip card, always prioritize that trip.
    if (preferredTripId) {
      const preferredTrip = (trips || []).find((t) => String(t?.id || "") === preferredTripId) || tripToOpen;
      const tripStart = toYMD(preferredTrip?.start_date, today);
      const tripEnd = toYMD(preferredTrip?.end_date, tripStart);
      const inPreferredTripRange = tripStart && tripEnd && today >= tripStart && today <= tripEnd;
      const targetDate = inPreferredTripRange ? today : tripStart;
      const d = new Date(`${targetDate}T12:00:00`);

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
    const selStart = selectedTrip ? toYMD(selectedTrip.start_date, today) : "";
    const selEnd = selectedTrip ? toYMD(selectedTrip.end_date, selStart || today) : "";
    const selectedMatchesToday =
      !!selectedTrip && !!selStart && !!selEnd && today >= selStart && today <= selEnd;

    if (!selectedMatchesToday) {
      const sections = classifyTrips(trips);
      const inProgress = sections.now && sections.now[0];
      if (inProgress?.id) {
        setSelectedTripId(String(inProgress.id));
      } else {
        // Aujourd’hui ne tombe dans aucun séjour : ne pas prendre le prochain (ex. Paris à partir de demain).
        setSelectedTripId("");
      }
    }
    setActiveTab("planner");
  };

  const handlePlannerDateSelect = (dateStr) => {
    const safeDate = toYMD(dateStr, getTodayStr());
    setSelectedDate(safeDate);
    const matchingTrip = (trips || []).find((trip) => {
      const start = toYMD(trip?.start_date, "");
      const end = toYMD(trip?.end_date, "");
      return start && end && safeDate >= start && safeDate <= end;
    });
    if (matchingTrip?.id) {
      if (String(matchingTrip.id) !== String(selectedTripId)) {
        setSelectedTripId(String(matchingTrip.id));
      }
      return;
    }
    const cur = (trips || []).find((t) => normTripId(t?.id) === normTripId(selectedTripId));
    if (cur) {
      const s = toYMD(cur.start_date, "");
      const e = toYMD(cur.end_date, "");
      if (s && e && (safeDate < s || safeDate > e)) setSelectedTripId("");
    }
  };

  const replaceTripActivitiesInState = (tripId, freshTripActivities) => {
    const targetTripId = normTripId(tripId);
    const fresh = (freshTripActivities || []).map(normalizeActivity);
    setActivities((prev) => {
      const keep = (prev || []).filter((a) => normTripId(a?.trip_id) !== targetTripId);
      if (fresh.length === 0) {
        const now = Date.now();
        const lagOnly = (prev || []).filter((a) => {
          if (normTripId(a?.trip_id) !== targetTripId) return false;
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession || null);
      setAuthLoading(false);
      const authEmail = String(newSession?.user?.email || "").trim();
      if (authEmail && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void tryMarkInviteeJoinedTrips(supabase);
      }
      if (event !== "SIGNED_IN" || !newSession?.user?.id) return;
      // À chaque connexion (ou inscription), ouvrir « Mes voyages ».
      setActiveTab("trips");
      const uid = newSession.user.id;
      const afterSignup = consumePendingOnboardingIntent(newSession.user);
      if (afterSignup && !hasSeenOnboardingForUser(uid)) {
        setShowOnboarding(true);
      }
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!session) {
      setShowOnboarding(false);
    }
  }, [session]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch (_e) {
      // ignore quota / private mode
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "budget") setBudgetDetailTrip(null);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "destination" && !destTabReady) setDestTabReady(true);
  }, [activeTab, destTabReady]);

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

  useEffect(() => {
    try {
      const id = normTripId(selectedTripId);
      if (id) window.localStorage.setItem(SELECTED_TRIP_STORAGE_KEY, id);
      else window.localStorage.removeItem(SELECTED_TRIP_STORAGE_KEY);
    } catch (_e) {
      // ignore
    }
  }, [selectedTripId]);

  useEffect(() => {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(selectedDate || ""))) {
        window.localStorage.setItem(PLANNER_DATE_STORAGE_KEY, String(selectedDate).trim());
      }
    } catch (_e) {
      // ignore
    }
  }, [selectedDate]);

  useEffect(() => {
    try {
      if (monthCursor instanceof Date && !Number.isNaN(monthCursor.getTime())) {
        const y = monthCursor.getFullYear();
        const mo = String(monthCursor.getMonth() + 1).padStart(2, "0");
        window.localStorage.setItem(PLANNER_MONTH_STORAGE_KEY, `${y}-${mo}`);
      }
    } catch (_e) {
      // ignore
    }
  }, [monthCursor]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setMenuOpen(false);
      setDestinationInput("");
      setDestinationConfirmed("");
      try {
        window.localStorage.removeItem(DESTINATION_QUERY_STORAGE_KEY);
        window.localStorage.removeItem(SELECTED_TRIP_STORAGE_KEY);
        window.localStorage.removeItem(PLANNER_DATE_STORAGE_KEY);
        window.localStorage.removeItem(PLANNER_MONTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      setSelectedTripId("");
      setSelectedDate(getTodayStr());
      setMonthCursor(monthCursorFromPlannerDate(getTodayStr()));
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
      setSelectedTripId("");
      try {
        window.localStorage.removeItem(SELECTED_TRIP_STORAGE_KEY);
        window.localStorage.removeItem(PLANNER_DATE_STORAGE_KEY);
        window.localStorage.removeItem(PLANNER_MONTH_STORAGE_KEY);
      } catch {
        // ignore
      }
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
    // Tant que la session n’est pas résolue, ne pas toucher aux voyages ni à la sélection : sinon
    // `visibleTrips` est vide → on effaçait `selectedTripId` puis au 2e fetch on prenait le 1er voyage (ex. Istanbul).
    if (authLoading) return undefined;

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
        setSelectedTripId((prev) => {
          const prevNorm = normTripId(prev);
          const anchor = toYMD(selectedDateRef.current, getTodayStr());
          const tripCoversAnchor = (t) => {
            const s = toYMD(t?.start_date, "");
            const e = toYMD(t?.end_date, "");
            return s && e && anchor >= s && anchor <= e;
          };
          if (!session) return "";
          if (visibleTrips.length === 0) {
            if (!data || data.length === 0) return "";
            return prevNorm;
          }
          if (prevNorm && visibleTrips.some((t) => normTripId(t?.id) === prevNorm)) {
            const cur = visibleTrips.find((t) => normTripId(t?.id) === prevNorm);
            if (cur && tripCoversAnchor(cur)) return prevNorm;
          }
          const covering = visibleTrips.find(tripCoversAnchor);
          if (covering?.id) return String(covering.id);
          return "";
        });
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
  }, [session, authLoading]);

  useEffect(() => {
    const myGen = ++loadActivitiesGenRef.current;
    const loadActivities = async () => {
      try {
        const tripIds = (tripsRef.current || []).map((t) => normTripId(t?.id)).filter(Boolean);
        if (tripIds.length === 0) {
          if (myGen === loadActivitiesGenRef.current) setActivities([]);
          return;
        }
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .in("trip_id", tripIds);
        if (error) throw error;
        if (myGen !== loadActivitiesGenRef.current) return;
        const fetched = (data || []).map(normalizeActivity);
        setActivities((prev) => mergeActivitiesFromServer(prev, fetched, tripIds, activityInsertGraceRef));
      } catch (e) {
        if (myGen !== loadActivitiesGenRef.current) return;
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
    if (authLoading || !session) {
      setTripExpenses([]);
      return undefined;
    }
    const myGen = ++loadTripExpensesGenRef.current;
    const loadTripExpenses = async () => {
      const tripIds = (tripsRef.current || []).map((t) => normTripId(t?.id)).filter(Boolean);
      if (tripIds.length === 0) {
        if (myGen === loadTripExpensesGenRef.current) setTripExpenses([]);
        return;
      }
      try {
        const { data, error } = await supabase.from("trip_expenses").select("*").in("trip_id", tripIds);
        if (error) {
          const msg = String(error.message || "");
          if (/trip_expenses|relation|does not exist|Could not find the table|schema cache/i.test(msg)) {
            if (myGen === loadTripExpensesGenRef.current) {
              setTripExpensesTableReady(false);
              setTripExpenses([]);
            }
            return;
          }
          throw error;
        }
        if (myGen !== loadTripExpensesGenRef.current) return;
        setTripExpensesTableReady(true);
        setTripExpenses((data || []).map(normalizeTripExpenseRow).filter(Boolean));
      } catch (e) {
        if (myGen !== loadTripExpensesGenRef.current) return;
        setNotice(String(e?.message || "Erreur chargement depenses groupe"));
      }
    };
    loadTripExpenses();
    const exChannel = supabase
      .channel("trip-expenses-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_expenses" }, loadTripExpenses)
      .subscribe();
    return () => supabase.removeChannel(exChannel);
  }, [trips, session, authLoading]);

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
          return {
            title: String(item || "").trim(),
            date: "",
            time: "",
            location: "",
            cost: 0,
            description: "",
          };
        }
        return {
          title: String(item?.title || "").trim(),
          date:
            item?.date != null && String(item.date).trim() !== ""
              ? toYMDLoose(item.date) || toYMD(item.date, "")
              : "",
          time: String(item?.time || "").trim(),
          location: String(item?.location || "").trim(),
          cost: clampActivityCostEUR(item?.cost),
          description: String(item?.description || "").trim(),
        };
      })
      .filter((x) => x.title);
    if (!tripId || normalizedItems.length === 0) return true;
    const tripDayList = listTripDatesInclusive(startYmd, endYmd);
    const tripDaySet = new Set(tripDayList);
    const fallbackDates = assignActivityDatesRoundRobin(startYmd, endYmd, normalizedItems.length);
    const insertErrorMsgs = [];
    for (let i = 0; i < normalizedItems.length; i += 1) {
      const { title, date: inDate, time: inTime, location, cost, description } = normalizedItems[i];
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
        trip_id: normTripId(tripId),
        date: safeDate,
        date_key: safeDate,
        activity_date: safeDate,
        time: assignedTime,
        title,
        name: title,
        description: String(description || ""),
        cost: clampActivityCostEUR(cost),
        location: String(location || ""),
        photo_url: String(fallbackPhoto || ""),
        image_url: String(fallbackPhoto || ""),
      };
      if (String(userId || "").trim()) {
        actPayload.owner_id = String(userId).trim();
      }
      let insertFailed = true;
      let lastInsertErr = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { error: actErr } = await supabase.from("activities").insert(actPayload);
        if (!actErr) {
          insertFailed = false;
          break;
        }
        lastInsertErr = actErr;
        const msg = String(actErr?.message || "");
        const missing = parseMissingSchemaColumnName(actErr);
        if (missing && Object.prototype.hasOwnProperty.call(actPayload, missing)) {
          const { [missing]: _removed, ...rest } = actPayload;
          actPayload = rest;
          continue;
        }
        if (/uuid|22P02|invalid input syntax/i.test(msg) && Object.prototype.hasOwnProperty.call(actPayload, "owner_id")) {
          const { owner_id: _o, ...rest } = actPayload;
          actPayload = rest;
          continue;
        }
        break;
      }
      if (insertFailed && lastInsertErr) {
        const em = lastInsertErr;
        const parts = [em?.message, em?.details, em?.hint].filter(Boolean).map(String);
        insertErrorMsgs.push(parts.length ? parts.join(" — ") : "Impossible d'enregistrer une activite.");
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
      replaceTripActivitiesInState(normTripId(tripId), fresh);
    } catch (_e) {
      /* ignore */
    }
    return insertErrorMsgs.length === 0;
  };

  const createTrip = async (payload) => {
    const safeTitle = formatCityName(payload?.title || "");
    if (!safeTitle) {
      setNotice(t("notices.destinationRequired"));
      return false;
    }
    if (String(payload.start_date || "") > String(payload.end_date || "")) {
      setNotice(t("notices.invalidStartDate"));
      return false;
    }
    const newStart = toYMD(String(payload.start_date || getTodayStr()), getTodayStr());
    const newEnd = toYMD(String(payload.end_date || newStart), newStart);
    const dateConflicts = findTripsOverlappingDateRange(trips, newStart, newEnd, null);
    if (dateConflicts.length > 0) {
      setTripDateConflictTrips(dateConflicts);
      setTripDateConflictModalOpen(true);
      return false;
    }
    if (createTripInFlightRef.current) {
      setNotice(t("notices.tripCreating"));
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
        invited_joined_emails: [],
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
                  return {
                    title,
                    date: dateYmd,
                    time: String(row?.time || "").trim(),
                    location: String(row?.location || "").trim(),
                    cost: clampActivityCostEUR(row?.cost),
                    description: String(row?.description || "").trim(),
                  };
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

          let inviteNotice = "";
          const inviteList = Array.isArray(body.invited_emails)
            ? [
                ...new Set(
                  body.invited_emails
                    .map((m) => String(m || "").trim().toLowerCase())
                    .filter((m) => isValidEmail(m))
                ),
              ]
            : [];
          if (inviteList.length > 0) {
            const inv = await postTripInvitesToApi({
              to: inviteList,
              tripTitle: String(body.destination || body.title || safeTitle),
              startYmd: body.start_date,
              endYmd: body.end_date,
              fixedUrl: body.fixed_url,
            });
            if (!inv.skipped) {
              inviteNotice = !inv.ok
                ? inv.error || NOTICE_INVITE_EMAIL_FAILED
                : `${inviteList.length} invitation(s) envoyée(s).`;
            }
          }

          setTripModalOpen(false);
          // Pas de message "success" : on laisse l'UI se mettre à jour via le fetch/les subscriptions.
          if (activitiesInsertOk) {
            setNotice(inviteNotice);
          } else if (inviteNotice) {
            setNotice((prev) => {
              const base = String(prev || "").trim();
              return base ? `${base} — ${inviteNotice}` : inviteNotice;
            });
          }
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
            // Priorité à l’id renvoyé par l’insert (fiable) ; repli si absent du jeu visible (RLS / latence).
            try {
              const tripStart = toYMD(body.start_date, getTodayStr());
              const wantedStart = toYMD(body.start_date, "");
              const wantedEnd = toYMD(body.end_date, "");
              const wantedTitle = String(body.destination || body.title || safeTitle || "");
              let pickId = normTripId(newTripId);
              if (!pickId || !visibleAfterCreate.some((t) => normTripId(t?.id) === pickId)) {
                const fallback =
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
                  visibleAfterCreate.find(
                    (t) => String(t.start_date || "") === wantedStart && String(t.end_date || "") === wantedEnd
                  ) ||
                  visibleAfterCreate[0];
                pickId = normTripId(fallback?.id);
              }
              if (pickId) {
                setSelectedTripId(pickId);
                setSelectedDate(tripStart);
                const md = new Date(`${tripStart}T12:00:00`);
                if (!Number.isNaN(md.getTime())) {
                  setMonthCursor(new Date(md.getFullYear(), md.getMonth(), 1));
                }
              }
            } catch (_matchErr) {
              const pid = normTripId(newTripId);
              if (pid) setSelectedTripId(pid);
              else if (visibleAfterCreate.length > 0) setSelectedTripId(String(visibleAfterCreate[0].id));
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
      setNotice(String(e?.message || t("modals.tripCreateError")));
    } finally {
      createTripInFlightRef.current = false;
    }
    return false;
  };

  const formatSupabaseClientError = (e) => {
    const parts = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).map(String);
    return parts.length ? parts.join(" — ") : t("modals.unknownError");
  };

  const addActivity = async (input) => {
    const tid = normTripId(selectedTripId);
    if (!tid) {
      const msg = t("modals.selectTripFirst");
      setNotice(msg);
      return { ok: false, error: msg };
    }
    try {
      let userId = String(session?.user?.id || "");
      try {
        const { data: userData } = await supabase.auth.getUser();
        const g = String(userData?.user?.id || "");
        if (g) userId = g;
      } catch (_e) {
        /* keep session fallback */
      }
      const safeSelectedDate = toYMD(selectedDate, getTodayStr());
      const index = (activities || []).filter((a) => toYMDLoose(a?.date_key || a?.date) === safeSelectedDate).length;
      const manualTime = String(input?.time || "").trim();
      const assignedTime =
        normalizeActivityTimeHHMM(manualTime) ||
        normalizeActivityTimeHHMM(slots[index % slots.length]) ||
        String(slots[index % slots.length]).slice(0, 5);
      const activityPrompt = String(
        `${input.title || ""} ${input.location || ""} ${safeSelectedDate} ${assignedTime}`
      ).trim();
      const rawCost = Number(input?.cost);
      const safeCost = Number.isFinite(rawCost) ? rawCost : 0;
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
        trip_id: tid,
        date: safeSelectedDate,
        date_key: safeSelectedDate,
        activity_date: safeSelectedDate,
        time: assignedTime,
        title: String(input.title || input.name || "Activite"),
        name: String(input.title || input.name || "Activite"),
        description: String(input.description || ""),
        cost: safeCost,
        location: String(input.location || ""),
        photo_url: String(fallbackPhoto || ""),
        image_url: String(fallbackPhoto || ""),
      };
      if (String(userId || "").trim()) {
        payload.owner_id = String(userId).trim();
      }

      let lastInsertError = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        // INSERT sans .select("id") : si RLS autorise l'insertion mais pas le RETURNING / lecture de la ligne,
        // l'ancien flux échouait alors que la ligne existait — le modal restait ouvert.
        const { error } = await supabase.from("activities").insert(payload);
        if (!error) {
          let fresh = [];
          try {
            fresh = await fetchActivitiesRowsForTrip(tid);
            replaceTripActivitiesInState(tid, fresh);
          } catch (_e) {
            /* ignore */
          }
          const titleMatch = String(payload.title || "");
          const match = (fresh || []).find(
            (r) =>
              normTripId(r.trip_id) === tid &&
              toYMDLoose(r?.date_key || r?.date) === safeSelectedDate &&
              String(r.time || "").slice(0, 5) === assignedTime &&
              String(r.title || r.name || "") === titleMatch
          );
          const insertedId = String(match?.id || "");
          if (insertedId) {
            activityInsertGraceRef.current.set(insertedId, Date.now());
            cacheActivityDescription(insertedId, input?.description || "");
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
                try {
                  const fresh2 = await fetchActivitiesRowsForTrip(tid);
                  replaceTripActivitiesInState(tid, fresh2);
                } catch (_refreshErr) {
                  /* ignore */
                }
              } catch (_bgErr) {
                /* ignore */
              }
            })();
          }

          setNotice("");
          return { ok: true };
        }

        lastInsertError = error;
        const msg = String(error?.message || "");
        const missing = parseMissingSchemaColumnName(error);
        if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
          const { [missing]: _removed, ...rest } = payload;
          payload = rest;
          continue;
        }
        if (/uuid|22P02|invalid input syntax/i.test(msg) && Object.prototype.hasOwnProperty.call(payload, "owner_id")) {
          const { owner_id: _o, ...rest } = payload;
          payload = rest;
          continue;
        }
        throw error;
      }
      const fallbackMsg = lastInsertError
        ? formatSupabaseClientError(lastInsertError)
        : t("modals.activityAddFallback");
      setNotice(fallbackMsg);
      return { ok: false, error: fallbackMsg };
    } catch (e) {
      const m = formatSupabaseClientError(e) || t("modals.activityAddError");
      const rlsHint = /row-level security|RLS|permission denied|42501/i.test(m) ? t("modals.hintRlsSuffix") : "";
      const fkHint = /foreign key|violates foreign key|23503/i.test(m) ? t("modals.hintFkSuffix") : "";
      const full = m + rlsHint + fkHint;
      setNotice(full);
      return { ok: false, error: full };
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
        location: String(activity?.location || ""),
        cost: Number(activity?.cost || 0),
        time: String(activity?.time || ""),
        photo_url: String(refreshedPhoto || ""),
        image_url: String(refreshedPhoto || ""),
      };
      for (let attempt = 0; attempt < 12; attempt += 1) {
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
        const missing = parseMissingSchemaColumnName(error);
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

  const addGroupExpense = async (row) => {
    if (!tripExpensesTableReady) return;
    const tid = normTripId(row?.trip_id);
    if (!tid) return;
    let body = {
      trip_id: tid,
      title: String(row?.title || "Dépense").trim(),
      amount: Math.max(0, Number(row?.amount) || 0),
      paid_by: String(row?.paid_by || "Moi"),
      split_between: Array.isArray(row?.split_between) ? row.split_between : [],
      expense_date: row?.expense_date || null,
    };
    if (session?.user?.id) body.owner_id = session.user.id;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data, error } = await supabase.from("trip_expenses").insert(body).select("*");
      if (!error && data?.[0]) {
        const norm = normalizeTripExpenseRow(data[0]);
        if (norm) setTripExpenses((prev) => [...(prev || []), norm]);
        setNotice("");
        return;
      }
      if (error) {
        const msg = String(error.message || "");
        if (/trip_expenses|relation|does not exist|Could not find the table/i.test(msg)) {
          setTripExpensesTableReady(false);
          return;
        }
        const missing = parseMissingSchemaColumnName(error);
        if (missing && Object.prototype.hasOwnProperty.call(body, missing)) {
          const { [missing]: _r, ...rest } = body;
          body = rest;
          continue;
        }
        if (/uuid|22P02|invalid input syntax/i.test(msg) && Object.prototype.hasOwnProperty.call(body, "owner_id")) {
          const { owner_id: _o, ...rest } = body;
          body = rest;
          continue;
        }
        setNotice(msg);
        return;
      }
    }
  };

  const updateGroupExpense = async (row) => {
    const id = String(row?.id || "");
    if (!id) return;
    let body = {
      title: String(row?.title || "").trim(),
      amount: Math.max(0, Number(row?.amount) || 0),
      paid_by: String(row?.paid_by || "Moi"),
      split_between: Array.isArray(row?.split_between) ? row.split_between : [],
      expense_date: row?.expense_date || null,
    };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { data, error } = await supabase.from("trip_expenses").update(body).eq("id", id).select("*");
      if (!error && data?.[0]) {
        const norm = normalizeTripExpenseRow(data[0]);
        if (norm) {
          setTripExpenses((prev) => (prev || []).map((e) => (String(e.id) === id ? norm : e)));
        }
        setNotice("");
        return;
      }
      if (error) {
        const missing = parseMissingSchemaColumnName(error);
        if (missing && Object.prototype.hasOwnProperty.call(body, missing)) {
          const { [missing]: _r, ...rest } = body;
          body = rest;
          continue;
        }
        setNotice(String(error.message || "Erreur mise a jour depense"));
        return;
      }
    }
  };

  const deleteGroupExpense = async (row) => {
    const id = String(row?.id || "");
    if (!id) return;
    try {
      const { error } = await supabase.from("trip_expenses").delete().eq("id", id);
      if (error) throw error;
      setTripExpenses((prev) => (prev || []).filter((e) => String(e.id) !== id));
      setNotice("");
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression depense"));
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
      let updateBody = { participants, invited_emails: nextInvitedEmails };
      if (Array.isArray(tricountTrip?.invited_joined_emails)) {
        const invSet = new Set(nextInvitedEmails.map((x) => String(x || "").trim().toLowerCase()));
        updateBody.invited_joined_emails = tricountTrip.invited_joined_emails
          .map((x) => String(x || "").trim().toLowerCase())
          .filter((e) => invSet.has(e));
      }
      let saveErr = null;
      for (let att = 0; att < 6; att += 1) {
        const { error } = await supabase.from("trips").update(updateBody).eq("id", tricountTrip.id);
        if (!error) {
          saveErr = null;
          break;
        }
        saveErr = error;
        const missing = parseMissingSchemaColumnName(error);
        if (missing && Object.prototype.hasOwnProperty.call(updateBody, missing)) {
          const { [missing]: _r, ...rest } = updateBody;
          updateBody = rest;
          continue;
        }
        break;
      }
      if (saveErr) throw saveErr;
      setTrips((prev) =>
        (prev || []).map((trip) =>
          String(trip?.id) === String(tricountTrip?.id)
            ? normalizeTrip({
                ...trip,
                participants,
                invited_emails: nextInvitedEmails,
                ...(updateBody.invited_joined_emails !== undefined
                  ? { invited_joined_emails: updateBody.invited_joined_emails }
                  : {}),
              })
            : trip
        )
      );
      if (newlyAddedInviteEmails.length > 0) {
        const inv = await postTripInvitesToApi({
          to: newlyAddedInviteEmails,
          tripTitle: String(tricountTrip?.title || "Voyage"),
          startYmd: tricountTrip?.start_date,
          endYmd: tricountTrip?.end_date,
          fixedUrl: String(tricountTrip?.fixed_url || ""),
        });
        if (inv.ok && !inv.skipped) {
          setNotice(`${newlyAddedInviteEmails.length} participant(s) invité(s) par e-mail.`);
        } else if (!inv.skipped) {
          setNotice(`Participants enregistrés. ${inv.error || NOTICE_INVITE_EMAIL_FAILED}`);
        } else {
          setNotice("");
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
      setNotice(t("notices.destinationRequired"));
      return;
    }
    if (String(trip.start_date || "") > String(trip.end_date || "")) {
      setNotice(t("notices.invalidStartDate"));
      return;
    }
    try {
      const currentTrip = (trips || []).find((t) => String(t?.id) === String(trip?.id)) || trip || {};
      const newStart = toYMD(String(trip.start_date || getTodayStr()), getTodayStr());
      const newEnd = toYMD(String(trip.end_date || newStart), newStart);
      const prevStart = toYMD(currentTrip?.start_date, newStart);
      const prevEnd = toYMD(currentTrip?.end_date, prevStart);
      const datesChanged = prevStart !== newStart || prevEnd !== newEnd;
      if (datesChanged) {
        const dateConflicts = findTripsOverlappingDateRange(trips, newStart, newEnd, trip.id);
        if (dateConflicts.length > 0) {
          setTripDateConflictTrips(dateConflicts);
          setTripDateConflictModalOpen(true);
          return;
        }
      }
      const previousInvitedEmails = Array.isArray(currentTrip?.invited_emails) ? currentTrip.invited_emails : [];
      const previousInvitedSet = new Set(previousInvitedEmails.map((m) => String(m || "").toLowerCase().trim()).filter(Boolean));

      const nextInvitedList =
        Array.isArray(trip?.invited_emails) && trip.invited_emails.length > 0 ? trip.invited_emails : [];
      const nextInvitedLower = new Set(nextInvitedList.map((m) => String(m || "").trim().toLowerCase()).filter(Boolean));
      let joinedForPayload;
      if (Array.isArray(currentTrip?.invited_joined_emails)) {
        joinedForPayload = currentTrip.invited_joined_emails
          .map((x) => String(x || "").trim().toLowerCase())
          .filter((e) => nextInvitedLower.has(e));
      } else {
        joinedForPayload = undefined;
      }

      let payload = {
        invited_emails: nextInvitedList,
        title: safeTitle,
        name: safeTitle,
        destination: safeTitle,
        start_date: String(trip.start_date || getTodayStr()),
        end_date: String(trip.end_date || getTodayStr()),
        participants: canonicalParticipants(
          Array.isArray(currentTrip?.participants) ? currentTrip.participants : [],
          nextInvitedList.length > 0 ? nextInvitedList : []
        ),
        fixed_url: String(trip.fixed_url || ""),
      };
      if (joinedForPayload !== undefined) {
        payload.invited_joined_emails = joinedForPayload;
      }
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
                    ...(joinedForPayload !== undefined ? { invited_joined_emails: joinedForPayload } : {}),
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
            const inv = await postTripInvitesToApi({
              to: newlyAddedInvites,
              tripTitle: nextTitle,
              startYmd: nextStart,
              endYmd: nextEnd,
              fixedUrl: nextFixedUrl,
            });
            if (inv.ok && !inv.skipped) {
              setNotice(`Voyage modifié. ${newlyAddedInvites.length} invitation(s) envoyée(s).`);
            } else if (!inv.skipped) {
              setNotice(`Voyage modifié. ${inv.error || NOTICE_INVITE_EMAIL_FAILED}`);
            } else {
              setNotice("");
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
      setBudgetDetailTrip((t) => (t && String(t.id) === idStr ? null : t));

      setNotice("");
      setTripToDelete(null);
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression voyage"));
    } finally {
      setDeletingTrip(false);
    }
  };

  const tabs = [
    { id: "trips", icon: Briefcase, label: t("nav.trips") },
    { id: "planner", icon: Calendar, label: t("nav.planner") },
    { id: "destination", icon: Search, label: t("nav.search") },
    { id: "budget", icon: DollarSign, label: t("nav.budget") },
    { id: "chat", icon: MessageCircle, label: t("nav.chat") },
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

  const handleConfirmDestination = async (raw) => {
    const stem = extractCityPrompt(raw) || normalizeCityInput(raw);
    const trimmed = normalizeCityInput(stem);
    if (trimmed.length < 2) return;

    const nstem = normalizeTextForSearch(trimmed);
    if (isExclusiveCountryIntent(nstem)) {
      setDestinationInvalidMessage(t("destination.invalidCountry"));
      setDestinationInvalidModalOpen(true);
      return;
    }

    const resolved = await resolveValidatedDestination(raw, language);
    if (!resolved) {
      setDestinationInvalidMessage(t("destination.invalidUnknown"));
      setDestinationInvalidModalOpen(true);
      return;
    }
    setDestinationConfirmed(resolved);
    setDestinationInput(resolved);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: BG, color: TEXT }}>
        <div className="rounded-[3.5rem] bg-white/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
          {t("app.loading")}
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthView />;
  }

  return (
    <div
      className="min-h-screen max-w-[100vw] overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom,0px))]"
      style={{
        color: TEXT,
        background:
          "radial-gradient(circle at 18% -8%, #ffffff 0%, #eef4fa 40%, #e3edf6 100%)",
      }}
    >
      <TopNav title={uiTitle} onMenu={() => setMenuOpen(true)} onAdd={() => setTripModalOpen(true)} />

      <main className="mx-auto mt-5 w-full min-w-0 max-w-6xl px-3 sm:px-5">
        {notice ? (
          <div className="mb-4 break-words rounded-[1.25rem] bg-white/90 px-4 py-3 text-sm shadow-[0_10px_28px_rgba(2,6,23,0.08)] ring-1 ring-slate-200/70">
            {String(notice)}
          </div>
        ) : null}

        {/* DestinationGuideView reste monté (display:none) après la 1ère visite
            → état préservé au retour sur l'onglet + évite les re-fetch */}
        {destTabReady && (
          <div style={{ display: activeTab === "destination" ? undefined : "none" }}>
            <DestinationGuideView
              session={session}
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
          </div>
        )}

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
            <div className="rounded-[2rem] bg-white/92 p-3 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/70 sm:p-5">
              {selectedTrip ? (
                <TripLiquidGlassShell
                  imageTitle={String(
                    selectedTrip?.destination || selectedTrip?.title || t("modals.tripDefault")
                  )}
                  active
                  className="rounded-2xl border border-white/50 shadow-[0_12px_28px_rgba(2,6,23,0.12)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
                    <div className="min-w-0 max-w-full flex-1">
                      <p className="text-[10px] uppercase tracking-[0.34em] text-white/80">{t("planner.activeTrip")}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                          style={{ backgroundColor: ACCENT }}
                        >
                          <MapPin size={10} className="mr-1 shrink-0" />
                          {t("destination.badgeDestination")}
                        </span>
                      </div>
                      <h3 className="mt-2 break-words text-xl font-extrabold uppercase leading-tight tracking-[0.02em] text-white drop-shadow-sm sm:text-2xl sm:leading-none">
                        {selectedTrip.title
                          ? displayCityForLocale(String(selectedTrip.title), language)
                          : t("modals.tripDefault")}
                      </h3>
                      <p className="mt-1 break-all text-xs text-white/85">
                        {formatDate(selectedTrip.start_date)} - {formatDate(selectedTrip.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center -space-x-2">
                        {invitedEmailsForAvatarStrip(selectedTrip)
                          .slice(0, 5)
                          .map((mail) => (
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
                        title={t("modals.inviteByEmailTitle")}
                      >
                        <Mail size={16} />
                      </button>
                    </div>
                  </div>
                </TripLiquidGlassShell>
              ) : (
                <p className="text-sm text-slate-500">{t("home.noCurrentTrip")}</p>
              )}
            </div>
            <PlannerView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              onSelectDate={handlePlannerDateSelect}
              selectedTrip={selectedTrip}
              selectedTripId={selectedTripId}
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
          <section className="pb-4">
            <div className="mb-6 rounded-[2rem] border border-amber-100/90 bg-gradient-to-br from-amber-50/95 via-white to-slate-50/90 p-4 shadow-[0_14px_40px_rgba(180,83,9,0.07)] ring-1 ring-amber-100/60 sm:p-6">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-900 shadow-sm ring-1 ring-amber-200/50">
                  <Wallet className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">{t("budget.title")}</h2>
                  <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{t("budget.intro")}</p>
                </div>
              </div>
            </div>
            <div className="space-y-7">
              {(() => {
                const sections = classifyTrips(trips || []);
                const renderBudgetTrip = (trip) => (
                  <BudgetTripSummaryCard
                    key={String(trip.id)}
                    trip={trip}
                    activities={activities}
                    groupExpenses={tripExpenses}
                    groupExpensesEnabled={tripExpensesTableReady}
                    onOpenDetail={() => setBudgetDetailTrip(trip)}
                  />
                );
                return (
                  <>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-emerald-200/70 bg-emerald-50/45 p-4 shadow-[0_10px_26px_rgba(16,185,129,0.08)]">
                        <h3 className="mb-1 text-xs uppercase tracking-[0.3em] text-emerald-700">{t("trips.badgeInProgress")}</h3>
                        <p className="mb-3 text-[11px] text-emerald-900/60">{t("trips.nowSectionHint")}</p>
                        <div className="grid gap-4">
                        {sections.now.length > 0
                          ? sections.now.map(renderBudgetTrip)
                          : <p className="text-sm text-slate-500">{t("home.noCurrentTrip")}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-sky-200/70 bg-sky-50/45 p-4 shadow-[0_10px_26px_rgba(14,165,233,0.08)]">
                        <button
                          type="button"
                          onClick={() => setBudgetUpcomingOpen((v) => !v)}
                          className="mb-1 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
                        >
                          <div>
                            <h3 className="text-xs uppercase tracking-[0.3em] text-sky-700">{t("trips.badgeUpcoming")}</h3>
                            <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-sky-800/55">
                              {t("trips.upcomingSubtitle")}
                            </p>
                          </div>
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
                              : <p className="text-sm text-slate-500">{t("trips.noUpcomingList")}</p>}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-[2rem] border border-slate-200 bg-slate-50/55 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                        <button
                          type="button"
                          onClick={() => setBudgetMemoriesOpen((v) => !v)}
                          className="mb-1 flex w-full items-center justify-between rounded-xl px-1 py-1 text-left"
                        >
                          <div>
                            <h3 className="text-xs uppercase tracking-[0.3em] text-slate-600">{t("trips.badgePast")}</h3>
                            <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-500">
                              {t("trips.pastSubtitle")}
                            </p>
                          </div>
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
                              : <p className="text-sm text-slate-500">{t("trips.noMemories")}</p>}
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

      <nav className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 w-[min(100%-1.5rem,calc(100vw-1.5rem))] max-w-3xl -translate-x-1/2 rounded-[2.2rem] bg-white/92 p-2 shadow-[0_18px_44px_rgba(2,6,23,0.12)] backdrop-blur-xl ring-1 ring-slate-200/70">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                data-tour-id={`tab-${t.id}`}
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
        user={session?.user || null}
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
        onShowTour={() => {
          setMenuOpen(false);
          setShowOnboarding(true);
        }}
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
      <ShareModal
        open={!!shareTrip}
        onClose={() => setShareTrip(null)}
        trip={shareTrip}
        activities={(activities || []).filter((a) => String(a?.trip_id) === String(shareTrip?.id))}
        inviterName={getMenuGreetingName(session?.user) || ""}
      />
      <TripParticipantsModal open={!!tricountTrip} onClose={() => setTricountTrip(null)} trip={tricountTrip} onSave={saveParticipants} />
      {budgetDetailTrip ? (
        <BudgetTripDetailShell trip={budgetDetailTrip} onClose={() => setBudgetDetailTrip(null)}>
          <TripExpenseDetail
            trip={budgetDetailTrip}
            session={session}
            activities={(activities || []).filter((a) => String(a.trip_id) === String(budgetDetailTrip.id))}
            groupExpenses={(tripExpenses || []).filter((e) => String(e.trip_id) === String(budgetDetailTrip.id))}
            groupExpensesEnabled={tripExpensesTableReady}
            onOpenParticipants={setTricountTrip}
            onUpdateActivity={updateActivity}
            onDeleteActivity={deleteActivity}
            onAddGroupExpense={addGroupExpense}
            onUpdateGroupExpense={updateGroupExpense}
            onDeleteGroupExpense={deleteGroupExpense}
          />
        </BudgetTripDetailShell>
      ) : null}
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
      {destinationInvalidModalOpen ? (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-dest-invalid-title"
          onClick={(e) => { if (e.target === e.currentTarget) setDestinationInvalidModalOpen(false); }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/80" onClick={(e) => e.stopPropagation()}>
            <h3 id="tp-dest-invalid-title" className="text-lg font-semibold text-slate-900">
              {t("destination.modalTitle")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{destinationInvalidMessage}</p>
            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-slate-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              onClick={() => setDestinationInvalidModalOpen(false)}
            >
              {t("common.ok")}
            </button>
          </div>
        </div>
      ) : null}
      {tripDateConflictModalOpen ? (
        <div
          className="fixed inset-0 z-[73] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-trip-date-conflict-title"
          onClick={(e) => { if (e.target === e.currentTarget) { setTripDateConflictModalOpen(false); setTripDateConflictTrips([]); } }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/80" onClick={(e) => e.stopPropagation()}>
            <h3 id="tp-trip-date-conflict-title" className="text-lg font-semibold text-slate-900">
              {t("modals.tripDateTitle")}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("modals.tripDateIntro")}</p>
            <ul className="mt-4 max-h-48 list-disc space-y-2 overflow-y-auto pl-5 text-sm text-slate-800">
              {tripDateConflictTrips.map((tripRow) => (
                <li key={String(tripRow.id)}>
                  <span className="font-medium">
                    {displayCityForLocale(
                      tripDestinationDisplayName(tripRow) || t("modals.tripDefault"),
                      language
                    )}
                  </span>
                  <span className="text-slate-600">
                    {" "}
                    — {formatDate(tripRow.start_date)} – {formatDate(tripRow.end_date)}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-6 w-full rounded-2xl bg-slate-900 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              onClick={() => {
                setTripDateConflictModalOpen(false);
                setTripDateConflictTrips([]);
              }}
            >
              {t("common.ok")}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Onboarding guide (nouveaux utilisateurs) ── */}
      {showOnboarding && session?.user?.id ? (
        <OnboardingTour
          userId={session.user.id}
          onDone={(completedFullTour) => {
            setShowOnboarding(false);
            if (completedFullTour) setActiveTab("trips");
          }}
          onNavigateToTab={(tab) => {
            if (tab === "planner") openPlannerToday();
            else setActiveTab(tab);
          }}
        />
      ) : null}

    </div>
  );
}
