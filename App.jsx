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
  fetchItineraryGroqFirst,
  fetchGroqTips,
  fetchGroqTripSuggestions,
  fetchGroqSuggestedActivities,
} from "./geminiClient.js";
import { sanitizeMustSeePlaces } from "./placeGuards.js";
import { ICONIC_PLACES_CANONICAL } from "./iconicPlacesData.js";
import { computeTricountBalances, simplifyTricountDebts } from "./tricountLogic.js";
import {
  buildCityHeroUnsplashQuery,
  buildCityDronePromptFR,
  getHeroUnsplashDescBoostTokens,
  normalizeCityDroneKey,
  inferAestheticCityQueryType,
  AESTHETIC_CITY_QUERY_TYPE,
} from "./cityDroneImagePrompt.js";
import { WIKIMEDIA_CURATED_CITY_HEROES } from "./cityWikimediaHeroes.js";
import { useI18n, LanguageSelector, LanguageFab } from "./i18n/I18nContext.jsx";
import { getAppDateLocale } from "./i18n/dateLocale.js";
import { catalogCityHitsForLocalizedQuery, displayCityForLocale } from "./i18n/cityDisplay.js";
import { activityTitleSaveValue, displayActivityTitleForLocale } from "./i18n/activityDisplay.js";
import {
  UiLocalizedTripTitle,
  UiTranslatedActivityTitle,
  useUiTranslatedCityName,
  useUiTranslatedText,
} from "./i18n/userContentTranslate.jsx";
import { translations, DEFAULT_LOCALE } from "./i18n/translations.js";
import {
  OnboardingTour,
  hasSeenOnboardingForUser,
  markSignupExpectsOnboarding,
  consumePendingOnboardingIntent,
  clearSignupOnboardingMarkers,
} from "./OnboardingTour.jsx";
import { TripDateRangeField } from "./TripDateRangeField.jsx";
import { formatNoticeForEndUser } from "./devUiNotices.js";

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
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";

/** Page statique (`public/`) — politique de confidentialité (App Store, mentions légales, lien in-app). */
const PRIVACY_POLICY_HREF = `${import.meta.env.BASE_URL}politique-confidentialite.html`;

/**
 * Pénalités légende Unsplash : éviter les résultats géographiquement incohérents (pont de Brooklyn pour San Francisco, etc.).
 * Clés = normalizeTextForSearch(resolveCanonicalCity(…)) ou variante proche.
 */
const UNSPLASH_HERO_CONFLICT_AVOID = Object.freeze({
  "san francisco": [
    "brooklyn",
    "brooklyn bridge",
    "manhattan",
    "new york",
    "nyc",
    "empire state",
    "times square",
    "statue of liberty",
    "liberty island",
    "jersey city",
    "williamsburg",
    "dumbo",
    "central park",
    "queens",
    "one world trade",
    "flatiron",
    "harlem",
    "wtc",
    "lower manhattan",
  ],
  "los angeles": [
    "golden gate",
    "san francisco",
    "bay bridge",
    "brooklyn",
    "manhattan",
    "new york",
    "chicago loop",
  ],
  "new york": [
    "golden gate",
    "san francisco",
    "hollywood sign",
    "beverly hills",
    "griffith observatory",
    "santa monica pier",
    "venice beach los angeles",
  ],
  chicago: [
    "new york",
    "manhattan",
    "brooklyn",
    "golden gate",
    "san francisco",
  ],
  boston: [
    "philadelphia city hall",
    "new york skyline",
    "manhattan",
  ],
  seattle: [
    "golden gate",
    "san francisco",
    "space needle toronto",
  ],
  lisbon: [
    "porto",
    "oporto",
    "seville",
    "sevilla",
    "granada spain",
    "cordoba spain",
    "madrid",
    "barcelona",
    "casablanca",
  ],
  lisbonne: [
    "porto",
    "oporto",
    "seville",
    "sevilla",
    "granada spain",
    "cordoba spain",
    "madrid",
    "barcelona",
    "casablanca",
  ],
  porto: ["lisbon", "lisboa", "lisbonne", "madrid", "barcelona"],
  barcelona: ["madrid skyline", "seville cathedral"],
  madrid: ["barcelona sagrada", "lisbon"],
  rome: ["florence duomo", "venice grand canal"],
  roma: ["florence duomo", "venice grand canal"],
  paris: ["london big ben", "tower bridge london"],
  londres: ["eiffel tower", "paris skyline"],
  london: ["eiffel tower", "paris skyline"],
  "sao paulo": [
    "rio de janeiro",
    "christ the redeemer",
    "cristo redentor",
    "corcovado",
    "copacabana",
    "ipanema",
    "sugarloaf",
    "pao de acucar",
    "maracana",
    "maracanã",
  ],
  "rio de janeiro": [
    "sao paulo",
    "são paulo",
    "avenida paulista",
    "ipiranga monument",
  ],
  dubai: [
    "abu dhabi",
    "sheikh zayed mosque",
    "doha",
    "riyadh",
  ],
  "abu dhabi": [
    "dubai",
    "burj khalifa",
    "doha",
    "riyadh",
  ],
  doha: [
    "dubai",
    "abu dhabi",
    "riyadh",
  ],
  tokyo: [
    "osaka castle",
    "kyoto temple",
    "beijing",
    "seoul",
  ],
  osaka: [
    "tokyo tower",
    "shibuya",
    "kyoto",
  ],
  kyoto: [
    "tokyo tower",
    "osaka castle",
    "shibuya",
  ],
  seoul: [
    "tokyo tower",
    "osaka",
    "beijing",
  ],
  bangkok: [
    "bali",
    "phuket",
    "singapore",
  ],
  singapore: [
    "kuala lumpur",
    "bangkok",
    "hong kong",
  ],
  sydney: [
    "melbourne",
    "auckland",
    "brisbane",
  ],
  melbourne: [
    "sydney opera",
    "harbour bridge",
    "auckland",
  ],
  florence: [
    "rome colosseum",
    "venice grand canal",
    "milan duomo",
  ],
  firenze: [
    "rome colosseum",
    "venice grand canal",
    "milan duomo",
  ],
  milan: [
    "rome colosseum",
    "florence duomo",
    "venice",
  ],
  milano: [
    "rome colosseum",
    "florence duomo",
    "venice",
  ],
  venise: [
    "rome colosseum",
    "florence duomo",
    "milan duomo",
  ],
  venice: [
    "rome colosseum",
    "florence duomo",
    "milan duomo",
  ],
  amsterdam: [
    "brussels",
    "bruxelles",
    "london",
    "paris",
  ],
  berlin: [
    "paris",
    "vienna",
    "prague",
  ],
  vienna: [
    "prague",
    "budapest",
    "berlin",
  ],
  vienne: [
    "prague",
    "budapest",
    "berlin",
  ],
  prague: [
    "vienna",
    "budapest",
    "berlin",
  ],
  budapest: [
    "vienna",
    "prague",
    "bucharest",
  ],
  istanbul: [
    "athens",
    "cairo",
  ],
  marrakech: [
    "tunis",
    "fez",
    "casablanca",
  ],
  "buenos aires": [
    "santiago",
    "montevideo",
  ],
  nice: [
    "cannes",
    "monaco",
    "marseille",
  ],
});

function getUnsplashHeroConflictAvoidKeywords(cityInput) {
  const stem = heroImageStemFromDestination(cityInput) || extractCityPrompt(cityInput) || String(cityInput || "").trim();
  if (stem.length < 2) return [];
  const safe = String(resolveCanonicalCity(stem) || stem).trim();
  const first = String(stem.split(",")[0] || "").trim();
  const keys = [
    normalizeTextForSearch(safe),
    normalizeTextForSearch(first),
    normalizeTextForSearch(stem),
  ].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    const arr = UNSPLASH_HERO_CONFLICT_AVOID[k];
    if (!Array.isArray(arr)) continue;
    for (const term of arr) {
      const t = String(term || "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

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
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.slice(0, 10));
  const d = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0)
    : new Date(s);
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

/** Fusionne cache local + serveur (même id = une entrée), tri par created_at — évite d’effacer l’historique si le serveur renvoie []. */
function mergeChatMessageLists(existing, server) {
  const map = new Map();
  const add = (m) => {
    if (!m || typeof m !== "object") return;
    const id = String(m.id ?? "");
    if (!id) return;
    const cur = map.get(id);
    if (!cur) {
      map.set(id, m);
      return;
    }
    const tNew = String(m.created_at || "");
    const tOld = String(cur.created_at || "");
    map.set(id, tNew >= tOld ? m : cur);
  };
  for (const m of existing || []) add(m);
  for (const m of server || []) add(m);
  return Array.from(map.values()).sort((a, b) =>
    String(a?.created_at || "").localeCompare(String(b?.created_at || ""))
  );
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

/** Pastel vifs lisibles avec initiales claires ou sombres. */
const INITIALS_AVATAR_BG_PALETTE = [
  "#4F46E5",
  "#0891B2",
  "#059669",
  "#CA8A04",
  "#C2410C",
  "#BE185D",
  "#7C3AED",
  "#0D9488",
  "#2563EB",
  "#DB2777",
  "#9333EA",
  "#EA580C",
];

function hashSeedToUint(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function initialsBgFromSeed(seed) {
  const idx = hashSeedToUint(seed) % INITIALS_AVATAR_BG_PALETTE.length;
  return INITIALS_AVATAR_BG_PALETTE[idx];
}

function randomInitialsBgFromPalette() {
  return INITIALS_AVATAR_BG_PALETTE[Math.floor(Math.random() * INITIALS_AVATAR_BG_PALETTE.length)];
}

function luminanceOfHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function textColorOnInitialsBg(bgHex) {
  return luminanceOfHex(bgHex) > 0.55 ? "#0f172a" : "#ffffff";
}

/**
 * Couleur de fond pour initiales : compte connecté = métadonnée (assignée à l’inscription),
 * autres pastilles = couleur stable dérivée de l’e-mail / libellé (invités sans profil partagé).
 */
function initialsAvatarBgForParticipant(raw, session) {
  if (isParticipantRawCurrentUser(raw, session)) {
    const stored = String(session?.user?.user_metadata?.initials_avatar_bg || "").trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(stored)) return stored;
    const uid = String(session?.user?.id || session?.user?.email || "me").trim();
    return initialsBgFromSeed(uid);
  }
  const key = String(raw || "").trim().toLowerCase();
  return initialsBgFromSeed(key || "?");
}

/** « Moi » ou e-mail identique au compte connecté. */
function isParticipantRawCurrentUser(raw, session) {
  const r = String(raw || "").trim().toLowerCase();
  if (r === "moi") return true;
  const em = String(session?.user?.email || "").trim().toLowerCase();
  return Boolean(em && r === em);
}

function currentUserProfileAvatarUrl(session) {
  return String(session?.user?.user_metadata?.avatar_url || "").trim();
}

/**
 * Pastille ronde (chat, listes) : photo profil si c’est l’utilisateur et qu’une URL est enregistrée, sinon initiales.
 * @param {"palette"|"none"} [initialsFill="palette"] — `none` désactive la palette (rare ; éviter les fonds gris en parallèle).
 */
function ParticipantCircleAvatar({ raw, session, displayLabel, className, initialsFill = "palette" }) {
  const isMe = isParticipantRawCurrentUser(raw, session);
  const photoUrl = isMe ? currentUserProfileAvatarUrl(session) : "";
  const [imgBroken, setImgBroken] = useState(false);
  useEffect(() => {
    setImgBroken(false);
  }, [photoUrl]);
  const initials = initialsFromLabel(displayLabel);
  const showImg = Boolean(photoUrl && !imgBroken);
  const paletteBg =
    !showImg && initialsFill === "palette" ? initialsAvatarBgForParticipant(raw, session) : null;
  const initialsInk = paletteBg ? textColorOnInitialsBg(paletteBg) : undefined;
  return (
    <span
      className={className}
      title={String(displayLabel)}
      style={paletteBg ? { backgroundColor: paletteBg, color: initialsInk } : undefined}
    >
      {showImg ? (
        <img
          src={photoUrl}
          alt=""
          onError={() => setImgBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

/** Bandeau planning : photo profil pour l’e-mail du compte, sinon avatar générique (Dicebear). */
function InviteeEmailAvatar({ email, session }) {
  const mail = String(email || "").trim();
  const dicebear = buildParticipantAvatarUrl(mail);
  const isMe =
    Boolean(session?.user?.email) &&
    mail.toLowerCase() === String(session.user.email).trim().toLowerCase();
  const custom = isMe ? currentUserProfileAvatarUrl(session) : "";
  const [useFallback, setUseFallback] = useState(false);
  useEffect(() => {
    setUseFallback(false);
  }, [custom, mail]);
  const src = custom && !useFallback ? custom : dicebear;
  return (
    <img
      src={src}
      alt={mail}
      onError={() => {
        if (custom && !useFallback) setUseFallback(true);
      }}
      className="h-full w-full object-cover"
    />
  );
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

/**
 * Cadrage vertical des photos hero ville / guide (`object-position` Y). Plus le % est élevé, plus on voit le bas de la photo (skyline quand le ciel domine en haut).
 * Clés = `normalizeTextForSearch` du premier segment « ville ».
 */
const DESTINATION_GUIDE_HERO_OBJECT_POSITION_CLASS_BY_NORMALIZED_CITY = {
  munster: "object-[center_68%] sm:object-[center_64%]",
};

function destinationGuideHeroObjectPositionClass(cityStemOrLabel) {
  const key = normalizeTextForSearch(String(cityStemOrLabel || "").split(",")[0].trim());
  if (
    key &&
    Object.prototype.hasOwnProperty.call(DESTINATION_GUIDE_HERO_OBJECT_POSITION_CLASS_BY_NORMALIZED_CITY, key)
  ) {
    return DESTINATION_GUIDE_HERO_OBJECT_POSITION_CLASS_BY_NORMALIZED_CITY[key];
  }
  return "object-[center_45%] sm:object-[center_40%]";
}

/**
 * GetYourGuide — `data-gyg-location-id` (portail partenaire > Outils > Widget ville).
 * Clés = normalizeTextForSearch(ville), ex. "paris". Sinon pas d’ID : lien recherche `?q=` (évite slug + ID Paris par défaut).
 */
const GYG_LOCATION_IDS_BY_NORMALIZED_CITY = {
  paris: "16",
  /** https://www.getyourguide.com/mykonos-l472/ — Cyclades, Grèce */
  mykonos: "472",
};

/** Slug URL getyourguide.com/{slug}-l{id}/ quand le nom affiché ≠ segment anglais (optionnel). */
const GYG_SLUG_BY_NORMALIZED_CITY = {
  "new york": "new-york",
  "los angeles": "los-angeles",
  "san francisco": "san-francisco",
  "rio de janeiro": "rio-de-janeiro",
  "sao paulo": "sao-paulo",
  "le caire": "cairo",
  bruxelles: "brussels",
  florence: "florence",
  venise: "venice",
  vienne: "vienna",
  munich: "munich",
  marrakech: "marrakesh",
  pekin: "beijing",
  "hong kong": "hong-kong",
};

function resolveGetYourGuideLocationId(cityLabel) {
  const key = normalizeTextForSearch(String(cityLabel || "").trim());
  if (key && Object.prototype.hasOwnProperty.call(GYG_LOCATION_IDS_BY_NORMALIZED_CITY, key)) {
    return String(GYG_LOCATION_IDS_BY_NORMALIZED_CITY[key] || "").trim();
  }
  return "";
}

function slugForGetYourGuidePath(cityLabel) {
  const key = normalizeTextForSearch(String(cityLabel || "").split(",")[0].trim());
  if (!key) return "";
  if (Object.prototype.hasOwnProperty.call(GYG_SLUG_BY_NORMALIZED_CITY, key)) {
    return GYG_SLUG_BY_NORMALIZED_CITY[key];
  }
  return key.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/** Lien affilié destination (partner_id). Préfère /{slug}-l{id}/ ; sinon recherche sur getyourguide.com/s/. */
function buildGetYourGuideAffiliateUrl(cityLabel, partnerId) {
  const pid = String(partnerId || "").trim();
  if (!pid) return "";
  const cityToken = String(cityLabel || "").split(",")[0].trim();
  const q = cityToken || "tours";
  const lid = resolveGetYourGuideLocationId(cityToken);
  const slug = slugForGetYourGuidePath(cityToken);
  let u;
  if (slug && lid) {
    u = new URL(`https://www.getyourguide.com/${slug}-l${lid}/`);
  } else {
    u = new URL("https://www.getyourguide.com/s/");
    u.searchParams.set("q", q);
  }
  u.searchParams.set("partner_id", pid);
  return u.toString();
}

/** Logo servi en local (l’ancienne URL Commons renvoyait 404 → cadre « vide »). */
const GYG_LOGO_SRC = `${import.meta.env.BASE_URL}getyourguide-logo.svg`;

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
  "Stockholm", "Visby", "Copenhague", "Oslo", "Helsinki", "Dublin",
  "Bruxelles", "Berne", "Lisbonne", "Porto", "Prague", "Vienne", "Budapest", "Athènes", "Istanbul",
  "Seville", "Valencia", "Naples", "Palermo", "Edinburgh", "Warsaw", "Krakow", "Turin",
  "Dubai", "Doha", "Abu Dhabi", "Le Caire", "Marrakech", "Tunis", "Alger",
  "Sydney", "Melbourne", "Mykonos", "Auckland", "Cape Town", "Rio de Janeiro", "Sao Paulo", "Phuket",
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
  Mykonos: ["Myconos"],
  Copenhague: ["Copenhagen", "København", "Kobenhavn"],
  Naples: ["Napoli"],
  Seville: ["Séville", "Sevilla"],
  Edinburgh: ["Édimbourg", "Edimbourg"],
  Warsaw: ["Varsovie", "Warszawa"],
  Krakow: ["Cracovie", "Kraków"],
  Turin: ["Torino"],
  Valencia: ["València"],
  Visby: ["Gotland"],
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
  {
    match: ["espagne", "spain"],
    cities: ["Barcelona", "Madrid", "Seville", "Valencia"],
    geoCountries: ["espagne", "spain", "espana"],
  },
  {
    match: ["royaume-uni", "united kingdom", "angleterre", "england"],
    cities: ["London"],
    geoCountries: ["royaume-uni", "united kingdom", "angleterre", "england"],
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
    match: ["suede", "sweden", "sverige"],
    cities: ["Stockholm", "Visby"],
    geoCountries: ["suede", "sweden", "sverige"],
  },
  {
    match: ["danemark", "denmark", "danmark"],
    cities: ["Copenhague"],
    geoCountries: ["danemark", "denmark", "danmark"],
  },
  {
    match: ["norvege", "norway", "norge"],
    cities: ["Oslo"],
    geoCountries: ["norvege", "norway", "norge"],
  },
  {
    match: ["finlande", "finland", "suomi"],
    cities: ["Helsinki"],
    geoCountries: ["finlande", "finland", "suomi"],
  },
  {
    match: ["irlande", "ireland", "eire"],
    cities: ["Dublin"],
    geoCountries: ["irlande", "ireland", "eire"],
  },
  {
    match: ["pologne", "poland", "polska"],
    cities: ["Warsaw", "Krakow"],
    geoCountries: ["pologne", "poland", "polska"],
  },
  {
    match: ["ecosse", "scotland"],
    cities: ["Edinburgh"],
    geoCountries: ["ecosse", "scotland"],
  },
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

/**
 * Score de similarité requête → nom de lieu (catalogue ou1er segment « Ville, région, pays »).
 * Rejette les faux positifs type « lofoten » → Lyon/Kyoto (Levenshtein trop lâche auparavant).
 */
function cityTokenSuggestionScore(qNorm, nameNorm) {
  const q = String(qNorm || "").trim();
  const n = String(nameNorm || "").trim();
  if (!q || q.length < 2 || !n) return 0;
  if (q.length === 2) {
    return n.startsWith(q) || n === q ? 88_000 : 0;
  }
  if (n === q) return 100_000;
  if (n.startsWith(q)) return 90_000 + Math.min(500, q.length * 12);
  if (q.startsWith(n) && n.length >= 3) return 85_000;
  if (n.includes(q)) return 80_000;
  if (q.includes(n) && n.length >= 3) return 75_000;
  const d = levenshteinDistance(q, n);
  const minL = Math.min(q.length, n.length);
  const maxD = Math.max(1, Math.floor(minL / 4));
  if (minL >= 3 && d <= maxD) return 50_000 - d * 800;
  let common = 0;
  for (let i = 0; i < Math.min(q.length, n.length); i += 1) {
    if (q[i] === n[i]) common += 1;
    else break;
  }
  if (q.length >= 4 && common >= 3) return 40_000 + common * 40;
  return 0;
}

/** Score pour une ligne complète de suggestion (géocodage avec région / pays). */
function suggestionLineRelevanceScore(qNorm, line) {
  const raw = String(line || "").trim();
  if (!qNorm || qNorm.length < 2 || !raw) return 0;
  const lineNorm = normalizeTextForSearch(raw);
  const nameNorm = lineNorm.split(",")[0]?.trim() || "";
  let best = cityTokenSuggestionScore(qNorm, nameNorm);
  const segments = lineNorm.split(",").map((p) => p.trim()).filter(Boolean);
  for (const seg of segments) {
    const sc = cityTokenSuggestionScore(qNorm, seg);
    if (sc > best) best = sc;
    if (seg.includes(qNorm) && qNorm.length >= 3) best = Math.max(best, 65_000);
  }
  if (lineNorm.includes(qNorm) && qNorm.length >= 3) best = Math.max(best, 70_000);
  return best;
}

/**
 * Classe catalogue + Open-Meteo par pertinence réelle (pas « tout le catalogue puis l’API »).
 * Mode pays : conserve l’ordre ancien (villes du pays d’abord).
 */
function rankAndMergeCitySuggestions(normalizedQuery, fallbackList, remoteList, max = 10) {
  const q = String(normalizedQuery || "").trim();
  if (!q || q.length < 2) return [];
  if (countryGroupsMatchingQuery(q).length > 0) {
    return mergeCitySuggestionLists(fallbackList || [], remoteList || [], max);
  }
  const scored = [];
  for (const s of fallbackList || []) {
    const raw = String(s || "").trim();
    if (!raw) continue;
    const sc = suggestionLineRelevanceScore(q, raw);
    if (sc > 0) scored.push({ line: raw, sc });
  }
  for (const s of remoteList || []) {
    const raw = String(s || "").trim();
    if (!raw) continue;
    const sc = suggestionLineRelevanceScore(q, raw);
    if (sc > 0) scored.push({ line: raw, sc });
  }
  scored.sort((a, b) => b.sc - a.sc);
  const seen = new Set();
  const out = [];
  for (const { line } of scored) {
    const k = normalizeTextForSearch(line.split(",")[0]?.trim() || line);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
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
  const catalogScored = CITY_SEARCH_ENTRIES.map((entry) => {
    const c = normalizeTextForSearch(entry.label);
    const score = cityTokenSuggestionScore(q, c);
    return score > 0 ? { city: entry.canonical, score } : null;
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const strictCanon = [...new Set(catalogScored.map((x) => x.city))].slice(0, 10);
  return mergeCitySuggestionLists(mergeCitySuggestionLists(fromLocalized, fromCountry, 12), strictCanon, 12);
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
/** Fond écran d’accueil connexion (paysage large, même scène que l’ancien portrait — `bg-cover` web / mobile). */
const AUTH_LANDING_BG = "/auth-landing-bg-wide.jpg";

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
  "font-normal tracking-[0.03em] border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_14px_35px_rgba(15,23,42,0.3)] transition hover:brightness-110";
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

/** Normalisation légère pour détecter pays / région dans une chaîne destination. */
function normalizeForHeroHint(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * « Valence » + Espagne / Communauté valencienne → Valencia (photos & cache alignés sur la ville espagnole).
 * @param {string} primaryLabel — typiquement premier segment (ex. extractCityPrompt).
 * @param {string} fullContext — libellé complet ou ville + pays + région.
 */
function disambiguateHeroCityStem(primaryLabel, fullContext) {
  const base = String(primaryLabel || "").trim();
  if (!base) return "";
  const full = normalizeForHeroHint(`${fullContext || ""} ${base}`);
  const baseNorm = normalizeForHeroHint(base.split(",")[0]?.trim() || base);
  if (baseNorm === "valence") {
    const spain =
      /\bespagne\b/.test(full) ||
      /\bspain\b/.test(full) ||
      /\bespaña\b/.test(full) ||
      /\bespana\b/.test(full) ||
      /\bspanien\b/.test(full) ||
      /\bkingdom of spain\b/.test(full) ||
      /comunidad valenciana/.test(full) ||
      /comunitat valenciana/.test(full) ||
      /communaute valencienne/.test(full) ||
      /comunidade valenciana/.test(full) ||
      /generalitat valenciana/.test(full) ||
      /valencian community/.test(full) ||
      (/\bvalencian\b/.test(full) &&
        !/\bfrance\b/.test(full) &&
        !/\bdrome\b/.test(full) &&
        !/\bdrôme\b/.test(full));
    if (spain) return "Valencia";
  }
  return base;
}

/** Tige utilisée pour Unsplash, Wikimedia figés et clés de cache image (peut différer du libellé affiché). */
function heroImageStemFromDestination(destination) {
  const raw = String(destination || "").trim();
  if (!raw) return "";
  const base = extractCityPrompt(raw) || raw;
  return disambiguateHeroCityStem(base, raw);
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
  /** EN : article « Basel » — pas « Bâle » (échec pageimages / résumé). */
  bale: "Basel",
  basel: "Basel",
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
  /** FR : article « Bâle » — pas « Basel » seul. */
  basel: "Bâle",
  bale: "Bâle",
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

async function fetchWikiPageImageApi(wikiHost, title, thumbSize = 1920, { rejectPortrait = false } = {}) {
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
    const tw = Number(page.thumbnail?.width || 0);
    const th = Number(page.thumbnail?.height || 0);
    if (rejectPortrait && tw > 0 && th > 0 && th > tw * 1.15) return "";
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


/**
 * Passe les miniatures Commons (/320px-, /800px-, …) à une largeur adaptée aux cartes HD / mobile retina.
 * Aucune clé API : même fichier sur upload.wikimedia.org.
 */
function upgradeWikimediaCommonsThumbUrl(url) {
  const u = String(url || "").trim();
  if (!u.includes("upload.wikimedia.org") || !u.includes("/thumb/")) return u;
  return u.replace(/\/\d+px-([^/?#]+)$/i, "/1920px-$1");
}

/** Unsplash : élargit w= dans l’URL (regular ~1080px → ~2400px si la photo le permet). */
function upgradeUnsplashDisplayUrl(url) {
  let u = String(url || "").trim();
  if (!/images\.unsplash\.com/i.test(u)) return u;
  if (/[?&]w=(?:1[6-9]\d{2}|[2-9]\d{3})/i.test(u)) return u;
  if (/([?&])w=\d+/i.test(u)) {
    return u.replace(/([?&])w=\d+/i, "$1w=1600");
  }
  return `${u}${u.includes("?") ? "&" : "?"}w=1600&fit=max&q=80&auto=format`;
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
  if (/\b(openstreetmap|osm[_-]|locator[_-]?map|location[_-]?map|map[_-]?of[_-]|relief[_-]?map|carte[_-]|karte[_-]|plan[_-]d|stadtplan|lageplan)\b/i.test(hay)) return true;
  if (/\bmap\.(?:svg|png)\b/i.test(hay)) return true;
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
  const hay = `${ft} ${u}`;
  if (isLikelyWikiBrandOrLogoImage(pageUrl, fileTitle)) return -1000;
  let s = 0;
  if (/\.(jpe?g|webp)(\?|$)/i.test(u) || /\/\d+px-[^/]+\.(jpe?g|webp)/i.test(u)) s += 42;
  if (u.includes(".svg.png")) s -= 30;
  // Préférer le jour ; pénaliser nuit / néons (repli possible si seules images nocturnes).
  if (
    /\b(at_)?night\b|nocturne|\bnighttime\b|_night\.|night_view|twilight|dusk|cr[ée]puscule|after.?dark|neon|long_exposure/i.test(
      hay
    )
  ) {
    s -= 44;
  }
  if (/\bdaylight\b|\bdaytime\b|\bmorning\b|\bafternoon\b|\bsunny\b|blue_sky|clear_sky|aerial.?view/i.test(hay)) {
    s += 18;
  }
  if (
    /exterior|facade|façade|building|aerial|panoram|panoramio|view of|plaza|square|frontage|great hall|main hall|entrance|facade|skyline|street view|central park|_nyc|manhattan|fifth.?avenue|5th.?avenue|museum.*\.(jpe?g|webp)/i.test(
      hay
    )
  )
    s += 38;
  if (/museum|cathedral|basilica|palace|château|castle|tower|bridge|gallery|monument|memorial/i.test(hay)) s += 22;
  const sec = Number(sectionId);
  if (Number.isFinite(sec)) {
    if (sec <= 1) s += 18;
    if (sec >= 4 && sec < 48) s -= 12;
    if (sec >= 49) s -= 40;
  }
  if (/_met_dt|_met_dp|_met_ada|_dp\d|_dt\d|standing_hippopotamus|pendant_mask|oil_on_canvas|portrait of|by_|\bminiature\b/i.test(hay)) s -= 28;
  if (/\b(openstreetmap|osm[_-]|locator[_-]?map|location[_-]?map|map[_-]?of[_-]|relief[_-]?map|carte[_-]|karte[_-]|plan[_-]d|stadtplan|lageplan)\b/i.test(hay)) s -= 500;
  if (/\bmap\.(?:svg|png)\b/i.test(hay)) s -= 500;
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
  const full = String(cityInput || "").trim();
  const raw = String(heroImageStemFromDestination(cityInput) || extractCityPrompt(cityInput) || full).trim();
  if (!raw && !full) return [];
  const keys = [];
  const pushKey = (k, minLen = 2) => {
    const n = normalizeTextForSearch(String(k || "").trim());
    if (!n || n.length < minLen || keys.includes(n)) return;
    keys.push(n);
  };
  const canonical = resolveCanonicalCity(raw);
  if (canonical) pushKey(canonical, 2);
  pushKey(raw, 2);
  pushKey(raw.split(/\s+/)[0] || "", 2);
  // Titres du type « Voyage à Mykonos » : le premier mot n’est pas la ville — on teste chaque segment.
  for (const piece of full.split(/[\s,\-–—]+/)) {
    pushKey(piece, 3);
  }
  for (const piece of raw.split(/[\s,\-–—]+/)) {
    pushKey(piece, 3);
  }
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
  const p = String(heroImageStemFromDestination(prompt) || extractCityPrompt(prompt) || prompt || "").trim();
  if (!p) return "";
  const primary =
    resolveCityHeroImageUrl(p) || getBundledCityHeroPath(p) || getStorageMirrorHeroUrl(p);
  if (primary) return primary;
  return "";
}

function getCityImageCacheKey(cityInput) {
  const stem = heroImageStemFromDestination(cityInput) || extractCityPrompt(cityInput) || String(cityInput || "").trim();
  return `v68:${String(stem)
    .trim()
    .toLowerCase()}`;
}

/**
 * Avec clé Unsplash : n’expose que le cache photo voyageur (RAM / tp_city_img_) comme héros.
 * Retire toute URL Wikimedia / bundle du guide (ex. cache `tp_guide_cache_*`) pour éviter le flash avant Unsplash.
 */
function applyGuideHeroUnsplashOnlyOrEmpty(guide) {
  if (!UNSPLASH_ACCESS_KEY || !guide || typeof guide !== "object") return guide;
  const city = String(guide.city || "").trim();
  if (!city) return guide;
  const cacheProbeFull = [guide.city, guide.country, guide.adminRegion].filter(Boolean).join(", ").trim();
  const cacheProbes = dedupeImageUrlChain([cacheProbeFull || city, city].filter(Boolean));
  let fast = "";
  let ck = "";
  for (const probe of cacheProbes) {
    ck = getCityImageCacheKey(probe);
    const mem = ck && cityImageMemoryCache[ck] ? String(cityImageMemoryCache[ck]) : "";
    if (mem && !isLikelyWikiFlagOrSealThumb(mem)) {
      fast = upgradeLandscapeImageUrl(mem);
      break;
    }
  }
  if (!fast) {
    try {
      for (const probe of cacheProbes) {
        ck = getCityImageCacheKey(probe);
        const v = window.localStorage.getItem(`tp_city_img_${ck}`);
        if (v && !isLikelyWikiFlagOrSealThumb(String(v))) {
          fast = upgradeLandscapeImageUrl(String(v).trim());
          break;
        }
      }
    } catch (_e) {
      /* ignore */
    }
  }
  if (fast) {
    return {
      ...guide,
      imageUrl: fast,
      landscapeImageUrl: fast,
      heroImageCandidates: dedupeImageUrlChain([fast]).map((u) => upgradeLandscapeImageUrl(String(u || ""))),
    };
  }
  /* Pas de cache Unsplash : garder les URLs du guide (Commons / fetch) — ne pas vider l’image. */
  return guide;
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

/**
 * Recherche — bandeau « Envie de partir ? ».
 * Variable : MP4/WebM (`/fichier.mp4` dans public ou URL HTTPS). Vide / absente = MP4 local (compatible iOS Safari ; WebM seul ne joue pas sur iPhone).
 * Désactiver la vidéo : `false`, `off`, `none`, `image` ou `static`.
 */
/** MP4 H.264 local — même visuel plage / drone ; iOS ne lit pas le WebM par défaut (VP9). */
const DESTINATION_GUIDE_HERO_VIDEO_MP4_FALLBACK = "/videos/plage-hero.mp4";
const DESTINATION_GUIDE_HERO_VIDEO_DEFAULT = DESTINATION_GUIDE_HERO_VIDEO_MP4_FALLBACK;

function inferDestinationHeroVideoMimeType(url) {
  const path = String(url || "").split("?")[0].toLowerCase();
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".mp4") || path.endsWith(".m4v")) return "video/mp4";
  return "video/mp4";
}

/** Si l’URL est du WebM, on propose d’abord le MP4 local pour Safari iOS, puis le WebM pour Chrome. */
function buildDestinationHeroVideoSources(primaryUrl) {
  const p = String(primaryUrl || "").trim();
  if (!p) return [];
  const out = [];
  if (/\.webm(\?|$)/i.test(p)) {
    out.push({ src: DESTINATION_GUIDE_HERO_VIDEO_MP4_FALLBACK, type: "video/mp4" });
  }
  out.push({ src: p, type: inferDestinationHeroVideoMimeType(p) });
  return out;
}

const DESTINATION_GUIDE_HERO_VIDEO_RAW = String(
  import.meta.env.VITE_DESTINATION_GUIDE_HERO_VIDEO ?? ""
).trim();

const DESTINATION_GUIDE_HERO_VIDEO_DISABLED =
  /^(0|false|off|none|image|static)$/i.test(DESTINATION_GUIDE_HERO_VIDEO_RAW);

const DESTINATION_GUIDE_HERO_VIDEO_URL = DESTINATION_GUIDE_HERO_VIDEO_DISABLED
  ? ""
  : DESTINATION_GUIDE_HERO_VIDEO_RAW || DESTINATION_GUIDE_HERO_VIDEO_DEFAULT;

const DESTINATION_GUIDE_HERO_VIDEO_SOURCES = buildDestinationHeroVideoSources(DESTINATION_GUIDE_HERO_VIDEO_URL);

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

function buildTravelTips(city, placesOverride = null, uiLanguage = "fr") {
  const display = String(city || "").trim() || "la destination";
  const canonical = resolveCanonicalCity(display);
  const key = normalizeTextForSearch(canonical);
  const label = String(canonical || display).trim() || display;
  const rawPlaces =
    placesOverride != null
      ? placesOverride
      : getIconicPlacesFallback(display) || [];
  const places = rawPlaces
    .map((p) => String(p || "").trim())
    .filter((p) => p && !isGenericExplorationPlaceName(p));
  const lang = String(uiLanguage || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  return resolveTravelTips(key, label, places, lang);
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
function mergeTipsDoFromGemini(baseDo, geminiDo, cityName, uiLanguage = "fr") {
  const g = dedupeTipLines(geminiDo);
  const b = dedupeTipLines(baseDo);
  let merged = dedupeTipLines([...g, ...b]);
  if (merged.length < 3) {
    const city = String(cityName || "").trim();
    const canonical = resolveCanonicalCity(city);
    const key = normalizeTextForSearch(canonical);
    const label = String(canonical || city).trim() || city;
    const lang = String(uiLanguage || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
    const fill = resolveTravelTips(key, label, getIconicPlacesFallback(city) || [], lang).do;
    merged = dedupeTipLines([...merged, ...fill]);
  }
  return merged.slice(0, 12);
}

const COASTAL_CITIES = new Set([
  "miami", "barcelone", "barcelona", "nice", "marseille", "lisbonne", "lisbon", "lisboa",
  "rio de janeiro", "rio", "sydney", "dubai", "dubai", "bali", "cape town", "le cap",
  "los angeles", "san francisco", "honolulu", "cancun", "phuket", "naples", "napoli",
  "venice", "venise", "amalfi", "porto", "athens", "athenes", "istanbul",
  "tel aviv", "mumbai", "hong kong", "singapour", "singapore", "seattle",
  "copenhague", "copenhagen", "stockholm", "oslo", "helsinki", "vancouver",
  "san diego", "havana", "la havane", "cartagena", "dubrovnik", "split",
  "mykonos", "myconos", "santorini", "casablanca", "tunis", "alger", "dakar",
  "mombasa", "zanzibar", "goa", "colombo", "abu dhabi", "doha",
  "yokohama", "osaka", "busan", "shanghai", "qingdao",
]);

function isCityCoastal(cityName) {
  const c = String(cityName || "").toLowerCase().trim();
  if (COASTAL_CITIES.has(c)) return true;
  for (const k of COASTAL_CITIES) {
    if (c.includes(k) || k.includes(c)) return true;
  }
  return false;
}

function buildSuggestedActivitiesForCity(city) {
  const c = String(city || "").toLowerCase();
  const label = String(city || "").trim() || "la destination";
  const act = (title, estimatedCostEur, costNote = "", location = "") => {
    const o = { title, estimatedCostEur: clampActivityCostEUR(estimatedCostEur) };
    const note = String(costNote || "").trim();
    if (note) o.costNote = note;
    const loc = String(location || "").trim();
    if (loc) o.location = loc;
    return o;
  };
  if (c.includes("tokyo")) {
    return [
      act("Croisement de Shibuya", 0, "Gratuit", "Shibuya, Tokyo"),
      act("Temple Senso-ji", 0, "Gratuit", "Asakusa, Tokyo"),
      act("Marché Tsukiji Outer Market", 25, "Street food", "Chuo, Tokyo"),
      act("Shibuya Sky", 24, "Billet adulte", "Shibuya, Tokyo"),
      act("Sanctuaire Meiji-jingu", 0, "Gratuit", "Harajuku, Tokyo"),
      act("Parc Ueno & Musée national", 10, "Entrée musée", "Ueno, Tokyo"),
    ];
  }
  if (c.includes("paris")) {
    return [
      act("Tour Eiffel", 29, "Billet sommet", "Champ de Mars, Paris"),
      act("Musée du Louvre", 22, "Billet adulte", "1er arr., Paris"),
      act("Basilique du Sacré-Cœur", 0, "Gratuit", "Montmartre, Paris"),
      act("Champs-Élysées & Arc de Triomphe", 16, "Montée Arc de Triomphe", "8e arr., Paris"),
      act("Le Marais & Place des Vosges", 0, "Gratuit", "3e-4e arr., Paris"),
      act("Musée d'Orsay", 16, "Billet adulte", "7e arr., Paris"),
    ];
  }
  if (c.includes("bali")) {
    return [
      act("Temple Uluwatu", 5, "Entrée indicative", "Pecatu, Bali"),
      act("Rizières de Tegallalang", 3, "Don / parking", "Ubud, Bali"),
      act("Plage de Seminyak", 0, "Gratuit", "Seminyak, Bali"),
      act("Forêt des singes d'Ubud", 5, "Entrée", "Ubud, Bali"),
      act("Temple Tirta Empul", 5, "Entrée", "Tampaksiring, Bali"),
      act("Mont Batur (lever de soleil)", 35, "Guide + transport", "Kintamani, Bali"),
    ];
  }
  if (c.includes("new york")) {
    return [
      act("Central Park", 0, "Gratuit", "Manhattan, New York"),
      act("Brooklyn Bridge", 0, "Gratuit", "Brooklyn / Manhattan"),
      act("Top of the Rock", 44, "Billet adulte", "Rockefeller Center, NYC"),
      act("High Line", 0, "Gratuit", "Chelsea, Manhattan"),
      act("Metropolitan Museum of Art", 30, "Donation suggérée", "Upper East Side, NYC"),
      act("Times Square & Broadway", 0, "Gratuit (spectacles en sus)", "Midtown, Manhattan"),
    ];
  }
  if (c.includes("london") || c.includes("londres")) {
    return [
      act("British Museum", 0, "Gratuit", "Bloomsbury, Londres"),
      act("Tower of London", 33, "Billet adulte", "Tower Hill, Londres"),
      act("Buckingham Palace", 0, "Gratuit (relève de la garde)", "Westminster, Londres"),
      act("Borough Market", 0, "Gratuit (repas en sus)", "Southwark, Londres"),
      act("Hyde Park & Kensington Gardens", 0, "Gratuit", "Westminster, Londres"),
      act("Tate Modern", 0, "Gratuit", "Bankside, Londres"),
    ];
  }
  if (c.includes("barcelona") || c.includes("barcelone")) {
    return [
      act("Sagrada Família", 26, "Billet adulte", "Eixample, Barcelone"),
      act("Parc Güell", 10, "Billet zone monumentale", "Gràcia, Barcelone"),
      act("La Rambla & Marché de la Boqueria", 0, "Gratuit (achats en sus)", "Ciutat Vella, Barcelone"),
      act("Quartier Gothique (Barri Gòtic)", 0, "Gratuit", "Ciutat Vella, Barcelone"),
      act("Plage de la Barceloneta", 0, "Gratuit", "Barceloneta, Barcelone"),
      act("Casa Batlló", 35, "Billet adulte", "Passeig de Gràcia, Barcelone"),
    ];
  }
  if (c.includes("rome") || c.includes("roma")) {
    return [
      act("Colisée", 18, "Billet combiné Forum", "Centro Storico, Rome"),
      act("Basilique Saint-Pierre", 0, "Gratuit (coupole 8€)", "Vatican, Rome"),
      act("Fontaine de Trevi", 0, "Gratuit", "Centro Storico, Rome"),
      act("Panthéon", 5, "Billet adulte", "Piazza della Rotonda, Rome"),
      act("Quartier du Trastevere", 0, "Gratuit", "Trastevere, Rome"),
      act("Forum romain & Palatin", 18, "Billet combiné Colisée", "Centro Storico, Rome"),
    ];
  }
  if (c.includes("amsterdam")) {
    return [
      act("Rijksmuseum", 22, "Billet adulte", "Museumplein, Amsterdam"),
      act("Maison d'Anne Frank", 16, "Réservation obligatoire", "Prinsengracht, Amsterdam"),
      act("Vondelpark", 0, "Gratuit", "Amsterdam-Zuid"),
      act("Quartier Jordaan", 0, "Gratuit", "Jordaan, Amsterdam"),
      act("Croisière sur les canaux", 16, "Billet type", "Centre, Amsterdam"),
      act("Musée Van Gogh", 20, "Billet adulte", "Museumplein, Amsterdam"),
    ];
  }
  if (c.includes("marseille")) {
    return [
      act("Vieux-Port", 0, "Gratuit", "Vieux-Port, Marseille"),
      act("Basilique Notre-Dame de la Garde", 0, "Gratuit", "Colline de la Garde, Marseille"),
      act("Calanques de Marseille", 0, "Gratuit (randonnée)", "Parc national des Calanques"),
      act("MuCEM", 11, "Billet adulte", "J4, Marseille"),
      act("Quartier du Panier", 0, "Gratuit", "Le Panier, Marseille"),
      act("Château d'If", 6, "Billet + navette", "Île d'If, Marseille"),
    ];
  }
  if (c.includes("lyon")) {
    return [
      act("Vieux Lyon & traboules", 0, "Gratuit", "Vieux Lyon, Lyon"),
      act("Basilique de Fourvière", 0, "Gratuit", "Fourvière, Lyon"),
      act("Parc de la Tête d'Or", 0, "Gratuit", "6e arr., Lyon"),
      act("Halles Paul Bocuse", 0, "Gratuit (repas en sus)", "Part-Dieu, Lyon"),
      act("Musée des Confluences", 12, "Billet adulte", "Confluence, Lyon"),
      act("Place Bellecour & Presqu'île", 0, "Gratuit", "2e arr., Lyon"),
    ];
  }
  if (c.includes("istanbul")) {
    return [
      act("Sainte-Sophie", 25, "Billet adulte", "Sultanahmet, Istanbul"),
      act("Mosquée Bleue", 0, "Gratuit", "Sultanahmet, Istanbul"),
      act("Grand Bazar", 0, "Gratuit (achats en sus)", "Beyazıt, Istanbul"),
      act("Palais de Topkapı", 20, "Billet adulte", "Sultanahmet, Istanbul"),
      act("Croisière sur le Bosphore", 15, "Billet ferry public", "Eminönü, Istanbul"),
      act("Tour de Galata", 10, "Billet adulte", "Beyoğlu, Istanbul"),
    ];
  }
  if (c.includes("dubai") || c.includes("dubaï")) {
    return [
      act("Burj Khalifa — At the Top", 45, "Billet 124e étage", "Downtown Dubai"),
      act("Souk de l'Or & Souk aux Épices", 0, "Gratuit", "Deira, Dubaï"),
      act("Dubai Mall & Fontaines", 0, "Gratuit", "Downtown Dubai"),
      act("Quartier historique Al Fahidi", 0, "Gratuit", "Bur Dubai"),
      act("Désert — safari en 4x4", 60, "Excursion demi-journée", "Désert de Dubaï"),
      act("Plage de Jumeirah", 0, "Gratuit", "Jumeirah, Dubaï"),
    ];
  }
  if (c.includes("marrakech")) {
    return [
      act("Place Jemaa el-Fna", 0, "Gratuit", "Médina, Marrakech"),
      act("Jardin Majorelle", 14, "Billet adulte", "Guéliz, Marrakech"),
      act("Palais Bahia", 7, "Billet adulte", "Médina, Marrakech"),
      act("Souks de la Médina", 0, "Gratuit (achats en sus)", "Médina, Marrakech"),
      act("Tombeaux Saadiens", 7, "Billet adulte", "Kasbah, Marrakech"),
      act("Médersa Ben Youssef", 5, "Billet adulte", "Médina, Marrakech"),
    ];
  }
  if (c.includes("lisbonne") || c.includes("lisbon") || c.includes("lisboa")) {
    return [
      act("Tour de Belém", 10, "Billet adulte", "Belém, Lisbonne"),
      act("Monastère des Hiéronymites", 10, "Billet adulte", "Belém, Lisbonne"),
      act("Tramway 28", 3, "Ticket trajet", "Graça → Estrela, Lisbonne"),
      act("Quartier de l'Alfama", 0, "Gratuit", "Alfama, Lisbonne"),
      act("Pastéis de Belém", 5, "Dégustation", "Belém, Lisbonne"),
      act("Miradouro da Graça", 0, "Gratuit", "Graça, Lisbonne"),
    ];
  }
  if (c.includes("caire") || c.includes("cairo")) {
    return [
      act("Pyramides de Gizeh", 15, "Billet adulte", "Gizeh, Le Caire"),
      act("Sphinx de Gizeh", 0, "Inclus avec Pyramides", "Gizeh, Le Caire"),
      act("Musée égyptien du Caire", 10, "Billet adulte", "Place Tahrir, Le Caire"),
      act("Khan el-Khalili", 0, "Gratuit (achats en sus)", "Vieux Caire"),
      act("Mosquée Mohammed Ali", 5, "Billet adulte", "Citadelle, Le Caire"),
      act("Quartier copte du Vieux Caire", 0, "Gratuit", "Vieux Caire"),
    ];
  }
  if (c.includes("athènes") || c.includes("athens") || c.includes("athina") || c.includes("athenes")) {
    return [
      act("Acropole & Parthénon", 20, "Billet combiné", "Acropole, Athènes"),
      act("Musée de l'Acropole", 10, "Billet adulte", "Makrigianni, Athènes"),
      act("Quartier de Pláka", 0, "Gratuit", "Pláka, Athènes"),
      act("Agora antique", 10, "Billet adulte", "Monastiráki, Athènes"),
      act("Place Syntagma & Relève de la garde", 0, "Gratuit", "Syntagma, Athènes"),
      act("Mont Lycabette", 0, "Gratuit (téléphérique ~7€)", "Kolonáki, Athènes"),
    ];
  }
  if (c.includes("berlin")) {
    return [
      act("Porte de Brandebourg", 0, "Gratuit", "Mitte, Berlin"),
      act("Île aux Musées (Museumsinsel)", 19, "Pass musées", "Mitte, Berlin"),
      act("East Side Gallery", 0, "Gratuit", "Friedrichshain, Berlin"),
      act("Mémorial du Mur de Berlin", 0, "Gratuit", "Bernauer Straße, Berlin"),
      act("Reichstag (Coupole)", 0, "Gratuit (réservation)", "Mitte, Berlin"),
      act("Checkpoint Charlie", 0, "Gratuit", "Kreuzberg, Berlin"),
    ];
  }
  if (c.includes("prague") || c.includes("praha")) {
    return [
      act("Pont Charles", 0, "Gratuit", "Vieille Ville / Malá Strana, Prague"),
      act("Château de Prague", 15, "Circuit long", "Hradčany, Prague"),
      act("Place de la Vieille-Ville & Horloge astronomique", 0, "Gratuit", "Staré Město, Prague"),
      act("Quartier Josefov (ancien ghetto juif)", 12, "Billet combiné", "Josefov, Prague"),
      act("Mur John Lennon", 0, "Gratuit", "Malá Strana, Prague"),
      act("Petřín (colline & tour)", 5, "Billet tour", "Petřín, Prague"),
    ];
  }
  if (c.includes("bangkok")) {
    return [
      act("Grand Palais (Wat Phra Kaeo)", 15, "Billet adulte", "Phra Nakhon, Bangkok"),
      act("Wat Pho (Bouddha couché)", 5, "Billet adulte", "Phra Nakhon, Bangkok"),
      act("Wat Arun (Temple de l'Aube)", 3, "Billet adulte", "Bangkok Yai, Bangkok"),
      act("Marché flottant de Damnoen Saduak", 10, "Transport + entrée", "Ratchaburi, Bangkok"),
      act("Chatuchak Weekend Market", 0, "Gratuit (achats en sus)", "Chatuchak, Bangkok"),
      act("Chinatown de Bangkok (Yaowarat)", 0, "Gratuit (street food en sus)", "Samphanthawong, Bangkok"),
    ];
  }
  if (c.includes("séville") || c.includes("seville") || c.includes("sevilla")) {
    return [
      act("Alcázar de Séville", 14, "Billet adulte", "Santa Cruz, Séville"),
      act("Cathédrale de Séville & Giralda", 12, "Billet adulte", "Centre, Séville"),
      act("Plaza de España", 0, "Gratuit", "Parque de María Luisa, Séville"),
      act("Quartier de Santa Cruz", 0, "Gratuit", "Santa Cruz, Séville"),
      act("Spectacle de Flamenco", 25, "Billet type", "Triana, Séville"),
      act("Torre del Oro", 3, "Billet adulte", "Arenal, Séville"),
    ];
  }
  if (c.includes("vienne") || c.includes("vienna") || c.includes("wien")) {
    return [
      act("Château de Schönbrunn", 22, "Grand Tour", "Hietzing, Vienne"),
      act("Cathédrale Saint-Étienne (Stephansdom)", 0, "Gratuit (tours payantes)", "Innere Stadt, Vienne"),
      act("Palais du Belvédère", 16, "Billet adulte", "Landstraße, Vienne"),
      act("Hofburg (Palais impérial)", 18, "Billet combiné", "Innere Stadt, Vienne"),
      act("Naschmarkt", 0, "Gratuit (repas en sus)", "Mariahilf, Vienne"),
      act("Prater & Grande Roue", 13, "Billet Grande Roue", "Leopoldstadt, Vienne"),
    ];
  }
  if (c.includes("milan") || c.includes("milano")) {
    return [
      act("Dôme de Milan (Duomo)", 15, "Billet terrasses", "Piazza del Duomo, Milan"),
      act("La Cène de Léonard de Vinci", 15, "Réservation obligatoire", "Santa Maria delle Grazie, Milan"),
      act("Galerie Vittorio Emanuele II", 0, "Gratuit", "Piazza del Duomo, Milan"),
      act("Château des Sforza", 5, "Billet musées", "Parco Sempione, Milan"),
      act("Quartier des Navigli", 0, "Gratuit", "Navigli, Milan"),
      act("Pinacothèque de Brera", 15, "Billet adulte", "Brera, Milan"),
    ];
  }
  if (c.includes("sydney")) {
    return [
      act("Opéra de Sydney", 30, "Visite guidée", "Bennelong Point, Sydney"),
      act("Harbour Bridge", 0, "Gratuit (BridgeClimb ~200€)", "Sydney Harbour"),
      act("Bondi Beach", 0, "Gratuit", "Bondi, Sydney"),
      act("Royal Botanic Garden", 0, "Gratuit", "Sydney CBD"),
      act("The Rocks (quartier historique)", 0, "Gratuit", "The Rocks, Sydney"),
      act("Taronga Zoo", 38, "Billet adulte", "Mosman, Sydney"),
    ];
  }
  if (c.includes("ibiza") || c.includes("eivissa")) {
    return [
      act("Dalt Vila (vieille ville fortifiée)", 0, "Gratuit", "Dalt Vila, Ibiza"),
      act("Cala Comte — baignade & coucher de soleil", 0, "Gratuit", "Sant Josep, Ibiza"),
      act("Es Vedrà depuis Cala d'Hort", 0, "Gratuit", "Cala d'Hort, Ibiza"),
      act("Marché hippie Las Dalias", 0, "Gratuit (achats en sus)", "Sant Carles, Ibiza"),
      act("Playa d'en Bossa & clubs", 20, "Entrée club type", "Playa d'en Bossa, Ibiza"),
      act("Port d'Ibiza & quartier de la Marina", 0, "Gratuit", "Port, Ibiza"),
    ];
  }
  if (c.includes("mykonos") || c.includes("myconos")) {
    return [
      act("Petite Venise & moulins à vent", 0, "Gratuit", "Chóra, Mykonos"),
      act("Plage Paradise Beach", 0, "Gratuit (transat ~15€)", "Paradise, Mykonos"),
      act("Île de Délos (excursion)", 20, "Billet + bateau", "Délos, Mykonos"),
      act("Quartier de Chóra", 0, "Gratuit", "Chóra, Mykonos"),
      act("Plage Super Paradise", 0, "Gratuit (transat ~20€)", "Super Paradise, Mykonos"),
      act("Église Panagia Paraportiani", 0, "Gratuit", "Chóra, Mykonos"),
    ];
  }
  if (c.includes("santorini") || c.includes("santorin")) {
    return [
      act("Oia — coucher de soleil iconique", 0, "Gratuit", "Oia, Santorini"),
      act("Randonnée Fira–Oia (caldeira)", 0, "Gratuit", "Fira → Oia, Santorini"),
      act("Plage Rouge (Red Beach)", 0, "Gratuit", "Akrotiri, Santorini"),
      act("Site archéologique d'Akrotiri", 12, "Billet adulte", "Akrotiri, Santorini"),
      act("Dégustation de vins santoriniens", 15, "Dégustation type", "Pyrgos, Santorini"),
      act("Plage de Kamari", 0, "Gratuit", "Kamari, Santorini"),
    ];
  }
  if (c.includes("cancun") || c.includes("cancún")) {
    return [
      act("Ruines de Tulum (excursion)", 10, "Billet adulte", "Tulum, Quintana Roo"),
      act("Isla Mujeres & Playa Norte", 15, "Ferry aller-retour", "Isla Mujeres"),
      act("Playa Delfines", 0, "Gratuit", "Zone Hotelera, Cancún"),
      act("Cenote Ik Kil", 15, "Entrée adulte", "Pisté, Yucatán"),
      act("Chichén Itzá (excursion)", 30, "Entrée + transport", "Yucatán"),
      act("Parc Xcaret", 100, "Billet journée", "Playa del Carmen"),
    ];
  }
  if (c.includes("tulum")) {
    return [
      act("Ruines mayas de Tulum", 5, "Billet adulte", "Tulum, Quintana Roo"),
      act("Gran Cenote", 15, "Entrée adulte", "Tulum, Quintana Roo"),
      act("Cenote Dos Ojos", 20, "Entrée + snorkel", "Tulum, Quintana Roo"),
      act("Plage sous les ruines", 0, "Gratuit (inclus avec ruines)", "Tulum, Quintana Roo"),
      act("Réserve de Sian Ka'an", 40, "Excursion guidée", "Sian Ka'an"),
      act("Laguna de Bacalar (excursion)", 0, "Gratuit (transport en sus)", "Bacalar, Quintana Roo"),
    ];
  }
  if (c.includes("singapour") || c.includes("singapore")) {
    return [
      act("Gardens by the Bay", 20, "Billet Flower Dome + Cloud Forest", "Marina Bay, Singapour"),
      act("Marina Bay Sands SkyPark", 23, "Billet adulte", "Marina Bay, Singapour"),
      act("Chinatown & Temple de la Dent de Bouddha", 0, "Gratuit", "Chinatown, Singapour"),
      act("Little India", 0, "Gratuit", "Little India, Singapour"),
      act("Sentosa Island", 0, "Gratuit (attractions en sus)", "Sentosa, Singapour"),
      act("Hawker centres (Maxwell ou Lau Pa Sat)", 5, "Repas type", "Centre, Singapour"),
    ];
  }
  if (c.includes("nice")) {
    return [
      act("Promenade des Anglais", 0, "Gratuit", "Baie des Anges, Nice"),
      act("Vieux-Nice & Cours Saleya", 0, "Gratuit", "Vieux-Nice"),
      act("Colline du Château", 0, "Gratuit", "Colline du Château, Nice"),
      act("Musée Matisse", 10, "Billet adulte", "Cimiez, Nice"),
      act("Place Masséna", 0, "Gratuit", "Centre-ville, Nice"),
      act("Marché aux fleurs du Cours Saleya", 0, "Gratuit (achats en sus)", "Vieux-Nice"),
    ];
  }
  if (c.includes("monaco") || c.includes("monte carlo") || c.includes("monte-carlo")) {
    return [
      act("Palais Princier & Relève de la garde", 10, "Billet adulte", "Monaco-Ville"),
      act("Musée Océanographique", 18, "Billet adulte", "Monaco-Ville"),
      act("Casino de Monte-Carlo", 0, "Gratuit (salle de jeux 17€)", "Monte-Carlo"),
      act("Jardin Exotique", 7, "Billet adulte", "Les Révoires, Monaco"),
      act("Cathédrale Notre-Dame-Immaculée", 0, "Gratuit", "Monaco-Ville"),
      act("Port Hercule & Quartier de la Condamine", 0, "Gratuit", "La Condamine, Monaco"),
    ];
  }
  if (c.includes("bordeaux")) {
    return [
      act("Cité du Vin", 22, "Billet adulte", "Quartier Bacalan, Bordeaux"),
      act("Place de la Bourse & Miroir d'Eau", 0, "Gratuit", "Centre, Bordeaux"),
      act("Rue Sainte-Catherine", 0, "Gratuit", "Centre, Bordeaux"),
      act("Quartier Saint-Pierre", 0, "Gratuit", "Saint-Pierre, Bordeaux"),
      act("Cathédrale Saint-André", 0, "Gratuit (tour Pey-Berland 6€)", "Centre, Bordeaux"),
      act("Excursion vignobles de Saint-Émilion", 35, "Dégustation + transport", "Saint-Émilion"),
    ];
  }
  if (c.includes("toulouse")) {
    return [
      act("Place du Capitole", 0, "Gratuit", "Centre, Toulouse"),
      act("Cité de l'Espace", 25, "Billet adulte", "Avenue Jean Gonord, Toulouse"),
      act("Basilique Saint-Sernin", 0, "Gratuit", "Centre, Toulouse"),
      act("Canal du Midi (promenade)", 0, "Gratuit", "Centre, Toulouse"),
      act("Couvent des Jacobins", 5, "Billet adulte", "Centre, Toulouse"),
      act("Marché Victor Hugo", 0, "Gratuit (repas en sus)", "Centre, Toulouse"),
    ];
  }
  if (c.includes("lille")) {
    return [
      act("Palais des Beaux-Arts", 7, "Billet adulte", "Place de la République, Lille"),
      act("Vieux-Lille & Grand'Place", 0, "Gratuit", "Vieux-Lille"),
      act("Citadelle de Lille", 0, "Gratuit (extérieur)", "Bois de Boulogne, Lille"),
      act("Marché de Wazemmes", 0, "Gratuit (achats en sus)", "Wazemmes, Lille"),
      act("Rue de Béthune (shopping)", 0, "Gratuit", "Centre, Lille"),
      act("Hospice Comtesse", 6, "Billet adulte", "Vieux-Lille"),
    ];
  }
  if (c.includes("nantes")) {
    return [
      act("Les Machines de l'Île & Éléphant", 9, "Billet adulte", "Île de Nantes"),
      act("Château des Ducs de Bretagne", 0, "Gratuit (musée 8€)", "Centre, Nantes"),
      act("Passage Pommeraye", 0, "Gratuit", "Centre, Nantes"),
      act("Jardin des Plantes", 0, "Gratuit", "Gare Sud, Nantes"),
      act("Quartier Bouffay", 0, "Gratuit", "Centre, Nantes"),
      act("Parcours Voyage à Nantes (art urbain)", 0, "Gratuit", "Centre-ville, Nantes"),
    ];
  }
  if (c.includes("kyoto")) {
    return [
      act("Fushimi Inari-taisha (torii)", 0, "Gratuit", "Fushimi, Kyoto"),
      act("Temple Kinkaku-ji (Pavillon d'or)", 5, "Billet adulte", "Kita, Kyoto"),
      act("Forêt de bambous d'Arashiyama", 0, "Gratuit", "Arashiyama, Kyoto"),
      act("Temple Kiyomizu-dera", 4, "Billet adulte", "Higashiyama, Kyoto"),
      act("Quartier de Gion (geishas)", 0, "Gratuit", "Gion, Kyoto"),
      act("Château de Nijō", 8, "Billet adulte", "Nakagyō, Kyoto"),
    ];
  }
  if (c.includes("osaka")) {
    return [
      act("Château d'Osaka", 6, "Billet adulte", "Chūō, Osaka"),
      act("Dōtonbori (street food & néons)", 0, "Gratuit (repas en sus)", "Namba, Osaka"),
      act("Shinsekai & Tour Tsūtenkaku", 5, "Billet tour", "Naniwa, Osaka"),
      act("Aquarium Kaiyūkan", 24, "Billet adulte", "Port d'Osaka"),
      act("Sanctuaire Sumiyoshi Taisha", 0, "Gratuit", "Sumiyoshi, Osaka"),
      act("Universal Studios Japan", 75, "Billet journée", "Konohana, Osaka"),
    ];
  }
  if (c.includes("seoul") || c.includes("séoul")) {
    return [
      act("Palais Gyeongbokgung", 3, "Billet adulte", "Jongno-gu, Séoul"),
      act("Quartier Bukchon Hanok", 0, "Gratuit", "Jongno-gu, Séoul"),
      act("N Seoul Tower (Namsan)", 12, "Billet observatoire", "Yongsan-gu, Séoul"),
      act("Marché Gwangjang", 0, "Gratuit (street food en sus)", "Jongno-gu, Séoul"),
      act("Quartier Myeongdong (shopping)", 0, "Gratuit", "Jung-gu, Séoul"),
      act("Temple Jogyesa", 0, "Gratuit", "Jongno-gu, Séoul"),
    ];
  }
  if (c.includes("jakarta")) {
    return [
      act("Monument National (Monas)", 4, "Billet adulte", "Centre, Jakarta"),
      act("Vieille ville Kota Tua", 0, "Gratuit", "Jakarta Ouest"),
      act("Mosquée Istiqlal", 0, "Gratuit", "Centre, Jakarta"),
      act("Musée national d'Indonésie", 3, "Billet adulte", "Centre, Jakarta"),
      act("Thousand Islands (excursion)", 20, "Bateau + entrée", "Kepulauan Seribu"),
      act("Marché Tanah Abang", 0, "Gratuit (achats en sus)", "Centre, Jakarta"),
    ];
  }
  if (c.includes("beijing") || c.includes("pekin") || c.includes("pékin")) {
    return [
      act("Cité Interdite (Palais impérial)", 8, "Billet adulte", "Dongcheng, Pékin"),
      act("Grande Muraille (Mutianyu)", 40, "Billet + transport", "Huairou, Pékin"),
      act("Place Tian'anmen", 0, "Gratuit", "Dongcheng, Pékin"),
      act("Temple du Ciel", 5, "Billet adulte", "Dongcheng, Pékin"),
      act("Palais d'Été", 4, "Billet adulte", "Haidian, Pékin"),
      act("Hutongs & Lac Houhai", 0, "Gratuit (pousse-pousse ~10€)", "Xicheng, Pékin"),
    ];
  }
  if (c.includes("shanghai") || c.includes("shanghaï")) {
    return [
      act("Le Bund (promenade)", 0, "Gratuit", "Huangpu, Shanghai"),
      act("Tour de Shanghai (observatoire)", 25, "Billet adulte", "Pudong, Shanghai"),
      act("Jardin Yuyuan", 5, "Billet adulte", "Huangpu, Shanghai"),
      act("Temple du Bouddha de Jade", 3, "Billet adulte", "Jing'an, Shanghai"),
      act("Quartier Tianzifang", 0, "Gratuit", "Xuhui, Shanghai"),
      act("Nanjing Road (shopping)", 0, "Gratuit", "Huangpu, Shanghai"),
    ];
  }
  if (c.includes("guangzhou") || c.includes("canton")) {
    return [
      act("Canton Tower", 15, "Billet observatoire", "Haizhu, Guangzhou"),
      act("Temple des Six Banians", 1, "Billet adulte", "Yuexiu, Guangzhou"),
      act("Île Shamian", 0, "Gratuit", "Liwan, Guangzhou"),
      act("Parc Yuexiu & Statue des 5 chèvres", 0, "Gratuit", "Yuexiu, Guangzhou"),
      act("Dim sum dans un restaurant traditionnel", 10, "Repas type", "Liwan, Guangzhou"),
      act("Musée du Roi Nanyue", 3, "Billet adulte", "Yuexiu, Guangzhou"),
    ];
  }
  if (c.includes("los angeles")) {
    return [
      act("Hollywood Walk of Fame", 0, "Gratuit", "Hollywood, Los Angeles"),
      act("Santa Monica Pier & Plage", 0, "Gratuit", "Santa Monica, LA"),
      act("Griffith Observatory", 0, "Gratuit", "Griffith Park, LA"),
      act("The Getty Center", 0, "Gratuit (parking 20$)", "Brentwood, LA"),
      act("Venice Beach & Boardwalk", 0, "Gratuit", "Venice, LA"),
      act("Universal Studios Hollywood", 110, "Billet journée", "Universal City, LA"),
    ];
  }
  if (c.includes("san francisco")) {
    return [
      act("Golden Gate Bridge", 0, "Gratuit", "Presidio, San Francisco"),
      act("Alcatraz Island", 40, "Billet + ferry", "San Francisco Bay"),
      act("Fisherman's Wharf & Pier 39", 0, "Gratuit", "Fisherman's Wharf, SF"),
      act("Cable Car", 8, "Ticket trajet", "Powell Street, SF"),
      act("Chinatown de San Francisco", 0, "Gratuit", "Chinatown, SF"),
      act("Painted Ladies & Alamo Square", 0, "Gratuit", "Western Addition, SF"),
    ];
  }
  if (c.includes("miami")) {
    return [
      act("South Beach & Ocean Drive", 0, "Gratuit", "Miami Beach"),
      act("Art Deco Historic District", 0, "Gratuit", "South Beach, Miami"),
      act("Wynwood Walls (street art)", 0, "Gratuit", "Wynwood, Miami"),
      act("Little Havana & Calle Ocho", 0, "Gratuit", "Little Havana, Miami"),
      act("Everglades (excursion airboat)", 35, "Excursion type", "Everglades, Floride"),
      act("Vizcaya Museum & Gardens", 22, "Billet adulte", "Coconut Grove, Miami"),
    ];
  }
  if (c.includes("chicago")) {
    return [
      act("Millennium Park & Cloud Gate (The Bean)", 0, "Gratuit", "The Loop, Chicago"),
      act("Art Institute of Chicago", 25, "Billet adulte", "Grant Park, Chicago"),
      act("Croisière architecturale sur la rivière", 45, "Billet adulte", "Chicago River"),
      act("Willis Tower Skydeck", 28, "Billet adulte", "The Loop, Chicago"),
      act("Navy Pier", 0, "Gratuit (attractions en sus)", "Streeterville, Chicago"),
      act("Deep-dish pizza chez Giordano's ou Lou Malnati's", 20, "Repas type", "Centre, Chicago"),
    ];
  }
  if (c.includes("toronto")) {
    return [
      act("CN Tower", 38, "Billet adulte", "Downtown, Toronto"),
      act("Royal Ontario Museum", 20, "Billet adulte", "Bloor-Yorkville, Toronto"),
      act("Distillery District", 0, "Gratuit", "Old Town, Toronto"),
      act("Kensington Market", 0, "Gratuit (achats en sus)", "Kensington, Toronto"),
      act("Îles de Toronto (ferry)", 8, "Billet ferry", "Toronto Islands"),
      act("St. Lawrence Market", 0, "Gratuit (repas en sus)", "Old Town, Toronto"),
    ];
  }
  if (c.includes("vancouver")) {
    return [
      act("Stanley Park & Seawall", 0, "Gratuit", "Stanley Park, Vancouver"),
      act("Pont suspendu de Capilano", 54, "Billet adulte", "North Vancouver"),
      act("Granville Island", 0, "Gratuit", "Granville Island, Vancouver"),
      act("Gastown & Steam Clock", 0, "Gratuit", "Gastown, Vancouver"),
      act("English Bay Beach", 0, "Gratuit", "West End, Vancouver"),
      act("Grouse Mountain", 55, "Billet téléphérique", "North Vancouver"),
    ];
  }
  if (c.includes("madrid")) {
    return [
      act("Musée du Prado", 15, "Billet adulte", "Paseo del Prado, Madrid"),
      act("Palais Royal de Madrid", 12, "Billet adulte", "Centre, Madrid"),
      act("Parc du Retiro", 0, "Gratuit", "Retiro, Madrid"),
      act("Puerta del Sol & Gran Vía", 0, "Gratuit", "Centro, Madrid"),
      act("Musée Reina Sofía (Guernica)", 10, "Billet adulte", "Atocha, Madrid"),
      act("Mercado de San Miguel", 0, "Gratuit (tapas en sus)", "Centre, Madrid"),
    ];
  }
  if (c.includes("venise") || c.includes("venice") || c.includes("venezia")) {
    return [
      act("Place Saint-Marc & Basilique", 0, "Gratuit (musée 5€)", "San Marco, Venise"),
      act("Palais des Doges", 25, "Billet adulte", "San Marco, Venise"),
      act("Pont du Rialto & Marché", 0, "Gratuit", "San Polo, Venise"),
      act("Balade en gondole", 80, "Tarif 30 min standard", "Centre, Venise"),
      act("Île de Murano (verrerie)", 0, "Gratuit (ferry ~7€)", "Murano, Venise"),
      act("Île de Burano (maisons colorées)", 0, "Gratuit (ferry ~7€)", "Burano, Venise"),
    ];
  }
  if (c.includes("bruxelles") || c.includes("brussels")) {
    return [
      act("Grand-Place de Bruxelles", 0, "Gratuit", "Centre, Bruxelles"),
      act("Manneken-Pis", 0, "Gratuit", "Centre, Bruxelles"),
      act("Atomium", 16, "Billet adulte", "Laeken, Bruxelles"),
      act("Musées royaux des Beaux-Arts", 10, "Billet adulte", "Centre, Bruxelles"),
      act("Dégustation de chocolat belge", 10, "Atelier type", "Centre, Bruxelles"),
      act("Quartier Sainte-Catherine", 0, "Gratuit", "Centre, Bruxelles"),
    ];
  }
  if (c.includes("berne") || c.includes("bern")) {
    return [
      act("Vieille ville de Berne (UNESCO)", 0, "Gratuit", "Altstadt, Berne"),
      act("Fosse aux Ours (BärenPark)", 0, "Gratuit", "Aare, Berne"),
      act("Tour de l'Horloge (Zytglogge)", 15, "Visite guidée", "Altstadt, Berne"),
      act("Musée d'Histoire de Berne & Einstein", 10, "Billet adulte", "Helvetiaplatz, Berne"),
      act("Rosengarten (Roseraie)", 0, "Gratuit", "Muristalden, Berne"),
      act("Baignade dans l'Aar", 0, "Gratuit", "Rivière Aar, Berne"),
    ];
  }
  if (c.includes("porto")) {
    return [
      act("Ribeira & Pont Dom-Luís", 0, "Gratuit", "Ribeira, Porto"),
      act("Caves de vin de Porto (Vila Nova de Gaia)", 15, "Dégustation", "Vila Nova de Gaia"),
      act("Librairie Lello", 5, "Billet entrée", "Centre, Porto"),
      act("Tour des Clercs (Torre dos Clérigos)", 6, "Billet adulte", "Centre, Porto"),
      act("Gare de São Bento (azulejos)", 0, "Gratuit", "Centre, Porto"),
      act("Croisière sur le Douro", 15, "Croisière 6 ponts", "Ribeira, Porto"),
    ];
  }
  if (c.includes("budapest")) {
    return [
      act("Parlement de Budapest", 12, "Visite guidée", "Kossuth tér, Budapest"),
      act("Thermes Széchenyi", 22, "Billet journée", "Városliget, Budapest"),
      act("Bastion des Pêcheurs", 0, "Gratuit (terrasse haute 4€)", "Buda, Budapest"),
      act("Château de Buda", 0, "Gratuit (musées payants)", "Várhegy, Budapest"),
      act("Ruin bars (Szimpla Kert)", 0, "Gratuit (consommations en sus)", "VII. arr., Budapest"),
      act("Croisière sur le Danube", 15, "Billet type", "Danube, Budapest"),
    ];
  }
  if (c.includes("doha")) {
    return [
      act("Musée d'Art Islamique", 0, "Gratuit", "Corniche, Doha"),
      act("Souq Waqif", 0, "Gratuit (achats en sus)", "Centre, Doha"),
      act("The Pearl-Qatar", 0, "Gratuit", "The Pearl Island, Doha"),
      act("Corniche de Doha (promenade)", 0, "Gratuit", "West Bay, Doha"),
      act("Musée National du Qatar", 13, "Billet adulte", "Centre, Doha"),
      act("Excursion dans le désert & mer intérieure", 60, "Excursion 4x4", "Khor Al Adaid"),
    ];
  }
  if (c.includes("abu dhabi")) {
    return [
      act("Grande Mosquée Sheikh Zayed", 0, "Gratuit", "Centre, Abu Dhabi"),
      act("Louvre Abu Dhabi", 16, "Billet adulte", "Île Saadiyat, Abu Dhabi"),
      act("Emirates Palace (visite extérieure)", 0, "Gratuit", "Corniche, Abu Dhabi"),
      act("Yas Island (Ferrari World)", 75, "Billet journée", "Yas Island, Abu Dhabi"),
      act("Corniche Beach", 0, "Gratuit", "Corniche, Abu Dhabi"),
      act("Heritage Village", 0, "Gratuit", "Breakwater, Abu Dhabi"),
    ];
  }
  if (c.includes("tunis")) {
    return [
      act("Médina de Tunis (UNESCO)", 0, "Gratuit", "Médina, Tunis"),
      act("Musée du Bardo", 11, "Billet adulte", "Le Bardo, Tunis"),
      act("Ruines de Carthage", 8, "Billet adulte", "Carthage, Tunis"),
      act("Sidi Bou Saïd", 0, "Gratuit", "Sidi Bou Saïd"),
      act("Mosquée Zitouna", 0, "Gratuit", "Médina, Tunis"),
      act("Souk El Attarine", 0, "Gratuit (achats en sus)", "Médina, Tunis"),
    ];
  }
  if (c.includes("alger")) {
    return [
      act("Casbah d'Alger (UNESCO)", 0, "Gratuit", "Casbah, Alger"),
      act("Basilique Notre-Dame d'Afrique", 0, "Gratuit", "Bologhine, Alger"),
      act("Monument des Martyrs (Maqam Echahid)", 0, "Gratuit", "Riadh El Feth, Alger"),
      act("Jardin d'Essai du Hamma", 1, "Billet adulte", "Hamma, Alger"),
      act("Grande Poste d'Alger", 0, "Gratuit (extérieur)", "Centre, Alger"),
      act("Front de mer (promenade des Sablettes)", 0, "Gratuit", "Bab El Oued, Alger"),
    ];
  }
  if (c.includes("melbourne")) {
    return [
      act("Federation Square", 0, "Gratuit", "CBD, Melbourne"),
      act("Street art de Hosier Lane", 0, "Gratuit", "CBD, Melbourne"),
      act("Royal Botanic Gardens", 0, "Gratuit", "South Yarra, Melbourne"),
      act("Great Ocean Road (excursion)", 80, "Excursion journée", "Victoria"),
      act("Queen Victoria Market", 0, "Gratuit (repas en sus)", "CBD, Melbourne"),
      act("Brighton Beach Boxes", 0, "Gratuit", "Brighton, Melbourne"),
    ];
  }
  if (c.includes("auckland")) {
    return [
      act("Sky Tower", 28, "Billet observatoire", "CBD, Auckland"),
      act("Volcans Auckland Domain & Rangitoto", 0, "Gratuit (ferry ~15€)", "Hauraki Gulf"),
      act("Harbour Bridge (vue ou bungy)", 0, "Gratuit (bungy 165 NZD)", "Westhaven, Auckland"),
      act("Mission Bay Beach", 0, "Gratuit", "Mission Bay, Auckland"),
      act("Marché de Otara", 0, "Gratuit (achats en sus)", "Otara, Auckland"),
      act("Devonport (ferry & village)", 7, "Billet ferry", "Devonport, Auckland"),
    ];
  }
  if (c.includes("cape town") || c.includes("le cap")) {
    return [
      act("Montagne de la Table (téléphérique)", 18, "Billet adulte", "Table Mountain, Le Cap"),
      act("Cap de Bonne-Espérance", 10, "Billet adulte", "Cape Point, Le Cap"),
      act("Robben Island", 25, "Billet + ferry", "Robben Island, Le Cap"),
      act("V&A Waterfront", 0, "Gratuit", "Waterfront, Le Cap"),
      act("Quartier coloré de Bo-Kaap", 0, "Gratuit", "Bo-Kaap, Le Cap"),
      act("Plage de Boulders (manchots)", 8, "Billet adulte", "Simon's Town, Le Cap"),
    ];
  }
  if (c.includes("rio de janeiro") || c.includes("rio")) {
    return [
      act("Christ Rédempteur (Corcovado)", 15, "Billet + train", "Corcovado, Rio"),
      act("Pain de Sucre (téléphérique)", 20, "Billet adulte", "Urca, Rio"),
      act("Plage de Copacabana", 0, "Gratuit", "Copacabana, Rio"),
      act("Escalier Selarón", 0, "Gratuit", "Lapa, Rio"),
      act("Quartier Santa Teresa", 0, "Gratuit", "Santa Teresa, Rio"),
      act("Jardin botanique de Rio", 5, "Billet adulte", "Jardim Botânico, Rio"),
    ];
  }
  if (c.includes("sao paulo") || c.includes("são paulo")) {
    return [
      act("Avenida Paulista & MASP", 12, "Billet adulte", "Bela Vista, São Paulo"),
      act("Quartier Liberdade (japonais)", 0, "Gratuit", "Liberdade, São Paulo"),
      act("Parc Ibirapuera", 0, "Gratuit", "Ibirapuera, São Paulo"),
      act("Pinacothèque de l'État", 10, "Billet adulte", "Luz, São Paulo"),
      act("Marché Municipal (Mercadão)", 0, "Gratuit (repas en sus)", "Centro, São Paulo"),
      act("Beco do Batman (street art)", 0, "Gratuit", "Vila Madalena, São Paulo"),
    ];
  }
  if (c.includes("phuket")) {
    return [
      act("Plage de Patong", 0, "Gratuit", "Patong, Phuket"),
      act("Grand Bouddha de Phuket", 0, "Gratuit (donation)", "Nakkerd Hills, Phuket"),
      act("Vieille ville de Phuket", 0, "Gratuit", "Phuket Town"),
      act("Excursion Îles Phi Phi", 40, "Bateau + entrée", "Phi Phi Islands"),
      act("Cap Promthep (coucher de soleil)", 0, "Gratuit", "Rawai, Phuket"),
      act("Temple Wat Chalong", 0, "Gratuit", "Chalong, Phuket"),
    ];
  }
  if (c.includes("metz")) {
    return [
      act("Cathédrale Saint-Étienne & crypte", 0, "Gratuit", "Metz"),
      act("Centre Pompidou-Metz", 11, "Billet adulte", "Metz"),
      act("Porte des Allemands", 0, "Gratuit", "Metz"),
      act("Place Saint-Louis & quartier impérial", 0, "Gratuit", "Metz"),
      act("Marché couvert", 0, "Gratuit (achats en sus)", "Metz"),
      act("Plan d'eau — promenade sur la Moselle", 0, "Gratuit", "Metz"),
    ];
  }
  if (c.includes("nancy")) {
    return [
      act("Place Stanislas — ensemble UNESCO", 0, "Gratuit", "Nancy"),
      act("Musée Lorrain", 8, "Billet adulte", "Nancy"),
      act("Parc de la Pépinière", 0, "Gratuit", "Nancy"),
      act("Vieille ville & porte de la Craffe", 0, "Gratuit", "Nancy"),
      act("Musée des beaux-arts — art & École de Nancy", 7, "Billet adulte", "Nancy"),
      act("Cathédrale Notre-Dame-de-l'Annonciation", 0, "Gratuit", "Nancy"),
    ];
  }
  if (c.includes("reims")) {
    return [
      act("Cathédrale Notre-Dame & façade des rois", 0, "Gratuit", "Reims"),
      act("Palais du Tau", 8, "Billet adulte", "Reims"),
      act("Basilique Saint-Remi", 0, "Gratuit", "Reims"),
      act("Visite de cave de champagne", 25, "Dégustation type", "Reims"),
      act("Place Drouet-d'Erlon", 0, "Gratuit", "Reims"),
      act("Halles du Boulingrin", 0, "Gratuit (achats en sus)", "Reims"),
    ];
  }
  if (c.includes("strasbourg")) {
    return [
      act("Cathédrale Notre-Dame & plateforme panoramique", 8, "Billet montée", "Grande Île, Strasbourg"),
      act("Petite France & ponts couverts", 0, "Gratuit", "Grande Île, Strasbourg"),
      act("Palais Rohan — musées", 7, "Billet musées", "Grande Île, Strasbourg"),
      act("Parlement européen — visite Hemicycle", 0, "Gratuit (réservation)", "Quartier européen, Strasbourg"),
      act("Barrage Vauban & panorama", 0, "Gratuit", "Petite France, Strasbourg"),
      act("Croisière Batorama sur les canaux", 14, "Billet adulte", "Presqu'île Malraux, Strasbourg"),
    ];
  }
  if (c.includes("colmar")) {
    return [
      act("Petite Venise — promenade des quais", 0, "Gratuit", "Centre historique, Colmar"),
      act("Musée Unterlinden", 13, "Billet adulte", "Colmar"),
      act("Maison Pfister & rue des Marchands", 0, "Gratuit", "Colmar"),
      act("Marché couvert & dégustation alsacienne", 0, "Gratuit (achats en sus)", "Colmar"),
      act("Musée Bartholdi", 6, "Billet adulte", "Colmar"),
      act("Route des vins — Eguisheim ou Riquewihr (excursion)", 25, "Transport / dégustation", "Haut-Rhin"),
    ];
  }
  if (c.includes("mulhouse") || c.includes("mülhausen") || c.includes("muhlouse")) {
    return [
      act("Cité de l'automobile", 18, "Billet adulte", "Mulhouse"),
      act("Musée EDF Electropolis", 11, "Billet adulte", "Mulhouse"),
      act("Temple Saint-Étienne", 0, "Gratuit", "Centre-ville, Mulhouse"),
      act("Place de la Réunion & hôtel de ville", 0, "Gratuit", "Mulhouse"),
      act("Parc zoologique & botanique", 20, "Billet adulte", "Mulhouse"),
      act("Quartier Rebberg — villas Belle Époque", 0, "Gratuit", "Mulhouse"),
    ];
  }
  if (c.includes("cannes")) {
    return [
      act("La Croisette & plages", 0, "Gratuit", "Cannes"),
      act("Suquet & musée de la Castre", 6, "Billet musée", "Le Suquet, Cannes"),
      act("Marché Forville", 0, "Gratuit (achats en sus)", "Cannes"),
      act("Île Sainte-Marguerite (bateau)", 15, "Ferry A/R", "Îles de Lérins"),
      act("Palais des Festivals", 0, "Gratuit (extérieur)", "Cannes"),
      act("Rue d'Antibes & shopping", 0, "Gratuit", "Cannes"),
    ];
  }
  if (c.includes("valencia") || c.includes("valència")) {
    return [
      act("Cité des arts et des sciences", 12, "Billet combiné type", "València, Espagne"),
      act("Lonja de la Seda", 2, "Billet adulte", "València, Espagne"),
      act("Marché Central", 0, "Gratuit", "València, Espagne"),
      act("Quartier du Carmen & cathédrale", 0, "Gratuit", "València, Espagne"),
      act("Jardin du Turia", 0, "Gratuit", "València, Espagne"),
      act("Plage de la Malvarrosa", 0, "Gratuit", "València, Espagne"),
    ];
  }
  if (c.includes("visby")) {
    return [
      act("Promenade sur les remparts (Ringmur)", 0, "Gratuit", "Visby, Gotland"),
      act("Cathédrale Sainte-Marie (Sankta Maria)", 0, "Gratuit", "Visby"),
      act("Gotlands museum", 12, "Billet adulte", "Visby"),
      act("Ruines Sankta Karin & Sankta Lars", 0, "Gratuit", "Visby"),
      act("Almedalen & port hanséatique", 0, "Gratuit", "Visby"),
      act("Högklint — falaises & vue sur la mer", 0, "Gratuit", "Gotland"),
    ];
  }
  if (c.includes("stockholm")) {
    return [
      act("Gamla Stan & palais royal", 0, "Gratuit", "Stockholm"),
      act("Musée Vasa", 17, "Billet adulte", "Djurgården, Stockholm"),
      act("Croisière archipel (Strömma)", 25, "Billet type", "Depuis Nybrokajen, Stockholm"),
      act("Skansen", 16, "Billet adulte", "Djurgården, Stockholm"),
      act("Hôtel de ville Stadshuset", 12, "Visite guidée", "Kungsholmen, Stockholm"),
      act("Quartier Södermalm & Monteliusvägen", 0, "Gratuit", "Södermalm, Stockholm"),
    ];
  }
  if (c.includes("copenhague") || c.includes("copenhagen") || c.includes("københavn")) {
    return [
      act("Nyhavn & promenade", 0, "Gratuit", "Copenhague"),
      act("Tivoli Gardens", 22, "Billet adulte", "Centre, Copenhague"),
      act("Château de Rosenborg", 14, "Billet adulte", "Copenhague"),
      act("Christiansborg — tour du Parlement", 15, "Billet adulte", "Slotsholmen, Copenhague"),
      act("Petite Sirène", 0, "Gratuit", "Langelinie, Copenhague"),
      act("Marché Torvehallerne", 0, "Gratuit (repas en sus)", "Nørreport, Copenhague"),
    ];
  }
  if (c.includes("oslo")) {
    return [
      act("Musée des navires vikings", 12, "Billet adulte", "Bygdøy, Oslo"),
      act("Parc Vigeland", 0, "Gratuit", "Frogner, Oslo"),
      act("Forteresse Akershus", 0, "Gratuit (musées en sus)", "Akershus, Oslo"),
      act("Opéra d'Oslo — toit accessible", 0, "Gratuit", "Bjørvika, Oslo"),
      act("Musée du peuple norvégien", 15, "Billet adulte", "Bygdøy, Oslo"),
      act("Palais royal & relève de la garde", 0, "Gratuit", "Sentrum, Oslo"),
    ];
  }
  if (c.includes("helsinki")) {
    return [
      act("Forteresse Suomenlinna (ferry)", 8, "Billet ferry A/R", "Helsinki"),
      act("Église Temppeliaukio", 5, "Billet adulte", "Helsinki"),
      act("Cathédrale luthérienne", 0, "Gratuit", "Senate Square, Helsinki"),
      act("Marché Kauppatori", 0, "Gratuit", "Waterfront, Helsinki"),
      act("Musée national de Finlande", 14, "Billet adulte", "Helsinki"),
      act("Ouspenski & quartier Katajanokka", 0, "Gratuit", "Helsinki"),
    ];
  }
  if (c.includes("dublin")) {
    return [
      act("Trinity College — Livre de Kells", 15, "Billet adulte", "Dublin"),
      act("Guinness Storehouse", 28, "Billet adulte", "St. James's Gate, Dublin"),
      act("Temple Bar", 0, "Gratuit", "Dublin"),
      act("Château de Dublin", 8, "Billet adulte", "Dublin"),
      act("Cathédrale Saint-Patrick", 8, "Billet adulte", "Dublin"),
      act("Phoenix Park & Zoo", 0, "Gratuit (zoo payant)", "Dublin"),
    ];
  }
  if (c.includes("naples") || c.includes("napoli")) {
    return [
      act("Musée archéologique national", 15, "Billet adulte", "Naples"),
      act("Centre historique & Spaccanapoli", 0, "Gratuit", "Naples"),
      act("Castel dell'Ovo", 0, "Gratuit", "Lungomare, Naples"),
      act("Catacombes de San Gennaro", 11, "Billet adulte", "Naples"),
      act("Castel Nuovo (Maschio Angioino)", 6, "Billet adulte", "Naples"),
      act("Pizza historique — Via dei Tribunali", 12, "Repas type", "Naples"),
    ];
  }
  if (c.includes("palermo")) {
    return [
      act("Palais des Normands & chapelle Palatine", 12, "Billet adulte", "Palerme"),
      act("Cathédrale de Palerme", 0, "Gratuit", "Palerme"),
      act("Teatro Massimo", 10, "Visite guidée", "Palerme"),
      act("Marché Ballarò", 0, "Gratuit (street food en sus)", "Palerme"),
      act("Catacombes des Capucins", 3, "Billet adulte", "Palerme"),
      act("Monreale — cathédrale (excursion)", 8, "Bus + entrée", "Monreale"),
    ];
  }
  if (c.includes("séville") || c.includes("seville") || c.includes("sevilla")) {
    return [
      act("Alcázar de Séville", 14, "Billet adulte", "Santa Cruz, Séville"),
      act("Cathédrale & Giralda", 12, "Billet adulte", "Séville"),
      act("Plaza de España", 0, "Gratuit", "Parque María Luisa, Séville"),
      act("Quartier Santa Cruz", 0, "Gratuit", "Séville"),
      act("Metropol Parasol (Setas)", 12, "Billet adulte", "Encarnación, Séville"),
      act("Torre del Oro", 3, "Billet adulte", "Guadalquivir, Séville"),
    ];
  }
  if (c.includes("turin") || c.includes("torino")) {
    return [
      act("Mole Antonelliana & musée du cinéma", 12, "Billet adulte", "Turin"),
      act("Palais royal & Armeria", 12, "Billet adulte", "Turin"),
      act("Musée égyptien", 15, "Billet adulte", "Turin"),
      act("Place San Carlo", 0, "Gratuit", "Turin"),
      act("Cathédrale & chapelle du Suaire", 0, "Gratuit (Suaire non exposé)", "Turin"),
      act("Piazza Castello & palais Madama", 10, "Billet musée", "Turin"),
    ];
  }
  if (c.includes("varsovie") || c.includes("warsaw") || c.includes("warszawa")) {
    return [
      act("Vieille ville (Stare Miasto)", 0, "Gratuit", "Varsovie"),
      act("Château royal", 12, "Billet adulte", "Varsovie"),
      act("Musée de l'insurrection", 7, "Billet adulte", "Varsovie"),
      act("Palais de la culture & des sciences", 8, "Billet panorama", "Varsovie"),
      act("Parc Lazienki", 5, "Palais sur l'île", "Varsovie"),
      act("Quartier Praga", 0, "Gratuit", "Varsovie"),
    ];
  }
  if (c.includes("cracovie") || /krak[oó]w/i.test(c)) {
    return [
      act("Place du Marché (Rynek Główny)", 0, "Gratuit", "Cracovie"),
      act("Château de Wawel", 15, "Billet combiné", "Cracovie"),
      act("Quartier Kazimierz", 0, "Gratuit", "Cracovie"),
      act("Mine de sel Wieliczka", 25, "Billet + transport", "Wieliczka"),
      act("Collegium Maius", 4, "Billet adulte", "Cracovie"),
      act("Église Sainte-Marie (hejnal)", 5, "Billet adulte", "Cracovie"),
    ];
  }
  if (c.includes("edinburgh") || c.includes("édimbourg") || c.includes("edimbourg")) {
    return [
      act("Château d'Édimbourg", 19, "Billet adulte", "Édimbourg"),
      act("Royal Mile", 0, "Gratuit", "Édimbourg"),
      act("Arthur's Seat", 0, "Gratuit", "Holyrood Park, Édimbourg"),
      act("Palais de Holyroodhouse", 18, "Billet adulte", "Édimbourg"),
      act("National Museum of Scotland", 0, "Gratuit", "Édimbourg"),
      act("Calton Hill", 0, "Gratuit", "Édimbourg"),
    ];
  }
  const cityDeaccent = String(city || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const firstTok = cityDeaccent.split(/[\s,]+/)[0] || "";
  if (
    c.includes("bâle") ||
    c.includes("basel") ||
    cityDeaccent.includes("basel") ||
    firstTok === "bale"
  ) {
    return [
      act("Cathédrale de Bâle (Münster) & place de la cathédrale", 0, "Gratuit", "Altstadt, Bâle"),
      act("Marktplatz & Rathaus — hôtel de ville rouge", 0, "Gratuit", "Centre historique, Bâle"),
      act("Kunstmuseum Basel — grands maîtres", 18, "Billet adulte", "St. Alban-Graben, Bâle"),
      act("Fondation Beyeler — art moderne (Riehen)", 26, "Billet adulte", "Riehen, Bâle"),
      act("Musée Tinguely — machines animées", 14, "Billet adulte", "Paul Sacher-Anlage, Bâle"),
      act("Zoo de Bâle — espèces & vivarium", 22, "Billet adulte", "Binningen, Bâle"),
    ];
  }
  return [
    act("Centre historique de " + label, 0, "Gratuit", label),
    act("Principal musée de " + label, 15, "Entrée type", label),
    act("Monument emblématique de " + label, 10, "Entrée type", label),
    act("Marché local de " + label, 0, "Gratuit (achats en sus)", label),
    act("Parc ou jardin principal de " + label, 0, "Gratuit", label),
    act("Quartier pittoresque de " + label, 0, "Gratuit", label),
  ];
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

/** Repères « exploration » (repli sans POI réels) — à ne pas utiliser pour enrichir les conseils ni comme premier rendu. */
function isGenericExplorationPlaceName(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (s === "Quartiers agréables pour se balader") return true;
  if (s === "Marchés, cuisine locale & vie de quartier") return true;
  if (s === "Architecture remarquable & art dans la ville") return true;
  if (/^Centre historique & cœur de .+/i.test(s)) return true;
  if (/^Musées, monuments & patrimoine — .+/i.test(s)) return true;
  if (/^Parcs, jardins & points de vue à .+/i.test(s)) return true;
  if (/^Excursion ou panorama aux alentours de .+/i.test(s)) return true;
  return false;
}

/**
 * Priorité : OSM (name:xx) → titres wiki géolocalisés (langue UI) → Foursquare.
 * Donne des libellés concrets au lieu de se rabattre sur des « axes » génériques.
 */
function mergePlaceCandidates(osmNames, wikiGeoTitles, fsqNames, cap = 22) {
  const out = [];
  const seen = new Set();
  const push = (label) => {
    const s = String(label || "").trim();
    if (s.length < 2) return;
    const k = normalizeTextForSearch(s);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  for (const n of osmNames || []) push(n);
  for (const n of wikiGeoTitles || []) push(n);
  for (const n of fsqNames || []) push(n);
  const n = Math.min(48, Math.max(10, Number(cap) || 22));
  return out.slice(0, n);
}

/** Activités dérivées des vrais noms de lieux (évite « Principal musée de X » tant que possible). */
function buildSuggestedActivitiesFromDistinctPlaces(placeLabels, cityHint) {
  const c = String(cityHint || "").trim();
  const out = [];
  for (const p of placeLabels || []) {
    const t = String(p || "").trim();
    if (!t || isGenericExplorationPlaceName(t)) continue;
    out.push({
      title: t,
      estimatedCostEur: clampActivityCostEUR(0),
      costNote: "",
      location: c,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/** Remplace le titre d’une activité Foursquare par le libellé du guide si même repère (clé normalisée). */
function applyLocalizedPlaceTitlesToActivities(activities, placesForGuide) {
  const map = new Map();
  for (const p of placesForGuide || []) {
    const s = String(p || "").trim();
    if (!s) continue;
    map.set(normalizeTextForSearch(s), s);
  }
  if (map.size === 0) return activities;
  return (activities || []).map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const t = String(raw.title ?? raw.name ?? "").trim();
    if (!t) return raw;
    const repl = map.get(normalizeTextForSearch(t));
    return repl && repl !== t ? { ...raw, title: repl } : raw;
  });
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

/**
 * Entre min et max lieux : catalogue emblématique en secours seulement.
 * Pas de pastilles « Centre historique & cœur de… » pour gonfler artificiellement la liste.
 */
function clampPlacesList(places, cityName, { min = 3, max = 7, padExploration = false } = {}) {
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
  const iconic = getIconicPlacesFallback(cityName) || [];
  for (const p of iconic) {
    if (out.length >= min) break;
    add(p);
  }
  for (const p of iconic) {
    if (out.length >= max) break;
    add(p);
  }
  if (padExploration) {
    const explore = buildExplorationPlacesFallback(cityName) || [];
    for (const p of explore) {
      if (out.length >= min) break;
      add(p);
    }
    for (const p of explore) {
      if (out.length >= max) break;
      add(p);
    }
  }
  return out.slice(0, max);
}

/** Affichage instantane (sans reseau) le temps que les APIs repondent. */
function buildInstantDestinationGuide(rawQuery, uiLanguage = "fr") {
  const cityStem = extractCityPrompt(rawQuery) || normalizeCityInput(rawQuery);
  if (cityStem.length < 2) return null;
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return null;
  const heroStem = heroImageStemFromDestination(rawQuery) || safeCity;
  const imgRaw = buildCityImageUrl(rawQuery);
  const img = imgRaw ? upgradeLandscapeImageUrl(imgRaw) : "";
  const instantCandidates = dedupeImageUrlChain([
    ...getCityHeroImageCandidates(rawQuery),
    getBundledCityHeroPath(heroStem),
    getStorageMirrorHeroUrl(heroStem),
  ]).map((u) => upgradeLandscapeImageUrl(String(u || "")));
  const iconicOnly = getIconicPlacesFallback(safeCity);
  const lang = String(uiLanguage || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  return {
    city: safeCity,
    /** Rempli par Wikivoyage / Wikipedia / Groq (fetch rapide) — pas de phrase générique qui clignote avant la vraie description. */
    description: "",
    /** Pas de repères « modèle » avant Foursquare / OSM / clamp : évite le flash Bielefeld-style. */
    places: iconicOnly || [],
    suggestedActivities: iconicOnly?.length
      ? buildSuggestedActivitiesFromDistinctPlaces(iconicOnly, safeCity)
      : [],
    /** Conseils de base dans la langue UI dès l’ouverture (écran vide si on attend le fetch). */
    tips: buildTravelTips(safeCity, iconicOnly && iconicOnly.length >= 2 ? iconicOnly : [], lang),
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

/** Mini-carte pays (contour GeoJSON + bbox) — partagé par le guide complet et le chargement rapide. */
async function buildSituationMapForDestination(latitude, longitude, displayCountry, countryCodeNorm) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const countryMap = await fetchCountryMapData(
    String(displayCountry || "").trim(),
    String(countryCodeNorm || "").trim().toLowerCase(),
    latitude,
    longitude
  );
  let bbox = null;
  if (countryMap?.bbox) {
    bbox = expandBoundingBox(countryMap.bbox);
    bbox = unionBboxWithPoint(bbox, latitude, longitude);
  } else {
    bbox = bboxAroundPoint(latitude, longitude);
  }
  const latN = Number(latitude);
  const lonN = Number(longitude);
  return {
    miniMap: {
      geojson: countryMap?.geojson || null,
      viewBbox: bbox,
    },
    openMapUrl: `https://www.openstreetmap.org/?mlat=${latN}&mlon=${lonN}#map=7/${latN}/${lonN}`,
  };
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
 * Articles Wikipédia proches des coordonnées — titres déjà dans la langue du wiki (= langue UI).
 * Enrichit les villes où OSM / Foursquare renvoient peu de noms exploitables.
 */
async function fetchWikipediaGeoNearbyPlaceTitles(lat, lon, uiLang, cityHint) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const code = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const wikiLang = WIKI_LANG_CODES[code] || "fr";
  const host = `${wikiLang}.wikipedia.org`;
  const radius = 9000;
  const limit = 22;
  const hintStem = String(extractCityPrompt(cityHint) || cityHint || "")
    .split(",")[0]
    .trim();
  const cityNorm = normalizeTextForSearch(hintStem);
  try {
    /** Pas de ggsprimary (param non supporté partout → réponse vide). */
    const url =
      `https://${host}/w/api.php?action=query&list=geosearch&ggsnamespace=0` +
      `&ggsradius=${radius}&ggscoord=${lat}|${lon}&ggslimit=${limit}&format=json&origin=*`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    const gs = j?.query?.geosearch;
    if (!Array.isArray(gs)) return [];
    const out = [];
    for (const item of gs) {
      const title = String(item?.title || "").replace(/_/g, " ").trim();
      if (title.length < 3 || title.length > 105) continue;
      if (/^(liste des|liste d'|liste de la|liste du|list of|lists of)\b/i.test(title)) continue;
      const mainPart = title.split("(")[0].trim();
      if (cityNorm && normalizeTextForSearch(mainPart) === cityNorm) continue;
      out.push(title);
    }
    return out.slice(0, 14);
  } catch (_e) {
    return [];
  }
}

/** Dernier secours lieux : Nominatim dans une viewbox autour du centre (sans clé). */
async function fetchNominatimLandmarkHints(safeCity, uiLanguage, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const lang = String(uiLanguage || "fr").toLowerCase().split("-")[0] || "fr";
  const city = String(safeCity || "").trim().split(",")[0].trim();
  const cityNorm = normalizeTextForSearch(city);
  const d = 0.11;
  const viewbox = `${lon - d},${lat + d},${lon + d},${lat - d}`;
  const tryQueries = ["museum", "church", "historic", `monument ${city}`];
  const seen = new Set();
  const out = [];
  try {
    for (const q of tryQueries) {
      if (out.length >= 10) break;
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=8&addressdetails=0&bounded=1` +
        `&viewbox=${encodeURIComponent(viewbox)}&accept-language=${encodeURIComponent(lang)}` +
        `&q=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      for (const row of arr) {
        const name = String(row?.name || row?.display_name || "").split(",")[0].trim();
        if (name.length < 3 || name.length > 95) continue;
        const nk = normalizeTextForSearch(name);
        if (cityNorm && nk === cityNorm) continue;
        if (seen.has(nk)) continue;
        seen.add(nk);
        out.push(name);
      }
    }
    return out.slice(0, 12);
  } catch (_e) {
    return [];
  }
}

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
  const stripped = p.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*[—–]\s*.+$/, "").trim();
  if (stripped && stripped !== p) add(stripped);
  for (const c of chunks) {
    const cs = c.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*[—–]\s*.+$/, "").trim();
    if (cs && cs !== c) add(cs);
  }
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
  const MAP = [
    [/statue\s+de\s+la\s+libert/i, "Statue of Liberty"],
    [/ellis\s+island/i, "Ellis Island"],
    [/one\s*world\s*(trade|center|tower)/i, "One World Trade Center"],
    [/high\s*line/i, "High Line"],
    [/times\s*square/i, "Times Square"],
    [/brooklyn\s*bridge/i, "Brooklyn Bridge"],
    [/central\s*park/i, "Central Park"],
    [/empire\s*state/i, "Empire State Building"],
    [/tour\s*eiffel/i, "Eiffel Tower"],
    [/mus[eé]+e?\s*(du\s+)?louvre/i, "Louvre"],
    [/mus[eé]+e?\s*(du\s+)?prado/i, "Museo del Prado"],
    [/mus[eé]+e?\s*d['']?orsay/i, "Musée d'Orsay"],
    [/arc\s*de\s*triomphe/i, "Arc de Triomphe"],
    [/notre[\s-]*dame\b/i, "Notre-Dame de Paris"],
    [/sacr[eé][\s-]*c[oœ]ur/i, "Basilica of the Sacred Heart of Paris"],
    [/champs[\s-]*[eé]lys[eé]+s/i, "Champs-Élysées"],
    [/sagrada\s*fam[ií]lia/i, "Sagrada Família"],
    [/parc?\s*g[uü]ell/i, "Park Güell"],
    [/casa\s*batll[oó]/i, "Casa Batlló"],
    [/la\s*rambla/i, "La Rambla, Barcelona"],
    [/colis[eé]+/i, "Colosseum"],
    [/colis[eé]+o/i, "Colosseum"],
    [/colosseum/i, "Colosseum"],
    [/fontaine\s*de\s*tr[eé]vi/i, "Trevi Fountain"],
    [/panth[eé]on\s*.*rom/i, "Pantheon, Rome"],
    [/chapelle\s*sixtine/i, "Sistine Chapel"],
    [/basilique\s*saint[\s-]*pierre/i, "St. Peter's Basilica"],
    [/place\s*saint[\s-]*marc/i, "Piazza San Marco"],
    [/pont\s*du\s*rialto/i, "Rialto Bridge"],
    [/palais\s*des\s*doges/i, "Doge's Palace"],
    [/big\s*ben/i, "Big Ben"],
    [/tower\s*bridge/i, "Tower Bridge"],
    [/tower\s*of\s*london/i, "Tower of London"],
    [/buckingham/i, "Buckingham Palace"],
    [/westminster\s*(abbey|abb)/i, "Westminster Abbey"],
    [/british\s*museum/i, "British Museum"],
    [/hagia\s*sophia/i, "Hagia Sophia"],
    [/sainte[\s-]*sophie/i, "Hagia Sophia"],
    [/mosqu[eé]+e?\s*(bleue|sultan\s*ahmed)/i, "Sultan Ahmed Mosque"],
    [/topkapi/i, "Topkapı Palace"],
    [/grand\s*bazar/i, "Grand Bazaar, Istanbul"],
    [/palais\s*royal\s*.*madrid/i, "Royal Palace of Madrid"],
    [/plaza\s*mayor/i, "Plaza Mayor, Madrid"],
    [/vieux[\s-]*port\s*.*marseille/i, "Old Port of Marseille"],
    [/vieux[\s-]*port/i, "Old Port of Marseille"],
    [/basilique\s*notre[\s-]*dame\s*(de\s*la\s*garde)?/i, "Basilica of Notre-Dame de la Garde"],
    [/burj\s*khalifa/i, "Burj Khalifa"],
    [/burj\s*al\s*arab/i, "Burj Al Arab"],
    [/palm\s*jumeirah/i, "Palm Jumeirah"],
    [/place\s*jemaa\s*el[\s-]*fna/i, "Jemaa el-Fnaa"],
    [/jemaa\s*el[\s-]*fna/i, "Jemaa el-Fnaa"],
    [/tour\s*hassan/i, "Hassan Tower"],
    [/koutoubia/i, "Koutoubia Mosque"],
    [/rijksmuseum/i, "Rijksmuseum"],
    [/anne\s*frank/i, "Anne Frank House"],
    [/dam\s*square/i, "Dam Square"],
    [/vondelpark/i, "Vondelpark"],
    [/mont[\s-]*fuji/i, "Mount Fuji"],
    [/temple\s*(senso[\s-]*ji|sensoji)/i, "Sensō-ji"],
    [/senso[\s-]*ji/i, "Sensō-ji"],
    [/meiji[\s-]*(jingu|shrine)/i, "Meiji Shrine"],
    [/shibuya\s*crossing/i, "Shibuya Crossing"],
    [/tour\s*de\s*tokyo/i, "Tokyo Tower"],
    [/palais\s*imp[eé]rial.*tokyo/i, "Tokyo Imperial Palace"],
    [/op[eé]ra\s*de\s*sydney/i, "Sydney Opera House"],
    [/machu\s*picchu/i, "Machu Picchu"],
    [/christ\s*(r[eé]dempteur|the\s*redeemer)/i, "Christ the Redeemer (statue)"],
    [/taj\s*mahal/i, "Taj Mahal"],
    [/grande\s*muraille/i, "Great Wall of China"],
    [/cit[eé]\s*interdite/i, "Forbidden City"],
    [/petra/i, "Petra"],
    [/acropole/i, "Acropolis of Athens"],
    [/parth[eé]non/i, "Parthenon"],
    [/tour\s*de\s*b[eé]l[eé]m/i, "Belém Tower"],
    [/monast[eè]re\s*des\s*j[eé]r[oó]nimos/i, "Jerónimos Monastery"],
    [/porte\s*de\s*brandebourg/i, "Brandenburg Gate"],
    [/brandenburger\s*tor/i, "Brandenburg Gate"],
    [/alexanderplatz/i, "Alexanderplatz"],
    [/fernsehturm/i, "Fernsehturm Berlin"],
    [/mur\s*d[eu]\s*berlin/i, "Berlin Wall"],
    [/east\s*side\s*gallery/i, "East Side Gallery"],
    [/m[eé]morial\s*de\s*l['']?holocauste/i, "Memorial to the Murdered Jews of Europe"],
    [/mus[eé]+e?\s*de\s*pergame/i, "Pergamon Museum"],
    [/pergamonmuseum/i, "Pergamon Museum"],
    [/checkpoint\s*charlie/i, "Checkpoint Charlie"],
    [/[iî]le\s*aux?\s*mus[eé]+e?s/i, "Museum Island"],
    [/reichstag/i, "Reichstag building"],
    [/tiergarten/i, "Tiergarten"],
    [/potsdamer\s*platz/i, "Potsdamer Platz"],
    [/cath[eé]drale\s*de\s*berlin/i, "Berlin Cathedral"],
    [/berliner\s*dom/i, "Berlin Cathedral"],
    [/château\s*de\s*charlottenburg/i, "Charlottenburg Palace"],
    [/mus[eé]+e?\s*juif\s*de\s*berlin/i, "Jewish Museum Berlin"],
    [/colonne\s*de\s*la\s*victoire/i, "Berlin Victory Column"],
    [/porte\s*d['']?ishtar/i, "Ishtar Gate"],
    [/unter\s*den\s*linden/i, "Unter den Linden"],
    [/kurf[uü]rstendamm/i, "Kurfürstendamm"],
    [/jardin\s*majorelle/i, "Majorelle Garden"],
    [/m[eé]dersa\s*ben\s*youssef/i, "Ben Youssef Madrasa"],
    [/tombeaux?\s*saadiens/i, "Saadian Tombs"],
    [/palais\s*bahia/i, "Bahia Palace"],
    [/palais\s*el\s*badi/i, "El Badi Palace"],
    [/kasbah\s*des\s*oudayas/i, "Kasbah of the Udayas"],
    [/pyramides?\s*de\s*gizeh/i, "Giza pyramid complex"],
    [/sphinx\s*de\s*gizeh/i, "Great Sphinx of Giza"],
    [/mus[eé]+e?\s*[eé]gyptien/i, "Egyptian Museum"],
    [/khan\s*el[\s-]*khalili/i, "Khan el-Khalili"],
    [/mosqu[eé]+e?\s*mohammed\s*ali/i, "Mosque of Muhammad Ali"],
  ];
  for (const [re, en] of MAP) {
    if (re.test(s) || re.test(lower)) push(en);
  }
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

/**
 * Recherche directe d'image Wikipedia pour un lieu nommé via l'API pageimages.
 * Plus rapide que la chaîne complète (un seul appel réseau par tentative).
 */
async function fetchWikiDirectPlaceImage(placeName, cityName, uiLang) {
  const place = String(placeName || "").trim();
  if (!place) return "";
  const city = String(cityName || "").trim();
  const wikiLang = WIKI_LANG_CODES[String(uiLang || "fr").toLowerCase()] || "fr";
  const langsTry = [wikiLang, "en", "fr"].filter((l, i, arr) => arr.indexOf(l) === i);
  const titles = [];
  const addT = (t) => { const s = String(t || "").trim(); if (s && !titles.includes(s)) titles.push(s); };
  const segments = expandMustSeePlaceSegments(place);
  for (const seg of segments) {
    addT(seg);
    if (city) addT(`${seg} (${city})`);
  }
  for (const alias of enWikipediaAliasTitles(place)) {
    addT(alias);
    if (city) addT(`${alias} (${city})`);
  }
  const stripped = place.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*[\u2014\u2013]\s*.+$/, "").trim();
  if (stripped && stripped !== place) addT(stripped);
  const jobs = [];
  for (const lang of langsTry) {
    for (let i = 0; i < titles.length; i++) {
      jobs.push({ lang, title: titles[i], rank: i });
    }
  }
  const results = await Promise.all(
    jobs.map(async ({ lang, title, rank }) => {
      try {
        const api = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&origin=*&pithumbsize=1920&redirects=1`;
        const r = await fetch(api);
        if (!r.ok) return null;
        const j = await r.json();
        const page = Object.values(j?.query?.pages || {})[0];
        if (!page || page.missing === true) return null;
        const tw = Number(page.thumbnail?.width || 0);
        const th = Number(page.thumbnail?.height || 0);
        const src = String(page.thumbnail?.source || "").trim();
        if (!src) return null;
        const img = upgradeLandscapeImageUrl(src);
        if (!img || isLikelyWikiBrandOrLogoImage(img, title)) return null;
        const isPortrait = tw > 0 && th > 0 && th > tw * 1.15;
        return { img, isPortrait, lang, title, rank };
      } catch { return null; }
    })
  );
  const valid = results.filter(Boolean);
  valid.sort((a, b) => a.rank - b.rank || (a.isPortrait ? 1 : 0) - (b.isPortrait ? 1 : 0));
  const best = valid[0];
  return best ? best.img : "";
}
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
  return `v5\x1e${String(rawName || "").trim()}\x1e${String(city || "").trim().toLowerCase()}\x1e${L}`;
}

function readMustSeePlaceModalCache(rawName, city, lang) {
  const k = mustSeePlaceModalCacheKey(rawName, city, lang);
  const row = _MUST_SEE_MODAL_CACHE.get(k);
  if (!row || Date.now() - row.ts > _MUST_SEE_MODAL_CACHE_TTL_MS) {
    if (row) _MUST_SEE_MODAL_CACHE.delete(k);
    return null;
  }
  if (!row.imageUrl) return null;
  return row;
}

function writeMustSeePlaceModalCache(rawName, city, lang, extract, imageUrl) {
  const img = String(imageUrl || "").trim();
  if (!img) return;
  const k = mustSeePlaceModalCacheKey(rawName, city, lang);
  if (_MUST_SEE_MODAL_CACHE.size >= _MUST_SEE_MODAL_CACHE_MAX) {
    const first = _MUST_SEE_MODAL_CACHE.keys().next().value;
    if (first) _MUST_SEE_MODAL_CACHE.delete(first);
  }
  _MUST_SEE_MODAL_CACHE.set(k, {
    extract: String(extract || ""),
    imageUrl: img,
    ts: Date.now(),
  });
}

/**
 * Les extraits Wikipédia listent souvent des lieux (ex. villages) un par ligne.
 * On les regroupe en flux continu avec des virgules ; les vrais paragraphes (\n\n) sont conservés.
 */
function formatWikiExtractCommaStyleParagraphs(raw) {
  const s = String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!s) return s;
  return s
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length <= 1) return lines[0] || "";
      return lines.join(", ");
    })
    .filter(Boolean)
    .join("\n\n");
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

// ─── Foursquare Places — palier prix API (1–4) → € indicatif / pers. repas ─────
function fsqPriceTierToIndicativeEur(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 1) return null;
  const tier = Math.min(4, Math.max(1, Math.floor(p)));
  const map = { 1: 15, 2: 28, 3: 45, 4: 75 };
  return map[tier] ?? null;
}

function fsqRestaurantCostNote(eur, lang) {
  const n = Math.round(Number(eur) || 0);
  const code = String(lang || "fr").toLowerCase().split("-")[0];
  if (code === "en") return `≈${n}€/person (indicative — Foursquare price tier)`;
  if (code === "de") return `≈${n}€/Pers. (Richtwert — Foursquare-Preisstufe)`;
  if (code === "es") return `≈${n}€/pers. (orientativo — nivel Foursquare)`;
  if (code === "it") return `≈${n}€/pers. (indicativo — fascia prezzo Foursquare)`;
  if (code === "zh") return `约${n}欧元/人（参考价，Foursquare价位）`;
  return `≈${n}€/pers. (indicatif — palier Foursquare)`;
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
async function fetchFoursquarePlaces(lat, lon, uiLang = "fr") {
  const locale = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  try {
    const resp = await fetch("/api/foursquare/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, limit: 20, locale }),
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
 * Lieux nommés via OpenStreetMap (Overpass), sans clé — repli si Foursquare vide.
 */
async function fetchOsmLandmarkNames(lat, lon, cityHint = "", uiLang = "fr") {
  const locale = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  try {
    const resp = await fetch("/api/osm/landmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lon,
        radius: 11000,
        cityHint: String(cityHint || "").trim(),
        locale,
      }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json?.ok || !Array.isArray(json.names)) return [];
    return json.names.map((x) => String(x || "").trim()).filter(Boolean);
  } catch (_e) {
    return [];
  }
}

/**
 * Restaurants réels (catégorie Dining & Drinking) — noms Foursquare + € indicatif
 * (palier `price` 1–4 ou repli heuristique catégories).
 */
async function fetchFoursquareRestaurantActivities(lat, lon, uiLang = "fr") {
  const locale = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  try {
    const resp = await fetch("/api/foursquare/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, limit: 36, preset: "restaurants", locale }),
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json.ok || !Array.isArray(json.results)) return [];

    const seen = new Set();
    const dining = json.results.filter((r) => {
      const name = String(r?.name || "").trim();
      if (name.length < 2) return false;
      const k = name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      const cats = (r.categories || []).map((c) => String(c?.name || "").toLowerCase()).join(" ");
      if (
        /hotel|hostel|motel|resort|gas station|parking|pharmacy|supermarket|grocery/i.test(
          `${name} ${cats}`
        )
      ) {
        return false;
      }
      return true;
    });

    return dining.slice(0, 6).map((r) => {
      const tierEur = fsqPriceTierToIndicativeEur(r.price);
      const fallbackEur = fsqEstimateCost(r.categories);
      const eur = tierEur != null ? tierEur : fallbackEur;
      const loc = r?.location || {};
      const locality = String(loc.locality || loc.region || "").trim();
      const neighborhood = String(loc.neighborhood || loc.sublocality || "").trim();
      const location = [neighborhood, locality].filter(Boolean).join(", ") || "";
      const catLabel = String(r.categories?.[0]?.name || "").trim();
      return {
        title: String(r.name),
        estimatedCostEur: eur,
        costNote: fsqRestaurantCostNote(eur, uiLang),
        location,
        description: catLabel ? `${catLabel}.` : "",
      };
    });
  } catch (_e) {
    return [];
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

/** Phrase de repli quand aucune source wiki / Groq n’est disponible (évite l’affichage vide en fin de chargement). */
function genericDestinationDescriptionFallback(safeCity) {
  const c = String(safeCity || "").trim() || "Ville";
  return `${c} est une destination populaire avec une forte identite culturelle, de nombreux quartiers a explorer et une scene locale dynamique.`;
}

/**
 * Priorité Groq → Wikivoyage / Wikipédia (tronqué) → repli générique seulement si demandé.
 * `useGenericFallback: false` pour le premier rendu réseau (pas de flash « trop général » avant les sources).
 */
function composeDestinationGuideDescription(
  groqDesc,
  wikivoyageText,
  summaryText,
  safeCity,
  { useGenericFallback = false } = {}
) {
  const groq = String(groqDesc || "").trim();
  if (groq) return groq;
  const wiki = String(wikivoyageText || "").trim();
  const summ = String(summaryText || "").trim();
  const fromWiki = truncateDescription(wiki || summ || "");
  if (fromWiki) return fromWiki;
  if (useGenericFallback) return truncateDescription(genericDestinationDescriptionFallback(safeCity));
  return "";
}

const _nominatimGeoInflight = Object.create(null);

/** Géocode ville (léger) — partagé par le guide complet et l’aperçu mini-carte immédiat (requêtes en cours dédupliquées). */
async function fetchNominatimCityGeo(safeCity, acceptLanguage = "fr") {
  const q = String(safeCity || "").trim();
  if (q.length < 2) return { lat: NaN, lon: NaN, country: "", countryCode: "", region: "" };
  const lang = String(acceptLanguage || "fr").toLowerCase().split("-")[0] || "fr";
  const k = `${normalizeTextForSearch(q)}\x1e${lang}`;
  const inflight = _nominatimGeoInflight[k];
  if (inflight) return inflight;

  const run = (async () => {
    try {
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=${encodeURIComponent(
          lang
        )}&q=${encodeURIComponent(q)}`
      );
      if (!geoResp.ok) return { lat: NaN, lon: NaN, country: "", countryCode: "", region: "" };
      const geoJsonRaw = await geoResp.json();
      const first = Array.isArray(geoJsonRaw) && geoJsonRaw.length > 0 ? geoJsonRaw[0] : null;
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

  _nominatimGeoInflight[k] = run;
  run.finally(() => {
    if (_nominatimGeoInflight[k] === run) delete _nominatimGeoInflight[k];
  });
  return run;
}

async function fetchDestinationGuide(city, uiLanguage = "fr") {
  const cityStem = extractCityPrompt(city) || String(city || "").trim();
  if (cityStem.length < 2) return null;
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return null;
  const imageCtx = String(city || "").trim();

  const wikiSummaryP = fetchWikiSummaryForLang(safeCity, uiLanguage);
  // Wikivoyage : description orientée voyage (prioritaire sur Wikipedia si disponible)
  const wikivoyageP = fetchWikivoyageSummaryText(safeCity, uiLanguage);
  // Groq : description courte + engageante (2 phrases style magazine) — lancée en parallèle
  const groqDescP = fetchGroqCityDescription(safeCity, uiLanguage);

  /** Pas de titres Wikipédia bruts comme « lieux » (homonymes / hors sujet). Lieux = répertoire emblématique + repli exploration ; enrichissement IA optionnel via VITE_GEMINI_DESTINATION_ENRICH. */
  const wikiPlaceTitlesP = Promise.resolve([]);

  const nominatimP = fetchNominatimCityGeo(safeCity, uiLanguage);

  /** Image persistante d’abord : évite un nouvel Unsplash à chaque chargement (stabilité + moins d’API). */
  const cachedCityImage = await getCachedCityImage(imageCtx);
  const cachedUsableEarly = !!(cachedCityImage && !isLikelyWikiFlagOrSealThumb(cachedCityImage));

  const earlyCommonsList = getCityHeroImageCandidates(imageCtx);
  const earlyCommonsFirst =
    earlyCommonsList.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || earlyCommonsList[0] || "";
  const hasCuratedCommonsHero = !!String(earlyCommonsFirst || "").trim();

  const wikiHeroUrlsP = fetchWikipediaHeroImageUrls(safeCity);
  /** Pas d’appel Unsplash si le catalogue Commons a déjà une vue lieu (évite de polluer le cache avant le guide). */
  const unsplashHeroP =
    cachedUsableEarly || !UNSPLASH_ACCESS_KEY || hasCuratedCommonsHero
      ? Promise.resolve("")
      : (async () => {
    const u = await getCityHeroImage(imageCtx);
    return u ? upgradeLandscapeImageUrl(String(u)) : "";
  })();

  const [summaryPack, wikivoyageText, groqDesc, , geoPack, wikiHeroUrls, unsplashHero] = await Promise.all([
    wikiSummaryP,
    wikivoyageP,
    groqDescP,
    wikiPlaceTitlesP,
    nominatimP,
    wikiHeroUrlsP,
    unsplashHeroP,
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

  // Foursquare + OSM en parallèle : OSM fournit name:xx (langue UI) quand le tag existe — complète / corrige les noms Foursquare.
  const wikiGeoP =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchWikipediaGeoNearbyPlaceTitles(latitude, longitude, uiLanguage, safeCity)
      : Promise.resolve([]);

  const [otmData, restaurantActs, osmLandmarkNames, wikiGeoTitles] = await Promise.all([
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchFoursquarePlaces(latitude, longitude, uiLanguage)
      : Promise.resolve({ places: [], activities: [] }),
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchFoursquareRestaurantActivities(latitude, longitude, uiLanguage)
      : Promise.resolve([]),
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchOsmLandmarkNames(latitude, longitude, safeCity, uiLanguage)
      : Promise.resolve([]),
    wikiGeoP,
  ]);
  const useFsqRestaurants = restaurantActs.length >= 4;

  const heroStem = heroImageStemFromDestination(imageCtx) || safeCity;
  const bundledUrl = getBundledCityHeroPath(heroStem);
  const storageMirrorUrl = getStorageMirrorHeroUrl(heroStem);
  const commonsCandidates = getCityHeroImageCandidates(imageCtx);
  const commonsFirst =
    commonsCandidates.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || commonsCandidates[0] || "";
  const wikiThumbRaw = String(summaryPack.thumb || "").trim();
  const wikiThumbUsable = !!(wikiThumbRaw && !isLikelyWikiFlagOrSealThumb(wikiThumbRaw));
  const cachedUsable = cachedUsableEarly;

  const wikiApiOrdered = wikiHeroUrls.filter((u) => u && !isLikelyWikiFlagOrSealThumb(u));
  const wikiApiPrimary = wikiApiOrdered[0] || wikiHeroUrls[0] || "";

  const unsplashUrl = String(unsplashHero || "").trim();

  /**
   * 1) Commons curés (cityWikimediaHeroes…) : prime sur le cache Unsplash / API pour éviter photos hors lieu.
   * 2) Sinon cache voyageur. 3) Sinon Unsplash puis autres sources.
   */
  let imageUrl = "";
  let landscapeImageUrl = "";
  if (commonsFirst) {
    imageUrl = upgradeLandscapeImageUrl(commonsFirst);
    landscapeImageUrl = imageUrl;
  } else if (cachedUsable) {
    imageUrl = upgradeLandscapeImageUrl(cachedCityImage);
    landscapeImageUrl = imageUrl;
  } else {
    imageUrl =
      unsplashUrl ||
      bundledUrl ||
      storageMirrorUrl ||
      wikiApiPrimary ||
      (wikiThumbUsable ? wikiThumbRaw : "") ||
      "";
    if (imageUrl) {
      imageUrl = upgradeLandscapeImageUrl(imageUrl);
      landscapeImageUrl = imageUrl;
    }
  }

  if (imageUrl) {
    const prevCached = cachedUsableEarly ? upgradeLandscapeImageUrl(cachedCityImage) : "";
    const shouldPersist = !cachedUsableEarly || (commonsFirst && prevCached !== imageUrl);
    if (shouldPersist) {
      try {
        await persistCityImage(imageCtx, imageUrl);
      } catch (_e) {
        // ignore persistence errors
      }
    }
  }

  const heroImageCandidates = dedupeImageUrlChain([
    ...(imageUrl ? [imageUrl] : []),
    ...commonsCandidates,
    ...(unsplashUrl ? [unsplashUrl] : []),
    bundledUrl,
    storageMirrorUrl,
    ...wikiHeroUrls,
    ...(wikiThumbUsable ? [wikiThumbRaw] : []),
    ...(cachedUsable && !commonsFirst ? [cachedCityImage] : []),
  ]).map((u) => upgradeLandscapeImageUrl(String(u || "")));

  let mergedFromApis = mergePlaceCandidates(osmLandmarkNames, wikiGeoTitles, otmData.places, 22);
  if (
    mergedFromApis.length === 0 &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    const nomi = await fetchNominatimLandmarkHints(safeCity, uiLanguage, latitude, longitude);
    mergedFromApis = mergePlaceCandidates(nomi, [], [], 22);
  }
  /** Pas de pastilles « exploration » génériques ; repli = catalogue emblématique ou vide. */
  const rawPlacesList =
    mergedFromApis.length > 0 ? mergedFromApis : getIconicPlacesFallback(safeCity) || [];

  const placesForGuide = clampPlacesList(sanitizeMustSeePlaces(rawPlacesList, safeCity), safeCity, {
    min: 3,
    max: 7,
    padExploration: false,
  });

  const tips = buildTravelTips(safeCity, placesForGuide, uiLanguage);

  /** Restaurants Foursquare (noms exacts + € indicatif palier) si assez de résultats, sinon POI mixtes. */
  const suggestedActivitySourceRaw = useFsqRestaurants
    ? restaurantActs
    : otmData.activities.length > 0
      ? otmData.activities
      : osmLandmarkNames.length >= 4
        ? osmLandmarkNames.slice(0, 8).map((title) => ({
            title,
            estimatedCostEur: 0,
            costNote: "",
            location: safeCity,
          }))
        : buildSuggestedActivitiesForCity(safeCity);
  const suggestedActivitySource = applyLocalizedPlaceTitlesToActivities(
    suggestedActivitySourceRaw,
    placesForGuide
  );
  const suggestedActivityMin = useFsqRestaurants
    ? Math.min(6, restaurantActs.length)
    : MIN_SUGGESTED_ACTIVITIES;
  const suggestedActivities = ensureMinSuggestedActivities(
    suggestedActivitySource,
    safeCity,
    suggestedActivityMin,
    placesForGuide
  );

  const displayCountry = String(geoPack.country || "").trim();
  const displayRegion = String(geoPack.region || "").trim();
  const countryCodeNorm = String(geoPack.countryCode || "")
    .trim()
    .toLowerCase();
  const situationMap =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? await buildSituationMapForDestination(latitude, longitude, displayCountry, countryCodeNorm)
      : null;

  return {
    city: safeCity,
    description: composeDestinationGuideDescription(
      groqDesc,
      wikivoyageText,
      summaryPack.summaryText,
      safeCity,
      { useGenericFallback: true }
    ),
    places: placesForGuide,
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
    countryCode: countryCodeNorm || null,
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

const SUGGESTED_FILL_KEYS = [
  "suggestedFillHistoricCenter",
  "suggestedFillMainMuseum",
  "suggestedFillLandmark",
  "suggestedFillLocalMarket",
  "suggestedFillMainPark",
  "suggestedFillPicturesqueQuarter",
];

function translateDestinationField(key, uiLang, vars) {
  const code = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const order = [code, "en", DEFAULT_LOCALE];
  let template = "";
  for (const lc of order) {
    const v = translations[lc]?.destination?.[key];
    if (typeof v === "string" && v) {
      template = v;
      break;
    }
  }
  let s = template || "";
  if (vars && s) {
    Object.keys(vars).forEach((k) => {
      s = s.split(`{{${k}}}`).join(String(vars[k] ?? ""));
    });
  }
  return s;
}

/** Repli catalogue : titres générés en FR dans `buildSuggestedActivitiesForCity` → alignés sur la langue UI. */
function localizeGenericSuggestedActivities(rawList, cityHint, uiLang) {
  if (!Array.isArray(rawList) || rawList.length === 0) return rawList;
  const city = String(cityHint || "").trim();
  const label = (city || "la destination").trim();
  const code = String(uiLang || "fr").toLowerCase().split("-")[0].slice(0, 2) || "fr";
  const frByKey = Object.fromEntries(
    SUGGESTED_FILL_KEYS.map((k) => [k, translateDestinationField(k, "fr", { city: label }).trim()])
  );
  const frTitles = new Set(Object.values(frByKey));
  return rawList.map((raw) => {
    if (raw == null) return raw;
    if (typeof raw === "string") {
      const t0 = String(raw || "").trim();
      if (!frTitles.has(t0)) return raw;
      const hit = SUGGESTED_FILL_KEYS.find((k) => frByKey[k] === t0);
      return hit ? translateDestinationField(hit, code, { city: label }) : raw;
    }
    if (typeof raw === "object") {
      const title = String(raw.title ?? raw.name ?? raw.label ?? "").trim();
      if (!frTitles.has(title)) return raw;
      const hit = SUGGESTED_FILL_KEYS.find((k) => frByKey[k] === title);
      if (!hit) return raw;
      return { ...raw, title: translateDestinationField(hit, code, { city: label }) };
    }
    return raw;
  });
}

const MIN_SUGGESTED_ACTIVITIES = 6;

/**
 * Complète jusqu’à `min` activités : d’abord les lieux réels du guide, puis le catalogue par ville, puis le repli générique.
 */
function ensureMinSuggestedActivities(
  rawList,
  cityHint,
  min = MIN_SUGGESTED_ACTIVITIES,
  placeTitlesHint = null
) {
  const city = String(cityHint || "").trim();
  const normalized = normalizeSuggestedActivitiesList(rawList, city);
  if (normalized.length >= min) return normalized;
  const seen = new Set(normalized.map((x) => normalizeTextForSearch(String(x.title || ""))));
  const out = [...normalized];
  const fromPlaces = normalizeSuggestedActivitiesList(
    buildSuggestedActivitiesFromDistinctPlaces(placeTitlesHint, city),
    city
  );
  for (const f of fromPlaces) {
    if (out.length >= min) break;
    const k = normalizeTextForSearch(String(f.title || ""));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  if (out.length >= min) return out;
  const fillers = normalizeSuggestedActivitiesList(buildSuggestedActivitiesForCity(city), city);
  for (const f of fillers) {
    if (out.length >= min) break;
    const k = normalizeTextForSearch(String(f.title || ""));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
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

function mergeDestinationGuideWithGemini(baseGuide, geminiNorm, uiLanguage = "fr") {
  if (!baseGuide) return null;
  const city = String(baseGuide.city || "");
  if (!geminiNorm) {
    return {
      ...baseGuide,
      places: clampPlacesList(baseGuide.places, city),
      suggestedActivities: ensureMinSuggestedActivities(
        baseGuide.suggestedActivities,
        city,
        MIN_SUGGESTED_ACTIVITIES,
        baseGuide.places
      ),
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
      do: mergeTipsDoFromGemini(baseGuide.tips?.do, geminiNorm.tips.do, city, uiLanguage),
      dont: geminiNorm.tips.dont.length > 0 ? geminiNorm.tips.dont : baseGuide.tips?.dont || [],
    },
    suggestedActivities: ensureMinSuggestedActivities(
      geminiNorm.suggestedActivities.length > 0
        ? geminiNorm.suggestedActivities
        : baseGuide.suggestedActivities,
      city,
      MIN_SUGGESTED_ACTIVITIES,
      clampPlacesList(mergedPlaces, city, { min: 3, max: 7, padExploration: false })
    ),
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
  const preferDaylight = options.preferDaylight !== false;
  const perPageDefault = preferDaylight ? 15 : 30;
  const perPage = Math.min(30, Math.max(1, Number(options.perPage) || perPageDefault));
  const userPreferred = Array.isArray(options.preferredKeywords)
    ? options.preferredKeywords.map((k) => normalizeTextForSearch(k))
    : [];
  const userAvoid = Array.isArray(options.avoidKeywords)
    ? options.avoidKeywords.map((k) => normalizeTextForSearch(k))
    : [];
  const daylightPreferred = preferDaylight
    ? [
        "daylight",
        "daytime",
        "day time",
        "sunny",
        "sunshine",
        "morning",
        "afternoon",
        "golden hour",
        "warm sunlight",
        "bright day",
        "bright",
        "natural light",
      ].map((k) => normalizeTextForSearch(k))
    : [];
  const nightAvoid = preferDaylight
    ? [
        "night",
        "nighttime",
        "at night",
        "midnight",
        "neon",
        "astrophotography",
        "milky way",
        "long exposure",
        "after dark",
        "city lights",
        "dusk",
        "twilight",
      ].map((k) => normalizeTextForSearch(k))
    : [];
  const preferredKeywords = [...daylightPreferred, ...userPreferred];
  const avoidKeywords = [...nightAvoid, ...userAvoid];
  const cityBoost = Array.isArray(options.cityBoostTokens)
    ? options.cityBoostTokens.map((t) => normalizeTextForSearch(t)).filter(Boolean)
    : [];
  const landmarkDescBoost = Array.isArray(options.landmarkDescBoostTokens)
    ? options.landmarkDescBoostTokens.map((t) => normalizeTextForSearch(t)).filter(Boolean)
    : [];
  const placeRelevance = Array.isArray(options.placeRelevanceTokens)
    ? options.placeRelevanceTokens.map((t) => normalizeTextForSearch(t)).filter(Boolean)
    : [];
  const heroPenalizeSkyOnly = !!options.heroPenalizeSkyOnly;
  const closeupHints = [
    "close-up", "closeup", "close up", "macro", "detail",
    "plaque", "inscription", "engraving", "text", "lettering",
    "carving", "relief", "bronze plaque", "sign", "indoor",
    "interior", "floor", "ceiling", "narrow street", "alley",
    "back street", "wall", "lifeguard", "selfie", "portrait",
  ].map((k) => normalizeTextForSearch(k));
  const postcardSignals = [
    "panorama", "panoramic", "aerial", "drone", "skyline",
    "cityscape", "wide angle", "overview", "bird eye",
    "landmark", "famous", "iconic", "viewpoint", "lookout",
    "waterfront", "harbour", "harbor", "bay",
  ].map((k) => normalizeTextForSearch(k));
  const skyStrongHints = [
    "sunset sky", "sunrise sky", "dramatic sky", "colorful sky",
    "pink sky", "orange sky", "purple sky", "cloudscape",
    "storm clouds", "beautiful sky", "epic sky", "sky only",
    "fiery sky", "golden sky",
  ].map((k) => normalizeTextForSearch(k));
  const skyLightHints = [
    "sunset", "sunrise", "afterglow", "twilight",
    "evening sky", "morning sky", "clouds",
    "overcast", "cloudy", "haze", "foggy", "misty",
    "grey sky", "gray sky", "blue sky",
  ].map((k) => normalizeTextForSearch(k));
  const structureHints = [
    "building", "architecture", "skyscraper", "skyline",
    "cityscape", "facade", "urban", "downtown", "monument",
    "museum", "cathedral", "church", "tower", "bridge",
    "plaza", "square", "statue", "historic", "palace",
    "stadium", "temple", "canal", "river", "waterfront",
    "panorama", "aerial", "beach", "coast",
    "mosque", "castle", "basilica", "dome", "minaret",
    "gate", "arch", "fountain", "pier", "promenade",
    "market", "bazaar", "gondola", "harbor", "harbour",
  ].map((k) => normalizeTextForSearch(k));
  try {
    const params = new URLSearchParams();
    params.set("query", q);
    params.set("orientation", "landscape");
    params.set("per_page", String(perPage));
    if (options.contentFilter === "high" || options.contentFilter === "low") {
      params.set("content_filter", options.contentFilter);
    }
    const url = `https://api.unsplash.com/search/photos?${params.toString()}`;
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
      const tagTitles = Array.isArray(item?.tags)
        ? item.tags.map((t) => normalizeTextForSearch(t?.title || "")).filter(Boolean)
        : [];
      const tagText = tagTitles.join(" ");
      const desc = normalizeTextForSearch(
        `${item?.description || ""} ${item?.alt_description || ""} ${tagText}`
      );

      const w = Number(item?.width || 0);
      const h = Number(item?.height || 1);
      const ratio = w / h;

      let ratioBonus = 0;
      if (ratio >= 1.8) ratioBonus = 80;
      else if (ratio >= 1.5) ratioBonus = 50;
      else if (ratio >= 1.3) ratioBonus = 20;
      else if (ratio < 1.1) ratioBonus = -120;

      let resolutionBonus = 0;
      if (w >= 5000) resolutionBonus = 50;
      else if (w >= 4000) resolutionBonus = 35;
      else if (w >= 3000) resolutionBonus = 20;
      else if (w < 1600) resolutionBonus = -40;

      const postcardBoost = postcardSignals.reduce(
        (acc, kw) => (kw && desc.includes(kw) ? acc + 55 : acc), 0
      );

      const keywordBoost = preferredKeywords.reduce(
        (acc, kw) => (kw && desc.includes(kw) ? acc + 25 : acc), 0
      );
      const avoidPenalty = avoidKeywords.reduce(
        (acc, kw) => (kw && desc.includes(kw) ? acc + 40 : acc), 0
      );
      const cityBoostScore = cityBoost.reduce(
        (acc, tok) => (tok && desc.includes(tok) ? acc + 80 : acc), 0
      );
      const landmarkBoostScore = landmarkDescBoost.reduce(
        (acc, tok) => (tok && desc.includes(tok) ? acc + 90 : acc), 0
      );

      let closeupPenalty = 0;
      const closeupHits = closeupHints.filter((kw) => kw && desc.includes(kw)).length;
      if (closeupHits >= 3) closeupPenalty = 500;
      else if (closeupHits >= 2) closeupPenalty = 300;
      else if (closeupHits >= 1) closeupPenalty = 150;

      let skyOnlyPenalty = 0;
      if (heroPenalizeSkyOnly) {
        const structHits = structureHints.filter((kw) => kw && desc.includes(kw)).length;
        const strong = skyStrongHints.filter((kw) => kw && desc.includes(kw)).length;
        const light = skyLightHints.filter((kw) => kw && desc.includes(kw)).length;
        const skyTotal = strong + light;
        if (structHits === 0) {
          if (strong >= 1) skyOnlyPenalty = 300;
          else if (light >= 2) skyOnlyPenalty = 200;
          else if (light >= 1) skyOnlyPenalty = 100;
        } else if (skyTotal > structHits) {
          skyOnlyPenalty = Math.min(200, (skyTotal - structHits) * 80);
        }
        if (desc.includes("cloud") && !desc.includes("panorama") && !desc.includes("aerial") && structHits <= 1) {
          skyOnlyPenalty += 100;
        }
      }

      let bwPenalty = 0;
      const photoColor = String(item?.color || "").toLowerCase();
      if (photoColor) {
        const hex = photoColor.replace("#", "");
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
          if (saturation < 0.08) bwPenalty = 500;
          else if (saturation < 0.15) bwPenalty = 200;
          const brightness = (r + g + b) / 3;
          if (brightness < 50) bwPenalty += 150;
        }
      }
      const bwDescHits = ["black and white", "black white", "monochrome", "grayscale", "greyscale", "bw", "noir"].filter(
        (kw) => desc.includes(kw)
      ).length;
      if (bwDescHits > 0) bwPenalty += 300;

      let placeRelevanceScore = 0;
      if (placeRelevance.length > 0) {
        const hits = placeRelevance.filter((tok) => desc.includes(tok)).length;
        if (hits === 0) placeRelevanceScore = -200;
        else placeRelevanceScore = hits * 60;
      }

      const likes = Number(item?.likes || 0);
      const qualityBoost = Math.min(60, Math.round(likes / 10));

      const firstBias = pickFirst ? Math.max(0, 20 - index * 2) : 0;

      const score =
        postcardBoost +
        keywordBoost +
        qualityBoost +
        firstBias +
        cityBoostScore +
        landmarkBoostScore +
        placeRelevanceScore +
        ratioBonus +
        resolutionBonus -
        avoidPenalty -
        skyOnlyPenalty -
        closeupPenalty -
        bwPenalty;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const picked = scored[0]?.item || results[0];
    const rawU = picked?.urls?.raw;
    const fullU = picked?.urls?.full;
    const regU = picked?.urls?.regular;
    let out = "";
    if (rawU && String(rawU).includes("images.unsplash.com")) {
      out = String(rawU);
      out += out.includes("?") ? "&" : "?";
      out += "w=1600&fit=max&q=80&auto=format";
    } else {
      out = String(fullU || regU || "");
    }
    return out ? upgradeLandscapeImageUrl(out) : "";
  } catch (_e) {
    return "";
  }
}

/**
 * Première image du guide : Commons curé (catalogue) → cache → Unsplash → Wikimedia / bundle.
 * Aligné sur `fetchDestinationGuide` pour ne pas enregistrer un Unsplash hors lieu avant le guide.
 */
async function resolveDestinationHeroFirstPaint(cityRaw) {
  const cityStem = heroImageStemFromDestination(cityRaw) || extractCityPrompt(cityRaw) || String(cityRaw || "").trim();
  if (cityStem.length < 2) return "";
  const safeCity = resolveCanonicalCity(cityStem);
  if (!safeCity || String(safeCity).trim().length < 2) return "";

  const curatedLists = getCityHeroImageCandidates(cityRaw);
  const curatedFirst =
    curatedLists.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || curatedLists[0] || "";
  if (curatedFirst) {
    const up = upgradeLandscapeImageUrl(String(curatedFirst));
    try {
      await persistCityImage(cityRaw, up);
    } catch (_e) {
      /* ignore */
    }
    return up;
  }

  const cacheKey = getCityImageCacheKey(cityRaw);
  const mem = cacheKey && cityImageMemoryCache[cacheKey] ? String(cityImageMemoryCache[cacheKey]) : "";
  if (mem && !isLikelyWikiFlagOrSealThumb(mem)) {
    return upgradeLandscapeImageUrl(mem);
  }

  const persisted = await getCachedCityImage(cityRaw);
  if (persisted && !isLikelyWikiFlagOrSealThumb(persisted)) {
    return upgradeLandscapeImageUrl(persisted);
  }

  if (UNSPLASH_ACCESS_KEY) {
    const u = await getCityHeroImage(cityRaw);
    if (u) {
      const up = upgradeLandscapeImageUrl(String(u));
      try {
        await persistCityImage(cityRaw, up);
      } catch (_e) {
        /* ignore */
      }
      return up;
    }
  }

  const wiki = buildCityImageUrl(cityRaw);
  return wiki ? upgradeLandscapeImageUrl(wiki) : "";
}

/**
 * Unsplash : requête « photographe d’architecture » (rue, monument, golden hour) + API landscape / high / per_page=1.
 * @param {string} cityInput — « Ville » ou « Ville, Pays » (pour overrides monument + kind côtier).
 */
async function getCityHeroImage(cityInput) {
  const raw = String(cityInput || "").trim();
  if (!raw || !UNSPLASH_ACCESS_KEY) return "";
  const stem = heroImageStemFromDestination(raw);
  const q = buildCityHeroUnsplashQuery(stem);
  if (!q) return "";
  const cityTok = normalizeCityDroneKey(stem).split(/\s+/).filter((t) => t.length > 2);
  const landmarkDescBoostTokens = getHeroUnsplashDescBoostTokens(stem).map((t) => normalizeTextForSearch(t));
  const isCoastal = inferAestheticCityQueryType(raw) === AESTHETIC_CITY_QUERY_TYPE.COASTAL;
  const preferredKeywords = isCoastal
    ? [
        "beach", "turquoise", "ocean", "sea", "coast", "tropical",
        "paradise", "island", "sand", "crystal clear", "lagoon",
        "travel", "tourism", "destination", "visit",
        "panorama", "panoramic", "aerial", "drone", "wide angle",
        "waterfront", "bay", "sunset", "daylight", "golden hour",
      ]
    : [
        "travel", "tourism", "destination", "visit",
        "architecture", "landmark", "monument", "cathedral",
        "cityscape", "skyline", "downtown", "waterfront",
        "panorama", "panoramic", "aerial", "drone", "wide angle",
        "overview", "bird eye", "viewpoint",
        "harbor", "harbour", "bay", "river", "canal",
        "daylight", "golden hour",
      ];
  return fetchUnsplashImageByQuery(q, {
    pickFirst: true,
    perPage: 30,
    contentFilter: "high",
    heroPenalizeSkyOnly: true,
    landmarkDescBoostTokens,
    preferredKeywords,
    avoidKeywords: [
      "logo", "icon", "drawing", "illustration", "map", "diagram",
      "macro", "close-up", "closeup", "close up", "detail", "texture",
      "bokeh", "abstract", "pattern", "fabric", "skin",
      "portrait", "selfie", "wedding", "food", "coffee", "pet",
      "flower", "leaf", "forest", "woodland", "mountain trail",
      "plaque", "inscription", "engraving", "sign", "text", "lettering",
      "carving", "relief", "bronze",
      "interior", "indoor", "floor", "ceiling", "tile", "mosaic detail",
      "lifeguard", "graffiti", "trash", "parking",
      "narrow street", "alley", "back street", "wall",
      "person", "couple", "group", "crowd",
      "black and white", "black white", "monochrome", "grayscale", "greyscale",
      "noir et blanc", "noir blanc", "sepia", "desaturated", "bw photo",
      ...getUnsplashHeroConflictAvoidKeywords(stem),
    ],
    cityBoostTokens: [...cityTok, normalizeTextForSearch(stem).split(/\s+/)[0]].filter(Boolean),
  });
}

/**
 * Image Unsplash représentative pour une ville (délègue à `getCityHeroImage`).
 * @param {string} [cityType] — ignoré ; conservé pour compatibilité des appelants.
 */
async function getAestheticCityImage(cityName, cityType) {
  return getCityHeroImage(cityName);
}

async function fetchPlaceLandmarkImage(placeName, cityName) {
  if (!UNSPLASH_ACCESS_KEY) return "";
  const place = String(placeName || "").trim();
  const city = String(cityName || "").trim();
  if (!place) return "";
  const cleanPlace = place
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*[—–-]\s*.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const placeTokens = normalizeTextForSearch(cleanPlace)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "les", "des", "del", "der", "von", "de", "du", "la", "le", "di", "das"].includes(t));
  const queries = [
    `${cleanPlace} ${city} landmark`,
    `${cleanPlace} ${city}`,
    `${cleanPlace}`,
    city ? `${cleanPlace} ${city} travel` : `${cleanPlace} travel`,
  ];
  for (const q of queries) {
    try {
      const url = await fetchUnsplashImageByQuery(q, {
        pickFirst: true,
        perPage: 15,
        contentFilter: "high",
        preferDaylight: true,
        preferredKeywords: ["landmark", "monument", "travel", "tourism", "architecture", "nature", "beach", "park"],
        avoidKeywords: [
          "black and white", "black white", "monochrome", "grayscale", "greyscale",
          "sepia", "desaturated", "bw photo", "noir et blanc",
          "logo", "icon", "drawing", "illustration",
        ],
        placeRelevanceTokens: placeTokens,
      });
      if (url) return url;
    } catch { /* try next */ }
  }
  return "";
}

async function fetchActivityImageFromUnsplash(activityLike) {
  const query = buildActivityImageQuery(activityLike);
  if (!query) return "";
  return fetchUnsplashImageByQuery(`${query} travel activity`, {
    pickFirst: true,
    preferDaylight: false,
    preferredKeywords: ["activity", "person", "travel", "outdoor", "sport"],
    avoidKeywords: [
      "logo", "icon", "drawing", "illustration",
      "black and white", "black white", "monochrome", "grayscale", "greyscale",
      "sepia", "desaturated", "bw photo",
    ],
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

/** Filtre `.in("trip_id", …)` PostgREST : un id non-uuid fait échouer toute la requête. */
function isUuidLike(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
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

/** Voyage terminé : date de fin strictement avant aujourd'hui (AAAA-MM-JJ, calendrier local). */
function isTripPastByEndDate(trip) {
  const end = toYMDLoose(trip?.end_date);
  if (!end) return false;
  return end < getTodayStr();
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

/**
 * Erreur « vraie » table absente / cache PostgREST — pas une simple erreur de permission ou autre.
 * Évite de traiter p.ex. "permission denied for table trip_expenses" comme « exécute le script SQL ».
 */
function isTripExpensesSchemaMissingError(err) {
  const msg = [err?.message, err?.details, err?.hint].filter(Boolean).map(String).join("\n");
  const low = msg.toLowerCase();
  if (/permission denied|violates row-level security/i.test(low)) return false;
  const code = String(err?.code || "");
  const st = Number(err?.status ?? err?.statusCode);
  // PGRST204 = colonne absente du cache : ce n’est pas « la table n’existe pas » (évite faux bandeau SQL).
  if (code === "PGRST204") return false;
  if (/could not find the .*column/i.test(msg) || /column.*does not exist/i.test(low)) return false;
  if (code === "PGRST205" || code === "42P01") return true;
  if (st === 404 && /trip_expenses/i.test(msg)) return true;
  if (/could not find the table/i.test(msg)) return true;
  if (/does not exist/i.test(msg) && (/relation/i.test(msg) || /table/i.test(low))) return true;
  return false;
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
  const stem = heroImageStemFromDestination(c) || c;
  const curatedList = getCityHeroImageCandidates(c);
  const curatedFirst =
    curatedList.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || curatedList[0] || "";
  /** Même règle que le guide : Commons curé prime sur le cache (cartes voyage sinon figées sur une vieille Unsplash). */
  if (curatedFirst) {
    const up = upgradeLandscapeImageUrl(String(curatedFirst));
    const persistedHero = await getCachedCityImage(c);
    const prev = persistedHero ? upgradeLandscapeImageUrl(persistedHero) : "";
    if (!prev || prev !== up) {
      try {
        await persistCityImage(c, up);
      } catch (_e) {
        /* ignore */
      }
    }
    return up;
  }

  const persistedHero = await getCachedCityImage(c);
  if (persistedHero && !isLikelyWikiFlagOrSealThumb(persistedHero)) {
    return upgradeLandscapeImageUrl(persistedHero);
  }
  if (UNSPLASH_ACCESS_KEY) {
    const u = await getCityHeroImage(c);
    if (u) return upgradeLandscapeImageUrl(u);
  }
  const curated = resolveCityHeroImageUrl(stem);
  if (curated) return upgradeLandscapeImageUrl(curated);
  const bundled = getBundledCityHeroPath(stem);
  if (bundled) return bundled;
  const mirrored = getStorageMirrorHeroUrl(stem);
  if (mirrored) return mirrored;
  const wikiUrls = await fetchWikipediaHeroImageUrls(stem);
  const preferred = wikiUrls.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || wikiUrls[0] || "";
  if (preferred) return upgradeLandscapeImageUrl(preferred);
  const thumb = await fetchFrenchWikiSummaryThumb(stem);
  if (thumb && !isLikelyWikiFlagOrSealThumb(thumb)) return upgradeLandscapeImageUrl(thumb);
  return "";
}

/**
 * Si le catalogue a une image lieu pour ce libellé de voyage, elle remplace RAM / localStorage / Supabase
 * (sinon les cartes restent bloquées sur une ancienne URL Unsplash).
 */
async function syncTripCardHeroWithCuratedCatalog(cacheKey, localStorageKey, tripTitle, cachedUrl) {
  const list = getCityHeroImageCandidates(tripTitle);
  const first =
    list.find((u) => u && !isLikelyWikiFlagOrSealThumb(u)) || list[0] || "";
  if (!first) return cachedUrl ? upgradeLandscapeImageUrl(String(cachedUrl)) : "";
  const want = upgradeLandscapeImageUrl(String(first));
  const have = cachedUrl ? upgradeLandscapeImageUrl(String(cachedUrl).trim()) : "";
  if (have && have === want) return want;
  cityImageMemoryCache[cacheKey] = want;
  try {
    window.localStorage.setItem(localStorageKey, want);
  } catch (_e) {
    /* ignore */
  }
  try {
    await supabase.from("image_cache").upsert({ id: cacheKey, url: want }, { onConflict: "id" });
  } catch (_e) {
    /* ignore */
  }
  return want;
}

// Atomes UI
/** @param {{ title: string, frameClassName?: string }} props — `frameClassName` pour aligner le masque avec le parent (ex. shell chat `rounded-none`). */
function CityImage({ title, frameClassName = "rounded-[3rem]" }) {
  const { t } = useI18n();
  const prompt = resolveCanonicalCity(extractCityPrompt(title));
  const safeTitle = String(prompt || title || "voyage");
  const cacheKey = getCityImageCacheKey(title);

  const getInstantUrl = () => {
    if (cityImageMemoryCache[cacheKey]) return String(cityImageMemoryCache[cacheKey]);
    try {
      const ls = window.localStorage.getItem(`tp_city_img_${cacheKey}`);
      if (ls) { cityImageMemoryCache[cacheKey] = ls; return ls; }
    } catch (_e) { /* ignore */ }
    return buildCityImageUrl(title) || "";
  };

  const [resolvedUrl, setResolvedUrl] = useState(getInstantUrl);
  const [loadFailed, setLoadFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const cityImageElRef = useRef(null);

  const primarySrc = upgradeLandscapeImageUrl(
    String(resolvedUrl || buildCityImageUrl(title) || "").trim()
  );

  useEffect(() => {
    setLoadFailed(false);
    setImgLoaded(false);
    setResolvedUrl(getInstantUrl());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTitle, prompt]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const localStorageKey = `tp_city_img_${cacheKey}`;
      const fallbackCommons = buildCityImageUrl(title);

      if (!prompt) {
        if (!cancelled) setResolvedUrl("");
        return;
      }

      if (cityImageMemoryCache[cacheKey]) {
        const synced = await syncTripCardHeroWithCuratedCatalog(
          cacheKey,
          localStorageKey,
          title,
          cityImageMemoryCache[cacheKey]
        );
        if (!cancelled) setResolvedUrl(synced);
        return;
      }

      try {
        const persisted = window.localStorage.getItem(localStorageKey);
        if (persisted) {
          const synced = await syncTripCardHeroWithCuratedCatalog(cacheKey, localStorageKey, title, persisted);
          if (!cancelled) setResolvedUrl(synced);
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
          const synced = await syncTripCardHeroWithCuratedCatalog(cacheKey, localStorageKey, title, cachedUrl);
          if (!cancelled) setResolvedUrl(synced);
          return;
        }

        const fromWiki = await resolveStableCityImageForCard(title);
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

  const displaySrc = loadFailed ? "" : primarySrc;
  const dronePromptFr = buildCityDronePromptFR(prompt || safeTitle);

  const markCityImageLoaded = useCallback(() => {
    setImgLoaded(true);
  }, []);

  /** Nouvelle URL → réinitialiser avant peinture (évite overlay masqué alors que la nouvelle image charge). */
  useLayoutEffect(() => {
    setImgLoaded(false);
  }, [displaySrc]);

  const cityImageRef = useCallback(
    (node) => {
      cityImageElRef.current = node;
      if (!node) return;
      // Déjà en cache / décodée avant l’abonnement à onLoad : sinon le texte « Chargement… » reste affiché.
      if (node.complete && node.naturalWidth > 0) markCityImageLoaded();
    },
    [markCityImageLoaded]
  );

  /** onLoad React ne part pas toujours (cache agressif, decode async) : load natif + decode() + rAF. */
  useLayoutEffect(() => {
    const el = cityImageElRef.current;
    if (!el || loadFailed || !displaySrc) return;

    let cancelled = false;
    const mark = () => {
      if (!cancelled) markCityImageLoaded();
    };
    const tryDecode = () => {
      if (cancelled || !el.isConnected) return;
      if (el.complete && el.naturalWidth > 0) {
        mark();
        return;
      }
      const dec = el.decode && typeof el.decode === "function" ? el.decode() : null;
      if (dec && typeof dec.then === "function") {
        dec.then(mark).catch(() => {
          if (el.complete && el.naturalWidth > 0) mark();
        });
      }
    };

    tryDecode();
    el.addEventListener("load", mark, { passive: true });
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      tryDecode();
      raf2 = requestAnimationFrame(tryDecode);
    });
    const t = window.setTimeout(tryDecode, 80);

    return () => {
      cancelled = true;
      el.removeEventListener("load", mark);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, [displaySrc, loadFailed, markCityImageLoaded]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300 ${frameClassName}`.trim()}
    >
      {displaySrc ? (
        <img
          key={displaySrc}
          ref={cityImageRef}
          src={displaySrc}
          alt={`${safeTitle} — vue aérienne drone, photo de voyage`}
          title={dronePromptFr}
          className={`h-full w-full object-cover ${destinationGuideHeroObjectPositionClass(safeTitle)}`}
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          fetchpriority="high"
          onLoad={markCityImageLoaded}
          onError={() => {
            if (!loadFailed) setLoadFailed(true);
          }}
        />
      ) : null}
      {!imgLoaded && !loadFailed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-pulse text-xs font-medium text-slate-400/80">{t("common.imageLoading")}</span>
        </div>
      )}
    </div>
  );
}

/** Fond photo ville + flou très léger / verre (budget, chat, bandeau calendrier). */
function TripLiquidGlassShell({
  imageTitle,
  active = false,
  /** `high` : texte blanc lisible sur photos très claires (ex. cartes onglet Budget). */
  contrast = "standard",
  className = "",
  children,
}) {
  const high = contrast === "high";
  return (
    <div className={`relative isolate overflow-hidden ${className}`.trim()}>
      {/* Photo : coins carrés, le parent arrondi + overflow-hidden évite le halo gris (CityImage ne doit pas forcer rounded-[3rem] ici). */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          filter: high
            ? active
              ? "blur(0.7px) saturate(1.12) brightness(0.78)"
              : "blur(0.5px) saturate(1.1) brightness(0.82)"
            : active
              ? "blur(0.7px) saturate(1.28) brightness(0.93)"
              : "blur(0.5px) saturate(1.22) brightness(0.95)",
        }}
      >
        <CityImage title={String(imageTitle || "voyage")} frameClassName="rounded-none" />
      </div>

      {/* Voile : côté texte (gauche) plus dense en mode high pour le contraste */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: high
            ? active
              ? "linear-gradient(118deg, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.52) 46%, rgba(2,6,23,0.28) 100%)"
              : "linear-gradient(118deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.48) 48%, rgba(2,6,23,0.22) 100%)"
            : active
              ? "linear-gradient(160deg, rgba(2,6,23,0.24) 0%, rgba(2,6,23,0.38) 100%)"
              : "linear-gradient(160deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.32) 100%)",
        }}
      />

      {/* Reflet haut : atténué en high pour ne pas éclaircir le texte */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: high
            ? "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 36%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 28%, rgba(255,255,255,0) 62%)",
        }}
      />

      <div className="relative">{children}</div>
    </div>
  );
}

function JusttripBrand({ size = "md", className = "" }) {
  const { t } = useI18n();
  const h =
    {
      xs: "h-5 max-h-5",
      sm: "h-9 max-h-9 sm:h-10 sm:max-h-10",
      md: "h-11 max-h-11 sm:h-14 sm:max-h-14",
      lg: "h-14 max-h-14 sm:h-16 sm:max-h-16",
    }[size] || "h-11 max-h-11 sm:h-14 sm:max-h-14";
  return (
    <img
      src="/logo-justtrip.png"
      alt={t("auth.logoAlt")}
      className={`inline-block w-auto object-contain object-center ${h} ${className}`.trim()}
    />
  );
}

function TopNav({ onMenu, onAdd, title }) {
  return (
    <header className="sticky top-0 z-30 min-w-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px)+0.35rem)] pb-1 sm:px-5 sm:pb-0 sm:pt-[max(1rem,env(safe-area-inset-top,0px))]">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center justify-between gap-2 rounded-[2.25rem] bg-white/90 px-3 py-3 shadow-[0_16px_44px_rgba(30,58,95,0.09)] backdrop-blur-xl ring-1 ring-sky-100/55 sm:px-6 sm:py-4">
        <button
          type="button"
          onClick={onMenu}
          className="shrink-0 rounded-full p-2.5 text-slate-700 hover:bg-slate-100 sm:p-3"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1 px-1 text-center">
          <h1 className="truncate font-display text-sm font-normal tracking-[0.05em] text-slate-900 sm:text-base sm:tracking-[0.06em]">
            {String(title || "Mes Voyages")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onAdd}
          data-tour-id="plus-button"
          className="inline-flex shrink-0 items-center justify-center rounded-[2rem] px-3.5 py-2.5 text-white shadow-[0_2px_10px_rgba(15,23,42,0.14)] transition hover:brightness-110 active:scale-[0.97] sm:px-4 sm:py-3"
          style={{ backgroundColor: ACCENT }}
        >
          <Plus size={20} className="shrink-0" aria-hidden />
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

function MenuProfileAvatar({ user }) {
  const { t } = useI18n();
  const url = String(user?.user_metadata?.avatar_url || "").trim();
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [url]);
  if (!url || broken) {
    return (
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200/90 text-slate-500 shadow-inner ring-1 ring-slate-300/60"
        role="img"
        aria-label={t("menu.profileDefaultAvatarAria")}
      >
        <UserRound size={30} strokeWidth={1.75} aria-hidden />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={t("menu.profilePhotoAlt")}
      onError={() => setBroken(true)}
      className="h-16 w-16 shrink-0 rounded-full object-cover shadow-md ring-1 ring-slate-300/40"
    />
  );
}

function PrivacyPolicyLink({ className, onNavigate }) {
  const { t } = useI18n();
  return (
    <a
      href={PRIVACY_POLICY_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => onNavigate?.()}
    >
      {t("common.privacyPolicy")}
    </a>
  );
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
          <p className="text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("menu.title")}</p>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label={t("menu.closeMenu")}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex items-center gap-3.5">
            <MenuProfileAvatar user={user} />
            <p className="min-w-0 flex-1 text-base font-normal leading-snug tracking-[0.03em] text-slate-800 sm:text-[1.125rem]">
              {greetingName
                ? t("menu.greeting", { name: greetingName })
                : t("menu.greetingNoName")}
            </p>
          </div>
          <LanguageSelector className="pt-1" />
          <div className="pt-2">
            <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.28em] text-slate-500">
              {t("menu.navigation")}
            </p>
            <div className="space-y-2">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSwitchTab(item.id)}
                    className={`w-full rounded-2xl px-3 py-2 text-left text-sm font-normal tracking-[0.04em] transition ${
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
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal tracking-[0.03em] hover:bg-slate-100"
          >
            {t("menu.account")}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-normal tracking-[0.03em] hover:bg-slate-100"
          >
            {t("menu.signOut")}
          </button>
          {/* ── Aide ── */}
          <div className="mt-4 pt-4 border-t border-slate-200/70">
            <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.28em] text-slate-500">
              {t("menu.help")}
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onShowTour?.();
              }}
              className="w-full flex items-center gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-normal tracking-[0.03em] text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <span className="text-base leading-none">🧭</span>
              {t("menu.howItWorks")}
            </button>
            <PrivacyPolicyLink
              onNavigate={onClose}
              className="mt-2 flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-center text-xs font-normal tracking-[0.04em] text-slate-600 transition hover:bg-slate-50"
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Erreur GoTrue / Supabase : inscription avec un e-mail déjà enregistré. */
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

/** URL de retour après clic sur le lien « confirmer l’e-mail » (à autoriser dans Supabase → Auth → URL). */
function getAuthEmailRedirectTo() {
  try {
    return `${window.location.origin}${window.location.pathname}`;
  } catch (_e) {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
}

function AuthView() {
  const { t, language } = useI18n();
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
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

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
        // Avant signUp pour que SIGNED_IN (immédiat ou après confirmation e-mail) voie encore le marqueur.
        markSignupExpectsOnboarding(safeEmail);
        const emailRedirectTo = getAuthEmailRedirectTo();
        const { data: signupData, error } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            emailRedirectTo: emailRedirectTo || undefined,
            data: {
              first_name: safeFirstName,
              last_name: safeLastName,
              full_name: `${safeFirstName} ${safeLastName}`.trim(),
              avatar_url: avatarUrl || "",
              initials_avatar_bg: randomInitialsBgFromPalette(),
              locale: language,
            },
          },
        });
        if (error) {
          clearSignupOnboardingMarkers();
          throw error;
        }
        if (!signupData?.session) {
          setAwaitingEmailConfirm(true);
          setConfirmationEmail(safeEmail);
          setMsg(t("auth.confirmEmailSent"));
          setMode("signin");
          setPassword("");
        } else {
          setAwaitingEmailConfirm(false);
          setConfirmationEmail("");
          setMsg(t("auth.signupLoggedIn"));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: safeEmail,
          password: safePassword,
        });
        if (error) throw error;
        setAwaitingEmailConfirm(false);
        setConfirmationEmail("");
      }
    } catch (e) {
      if (mode === "signup") clearSignupOnboardingMarkers();
      if (mode === "signup" && isAuthSignupDuplicateEmailError(e)) {
        setEmailExistsModalOpen(true);
        setMsg("");
      } else {
        const code = String(e?.code || "");
        const raw = String(e?.message || "");
        const low = raw.toLowerCase();
        if (
          code === "email_not_confirmed" ||
          low.includes("email not confirmed") ||
          low.includes("not confirmed")
        ) {
          setAwaitingEmailConfirm(true);
          setConfirmationEmail(safeEmail);
          setMsg(t("auth.emailNotConfirmed"));
        } else if (low.includes("invalid login credentials")) {
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
      const emailRedirectTo = getAuthEmailRedirectTo();
      const { data: inviteSignupData, error } = await supabase.auth.signUp({
        email: safeInviteEmail,
        password: safePassword,
        options: {
          emailRedirectTo: emailRedirectTo || undefined,
          data: {
            first_name: safeFirst,
            last_name: safeLast,
            full_name: `${safeFirst} ${safeLast}`.trim(),
            invited_email: safeInviteEmail,
            invited_trip: String(inviteTripName || "").trim(),
            initials_avatar_bg: randomInitialsBgFromPalette(),
            locale: language,
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
      if (!inviteSignupData?.session) {
        setAwaitingEmailConfirm(true);
        setConfirmationEmail(safeInviteEmail);
        setMsg(t("auth.confirmEmailSent"));
        setMode("signin");
      } else {
        setAwaitingEmailConfirm(false);
        setConfirmationEmail("");
        setMsg(t("auth.signupLoggedIn"));
      }
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

  const resendConfirmationEmail = async () => {
    const em = String(confirmationEmail || email || "").trim();
    if (!em) {
      setMsg(t("auth.forgotNeedEmail"));
      return;
    }
    setResendLoading(true);
    try {
      const emailRedirectTo = getAuthEmailRedirectTo();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: em,
        options: emailRedirectTo ? { emailRedirectTo } : {},
      });
      if (error) throw error;
      setMsg(t("auth.confirmEmailResendSent"));
    } catch (e) {
      setMsg(String(e?.message || t("auth.confirmEmailResendErr")));
    } finally {
      setResendLoading(false);
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
            <div className="flex min-h-0 flex-1 flex-col items-center pt-6 sm:pt-10">
              <div className="flex shrink-0 flex-col items-center gap-0 leading-none">
                <div className="relative z-[2] flex shrink-0 justify-center pb-1 sm:pb-2">
                  <div
                    className="pointer-events-none absolute left-1/2 top-[45%] z-0 h-[min(72vw,14rem)] w-[min(72vw,14rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 blur-3xl sm:h-[17rem] sm:w-[17rem]"
                    aria-hidden
                  />
                  <img
                    src="/logo-justtrip.png"
                    alt={t("auth.logoAlt")}
                    width={320}
                    height={320}
                    decoding="async"
                    className="relative z-[1] block h-auto max-h-[min(52vh,15.5rem)] w-auto max-w-[min(92vw,20rem)] object-contain object-center align-top [filter:drop-shadow(0_0_14px_rgba(255,255,255,0.95))_drop-shadow(0_0_36px_rgba(255,255,255,0.55))_drop-shadow(0_2px_12px_rgba(0,0,0,0.35))] sm:max-h-[17.5rem] sm:max-w-[21rem] sm:[filter:drop-shadow(0_0_16px_rgba(255,255,255,0.98))_drop-shadow(0_0_44px_rgba(255,255,255,0.5))_drop-shadow(0_3px_14px_rgba(0,0,0,0.3))]"
                  />
                </div>
              </div>
              <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start pt-7 sm:flex-none sm:justify-start sm:pt-0">
                <p className="max-w-[22rem] text-center text-[0.95rem] leading-snug text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] sm:mt-10 sm:text-base">
                  {t("auth.landingTagline")}
                </p>
              </div>
            </div>
            <div className="mx-auto mt-6 w-full max-w-[17rem] shrink-0 space-y-2 sm:mt-10 sm:max-w-sm sm:space-y-3">
              <button
                type="button"
                onClick={() => {
                  setShowAuthLanding(false);
                  setMode("signup");
                  setMsg("");
                }}
                className={`w-full rounded-full px-6 py-3 text-center text-base font-normal tracking-[0.03em] text-white shadow-[0_12px_32px_rgba(15,23,42,0.35)] transition hover:brightness-110 active:scale-[0.99] sm:py-4 ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                {t("auth.landingSignUp")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAuthLanding(false);
                  setMode("signin");
                  setMsg("");
                }}
                className="w-full rounded-full bg-white px-6 py-3 text-center text-base font-normal tracking-[0.03em] text-slate-900 shadow-lg transition hover:bg-white/95 active:scale-[0.99] sm:py-4"
              >
                {t("auth.landingSignIn")}
              </button>
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 pb-2 sm:mt-8">
              <LanguageFab placement="authFooter" />
              <PrivacyPolicyLink className="text-center text-[12px] font-normal text-white/85 underline decoration-white/35 underline-offset-[0.2em] hover:text-white" />
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
        <h1 className="mb-2 flex justify-center"><JusttripBrand size="sm" /></h1>
        <p className="mb-6 text-center font-display text-lg font-normal tracking-[0.04em]">
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
              if (next === "signup") {
                setAwaitingEmailConfirm(false);
                setConfirmationEmail("");
              }
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
        {awaitingEmailConfirm && String(confirmationEmail || email || "").trim() ? (
          <button
            type="button"
            onClick={resendConfirmationEmail}
            disabled={resendLoading || loading}
            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            {resendLoading ? t("auth.loading") : t("auth.confirmEmailResend")}
          </button>
        ) : null}
        <footer className="mt-6 border-t border-slate-200/60 pt-4">
          <div className="flex flex-col items-center gap-3">
            <LanguageFab placement="authFooter" />
            <PrivacyPolicyLink className="text-center text-[12px] text-slate-500 underline decoration-slate-300 underline-offset-[0.2em] hover:text-slate-700" />
          </div>
        </footer>
      </div>
      {invitePromptOpen ? (
        <div className="fixed -inset-1 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setInvitePromptOpen(false); setInviteAccepted(false); clearInviteParams(); } }}>
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
                    <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-slate-400">
                      {t("auth.inviteTitle")}
                    </p>
                    <h3 className="font-display text-[17px] font-normal leading-tight tracking-[0.02em] text-slate-900">
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
                        <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-slate-400">
                          {t("auth.inviteDestination")}
                        </p>
                        <p className="font-display text-[14px] font-normal tracking-[0.02em] text-slate-900">
                          {inviteTripName}
                        </p>
                      </div>
                    </div>
                  )}
                  {inviteStartDate && inviteEndDate && (
                    <div className="flex items-center gap-2.5">
                      <Calendar size={14} className="shrink-0 text-indigo-500" />
                      <div>
                        <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-slate-400">
                          Dates
                        </p>
                        <p className="text-[13px] font-normal tracking-[0.02em] text-slate-800">
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
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-normal tracking-[0.03em] text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <span>🎉</span>
                    {t("auth.inviteAccept")}
                  </button>
                </div>

                <footer className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex flex-col items-center gap-3">
                    <LanguageFab placement="authFooter" />
                    <PrivacyPolicyLink className="text-center text-[12px] text-slate-500 underline decoration-slate-300 underline-offset-[0.2em] hover:text-slate-700" />
                  </div>
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
                <h3 className="mb-1 text-[10px] font-normal uppercase tracking-[0.22em] text-slate-400">
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
                    className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-normal tracking-[0.03em] text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                  >
                    {loading ? t("auth.inviteCreating") : t("auth.inviteSubmit")}
                  </button>
                </div>
                <footer className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex flex-col items-center gap-3">
                    <LanguageFab placement="authFooter" />
                    <PrivacyPolicyLink className="text-center text-[12px] text-slate-500 underline decoration-slate-300 underline-offset-[0.2em] hover:text-slate-700" />
                  </div>
                </footer>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {emailExistsModalOpen ? (
        <div
          className="fixed -inset-1 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-4"
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

const _scrollLockState = { count: 0, scrollY: 0 };
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const s = _scrollLockState;
    if (s.count === 0) {
      s.scrollY = window.scrollY;
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${s.scrollY}px`;
      body.style.width = "100%";
      html.classList.add("modal-open");
      body.querySelectorAll("header, [class*='sticky']").forEach((el) => {
        el.dataset.prevVis = el.style.visibility || "";
        el.style.visibility = "hidden";
      });
    }
    s.count++;
    return () => {
      s.count--;
      if (s.count <= 0) {
        s.count = 0;
        const html = document.documentElement;
        const body = document.body;
        html.style.overflow = "";
        body.style.overflow = "";
        body.style.position = "";
        body.style.top = "";
        body.style.width = "";
        html.classList.remove("modal-open");
        body.querySelectorAll("header, [class*='sticky']").forEach((el) => {
          el.style.visibility = el.dataset.prevVis || "";
          delete el.dataset.prevVis;
        });
        window.scrollTo(0, s.scrollY);
      }
    };
  }, [active]);
}

function TripFormModal({ open, onClose, onCreate }) {
  useScrollLock(open);
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
    <div className="fixed -inset-1 z-50 flex items-center justify-center overflow-x-hidden bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-[min(36rem,calc(100vw-1.5rem))] overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("tripForm.title")}</h2>
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
  useScrollLock(open);
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
    <div className="fixed -inset-1 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-2xl ring-1 ring-slate-200/70 sm:rounded-[3rem] sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
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
  useScrollLock(open);
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

  const tripDatesReadOnly = isTripPastByEndDate(trip);

  return (
    <div className="fixed -inset-1 z-50 flex items-center justify-center overflow-x-hidden bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-[min(36rem,calc(100vw-1.5rem))] overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:max-w-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("modals.editTripTitle")}</h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
          {tripDatesReadOnly ? (
            <p className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              {t("modals.pastTripDatesHint")}
            </p>
          ) : null}
          <CitySearchBox
            value={title}
            onChange={setTitle}
            onPick={(city) => setTitle(String(city || ""))}
            placeholder={t("tripForm.destination")}
            showSuggestions={!tripDatesReadOnly}
            readOnly={tripDatesReadOnly}
            suggestPortal
          />
          <TripDateRangeField
            startDate={startDate}
            endDate={endDate}
            readOnly={tripDatesReadOnly}
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
          <div
            className={`rounded-2xl border border-slate-200 px-4 py-3 ${
              tripDatesReadOnly ? "bg-slate-50/90" : "bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-700">
                {t("modals.invitesLine", { count: invitedEmails.length })}
              </p>
              {!tripDatesReadOnly ? (
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(true)}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-100"
                  title={t("modals.inviteByEmailTitle")}
                >
                  <Mail size={14} />
                </button>
              ) : null}
            </div>
            {tripDatesReadOnly && invitedEmails.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {invitedEmails.map((mail) => (
                  <span
                    key={String(mail)}
                    className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200"
                  >
                    {String(mail)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            onClick={() => {
              const rawTripTitle = String(trip?.title || "").trim();
              const localizedBaseline = String(
                displayCityForLocale(rawTripTitle, language) || rawTripTitle
              ).trim();
              const nextTitle = String(title || "").trim();
              const titleToSave = tripDatesReadOnly
                ? rawTripTitle
                : nextTitle === localizedBaseline
                  ? rawTripTitle
                  : nextTitle;
              const emailsToSave = tripDatesReadOnly
                ? Array.isArray(trip?.invited_emails)
                  ? trip.invited_emails
                  : []
                : invitedEmails;
              onSave({
                ...trip,
                title: titleToSave,
                start_date: tripDatesReadOnly ? toYMD(trip?.start_date, startDate) : startDate,
                end_date: tripDatesReadOnly ? toYMD(trip?.end_date, endDate) : endDate,
                fixed_url: String(fixedUrl || "").trim(),
                invited_emails: emailsToSave,
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
  useScrollLock(open);
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [manualMailto, setManualMailto] = useState("");
  const [fallbackInviteUrl, setFallbackInviteUrl] = useState("");
  const [lastApiError, setLastApiError] = useState("");
  const [copyLinkState, setCopyLinkState] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setState("idle");
      setManualMailto("");
      setFallbackInviteUrl("");
      setLastApiError("");
      setCopyLinkState("");
    }
  }, [open]);

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

  const buildMailtoFallback = (trimmed, programme) => {
    const inviteParams = new URLSearchParams({
      invite: "1",
      email: trimmed,
      trip: tripTitle,
      ...(inviterName ? { from: inviterName } : {}),
      ...(startDate ? { start: startDate } : {}),
      ...(endDate ? { end: endDate } : {}),
    });
    const inviteUrl = `${window.location.origin}?${inviteParams.toString()}`;
    const subj = encodeURIComponent(
      `\u2708\uFE0F ${inviterName ? `${inviterName} t'invite` : "Invitation"} : ${tripTitle}`
    );
    const bodyLines = [
      `Salut,`,
      ``,
      `${inviterName ? `${inviterName} t'` : "On t'"}invite \u00e0 rejoindre le voyage "${tripTitle}" !`,
      ``,
      `\uD83D\uDCC5 Dates : ${dateRange}`,
      programme ? `\n\uD83D\uDCCB Programme :\n${programme}` : "",
      ``,
      `\uD83D\uDD17 Acc\u00e8de aux d\u00e9tails et rejoins le voyage directement :`,
      inviteUrl,
      ``,
      `\u00c0 bient\u00f4t ! \uD83C\uDF0D`,
    ].join("\n");
    return {
      inviteUrl,
      mailto: `mailto:${encodeURIComponent(trimmed)}?subject=${subj}&body=${encodeURIComponent(bodyLines)}`,
    };
  };

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    setState("sending");
    setLastApiError("");
    setCopyLinkState("");
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
    const fb = buildMailtoFallback(trimmed, programme);
    setFallbackInviteUrl(fb.inviteUrl);
    setManualMailto(fb.mailto);
    setLastApiError(String(inv.error || NOTICE_INVITE_EMAIL_FAILED).trim());
    setState("needs_manual");
  };

  const openMailtoFallback = () => {
    if (!manualMailto) return;
    window.location.href = manualMailto;
  };

  const copyInviteLink = async () => {
    const url = String(fallbackInviteUrl || "").trim();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyLinkState("copied");
      return;
    } catch (_e) {
      /* fallback */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      setCopyLinkState(document.execCommand("copy") ? "copied" : "error");
      document.body.removeChild(ta);
    } catch (_err) {
      setCopyLinkState("error");
    }
  };

  return (
    <div
      className="fixed -inset-1 z-[60] flex items-center justify-center bg-black/40 p-4"
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
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "needs_manual") {
                  setState("idle");
                  setManualMailto("");
                  setFallbackInviteUrl("");
                  setLastApiError("");
                  setCopyLinkState("");
                }
              }}
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
          {state === "needs_manual" && (
            <div className="space-y-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-100">
              <p className="font-semibold">{t("modals.shareInviteEmailApiFailed")}</p>
              {lastApiError ? (
                <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words font-normal text-amber-950/90">
                  {lastApiError}
                </p>
              ) : null}
              <p className="font-normal">{t("modals.shareInviteEmailManualExplain")}</p>
              <p className="text-[10px] font-normal text-amber-800/90">
                {t("modals.shareInviteEmailResendConfigHint")}
              </p>
            </div>
          )}
          {state === "needs_manual" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openMailtoFallback}
                disabled={!manualMailto}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                {t("modals.shareInviteEmailOpenMail")}
              </button>
              <button
                type="button"
                onClick={copyInviteLink}
                disabled={!fallbackInviteUrl}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                {copyLinkState === "copied"
                  ? `\u2713 ${t("modals.shareInviteEmailLinkCopied")}`
                  : t("modals.shareInviteEmailCopyLink")}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={state === "sending"}
                className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {t("modals.shareInviteEmailRetry")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "sending" || state === "sent"}
              className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 py-3 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {state === "sent"
                ? `\u2713 ${t("modals.shareInviteEmailSent")}`
                : state === "sending"
                  ? t("modals.shareInviteEmailSending")
                  : t("modals.shareInviteEmailSend")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ShareModal ────────────────────────────────────────────────────────────────
function ShareModal({ open, onClose, trip, activities, inviterName }) {
  useScrollLock(open);
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
        className="fixed -inset-1 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
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
              <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-slate-400">
                {t("modals.shareTitle")}
              </p>
              <h2 className="font-display text-[17px] font-normal leading-tight text-slate-900">{tripTitle}</h2>
              <p className="mt-0.5 text-[12px] text-slate-500">{dateRange}</p>
            </div>
            <button onClick={onClose} className="shrink-0 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">
              <X size={16} />
            </button>
          </div>
          <div className="h-px shrink-0 bg-slate-100 mx-5" />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 pt-4 pb-2 sm:px-6">
              <p className="mb-3 text-[10px] font-normal uppercase tracking-[0.2em] text-slate-400">
                {t("modals.shareProgramSection")}
              </p>
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
                <p className="mb-2 text-[10px] font-normal uppercase tracking-[0.2em] text-slate-400">
                  {t("modals.shareGuestsSection")}
                </p>
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

/** Liste lecture seule des participants (planning) — ouverte depuis la pile d’avatars sur la carte « Voyage actif ». */
function PlannerParticipantsListModal({ open, onClose, trip, session }) {
  useScrollLock(open);
  const { t } = useI18n();
  if (!open || !trip) return null;
  const rawList = participantsForAvatarRow(trip);
  const display = (p) => participantDisplayFromRaw(p, getCurrentUserDisplayName(session));
  return (
    <div
      className="fixed -inset-1 z-[55] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-planner-participants-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[min(88dvh,32rem)] w-full min-w-0 max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-h-[min(80vh,36rem)] sm:rounded-[2rem] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 pr-1">
            <h2
              id="tp-planner-participants-title"
              className="font-display text-xs font-normal uppercase tracking-[0.28em] text-slate-500"
            >
              {t("planner.participantsListTitle")}
            </h2>
            <p className="mt-2 text-sm font-normal tracking-[0.02em] text-slate-600">
              {t("planner.participantsListHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label={t("common.close")}
          >
            <X size={20} />
          </button>
        </div>
        <ul className="space-y-2">
          {rawList.map((raw, i) => {
            const rawStr = String(raw || "").trim();
            const label = display(raw);
            const emailLine = isValidEmail(rawStr)
              ? rawStr
              : rawStr.toLowerCase() === "moi"
                ? String(session?.user?.email || "").trim()
                : "";
            return (
              <li
                key={`planner-p-${rawStr}-${i}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 ring-1 ring-slate-100/80 sm:px-4 sm:py-3"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white shadow-md ring-2 ring-white">
                  <ParticipantCircleAvatar
                    raw={raw}
                    session={session}
                    displayLabel={label}
                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-xs font-normal"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-normal tracking-[0.02em] text-slate-900">
                    {label}
                  </p>
                  {emailLine ? <p className="truncate text-xs text-slate-500">{emailLine}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-slate-200 py-3 text-sm font-normal tracking-[0.03em] text-slate-800 transition hover:bg-slate-50"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

function TripParticipantsModal({ open, onClose, trip, onSave }) {
  useScrollLock(open);
  const { t } = useI18n();
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
    <div className="fixed -inset-1 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/85 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">Participants</h2>
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
  useScrollLock(open && !!trip);
  const { t } = useI18n();
  if (!open || !trip) return null;
  const delTitle = String(trip?.title || t("modals.tripDefault"));
  return (
    <div className="fixed -inset-1 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}>
      <div className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("common.confirmation")}</h2>
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
  useScrollLock(open);
  const { t } = useI18n();
  const photoInputId = useId();
  const photoInputRef = useRef(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [pendingPhotoBlobUrl, setPendingPhotoBlobUrl] = useState("");
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [photoErr, setPhotoErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setFirstName(String(session?.user?.user_metadata?.first_name || ""));
    setLastName(String(session?.user?.user_metadata?.last_name || ""));
    setEmail(String(session?.user?.email || ""));
    setPassword("");
    setPendingPhotoFile(null);
    setAvatarCleared(false);
    setPhotoErr("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, [open, session]);

  useEffect(() => {
    if (!pendingPhotoFile) {
      setPendingPhotoBlobUrl("");
      return;
    }
    const url = URL.createObjectURL(pendingPhotoFile);
    setPendingPhotoBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingPhotoFile]);

  const savedAvatarUrl = String(session?.user?.user_metadata?.avatar_url || "").trim();
  const displayAvatarUrl = pendingPhotoFile
    ? pendingPhotoBlobUrl
    : !avatarCleared && savedAvatarUrl
      ? savedAvatarUrl
      : "";
  const canRemovePhoto = !!(pendingPhotoFile || (!avatarCleared && savedAvatarUrl));

  const handleSave = async () => {
    setPhotoErr("");
    let avatar_url;
    if (pendingPhotoFile) {
      try {
        avatar_url = await fileToAvatarDataUrl(pendingPhotoFile);
      } catch (e) {
        setPhotoErr(String(e?.message || t("auth.errGeneric")));
        return;
      }
    } else if (avatarCleared && savedAvatarUrl) {
      avatar_url = "";
    }
    await onUpdateProfile({
      first_name: String(firstName || "").trim(),
      last_name: String(lastName || "").trim(),
      email: String(email || "").trim(),
      password: String(password || ""),
      avatar_url,
    });
  };

  if (!open) return null;
  return (
    <div className="fixed -inset-1 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !deleting && !saving) onClose(); }}>
      <div className="min-w-0 w-full max-w-xl overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("menu.account")}</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-500">{t("auth.profilePhotoOptional")}</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-2 ring-slate-200/80 shadow-sm">
                {displayAvatarUrl ? (
                  <img src={displayAvatarUrl} alt={t("auth.previewAlt")} className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center text-slate-400"
                    role="img"
                    aria-label={t("menu.profileDefaultAvatarAria")}
                  >
                    <UserRound size={40} strokeWidth={1.5} aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <label htmlFor={photoInputId} className="sr-only">
                  {t("accountModal.changePhoto")}
                </label>
                <input
                  id={photoInputId}
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  disabled={saving || deleting}
                  onChange={(e) => {
                    setPhotoErr("");
                    const f = e.target.files?.[0] || null;
                    if (!f) {
                      setPendingPhotoFile(null);
                      return;
                    }
                    setAvatarCleared(false);
                    setPendingPhotoFile(f);
                  }}
                  className="min-w-0 w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
                />
                {canRemovePhoto ? (
                  <button
                    type="button"
                    disabled={saving || deleting}
                    onClick={() => {
                      setPendingPhotoFile(null);
                      setAvatarCleared(true);
                      if (photoInputRef.current) photoInputRef.current.value = "";
                    }}
                    className="self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {t("accountModal.removePhoto")}
                  </button>
                ) : null}
              </div>
            </div>
            {photoErr ? <p className="mt-2 text-xs text-rose-600">{photoErr}</p> : null}
          </div>
          <div className={MODAL_GRID_2}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("auth.firstName")}
              className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("auth.lastName")}
              className="min-w-0 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("accountModal.newPasswordOptional")}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`w-full rounded-2xl px-4 py-3 text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
            style={GLASS_ACCENT_STYLE}
          >
            {saving ? t("accountModal.saving") : t("accountModal.saveProfile")}
          </button>
        </div>
        <button
          type="button"
          onClick={onDeleteAccount}
          disabled={deleting}
          className="mt-5 w-full rounded-2xl px-4 py-3 text-sm font-normal tracking-[0.03em] text-white disabled:opacity-60"
          style={{ backgroundColor: "#e11d48" }}
        >
          {deleting ? t("accountModal.deleting") : t("accountModal.deleteAccount")}
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
          <div className="pointer-events-none absolute inset-0 rounded-[3rem] bg-gradient-to-t from-black/40 via-black/08 to-transparent" />
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 text-white">
            <div className="flex w-full flex-col items-start">
              <h3 className="max-w-full truncate font-display text-[clamp(0.95rem,1.45vw,1.35rem)] font-normal uppercase leading-[1.08] tracking-[0.08em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_2px_14px_rgba(0,0,0,0.5)]">
                <UiLocalizedTripTitle raw={String(trip.title || "")} emptyLabel={t("modals.tripDefault")} />
              </h3>
              <p className="mt-1 w-full truncate text-left text-[clamp(0.56rem,0.78vw,0.68rem)] font-medium tracking-[0.04em] text-white/95">
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
  readOnly = false,
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
  const suggestions = useMemo(() => {
    const qk = normalizeTextForSearch(normalizeCityInput(value));
    return rankAndMergeCitySuggestions(qk, fallbackSuggestions, remoteSuggestions, 10);
  }, [fallbackSuggestions, remoteSuggestions, value]);
  const show = showSuggestions && !readOnly && focused && suggestions.length > 0;
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
      className="block w-full rounded-xl px-3 py-2 text-left text-sm font-normal tracking-[0.02em] text-slate-700 transition hover:bg-slate-100"
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
      <div
        className={`flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 ring-1 ring-sky-100/70 shadow-[0_2px_12px_rgba(30,58,95,0.04)] ${
          readOnly ? "bg-slate-50/90" : "bg-white"
        }`}
      >
        <Search size={16} className="shrink-0 text-sky-400/80" />
        <input
          value={value}
          onChange={(e) => {
            if (readOnly) return;
            onChange(e.target.value);
          }}
          onKeyDown={async (e) => {
            if (readOnly) return;
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
          onFocus={() => {
            if (!readOnly) setFocused(true);
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={confirmBusy}
          aria-readonly={readOnly || undefined}
          className={`min-w-0 w-full bg-transparent text-base outline-none disabled:opacity-60 sm:text-sm ${
            readOnly ? "cursor-default text-slate-700" : ""
          }`}
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
        <p className="text-xs font-normal uppercase tracking-[0.3em] text-slate-500">{t("home.label")}</p>
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
        <h2 className="mb-4 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
          {t("home.now")}
        </h2>
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
        <h2 className="mb-4 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
          {t("home.upcoming")}
        </h2>
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

/** Quota / limite de requêtes API Gemini (message utilisateur : « Réessaie plus tard »). */
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

/** Erreur « programme vide » — valeur d’état ; affichée via clé i18n (pas une stack trace). */
const ITIN_ERROR_EMPTY_RESULT = "ITIN_ERROR_EMPTY_RESULT";

/** Message court pour le programme (affiché à tous les utilisateurs). */
function userFacingItineraryErrorMessage(raw, tFn) {
  const s = String(raw || "");
  const fb = (key, fallbackStr) => {
    if (typeof tFn !== "function") return fallbackStr;
    const tr = tFn(key);
    return tr === key ? fallbackStr : tr;
  };
  if (s === ITIN_ERROR_EMPTY_RESULT) {
    return fb(
      "destination.itineraryEmptyResult",
      "The itinerary came back empty. Try again or pick different dates."
    );
  }
  if (/403|premium|réservée/i.test(s)) {
    return fb("destination.premiumBody", "Cette fonctionnalité est réservée au service Premium.");
  }
  if (isGeminiQuotaError(s)) {
    return fb("destination.quotaRetryLater", "Réessaie plus tard.");
  }
  if (/404|not found|cannot get|cannot post/i.test(s)) {
    return fb(
      "destination.itineraryApiMissingError",
      "Itinerary API is not available on this host (common on static hosting). Run the app locally with npm run dev, or deploy a backend with /api routes."
    );
  }
  if (
    /failed to fetch|load failed|networkerror|network request failed|econnrefused|err_connection|internet connection|offline|unreachable host/i.test(
      s
    )
  ) {
    return fb(
      "destination.itineraryNetworkError",
      "Cannot reach the generation server. On your phone with npm run dev, use npm run dev -- --host on your PC and open http://YOUR_PC_IP:5173 (not localhost from the phone). Check Wi‑Fi and try again."
    );
  }
  if (/TIMEOUT_ITINERARY|aborterror|the operation was aborted|dépasse le délai|timeout/i.test(s)) {
    return fb(
      "destination.itineraryTimeoutError",
      "Generation took too long. Try fewer days or a more stable connection."
    );
  }
  if (/503|502|GEMINI_API_KEY|Groq erreur 50[23]|\bErreur\s+50[23]\b/i.test(s)) {
    return fb("destination.itineraryGenerateError", "Service unavailable, please try again later.");
  }
  if (/JSON|invalide|guillemet|array element/i.test(s)) {
    return fb("destination.itineraryFormatError", "The response was incomplete. Try again or shorten the period.");
  }
  return fb("destination.itineraryGenerateError", "Unable to generate. Please try again later.");
}

/** Bloc erreur programme : toujours le texte utilisateur ; détail brut seulement en mode dev (repliable). */
function ItineraryErrorNotice({ raw }) {
  const { t } = useI18n();
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
  useScrollLock(true);
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
    <div className="fixed -inset-1 z-[70] flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            <h2 className="font-display text-lg font-normal text-slate-900">{t("destination.prefsTitle")}</h2>
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
            <p className="text-[12px] font-normal uppercase tracking-[0.12em] text-slate-500">{t("destination.prefsPace")}</p>
            <div className="space-y-2">
              {radioCard("pace", "relaxed",   pace, setPace, t("destination.prefsPaceRelaxed"))}
              {radioCard("pace", "moderate",  pace, setPace, t("destination.prefsPaceModerate"))}
              {radioCard("pace", "intensive", pace, setPace, t("destination.prefsPaceIntensive"))}
            </div>
          </section>

          {/* Style */}
          <section className="space-y-2">
            <p className="text-[12px] font-normal uppercase tracking-[0.12em] text-slate-500">{t("destination.prefsStyle")}</p>
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
            <p className="text-[12px] font-normal uppercase tracking-[0.12em] text-slate-500">{t("destination.prefsTravelers")}</p>
            <div className="grid grid-cols-2 gap-2">
              {radioCard("travelers", "solo",    travelers, setTravelers, t("destination.prefsTravelersSolo"))}
              {radioCard("travelers", "couple",  travelers, setTravelers, t("destination.prefsTravelerCouple"))}
              {radioCard("travelers", "family",  travelers, setTravelers, t("destination.prefsTravelersFamily"))}
              {radioCard("travelers", "friends", travelers, setTravelers, t("destination.prefsTravelersFriends"))}
            </div>
          </section>

          {/* Budget */}
          <section className="space-y-2">
            <p className="text-[12px] font-normal uppercase tracking-[0.12em] text-slate-500">{t("destination.prefsBudget")}</p>
            <div className="space-y-2">
              {radioCard("budget", "low",    budget, setBudget, t("destination.prefsBudgetLow"))}
              {radioCard("budget", "medium", budget, setBudget, t("destination.prefsBudgetMedium"))}
              {radioCard("budget", "high",   budget, setBudget, t("destination.prefsBudgetHigh"))}
              {radioCard("budget", "luxury", budget, setBudget, t("destination.prefsBudgetLuxury"))}
            </div>
          </section>

          {/* Souhaits libres */}
          <section className="space-y-2">
            <p className="text-[12px] font-normal uppercase tracking-[0.12em] text-slate-500">{t("destination.prefsWishes")}</p>
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
function ItineraryResultModal({
  dayIdeas,
  cityLabel,
  startDate,
  endDate,
  prefs,
  onClose,
  onRegenerate,
  onSaveToCalendar,
  regenerating = false,
  fetchError = "",
}) {
  useScrollLock(true);
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const days = Array.isArray(dayIdeas) ? dayIdeas : [];
  const errLine = String(fetchError || "").trim();

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
      className="fixed -inset-1 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
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
              <h2 className="mt-2 font-display text-[1.35rem] font-normal leading-tight tracking-[0.02em] text-slate-900">
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
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {regenerating ? (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[2px]"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="flex flex-col items-center gap-2 px-4">
                <span
                  className="h-9 w-9 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"
                  aria-hidden
                />
                <span className="text-center text-xs font-medium text-slate-600">
                  {t("destination.itineraryGenerating")}
                </span>
              </div>
            </div>
          ) : null}
          {(() => {
            const hasContent = days.length > 0 && days.some((d) => String(d?.title || "").trim() || (Array.isArray(d?.bullets) && d.bullets.length > 0) || (Array.isArray(d?.activities) && d.activities.length > 0));
            if (days.length === 0 || !hasContent) {
              return (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
                  <span className="h-9 w-9 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden />
                  <p className="text-center text-sm text-slate-500">{t("destination.itineraryGenerating")}</p>
                </div>
              );
            }
            return (
              <ol className="divide-y divide-slate-100">
                {days.map((d, idx) => {
                  const dayNum = Number(d?.day) || idx + 1;
                  const cost = Number(d?.costEur) || 0;
                  const title = String(d?.title || "").trim() || `${t("destination.itineraryDayLabel")} ${dayNum}`;
                  const bullets = Array.isArray(d?.bullets) ? d.bullets : (Array.isArray(d?.activities) ? d.activities : []);
                  return (
                    <li key={`day-${dayNum}`} className="px-5 py-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-sky-600 to-indigo-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                          {t("destination.itineraryDayLabel")} {dayNum}
                        </span>
                        <p className="min-w-0 flex-1 text-[13px] font-semibold text-slate-900">
                          {title}
                        </p>
                        {cost > 0 && (
                          <span className="shrink-0 text-[12px] font-semibold text-slate-500">
                            ~{cost}€
                          </span>
                        )}
                      </div>
                      {bullets.length > 0 && (
                        <ul className="mt-2.5 space-y-1.5 pl-10">
                          {bullets.map((b, j) => (
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
            );
          })()}
        </div>

        {errLine ? (
          <div className="shrink-0 border-t border-rose-100 bg-rose-50/40 px-5 py-2.5">
            <p className="text-xs leading-relaxed text-rose-600">
              {userFacingItineraryErrorMessage(errLine, t)}
            </p>
          </div>
        ) : null}

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
              disabled={regenerating || saving}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regenerating ? t("destination.itineraryGenerating") : t("destination.itineraryResultRegenerate")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || regenerating}
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

/** Repli si l’image ne charge : mêmes sources que l’affichage (Commons / bundle / miroir / Wiki), même avec clé Unsplash. */
function pickNextDestinationGuideImgSrc(el, guide) {
  const ctx = [guide?.city, guide?.country, guide?.adminRegion].filter(Boolean).join(", ").trim();
  const city = String(
    heroImageStemFromDestination(ctx || guide?.city) || extractCityPrompt(guide?.city) || guide?.city || ""
  ).trim();
  const tried = new Set(String(el.getAttribute("data-img-tried") || "").split("\x1e").filter(Boolean));
  const cur = String(el.src || "").trim();
  if (cur) tried.add(cur);
  const fromGuide = Array.isArray(guide?.heroImageCandidates) ? guide.heroImageCandidates : [];
  const chain = dedupeImageUrlChain([
    ...fromGuide,
    ...getCityHeroImageCandidates(city),
    getBundledCityHeroPath(city),
    getStorageMirrorHeroUrl(city),
    buildCityImageUrl(ctx || city),
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
const _GUIDE_LS_KEY = "tp_guide_cache_v14";
const _GUIDE_LS_TTL = 24 * 60 * 60 * 1000; // 24h — texte + image moins de rechargements intempestifs

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
    /** Ne pas figer un guide « coquille » (chargement interrompu / cache vide). */
    const hasDesc = String(guide.description || "").trim().length > 40;
    const hasPlaces = Array.isArray(guide.places) && guide.places.some((p) => String(p || "").trim());
    const hasTips = Array.isArray(guide.tips?.do) && guide.tips.do.some((x) => String(x || "").trim());
    if (!hasDesc && !hasPlaces && !hasTips) return;
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

function MustSeePlaceModal({ open, onClose, rawName, city, language }) {
  useScrollLock(open);
  const { t } = useI18n();
  const { text: displayName } = useUiTranslatedText(rawName, language);
  const titleId = useId();
  const [textLoading, setTextLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imgRendered, setImgRendered] = useState(false);
  const [extract, setExtract] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!open || !rawName) {
      setExtract("");
      setImageUrl("");
      setTextLoading(false);
      setImageLoading(false);
      setImgRendered(false);
      return;
    }
    const cached = readMustSeePlaceModalCache(rawName, city, language);
    if (cached) {
      setExtract(cached.extract);
      setImageUrl(cached.imageUrl);
      setTextLoading(false);
      setImageLoading(false);
      setImgRendered(false);
      return;
    }

    let cancelled = false;
    setTextLoading(true);
    setImageLoading(true);
    setImgRendered(false);
    setExtract("");
    setImageUrl("");

    const WIKI_TIMEOUT_MS = 15000;
    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((r) => setTimeout(() => r(null), ms)),
    ]);

    const wikiDirectP = withTimeout(
      fetchWikiDirectPlaceImage(rawName, city, language).catch(() => ""),
      WIKI_TIMEOUT_MS
    ).then((u) => u || "");

    const textP = withTimeout(
      fetchWikiPlaceSummaryForPlace(rawName, city, language, { resolveImage: false }).catch(
        () => ({ extract: "", thumb: "", wikiTitle: "", wikiHostLang: "" })
      ),
      WIKI_TIMEOUT_MS
    ).then((d) => d || { extract: "", thumb: "", wikiTitle: "", wikiHostLang: "" });

    const unsplashP = UNSPLASH_ACCESS_KEY
      ? fetchPlaceLandmarkImage(rawName, city).catch(() => "")
      : Promise.resolve("");

    wikiDirectP.then((u) => {
      if (cancelled || !u) return;
      setImageUrl(String(u).trim());
    });

    textP.then((d) => {
      if (cancelled) return;
      setExtract(String(d?.extract || ""));
      setTextLoading(false);
      const thumb = String(d?.thumb || "").trim();
      if (thumb && !isLikelyWikiBrandOrLogoImage(thumb, "")) {
        setImageUrl((prev) => (prev ? prev : thumb));
      }
    });

    (async () => {
      try {
        const [wikiDirect, data, unsplash] = await Promise.all([wikiDirectP, textP, unsplashP]);
        if (cancelled) return;
        let img = String(wikiDirect || "").trim();
        if (!img) {
          const thumb = String(data?.thumb || "").trim();
          if (thumb && !isLikelyWikiBrandOrLogoImage(thumb, "")) img = thumb;
        }
        if (!img) img = String(unsplash || "").trim();
        if (!img && UNSPLASH_ACCESS_KEY) {
          img = await fetchPlaceLandmarkImage(city, "").catch(() => "");
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

  const mustSeeImgRef = useRef(null);
  useLayoutEffect(() => {
    setImgRendered(false);
  }, [imageUrl]);

  useLayoutEffect(() => {
    if (!open || !imageUrl) return;
    const el = mustSeeImgRef.current;
    if (!el) return;
    let cancelled = false;
    const mark = () => {
      if (!cancelled) setImgRendered(true);
    };
    const sync = () => {
      if (cancelled || !el.isConnected) return;
      if (el.complete && el.naturalWidth > 0) mark();
    };
    sync();
    el.addEventListener("load", mark, { passive: true });
    if (typeof el.decode === "function") {
      el.decode().then(mark).catch(() => sync());
    }
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      sync();
      raf2 = requestAnimationFrame(sync);
    });
    const t = window.setTimeout(sync, 80);
    return () => {
      cancelled = true;
      el.removeEventListener("load", mark);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, [open, imageUrl]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed -inset-1 z-[85] flex items-end justify-center overscroll-none bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="flex max-h-[min(92dvh,900px)] w-full max-w-lg touch-auto flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[min(88vh,720px)] sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 bg-slate-100">
          {imageUrl ? (
            <>
              {!imgRendered ? (
                <div className="absolute inset-0 z-[1] flex h-44 flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-slate-100 to-slate-200 sm:h-52">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" aria-hidden />
                  <span className="animate-pulse text-xs font-medium text-slate-400">{t("destination.mustSeePlaceLoading")}</span>
                </div>
              ) : null}
              <img
                key={imageUrl}
                ref={mustSeeImgRef}
                src={imageUrl}
                alt=""
                className="relative z-[2] h-44 w-full object-cover object-[center_45%] sm:h-52 sm:object-[center_40%]"
                decoding="async"
                onLoad={() => setImgRendered(true)}
                onError={async (e) => {
                  const el = e.currentTarget;
                  if (UNSPLASH_ACCESS_KEY && !el.dataset.unsplashTried) {
                    el.dataset.unsplashTried = "1";
                    try {
                      const u = await fetchPlaceLandmarkImage(rawName, city);
                      if (u) { el.src = u; return; }
                    } catch (_e) { /* ignore */ }
                  }
                  el.style.display = "none";
                  setImgRendered(true);
                }}
              />
            </>
          ) : null}
          {!imageUrl && imageLoading ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-slate-100 to-slate-200 sm:h-52">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" aria-hidden />
              <span className="animate-pulse text-xs font-medium text-slate-400">{t("destination.mustSeePlaceLoading")}</span>
            </div>
          ) : null}
          {!imageUrl && !imageLoading ? (
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
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-5 sm:p-6">
          <h2 id={titleId} className="pr-10 font-display text-lg font-normal leading-snug text-slate-900 sm:text-xl">
            {displayName}
          </h2>
          <div className="mt-4">
            {textLoading ? (
              <p className="animate-pulse text-sm leading-relaxed text-slate-500">{t("destination.mustSeePlaceLoading")}</p>
            ) : extract ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {formatWikiExtractCommaStyleParagraphs(extract)}
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-slate-500">
                {t("destination.mustSeePlaceNoDescCtx", { place: displayName, city }) || t("destination.mustSeePlaceNoDesc")}
              </p>
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
  visible = true,
  searchInput,
  onSearchInputChange,
  confirmedDestination,
  onConfirmDestination,
  onCreateTrip,
  onBack,
  trips = [],
}) {
  const { t, language } = useI18n();

  // Nombre de "crédits" pour sauter le clear initial si on a des données en cache
  const skipClearsRef = useRef(0);

  const [guideError, setGuideError] = useState("");
  const [guide, setGuide] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    if (c?.guide) {
      skipClearsRef.current = 3; // 3 effets vont essayer de vider l'état
      return applyGuideHeroUnsplashOnlyOrEmpty(c.guide);
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
  /** Dernier contexte de génération (dest + dates) — pour « Régénérer » sans repasser par les modales. */
  const [lastItineraryRequest, setLastItineraryRequest] = useState(null);
  const [itineraryRegenerating, setItineraryRegenerating] = useState(false);

  useScrollLock(addModalOpen);
  useScrollLock(itineraryModalOpen);

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
  const [programStartDate, setProgramStartDate] = useState(() => getTodayStr());
  const [programEndDate, setProgramEndDate] = useState(() => getTodayStr());
  /** Conflit calendrier au moment d'« Ajouter au calendrier » — overlay au-dessus du modal programme (z-90). */
  const [itineraryCalendarConflict, setItineraryCalendarConflict] = useState(null);
  const [itineraryCalendarConflictErr, setItineraryCalendarConflictErr] = useState("");
  const [itineraryCalendarConflictSaving, setItineraryCalendarConflictSaving] = useState(false);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState("");
  const [generatedDayIdeas, setGeneratedDayIdeas] = useState(null);
  const [creatingVoyage, setCreatingVoyage] = useState(false);
  /** Tips en langue UI (Gemini) — utilisés quand la langue n'est pas le français et que GEMINI_DESTINATION_ENRICH est désactivé. */
  const [geminiLangTips, setGeminiLangTips] = useState(() => {
    const c = _readGuideCache(confirmedDestination, language);
    return c?.geminiTips ?? null;
  });

  const [heroVideoFailed, setHeroVideoFailed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(!!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setMobileViewport(!!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setHeroVideoFailed(false);
  }, [DESTINATION_GUIDE_HERO_VIDEO_URL]);

  // Mobile: on privilégie l'affichage vidéo même si "reduced motion" est détecté,
  // car certains appareils le signalent agressivement et masquent la vidéo à tort.
  const blockVideoForMotion = prefersReducedMotion && !mobileViewport;
  const showDestinationHeroVideo =
    Boolean(DESTINATION_GUIDE_HERO_VIDEO_URL) && !blockVideoForMotion && !heroVideoFailed;

  const destHeroVideoRef = useRef(null);
  useEffect(() => {
    if (!showDestinationHeroVideo) return;
    const v = destHeroVideoRef.current;
    if (!v) return;
    const tryPlay = () => {
      if (v.paused) {
        const p = v.play();
        if (p && typeof p.then === "function") p.catch(() => {});
      }
    };
    tryPlay();
    v.addEventListener("loadeddata", tryPlay, { once: true });
    v.addEventListener("canplay", tryPlay, { once: true });
    return () => {
      v.removeEventListener("loadeddata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
    };
  }, [showDestinationHeroVideo, DESTINATION_GUIDE_HERO_VIDEO_URL, visible]);

  const displayGuide = useMemo(() => {
    if (!guide) return null;
    let base;
    if (GEMINI_DESTINATION_ENRICH) {
      base = mergeDestinationGuideWithGemini(guide, geminiContent, language);
    } else if (geminiAiSuggestedActivities && geminiAiSuggestedActivities.length > 0) {
      const city = String(guide.city || "");
      base = {
        ...guide,
        places: clampPlacesList(guide.places, city, { min: 3, max: 7, padExploration: false }),
        suggestedActivities: geminiAiSuggestedActivities,
        tips: guide.tips,
      };
    } else {
      base = mergeDestinationGuideWithGemini(guide, null, language);
    }
    const city = String(base.city || "");
    const withActs = {
      ...base,
      suggestedActivities: localizeGenericSuggestedActivities(
        ensureMinSuggestedActivities(
          base.suggestedActivities,
          city,
          MIN_SUGGESTED_ACTIVITIES,
          base.places
        ),
        city,
        language
      ),
    };
    if (geminiLangTips && !GEMINI_DESTINATION_ENRICH) {
      return { ...withActs, tips: geminiLangTips };
    }
    return withActs;
  }, [guide, geminiContent, geminiAiSuggestedActivities, geminiLangTips, language]);

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
    setLastItineraryRequest(null);
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
      const ssIdeas = Array.isArray(data.dayIdeas) ? data.dayIdeas : [];
      const ssHasContent = ssIdeas.length > 0 && ssIdeas.some((d) =>
        String(d?.title || "").trim() || (Array.isArray(d?.bullets) && d.bullets.length > 0) || (Array.isArray(d?.activities) && d.activities.length > 0)
      );
      if (ssHasContent) {
        setGeneratedDayIdeas(ssIdeas);
        if (data.prefs) setLastItineraryPrefs(data.prefs);
        if (data.startDate) setProgramStartDate(data.startDate);
        if (data.endDate) setProgramEndDate(data.endDate);
        if (data.destination && data.startDate && data.endDate) {
          setLastItineraryRequest({
            dest: String(data.destination).trim(),
            startDate: String(data.startDate).trim(),
            endDate: String(data.endDate).trim(),
          });
        }
        if (data.popupOpen) setItineraryResultOpen(true);
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

    const instant = buildInstantDestinationGuide(confirmedDestination, language);
    if (!instant) {
      setGuide(null);
      setGuideError("");
      return;
    }

    const cityKey = String(instant.city || "");
    const cacheKeyFast = getCityImageCacheKey(confirmedDestination);
    const memFast =
      cacheKeyFast && cityImageMemoryCache[cacheKeyFast]
        ? String(cityImageMemoryCache[cacheKeyFast])
        : "";
    const heroFromMemory =
      memFast && !isLikelyWikiFlagOrSealThumb(memFast) ? upgradeLandscapeImageUrl(memFast) : "";
    let heroFromDisk = "";
    try {
      const lsKey = `tp_city_img_${cacheKeyFast}`;
      const v = window.localStorage.getItem(lsKey);
      if (v && !isLikelyWikiFlagOrSealThumb(String(v))) heroFromDisk = upgradeLandscapeImageUrl(String(v).trim());
    } catch (_e) {
      /* ignore */
    }
    const fastHero = heroFromMemory || heroFromDisk;

    const heroOverlay =
      fastHero && UNSPLASH_ACCESS_KEY
        ? {
            imageUrl: fastHero,
            landscapeImageUrl: fastHero,
            heroImageCandidates: dedupeImageUrlChain([fastHero, ...(instant.heroImageCandidates || [])]).map((u) =>
              upgradeLandscapeImageUrl(String(u || ""))
            ),
          }
        : null;

    const diskRow = _readGuideCache(confirmedDestination, language);
    const dg = diskRow?.guide;
    const useDiskGuide =
      dg &&
      normalizeTextForSearch(String(dg.city || "")) === normalizeTextForSearch(cityKey) &&
      String(dg.description || "").trim().length > 0;

    if (useDiskGuide) {
      setGuide(
        applyGuideHeroUnsplashOnlyOrEmpty({
          ...dg,
          ...(heroOverlay || {}),
          heroImageCandidates:
            heroOverlay?.heroImageCandidates || dg.heroImageCandidates || instant.heroImageCandidates,
        })
      );
    } else if (heroOverlay) {
      setGuide({ ...instant, ...heroOverlay });
    } else {
      setGuide(instant);
    }
    setGuideError("");

    let cancelled = false;

    /** Groq + Wikivoyage + Wikipédia en parallèle (sans Foursquare / carte) → description utile tout de suite. */
    (async () => {
      try {
        const safe = String(instant.city || "");
        const [summaryPack, wikivoyageText, groqDesc] = await Promise.all([
          fetchWikiSummaryForLang(safe, language),
          fetchWikivoyageSummaryText(safe, language),
          fetchGroqCityDescription(safe, language),
        ]);
        if (cancelled) return;
        const desc = composeDestinationGuideDescription(
          groqDesc,
          wikivoyageText,
          summaryPack?.summaryText,
          safe,
          { useGenericFallback: false }
        );
        if (!String(desc || "").trim()) return;
        setGuide((prev) => {
          if (!prev || String(prev.city || "") !== cityKey) return prev;
          if (String(prev.description || "").trim()) return prev;
          return { ...prev, description: desc };
        });
      } catch (_e) {
        /* non bloquant */
      }
    })();

    (async () => {
      try {
        const geo = await fetchNominatimCityGeo(String(instant.city || ""), language);
        if (cancelled) return;
        const latN = Number(geo.lat);
        const lonN = Number(geo.lon);
        if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return;
        const cc = String(geo.countryCode || "").trim().toLowerCase();
        const situationEarly = await buildSituationMapForDestination(
          latN,
          lonN,
          geo.country,
          cc
        );
        if (cancelled) return;
        setGuide((prev) => {
          if (!prev || String(prev.city || "") !== cityKey) return prev;
          if (prev.situationMap?.miniMap?.geojson) return prev;
          const next = {
            ...prev,
            coordinates: { lat: latN, lon: lonN },
            country: geo.country ? geo.country : prev.country || null,
            countryCode: cc || prev.countryCode || null,
            adminRegion: geo.region ? geo.region : prev.adminRegion || null,
          };
          if (situationEarly?.miniMap?.geojson) next.situationMap = situationEarly;
          return next;
        });
      } catch (_e) {
        /* carte : pas bloquant */
      }
    })();

    (async () => {
      try {
        let guideDone = false;
        const heroWork = (async () => {
          const heroUrl = await resolveDestinationHeroFirstPaint(confirmedDestination);
          if (cancelled || guideDone) return;
          if (!String(heroUrl || "").trim()) return;
          const nextHero = String(heroUrl).trim();
          setGuide((prev) => {
            if (!prev || String(prev.city || "") !== cityKey) return prev;
            return {
              ...prev,
              imageUrl: nextHero,
              landscapeImageUrl: nextHero,
              heroImageCandidates: dedupeImageUrlChain([nextHero, ...(instant.heroImageCandidates || [])]).map((u) =>
                upgradeLandscapeImageUrl(String(u || ""))
              ),
            };
          });
        })();

        const result = await fetchDestinationGuide(confirmedDestination, language);
        guideDone = true;
        if (!cancelled && result) setGuide(result);
        await heroWork;
      } catch (_e) {
        if (!cancelled) {
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
      fetchGroqTripSuggestions({ destination: dest, language })
        .then((res) => {
          if (cancelled) return;
          if (res?.ok && res.data) {
            const norm = normalizeGeminiGuidePayload(res.data, dest);
            if (norm && (Array.isArray(norm.places) && norm.places.length > 0)) {
              setGeminiContent(norm);
              setGeminiError("");
              return null;
            }
          }
          return fetchGeminiTripSuggestions({ destination: dest, language });
        })
        .then((res) => {
          if (cancelled || !res) return;
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

    fetchGroqSuggestedActivities({ destination: dest, language })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && res.data) {
          const norm = normalizeGeminiSuggestedActivitiesPayload(res.data, dest);
          const padded = ensureMinSuggestedActivities(norm, dest);
          if (padded.length > 0) {
            setGeminiAiSuggestedActivities(padded);
            setGeminiError("");
            return null;
          }
        }
        return fetchGeminiSuggestedActivities({ destination: dest, language });
      })
      .then((res) => {
        if (cancelled || !res) return;
        if (res?.ok && res.data) {
          const norm = normalizeGeminiSuggestedActivitiesPayload(res.data, dest);
          const padded = ensureMinSuggestedActivities(norm, dest);
          setGeminiAiSuggestedActivities(padded.length > 0 ? padded : null);
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

  async function fetchItineraryProgram(dest, startDate, endDate, prefs) {
    const countryCode = String(displayGuide?.countryCode || "").trim();
    return fetchItineraryGroqFirst({
      destination: dest,
      startDate,
      endDate,
      language,
      prefs,
      countryCode,
    });
  }

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
    const calConflicts = findTripsOverlappingDateRange(trips, programStartDate, programEndDate, null);
    if (calConflicts.length > 0) {
      setItineraryCalendarConflict({
        conflictingTrips: calConflicts,
        draftStart: programStartDate,
        draftEnd: programEndDate,
        phase: "beforeGenerate",
        afterResolve: "openPrefs",
      });
      setItineraryCalendarConflictErr("");
      return;
    }
    setPendingTripRequest({ dest, startDate: programStartDate, endDate: programEndDate });
    setItineraryModalOpen(false);
    setTripPrefsOpen(true);
  }

  async function runItineraryGenerationWithDates(dest, startDate, endDate, prefs, kind) {
    const regen = kind === "regenerate";
    if (regen) setItineraryRegenerating(true);
    else setItineraryLoading(true);
    setItineraryError("");
    try {
      const res = await fetchItineraryProgram(dest, startDate, endDate, prefs);
      const ideas = res?.ok && Array.isArray(res.data?.dayIdeas) ? res.data.dayIdeas : [];
      const ideasHaveContent =
        ideas.length > 0 &&
        ideas.some(
          (d) =>
            String(d?.title || "").trim() ||
            (Array.isArray(d?.bullets) && d.bullets.length > 0) ||
            (Array.isArray(d?.activities) && d.activities.length > 0)
        );
      if (ideasHaveContent) {
        setGeneratedDayIdeas(ideas);
        setLastItineraryRequest({ dest, startDate, endDate });
        if (!regen) setItineraryResultOpen(true);
        saveItineraryToSession(dest, ideas, prefs, startDate, endDate, true);
      } else {
        setItineraryError(ITIN_ERROR_EMPTY_RESULT);
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
      if (regen) setItineraryRegenerating(false);
      else setItineraryLoading(false);
    }
  }

  async function handleGenerateWithPrefs(prefs) {
    if (!pendingTripRequest) return;
    const { dest, startDate, endDate } = pendingTripRequest;
    setTripPrefsOpen(false);
    setLastItineraryPrefs(prefs);
    const calConflicts = findTripsOverlappingDateRange(trips, startDate, endDate, null);
    if (calConflicts.length > 0) {
      setItineraryCalendarConflict({
        conflictingTrips: calConflicts,
        draftStart: startDate,
        draftEnd: endDate,
        phase: "beforeGenerate",
        afterResolve: "runGeneration",
        generationKind: "initial",
        prefsForGeneration: prefs,
      });
      setItineraryCalendarConflictErr("");
      return;
    }
    await runItineraryGenerationWithDates(dest, startDate, endDate, prefs, "initial");
  }

  async function handleRegenerateItinerary() {
    if (!userCanUseItineraryGeneration(session)) {
      setItineraryPremiumGateOpen(true);
      return;
    }
    const req = pendingTripRequest || lastItineraryRequest;
    const dest = String(req?.dest || displayGuide?.city || "").trim();
    const startDate = String(req?.startDate || programStartDate || "").trim();
    const endDate = String(req?.endDate || programEndDate || "").trim();
    if (!dest || !startDate || !endDate) return;
    const { ok, error } = countInclusiveTripDaysClient(startDate, endDate);
    if (!ok) {
      setItineraryError(error);
      return;
    }
    const calConflicts = findTripsOverlappingDateRange(trips, startDate, endDate, null);
    if (calConflicts.length > 0) {
      setItineraryCalendarConflict({
        conflictingTrips: calConflicts,
        draftStart: startDate,
        draftEnd: endDate,
        phase: "beforeGenerate",
        afterResolve: "runGeneration",
        generationKind: "regenerate",
      });
      setItineraryCalendarConflictErr("");
      return;
    }
    await runItineraryGenerationWithDates(dest, startDate, endDate, lastItineraryPrefs, "regenerate");
  }

  const saveProgramToCalendar = useCallback(
    async (rangeStartRaw, rangeEndRaw) => {
      const rangeStart = toYMD(String(rangeStartRaw || getTodayStr()), getTodayStr());
      const rangeEnd = toYMD(String(rangeEndRaw || rangeStart), rangeStart);
      if (String(rangeStart) > String(rangeEnd)) return false;
      const conflicts = findTripsOverlappingDateRange(trips, rangeStart, rangeEnd, null);
      if (conflicts.length > 0) {
        setItineraryCalendarConflict({ conflictingTrips: conflicts, draftStart: rangeStart, draftEnd: rangeEnd });
        setItineraryCalendarConflictErr("");
        return false;
      }
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
      const ideas = generatedDayIdeas;
      if (!Array.isArray(ideas) || ideas.length === 0) return false;
      for (const d of ideas) {
        const dayNum = Number(d?.day) || 1;
        const actDate = addDaysToDate(rangeStart, dayNum - 1);
        const bullets = Array.isArray(d?.bullets) ? d.bullets : [];
        const perActCost =
          bullets.length > 0 && Number(d?.costEur) > 0
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
      return onCreateTrip({
        title: dest,
        destination: dest,
        start_date: rangeStart,
        end_date: rangeEnd,
        selectedActivitiesWithSchedule: schedule,
        selectedActivities: schedule.map((r) => r.title),
        /** Après génération IA : ramener la vue sur le résumé voyage + calendrier, pas sur la liste d’activités. */
        plannerFocusTripAndCalendar: true,
      });
    },
    [trips, generatedDayIdeas, displayGuide, confirmedDestination, onCreateTrip]
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-normal uppercase tracking-[0.35em] text-sky-900/45">
          {t("destination.guideHeading")}
        </h2>
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
              <div className="relative h-[15.5rem] w-full overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-200 via-sky-50 to-slate-300 ring-1 ring-white/25 sm:h-[17.5rem]">
                {(() => {
                  const heroCtx = [displayGuide.city, displayGuide.country, displayGuide.adminRegion]
                    .filter(Boolean)
                    .join(", ")
                    .trim();
                  const cityStem = String(
                    heroImageStemFromDestination(heroCtx || displayGuide.city) ||
                      extractCityPrompt(displayGuide.city) ||
                      displayGuide.city ||
                      ""
                  ).trim();
                  const primary = String(
                    displayGuide.landscapeImageUrl || displayGuide.imageUrl || ""
                  ).trim();
                  const syncFallback = String(
                    resolveCityHeroImageUrl(cityStem) ||
                      getBundledCityHeroPath(cityStem) ||
                      getStorageMirrorHeroUrl(cityStem) ||
                      buildCityImageUrl(heroCtx || displayGuide.city || "") ||
                      ""
                  ).trim();
                  const heroSrc = (primary || syncFallback).trim();
                  if (!heroSrc) return (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="animate-pulse text-xs font-medium text-slate-400/80">{t("common.imageLoading")}</span>
                    </div>
                  );
                  return (
                    <img
                      key={`${cityStem || String(displayGuide.city)}|${heroSrc.slice(0, 48)}`}
                      src={heroSrc}
                      alt={displayCityForLocale(String(displayGuide.city), language)}
                      className={`h-full w-full object-cover ${destinationGuideHeroObjectPositionClass(cityStem)}`}
                      referrerPolicy="no-referrer"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
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
                <p className="text-[11px] font-normal uppercase tracking-[0.3em] text-sky-700/90">
                  {t("destination.badgeDestination")}
                </p>
                <h3 className="mt-2 font-display text-[1.65rem] font-normal leading-tight tracking-[0.04em] text-slate-900 sm:text-3xl">
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
                  className={`mt-5 rounded-2xl px-5 py-2.5 text-sm text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] ${GLASS_BUTTON_CLASS}`}
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
                    <h4 className="text-[11px] font-normal uppercase tracking-[0.24em] text-slate-800">
                      {t("destination.mustSeeTitle")}
                    </h4>
                    <p className="text-[11px] text-slate-500">{t("destination.mustSeeSubtitle")}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(() => {
                    const rawList = (displayGuide.places || []).map(String).filter(Boolean);
                    const visible = rawList.filter((p) => !isGenericExplorationPlaceName(p));
                    const showSkel = visible.length === 0;
                    return (
                      <>
                        {showSkel ? (
                          <>
                            <span className="inline-block h-8 w-[11.5rem] animate-pulse rounded-full bg-slate-200/90" />
                            <span className="inline-block h-8 w-[10rem] animate-pulse rounded-full bg-slate-200/90" />
                            <span className="inline-block h-8 w-[13rem] animate-pulse rounded-full bg-slate-200/85" />
                            <span className="inline-block h-8 w-[9rem] animate-pulse rounded-full bg-slate-200/80" />
                          </>
                        ) : null}
                        {visible.map((p, i) => {
                          const raw = String(p || "").trim();
                          return (
                            <button
                              key={`place-${i}-${raw.slice(0, 24)}`}
                              type="button"
                              onClick={() => setMustSeePlaceModalRaw(raw)}
                              className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-slate-200/90 bg-white px-3.5 py-1.5 text-left text-xs font-normal leading-snug tracking-[0.02em] text-slate-800 shadow-sm ring-1 ring-slate-100/80 transition hover:border-sky-200/90 hover:bg-sky-50/40 hover:ring-sky-100/80 active:scale-[0.98]"
                            >
                              <UiTranslatedActivityTitle raw={raw} />
                            </button>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </section>

              {(() => {
                /** Conseils du guide déjà générés dans la langue UI (`buildTravelTips` + `resolveTravelTips`). */
                const doList = (displayGuide.tips?.do || []).map(String).filter(Boolean);
                const cityLabel = String(displayGuide.city || "").trim();
                const canonical = resolveCanonicalCity(cityLabel);
                const loadedPlaces = (displayGuide.places || []).map(String).filter(Boolean);
                const concretePlaces = loadedPlaces.filter((p) => !isGenericExplorationPlaceName(p));
                const hasConcretePlaces = concretePlaces.length >= 2;
                const catalogPlaces = getIconicPlacesFallback(cityLabel) || [];
                const placesForTips =
                  hasConcretePlaces
                    ? concretePlaces
                    : catalogPlaces.length >= 2
                      ? catalogPlaces
                      : [];
                const fill =
                  placesForTips.length >= 2
                    ? resolveTravelTips(
                        normalizeTextForSearch(canonical),
                        String(canonical || cityLabel).trim() || cityLabel,
                        placesForTips,
                        language
                      ).do
                    : [];
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
                        className="text-[11px] font-normal uppercase tracking-[0.26em] text-slate-300"
                      >
                        {t("destination.tipsTitle")}
                      </h4>
                      <Sparkles className="h-4 w-4 shrink-0 text-amber-400/90" strokeWidth={2} aria-hidden />
                      <span className="sr-only">{t("destination.tipsSr")}</span>
                    </div>
                    {threeTips.length === 0 ? (
                      <div className="mt-6 space-y-5" aria-busy="true">
                        <div className="flex gap-4">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-600" aria-hidden />
                          <div className="h-3.5 flex-1 max-w-xl animate-pulse rounded-full bg-slate-700/55" />
                        </div>
                        <div className="flex gap-4">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-600" aria-hidden />
                          <div className="h-3.5 flex-1 max-w-lg animate-pulse rounded-full bg-slate-700/50" />
                        </div>
                        <div className="flex gap-4">
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-slate-600" aria-hidden />
                          <div className="h-3.5 flex-1 max-w-md animate-pulse rounded-full bg-slate-700/45" />
                        </div>
                      </div>
                    ) : (
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
                    )}
                  </section>
                );
              })()}

              <section className="rounded-[1.75rem] border border-indigo-200/50 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/40 p-5 shadow-[0_8px_32px_rgba(67,56,202,0.06)] sm:p-6">
                <div className="flex items-center gap-2.5 border-b border-indigo-100/80 pb-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200/60">
                    <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <h4 className="text-[11px] font-normal uppercase tracking-[0.24em] text-slate-800">
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
                        className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-indigo-200/70 bg-white px-3.5 py-2 text-xs font-normal leading-snug tracking-[0.02em] text-indigo-950 shadow-sm ring-1 ring-white/80"
                      >
                        <span>
                          <UiTranslatedActivityTitle raw={cell.title} />
                        </span>
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
                {(() => {
                  const gygPid = String(import.meta.env?.VITE_GYG_PARTNER_ID || "").trim();
                  const cityToken = String(displayGuide.city || "").split(",")[0].trim();
                  if (!gygPid || !cityToken) return null;
                  const gygHref = buildGetYourGuideAffiliateUrl(cityToken, gygPid);
                  if (!gygHref) return null;
                  return (
                    <div className="mt-4 rounded-2xl border border-indigo-100/90 bg-white/95 px-4 py-3 ring-1 ring-indigo-50/80">
                      <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.2em] text-slate-600">
                        {t("destination.gygWidgetTitle")}
                      </p>
                      <p className="mb-3 text-[11px] leading-snug text-slate-500">{t("destination.gygWidgetHint")}</p>
                      <a
                        href={gygHref}
                        target="_blank"
                        rel="sponsored noopener noreferrer"
                        className="inline-flex max-w-full items-center justify-center rounded-xl border border-indigo-200/80 bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-100/90 transition hover:border-orange-300/90 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                        aria-label={t("destination.gygLinkAria", { city: displayCityForLocale(cityToken, language) })}
                      >
                        <img
                          src={GYG_LOGO_SRC}
                          alt="GetYourGuide"
                          className="h-8 w-auto max-w-[min(220px,100%)] object-contain object-center"
                          loading="lazy"
                          decoding="async"
                          width={160}
                          height={40}
                        />
                      </a>
                    </div>
                  );
                })()}
              </section>

              <section className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200/80">
                      <Calendar className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-[11px] font-normal uppercase tracking-[0.24em] text-slate-800">
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
                    className="shrink-0 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-normal tracking-[0.04em] text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
                  >
                    {itineraryLoading ? t("destination.itineraryGenerating") : t("destination.itineraryGenerate")}
                  </button>
                </div>
                {itineraryError && !itineraryModalOpen && !itineraryResultOpen ? (
                  <ItineraryErrorNotice raw={itineraryError} />
                ) : null}
                {Array.isArray(generatedDayIdeas) && generatedDayIdeas.length > 0 ? (
                  <div className="mt-5">
                    {/* Aperçu condensé — invite à ouvrir le popup */}
                    <div className="overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-950 p-5 shadow-[0_8px_32px_rgba(99,102,241,0.25)]">
                      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={2.5} aria-hidden />
                        <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-slate-300">
                          {t("destination.itineraryResultTitle")}
                        </p>
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {generatedDayIdeas.slice(0, 3).map((d) => (
                          <li key={String(d?.day) + String(d?.title)} className="flex items-center gap-2.5 text-sm text-slate-300">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white ring-1 ring-white/20">
                              {Number(d?.day) || "·"}
                            </span>
                            <span className="font-normal tracking-[0.02em] text-white/90">
                              {String(d?.title || "")}
                            </span>
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
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-normal tracking-[0.04em] text-white ring-1 ring-white/20 transition hover:bg-white/20"
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
            {showDestinationHeroVideo ? (
              <video
                ref={destHeroVideoRef}
                key={DESTINATION_GUIDE_HERO_VIDEO_URL}
                className="absolute inset-0 z-0 h-full w-full object-cover object-[center_34%] sm:object-[center_42%]"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster={DESTINATION_GUIDE_HERO_IMAGE_1280}
                aria-label={t("destination.heroImageAlt")}
                onError={() => setHeroVideoFailed(true)}
              >
                {DESTINATION_GUIDE_HERO_VIDEO_SOURCES.map((s) => (
                  <source key={s.src} src={s.src} type={s.type} />
                ))}
              </video>
            ) : (
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
            )}
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_95%_75%_at_50%_48%,rgba(15,118,110,0.12)_0%,rgba(15,23,42,0.38)_100%)]"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-3 py-4 sm:px-10 sm:py-6">
              <div className="flex max-w-xl flex-col items-center">
                <p className="text-center font-display text-[clamp(1.75rem,8.5vw,3.5rem)] font-normal leading-[1.18] tracking-[0.02em] text-white antialiased sm:leading-[1.14] sm:tracking-[0.025em] [text-shadow:0_1px_0_rgba(255,255,255,0.12),0_2px_4px_rgba(0,0,0,0.55),0_8px_32px_rgba(0,0,0,0.45),0_0_1px_rgba(0,0,0,0.9)]">
                  {t("destination.heroTagline")}
                </p>
                <div
                  className="mt-4 h-px w-12 bg-gradient-to-r from-transparent via-white/55 to-transparent sm:mt-6 sm:w-16"
                  aria-hidden
                />
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

      {itineraryLoading && !itineraryResultOpen ? (
        <div
          className="fixed -inset-1 z-[80] flex items-center justify-center bg-black/40"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-white px-10 py-10 shadow-2xl">
            <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-sky-600 border-t-transparent" aria-hidden />
            <p className="text-sm font-normal tracking-[0.03em] text-slate-700">
              {t("destination.itineraryGenerating")}
            </p>
          </div>
        </div>
      ) : null}

      {itineraryResultOpen && Array.isArray(generatedDayIdeas) && generatedDayIdeas.length > 0 ? (
        <ItineraryResultModal
          dayIdeas={generatedDayIdeas}
          cityLabel={displayGuide ? displayCityForLocale(String(displayGuide.city || ""), language) : ""}
          startDate={String(
            lastItineraryRequest?.startDate || pendingTripRequest?.startDate || programStartDate
          )}
          endDate={String(
            lastItineraryRequest?.endDate || pendingTripRequest?.endDate || programEndDate
          )}
          prefs={lastItineraryPrefs}
          regenerating={itineraryRegenerating}
          fetchError={itineraryError}
          onClose={() => {
            setItineraryError("");
            setItineraryCalendarConflict(null);
            setItineraryCalendarConflictErr("");
            setItineraryResultOpenPersist(false);
          }}
          onRegenerate={handleRegenerateItinerary}
          onSaveToCalendar={async () => {
            const rangeStart = String(
              lastItineraryRequest?.startDate || pendingTripRequest?.startDate || programStartDate || ""
            );
            const rangeEnd = String(
              lastItineraryRequest?.endDate || pendingTripRequest?.endDate || programEndDate || ""
            );
            const ok = await saveProgramToCalendar(rangeStart, rangeEnd);
            if (ok) setItineraryResultOpenPersist(false);
          }}
        />
      ) : null}

      {itineraryModalOpen && displayGuide ? (
        <div className="fixed -inset-1 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setItineraryModalOpen(false); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="itinerary-modal-title"
            className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] border border-slate-200/80 bg-white p-4 shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2
                id="itinerary-modal-title"
                className="min-w-0 flex-1 text-sm font-normal leading-snug tracking-[0.03em] text-slate-900"
              >
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
            <div className="w-full min-w-0">
              <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.2em] text-slate-500">
                {t("tripForm.dateRangeTitle")}
              </p>
              <TripDateRangeField
                startDate={programStartDate}
                endDate={programEndDate}
                onRangeChange={(s, e) => {
                  setProgramStartDate(s);
                  setProgramEndDate(e);
                }}
              />
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-normal tracking-[0.03em] text-slate-700 hover:bg-slate-50 sm:w-auto"
              >
                {t("destination.itineraryCancel")}
              </button>
              <button
                type="button"
                onClick={handleGenerateItinerary}
                disabled={itineraryLoading}
                className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-sm font-normal tracking-[0.04em] text-white shadow-md hover:brightness-110 disabled:opacity-50 sm:w-auto"
              >
                {itineraryLoading ? t("destination.itineraryGenerating") : t("destination.itineraryNext")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itineraryPremiumGateOpen ? (
        <div
          className="fixed -inset-1 z-[65] flex items-center justify-center bg-black/40 p-3 sm:p-4"
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
                className={`mt-8 w-full rounded-2xl py-3.5 text-sm text-white shadow-[0_8px_24px_rgba(14,116,144,0.35)] transition hover:brightness-105 active:scale-[0.99] ${GLASS_BUTTON_CLASS}`}
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
          className="fixed -inset-1 z-[66] flex items-center justify-center bg-black/40 p-3 sm:p-4"
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
                  Réessaie plus tard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setItineraryQuotaModalOpen(false);
                  setItineraryError("");
                }}
                className={`mt-8 w-full rounded-2xl py-3.5 text-sm text-white shadow-[0_8px_24px_rgba(14,116,144,0.35)] transition hover:brightness-105 active:scale-[0.99] ${GLASS_BUTTON_CLASS}`}
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
          city={String(displayGuide?.city || "").trim() || String(confirmedDestination || "").trim()}
          language={language}
        />
      ) : null}

      {addModalOpen && displayGuide ? (
        <div className="fixed -inset-1 z-50 flex items-center justify-center overflow-x-hidden bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddModalOpen(false); }}>
          <div className="max-h-[min(90vh,40rem)] min-w-0 w-full max-w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
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
            <TripDateRangeField
              startDate={startDate}
              endDate={endDate}
              onRangeChange={(s, e) => {
                setStartDate(s);
                setEndDate(e);
              }}
            />
            <div className="mt-5">
              <p className="text-[11px] font-normal uppercase tracking-[0.2em] text-slate-600">
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
                        <span className="min-w-0 flex-1 text-sm font-normal leading-snug tracking-[0.02em] text-slate-900">
                          <UiTranslatedActivityTitle raw={rawLabel} />
                        </span>
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
                    <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-sky-800/90">
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
                            key={`sched-${actIndex}-${rawPick.slice(0, 24)}`}
                            className="flex min-w-0 flex-col gap-2 rounded-xl bg-white/90 px-2.5 py-2 ring-1 ring-sky-100/80 sm:flex-row sm:items-center sm:gap-2"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="min-w-0 flex-1 text-xs font-normal leading-snug tracking-[0.02em] text-slate-800">
                                <UiTranslatedActivityTitle raw={rawPick} />
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
                            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:max-w-none sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
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
                                className="box-border w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-sm font-medium text-slate-800 sm:w-auto sm:max-w-[13.5rem] sm:py-1.5 sm:text-[11px]"
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
                                className="box-border w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-sm font-medium text-slate-800 sm:w-auto sm:max-w-[7.5rem] sm:py-1.5 sm:text-[11px]"
                              >
                                {TRIP_SCHEDULE_TIME_OPTIONS.map((timeOpt) => (
                                  <option key={timeOpt} value={timeOpt}>
                                    {timeOpt}
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

      {itineraryCalendarConflict ? (
        <div
          className="fixed -inset-1 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-itin-cal-conflict-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !itineraryCalendarConflictSaving) {
              setItineraryCalendarConflict(null);
              setItineraryCalendarConflictErr("");
            }
          }}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-[1.75rem]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain px-5 pb-4 pt-5 sm:px-6">
              <h3 id="tp-itin-cal-conflict-title" className="text-lg font-semibold text-slate-900">
                {t("modals.tripDateTitle")}
              </h3>
              {(() => {
                const rows = (itineraryCalendarConflict.conflictingTrips || []).map((tripRow) => {
                  const city = displayCityForLocale(
                    tripDestinationDisplayName(tripRow) || t("modals.tripDefault"),
                    language
                  );
                  const range = `${formatDate(tripRow.start_date)} – ${formatDate(tripRow.end_date)}`;
                  return { key: String(tripRow.id), city, range };
                });
                if (rows.length === 0) {
                  return (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("modals.tripDateIntro")}</p>
                  );
                }
                if (rows.length === 1) {
                  return (
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      {t("destination.itineraryCalendarOverlapOneBeforeCity")}
                      <span className="font-semibold text-slate-900">{rows[0].city}</span>
                      {t("destination.itineraryCalendarOverlapOneAfterCity")}
                      <span className="font-semibold text-slate-900">{rows[0].range}</span>
                      {t("destination.itineraryCalendarOverlapOneAfterRange")}
                    </p>
                  );
                }
                return (
                  <>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
                      {t("destination.itineraryCalendarOverlapManyIntro")}
                    </p>
                    <ul className="mt-2 max-h-32 list-none space-y-1.5 overflow-y-auto text-sm leading-relaxed text-slate-700">
                      {rows.map((r) => (
                        <li key={r.key}>
                          <span className="font-semibold text-slate-900">{r.city}</span>
                          {" ("}
                          <span className="font-semibold text-slate-900">{r.range}</span>
                          {")"}
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {t("destination.itineraryCalendarConflictHint")}
              </p>
              <div className="mt-4 w-full min-w-0">
                <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.2em] text-slate-500">
                  {t("tripForm.dateRangeTitle")}
                </p>
                <TripDateRangeField
                  startDate={itineraryCalendarConflict.draftStart}
                  endDate={itineraryCalendarConflict.draftEnd}
                  onRangeChange={(s, e) => {
                    setItineraryCalendarConflict((prev) =>
                      prev ? { ...prev, draftStart: s, draftEnd: e } : prev
                    );
                    setItineraryCalendarConflictErr("");
                  }}
                />
              </div>
              {(() => {
                const span = countInclusiveTripDaysClient(
                  itineraryCalendarConflict.draftStart,
                  itineraryCalendarConflict.draftEnd
                );
                return (
                  <p className="mt-2 text-xs text-slate-600">
                    {span.ok
                      ? t("destination.itineraryDuration", { n: span.days })
                      : span.error || t("destination.itineraryDatesError")}
                  </p>
                );
              })()}
              {itineraryCalendarConflictErr ? (
                <p className="mt-3 text-sm text-rose-600">{itineraryCalendarConflictErr}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={itineraryCalendarConflictSaving}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                onClick={() => {
                  setItineraryCalendarConflict(null);
                  setItineraryCalendarConflictErr("");
                }}
              >
                {t("destination.itineraryCancel")}
              </button>
              <button
                type="button"
                disabled={itineraryCalendarConflictSaving}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                onClick={async () => {
                  const c = itineraryCalendarConflict;
                  if (!c) return;
                  const ds = c.draftStart;
                  const de = c.draftEnd;
                  const beforeGen = c.phase === "beforeGenerate";
                  setItineraryCalendarConflictSaving(true);
                  setItineraryCalendarConflictErr("");
                  try {
                    const span = countInclusiveTripDaysClient(ds, de);
                    if (!span.ok) {
                      setItineraryCalendarConflictErr(span.error);
                      return;
                    }
                    if (
                      !beforeGen &&
                      Array.isArray(generatedDayIdeas) &&
                      generatedDayIdeas.length > 0 &&
                      span.days < generatedDayIdeas.length
                    ) {
                      setItineraryCalendarConflictErr(
                        t("destination.itineraryCalendarNeedDays", { n: generatedDayIdeas.length })
                      );
                      return;
                    }
                    const still = findTripsOverlappingDateRange(trips, ds, de, null);
                    if (still.length > 0) {
                      setItineraryCalendarConflictErr(t("destination.itineraryCalendarStillConflict"));
                      setItineraryCalendarConflict((prev) =>
                        prev ? { ...prev, conflictingTrips: still } : prev
                      );
                      return;
                    }
                    const dest = String(displayGuide?.city || confirmedDestination || "");
                    setProgramStartDate(ds);
                    setProgramEndDate(de);
                    setLastItineraryRequest((prev) => ({
                      dest: String(prev?.dest || dest),
                      startDate: ds,
                      endDate: de,
                    }));
                    setPendingTripRequest((prev) =>
                      prev ? { ...prev, startDate: ds, endDate: de } : { dest, startDate: ds, endDate: de }
                    );
                    setItineraryCalendarConflict(null);
                    setItineraryCalendarConflictErr("");

                    if (beforeGen) {
                      if (c.afterResolve === "openPrefs") {
                        setItineraryModalOpen(false);
                        setTripPrefsOpen(true);
                        return;
                      }
                      if (c.afterResolve === "runGeneration") {
                        const prefs =
                          c.prefsForGeneration !== undefined && c.prefsForGeneration !== null
                            ? c.prefsForGeneration
                            : lastItineraryPrefs;
                        const kind = c.generationKind === "regenerate" ? "regenerate" : "initial";
                        await runItineraryGenerationWithDates(dest, ds, de, prefs, kind);
                      }
                      return;
                    }

                    saveItineraryToSession(dest, generatedDayIdeas, lastItineraryPrefs, ds, de, true);
                    const ok = await saveProgramToCalendar(ds, de);
                    if (ok) setItineraryResultOpenPersist(false);
                  } finally {
                    setItineraryCalendarConflictSaving(false);
                  }
                }}
              >
                {itineraryCalendarConflictSaving
                  ? itineraryCalendarConflict.phase === "beforeGenerate"
                    ? t("destination.itineraryGenerating")
                    : t("destination.itineraryAdding")
                  : itineraryCalendarConflict.phase === "beforeGenerate"
                    ? t("destination.itineraryCalendarApplyContinue")
                    : t("destination.itineraryCalendarApplyAdd")}
              </button>
            </div>
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
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-emerald-700">
            {t("home.now")}
          </h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-emerald-700">
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
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-sky-700">
            {t("home.upcoming")}
          </h2>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-sky-700">
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
          <h2 className="font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-600">
            {t("trips.memories")}
          </h2>
          <span className="rounded-full bg-slate-200 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-slate-600">
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

  const editingRawForI18n = editingActivity
    ? String(editingActivity?.title || editingActivity?.name || "")
    : "";
  const { text: plannerEditTitleBaseline } = useUiTranslatedText(editingRawForI18n, language);

  const viewRawTitle =
    activityDetailsOpen && viewingActivity
      ? String(viewingActivity?.title || viewingActivity?.name || "")
      : "";
  const { text: viewDetailTitleTr } = useUiTranslatedText(viewRawTitle, language);
  const viewRawLoc =
    activityDetailsOpen && viewingActivity ? String(viewingActivity?.location || "").trim() : "";
  const { text: viewDetailLocTr } = useUiTranslatedText(viewRawLoc, language);
  const viewRawDesc =
    activityDetailsOpen && viewingActivity ? String(viewingActivity?.description || "").trim() : "";
  const { text: viewDetailDescTr } = useUiTranslatedText(viewRawDesc, language);

  const deleteRawTitle = activityToDelete
    ? String(activityToDelete?.title || activityToDelete?.name || "")
    : "";
  const { text: deleteActivityTitleTr } = useUiTranslatedText(deleteRawTitle, language);

  useEffect(() => {
    if (!editActivityModalOpen || !editingActivity) return;
    const raw = String(editingActivity?.title || editingActivity?.name || "").trim();
    if (!raw) return;
    setTitle((prev) => {
      const dict = displayActivityTitleForLocale(raw, language);
      const baseline = String(plannerEditTitleBaseline || "").trim();
      if (prev === raw || prev === dict || prev === baseline) return baseline || prev;
      return prev;
    });
  }, [editActivityModalOpen, editingActivity?.id, language, plannerEditTitleBaseline]);

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
        <div className="order-1 min-w-0 rounded-[2rem] bg-white/52 p-4 shadow-2xl backdrop-blur-md sm:rounded-[3rem] sm:p-5 md:rounded-[4.5rem] md:p-6 lg:order-1 lg:justify-self-start lg:w-full">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-1">
            <button onClick={() => setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-full px-3 py-2 hover:bg-slate-100">
              {"<"}
            </button>
            <h2 className="min-w-0 truncate px-1 text-center text-[10px] font-normal uppercase tracking-[0.28em] text-slate-500 sm:text-xs sm:tracking-[0.32em]">
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
          <h3 className="mb-3 break-all text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
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
                      <UiTranslatedActivityTitle
                        raw={String(a?.title || a?.name || "")}
                        emptyFallback={t("planner.activityNamePlaceholder")}
                        className="truncate"
                      />
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
        <div className="fixed -inset-1 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setActivityModalOpen(false); setActivityTime(""); setActivityFormError(""); } }}>
          <div className="min-w-0 w-full max-w-lg max-h-[min(92dvh,100svh)] overflow-y-auto overflow-x-hidden rounded-t-[2rem] bg-white/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8 sm:pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("planner.newActivityTitle")}</h2>
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
            <div className="min-w-0 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("planner.activityNamePlaceholder")}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("planner.descriptionPlaceholder")}
                rows={3}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <div className="min-w-0 w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white [contain:inline-size]">
                <input
                  type="time"
                  value={activityTime}
                  onChange={(e) => setActivityTime(e.target.value)}
                  className="box-border block min-h-[3rem] w-full min-w-0 max-w-full border-0 bg-transparent px-4 py-3 text-start text-base [color-scheme:light] [font-variant-numeric:tabular-nums] outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300/60 sm:min-h-0 sm:text-sm [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:max-w-full [&::-webkit-datetime-edit]:text-start [&::-webkit-datetime-edit-fields-wrapper]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:max-w-full [&::-webkit-datetime-edit-fields-wrapper]:py-0"
                />
              </div>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("planner.locationPlaceholder")}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <div className="relative min-w-0">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder={t("planner.costPlaceholder")}
                  className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-base sm:text-sm"
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
        <div className="fixed -inset-1 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setActivityDetailsOpen(false); setViewingActivity(null); } }}>
          <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white/95 p-4 shadow-[0_24px_60px_rgba(2,6,23,0.2)] backdrop-blur-xl sm:rounded-[2.5rem] sm:p-7" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="min-w-0 font-display text-[11px] font-normal uppercase tracking-[0.32em] text-slate-500">
                {t("planner.detailsTitle")}
              </h2>
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
              <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-slate-500">
                {t("planner.activityFieldLabel")}
              </p>
              <p className="mt-1 text-lg font-normal leading-snug tracking-[0.02em] text-slate-900">
                {String(viewingActivity?.title || viewingActivity?.name || "").trim()
                  ? viewDetailTitleTr
                  : t("planner.activityNamePlaceholder")}
              </p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-500">
                {t("planner.dateField")}
                </p>
                <p className="mt-1 break-all text-sm font-normal tracking-[0.02em] text-slate-900">
                  {viewingActivity?.date ? formatDate(viewingActivity.date) : "-"}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-500">
                {t("planner.timeField")}
                </p>
                <p className="mt-1 text-sm font-normal tabular-nums tracking-[0.02em] text-slate-900">
                  {String(viewingActivity?.time || "--:--")}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-500">
                {t("planner.budgetField")}
                </p>
                <p className="mt-1 text-sm font-normal tabular-nums tracking-[0.02em] text-slate-900">
                  {Number(viewingActivity?.cost || 0).toFixed(2)} {t("planner.currencyEur")}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4 sm:col-span-2">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-500">
                {t("planner.locationField")}
                </p>
                <p className="mt-1 break-words text-sm font-normal tracking-[0.02em] text-slate-900">
                  {viewRawLoc ? viewDetailLocTr : "-"}
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:col-span-2 sm:px-4">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-500">
                {t("planner.descriptionField")}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-normal tracking-[0.02em] text-slate-700">
                  {viewRawDesc ? viewDetailDescTr : t("planner.noDescriptionYet")}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editActivityModalOpen && editingActivity ? (
        <div className="fixed -inset-1 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) { setEditActivityModalOpen(false); setEditingActivity(null); setActivityTime(""); } }}>
          <div className="min-w-0 w-full max-w-lg max-h-[min(92dvh,100svh)] overflow-y-auto overflow-x-hidden rounded-t-[2rem] bg-white/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8 sm:pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between gap-2">
              <h2 className="min-w-0 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("planner.editActivityTitle")}</h2>
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
            <div className="min-w-0 space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("planner.activityNamePlaceholder")}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("planner.descriptionPlaceholder")}
                rows={3}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <div className="min-w-0 w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white [contain:inline-size]">
                <input
                  type="time"
                  value={activityTime}
                  onChange={(e) => setActivityTime(e.target.value)}
                  className="box-border block min-h-[3rem] w-full min-w-0 max-w-full border-0 bg-transparent px-4 py-3 text-start text-base [color-scheme:light] [font-variant-numeric:tabular-nums] outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300/60 sm:min-h-0 sm:text-sm [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:max-w-full [&::-webkit-datetime-edit]:text-start [&::-webkit-datetime-edit-fields-wrapper]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:max-w-full [&::-webkit-datetime-edit-fields-wrapper]:py-0"
                />
              </div>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("planner.locationPlaceholder")}
                className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base sm:text-sm"
              />
              <div className="relative min-w-0">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder={t("planner.costPlaceholder")}
                  className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-base sm:text-sm"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  €
                </span>
              </div>
              <button
                onClick={() => {
                  const rawStored = String(editingActivity?.title || editingActivity?.name || "");
                  const titleOut =
                    activityTitleSaveValue(rawStored, title, language, {
                      displayBaseline: plannerEditTitleBaseline,
                    }) || t("planner.activityNamePlaceholder");
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
        <div className="fixed -inset-1 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setActivityToDelete(null); }}>
          <div className="min-w-0 w-full max-w-md overflow-x-hidden rounded-[2rem] bg-white/90 p-4 shadow-2xl backdrop-blur-xl sm:rounded-[3.5rem] sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 font-display text-xs font-normal uppercase tracking-[0.32em] text-slate-500">{t("planner.confirmTitle")}</h2>
            <p className="mb-6 break-words text-sm font-normal tracking-[0.02em] text-slate-700">
              {t("planner.deleteActivityQuestion", {
                name: String(activityToDelete?.title || activityToDelete?.name || "").trim()
                  ? deleteActivityTitleTr
                  : t("planner.activityNamePlaceholder"),
              })}
            </p>
            <div className={MODAL_GRID_2}>
              <button
                onClick={() => setActivityToDelete(null)}
                className="min-w-0 rounded-2xl border border-slate-200 px-2 py-3 text-sm font-normal tracking-[0.03em] hover:bg-slate-100 sm:px-4"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  onDeleteActivity(activityToDelete);
                  setActivityToDelete(null);
                }}
                className="min-w-0 rounded-2xl px-2 py-3 text-sm font-normal tracking-[0.03em] text-white sm:px-4"
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
  useScrollLock(open);
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
    <div className="fixed -inset-1 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="min-w-0 w-full max-w-lg overflow-x-hidden rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-slate-200/80 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
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
            <p className="mb-2 text-[10px] font-normal uppercase tracking-[0.16em] text-slate-500">
              {t("budget.paidBySection")}
            </p>
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
            <p className="mb-2 text-[10px] font-normal uppercase tracking-[0.16em] text-slate-500">
              {t("budget.splitBetween")}
            </p>
            <p className="mb-2 text-[11px] font-normal tracking-[0.02em] text-slate-500">
              {t("budget.splitBetweenHint")}
            </p>
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
            className={`w-full rounded-2xl px-4 py-3 text-sm text-white disabled:opacity-60 ${GLASS_BUTTON_CLASS}`}
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
  const { text: labelI18n } = useUiTranslatedCityName(rawLabel, language);
  const label = rawLabel ? labelI18n : t("modals.tripDefault");
  const imageTitle = String(trip?.destination || trip?.title || "voyage");
  const dr =
    trip?.start_date && trip?.end_date
      ? `${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}`
      : "";

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="group block w-full overflow-hidden rounded-[2rem] border-0 bg-transparent p-0 text-left shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-200"
    >
      <TripLiquidGlassShell
        imageTitle={imageTitle}
        active={false}
        contrast="high"
        className="rounded-[2rem] border border-white/42 text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] transition group-hover:border-white/55"
      >
        <div className="flex items-start justify-between gap-2 px-3 py-3.5 sm:gap-3 sm:px-4 sm:py-4">
          <div
            className="min-w-0 flex-1"
            style={{
              textShadow:
                "0 1px 2px rgba(0,0,0,0.85), 0 2px 16px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.9)",
            }}
          >
            <h3 className="break-words text-lg font-normal tracking-[0.06em] text-white sm:text-xl">
              {label}
            </h3>
            {dr ? (
              <p className="mt-0.5 break-all text-xs font-normal tracking-[0.02em] text-white/92">
                {dr}
              </p>
            ) : null}
            {groupExpensesEnabled ? (
              <div className="mt-2.5 flex flex-col gap-1 text-xs font-normal tracking-[0.02em] text-white/92 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-1.5">
                <span className="min-w-0">
                  <span className="text-white/82">{t("budget.sharedExpensesLabel")}</span>{" "}
                  <span className="tabular-nums text-white">{formatEuroFR(totalGroup)}</span>
                </span>
                <span className="hidden text-white/50 sm:inline" aria-hidden>
                  ·
                </span>
                <span className="min-w-0">
                  <span className="text-white/82">{t("budget.plannerRefLabel")}</span>{" "}
                  <span className="tabular-nums text-white">{formatEuroFR(totalPlanner)}</span>
                </span>
              </div>
            ) : (
              <p className="mt-2.5 text-xs font-normal tracking-[0.02em] text-white/92">
                <span className="text-white/82">{t("budget.plannerRefLabel")}</span>{" "}
                <span className="tabular-nums text-white">{formatEuroFR(totalPlanner)}</span>
              </p>
            )}
            <p className="mt-2 text-[11px] font-normal tracking-[0.04em] text-white underline decoration-white/50 underline-offset-2">
              {t("budget.openTripBudget")}
            </p>
          </div>
          <ChevronRight
            className="mt-0.5 h-5 w-5 shrink-0 text-white/90"
            strokeWidth={2}
            aria-hidden
            style={{
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.85)) drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
            }}
          />
        </div>
      </TripLiquidGlassShell>
    </button>
  );
}

/** Bottom sheet mobile : seuil de fermeture au swipe vers le bas (px). */
const BUDGET_SHEET_DISMISS_PX = 100;

function isBudgetSheetMobileDrag() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 639px)").matches;
}

function BudgetTripDetailShell({ trip, onClose, children }) {
  const { t, language } = useI18n();
  const rawLabel = String(trip?.destination || trip?.title || "").trim();
  const { text: budgetShellCityLabel } = useUiTranslatedCityName(rawLabel, language);
  const label = rawLabel ? budgetShellCityLabel : t("modals.tripDefault");
  const dr =
    trip?.start_date && trip?.end_date
      ? `${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}`
      : "";
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetTouchStartY = useRef(0);
  const sheetTouchStartX = useRef(0);
  /** Sync true dès touchstart — évite que le 1er touchmove arrive avant le re-render (sheetDragging encore false). */
  const sheetDragSessionRef = useRef(false);
  /** Dernière position de drag (sync) pour touchend fiable vs setState async. */
  const sheetDragYRef = useRef(0);

  const onSheetDragStart = useCallback((e) => {
    if (!isBudgetSheetMobileDrag() || !e.touches?.[0]) return;
    sheetTouchStartY.current = e.touches[0].clientY;
    sheetTouchStartX.current = e.touches[0].clientX;
    sheetDragSessionRef.current = true;
    sheetDragYRef.current = 0;
    setSheetDragging(true);
  }, []);

  const onSheetDragMove = useCallback((e) => {
    if (!sheetDragSessionRef.current || !isBudgetSheetMobileDrag() || !e.touches?.[0]) return;
    const y = e.touches[0].clientY;
    const x = e.touches[0].clientX;
    const dy = y - sheetTouchStartY.current;
    const dx = Math.abs(x - sheetTouchStartX.current);
    if (dy > 0 && dy > dx * 0.35) {
      sheetDragYRef.current = dy;
      setSheetDragY(dy);
    }
  }, []);

  const onSheetDragEnd = useCallback(() => {
    if (!sheetDragSessionRef.current) return;
    sheetDragSessionRef.current = false;
    setSheetDragging(false);
    const y = sheetDragYRef.current;
    sheetDragYRef.current = 0;
    setSheetDragY(0);
    if (y >= BUDGET_SHEET_DISMISS_PX) onClose();
  }, [onClose]);

  if (!trip) return null;
  return (
    <div
      className="fixed -inset-1 z-[45] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-trip-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[min(92dvh,100svh)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-t-[2.25rem] bg-white shadow-[0_-12px_48px_rgba(2,6,23,0.2)] sm:max-h-[90vh] sm:rounded-[2rem] sm:shadow-2xl ${!sheetDragging ? "transition-transform duration-200 ease-out" : ""}`}
        style={
          sheetDragY > 0
            ? { transform: `translateY(${sheetDragY}px)`, willChange: "transform" }
            : undefined
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 touch-none border-b border-slate-100 sm:touch-auto"
          onTouchStart={onSheetDragStart}
          onTouchMove={onSheetDragMove}
          onTouchEnd={onSheetDragEnd}
          onTouchCancel={onSheetDragEnd}
        >
          <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden>
            <span className="block h-1 w-10 rounded-full bg-slate-300/90" />
          </div>
          <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-1 sm:gap-3 sm:px-6 sm:pt-4">
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-slate-400">
                {t("budget.tripDetailTitle")}
              </p>
              <h2
                id="budget-trip-detail-title"
                className="mt-1 line-clamp-2 break-words text-lg font-normal leading-snug tracking-[0.03em] text-slate-900"
              >
                {label}
              </h2>
              {dr ? (
                <p className="mt-0.5 break-all text-xs font-normal tracking-[0.02em] text-slate-500">
                  {dr}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              onTouchStart={(e) => e.stopPropagation()}
              className="shrink-0 rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
              aria-label={t("menu.closeMenu")}
            >
              <X size={22} />
            </button>
          </div>
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
  onShareTrip,
}) {
  const { t, language } = useI18n();
  const [editingActivity, setEditingActivity] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editTime, setEditTime] = useState("");
  const [groupModal, setGroupModal] = useState(null);
  const [groupSaving, setGroupSaving] = useState(false);

  const budgetEditRawTitle = editingActivity
    ? String(editingActivity?.title || editingActivity?.name || "")
    : "";
  const { text: budgetEditingTitleBaseline } = useUiTranslatedText(budgetEditRawTitle, language);

  useEffect(() => {
    if (!editingActivity) return;
    const raw = String(editingActivity?.title || editingActivity?.name || "").trim();
    if (!raw) return;
    setEditTitle((prev) => {
      const dict = displayActivityTitleForLocale(raw, language);
      const baseline = String(budgetEditingTitleBaseline || "").trim();
      if (prev === raw || prev === dict || prev === baseline) return baseline || prev;
      return prev;
    });
  }, [editingActivity?.id, language, budgetEditingTitleBaseline]);

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
  const { text: tripLabelI18n } = useUiTranslatedCityName(tripLabelRaw, language);
  const tripLabel = tripLabelRaw ? tripLabelI18n : t("modals.tripDefault");
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

  return (
    <>
      <div className="max-w-full overflow-x-hidden rounded-[2rem] border border-slate-200/80 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/80 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-normal tracking-[0.03em] text-slate-900">{tripLabel}</h3>
            {dateRange ? (
              <p className="mt-0.5 text-xs font-normal uppercase tracking-[0.18em] text-slate-400">
                {dateRange}
              </p>
            ) : null}
          </div>
          {!isTripPastByEndDate(trip) ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {typeof onShareTrip === "function" ? (
                <button
                  type="button"
                  onClick={() => onShareTrip(trip)}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-normal tracking-[0.03em] text-indigo-900 shadow-sm transition hover:bg-indigo-100 sm:w-auto"
                >
                  <Share2 size={18} className="text-indigo-700" strokeWidth={2} />
                  {t("tripCard.share")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenParticipants(trip)}
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-normal tracking-[0.03em] text-slate-800 shadow-sm transition hover:bg-slate-100 sm:w-auto"
              >
                <Users size={18} className="text-slate-600" strokeWidth={2} />
                {t("budget.participants")}
              </button>
            </div>
          ) : null}
        </div>

        {!groupExpensesEnabled ? (
          <div className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <p className="font-normal tracking-[0.02em]">{t("budget.groupDisabledTitle")}</p>
            <p className="mt-1 text-xs font-normal leading-relaxed tracking-[0.02em] text-amber-900/85">
              {t("budget.groupDisabledBody")}
            </p>
          </div>
        ) : null}

        {groupExpensesEnabled ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50/80 px-4 py-3.5 ring-1 ring-indigo-200/50">
                <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-indigo-800/80">
                  {t("budget.totalShared")}
                </p>
                <p className="mt-1.5 text-2xl font-normal tabular-nums tracking-[0.02em] text-indigo-950">
                  {formatEuroFR(totalGroup)}
                </p>
                <p className="mt-1 text-[11px] font-normal leading-snug tracking-[0.02em] text-indigo-900/70">
                  {t("budget.totalSharedHint")}
                </p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 px-4 py-3.5 ring-1 ring-slate-200/60">
                <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-500">
                  {t("budget.plannerRefLabel")}
                </p>
                <p className="mt-1.5 text-2xl font-normal tabular-nums tracking-[0.02em] text-slate-900">
                  {formatEuroFR(totalPlanner)}
                </p>
                <p className="mt-1 text-[11px] font-normal leading-snug tracking-[0.02em] text-slate-500">
                  {t("budget.plannerRefHint")}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-slate-500">
                {t("budget.balances")}
              </p>
              <p className="mt-1 text-[11px] font-normal tracking-[0.02em] text-slate-500">
                {t("budget.balancesHint")}
              </p>
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
                      <span className="min-w-0 truncate font-normal tracking-[0.02em] text-slate-800">
                        {displayName(person)}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums font-normal tracking-[0.02em] ${
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
                <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-emerald-800">
                  {t("budget.settlementsTitle")}
                </p>
                <p className="mt-1 text-[11px] font-normal tracking-[0.02em] text-emerald-900/70">
                  {t("budget.settlementsHint")}
                </p>
                <ul className="mt-3 space-y-2">
                  {settlements.map((s, i) => (
                    <li
                      key={`${s.from}-${s.to}-${i}`}
                      className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 ring-1 ring-emerald-100/80 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words font-normal tracking-[0.02em]">
                          {displayName(s.from)}
                        </span>
                        <ArrowRight size={14} className="shrink-0 text-emerald-600" aria-hidden />
                        <span className="break-words font-normal tracking-[0.02em]">
                          {displayName(s.to)}
                        </span>
                      </div>
                      <span className="shrink-0 font-normal tabular-nums tracking-[0.02em] text-emerald-800">
                        {formatEuroFR(s.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setGroupModal({ mode: "add" })}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm text-white ${GLASS_BUTTON_CLASS}`}
                style={GLASS_ACCENT_STYLE}
              >
                <Plus size={18} />
                {t("budget.newExpense")}
              </button>
            </div>

            <div className="mb-6 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <Receipt size={16} className="text-slate-400" strokeWidth={2} aria-hidden />
                <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-slate-500">
                  {t("budget.expenseList")}
                </p>
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
                          <p className="break-words font-normal tracking-[0.02em] text-slate-900">
                            {e.title}
                          </p>
                          <p className="mt-0.5 break-words text-xs font-normal tracking-[0.02em] text-slate-500">
                            {t("budget.paidBy")}{" "}
                            <span className="text-slate-700">{displayName(e.paid_by)}</span>
                            {" · "}
                            {t("budget.splitLabel")} {splitLabel}
                          </p>
                          {e.expense_date ? (
                            <p className="mt-1 text-[10px] font-normal tracking-[0.02em] text-slate-400">
                              {e.expense_date}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <p className="pt-0.5 text-sm font-normal tabular-nums tracking-[0.02em] text-slate-800">
                            {formatEuroFR(e.amount)}
                          </p>
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
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm font-normal tracking-[0.02em] text-slate-500">
                  {t("budget.noGroupExpenses")}
                </p>
              )}
            </div>
          </>
        ) : null}

        <div className={groupExpensesEnabled ? "border-t border-slate-100 pt-4" : ""}>
          <div className="mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" strokeWidth={2} aria-hidden />
            <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-slate-500">
              {t("budget.plannerActivities")}
            </p>
          </div>
          {sortedActivities && sortedActivities.length > 0 ? (
            <ul className="space-y-2">
              {sortedActivities.map((a, idx) => (
                <li
                  key={`${String(a?.id || "a")}-${idx}`}
                  className="flex items-start justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-normal tracking-[0.02em] text-slate-900">
                      <UiTranslatedActivityTitle
                        raw={String(a?.title || a?.name || "")}
                        emptyFallback={t("planner.activityNamePlaceholder")}
                      />
                    </p>
                    <p className="mt-0.5 truncate text-xs font-normal tracking-[0.02em] text-slate-500">
                      {String(a?.location || t("budget.locationUnknown"))}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-normal tracking-[0.02em] text-slate-400">
                      {a?.date ? (
                        <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200/80">
                          {String(a.date)}
                        </span>
                      ) : null}
                      {a?.time ? <span>{String(a.time)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <p className="pt-0.5 text-sm font-normal tabular-nums tracking-[0.02em] text-slate-800">
                      {formatEuroFR(a?.cost)}
                    </p>
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
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center text-sm font-normal tracking-[0.02em] text-slate-500">
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
            if (payload.id) {
              await onUpdateGroupExpense(payload);
              setGroupModal(null);
            } else {
              const ok = await onAddGroupExpense(payload);
              if (ok) setGroupModal(null);
            }
          } finally {
            setGroupSaving(false);
          }
        }}
      />

      {editingActivity ? (
        <div
          className="fixed -inset-1 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setEditingActivity(null)}
        >
          <div
            className="min-w-0 w-full max-w-lg max-h-[min(92dvh,100svh)] overflow-y-auto overflow-x-hidden rounded-t-[2rem] bg-white/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl sm:rounded-[3rem] sm:p-6 sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="min-w-0 flex-1 break-words text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
                {t("planner.editActivityTitle")}
              </h3>
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
                className="box-border w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3.5 text-base sm:px-4 sm:text-sm"
              />
              <input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder={t("budget.locationOptionalPh")}
                className="box-border w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3.5 text-base sm:px-4 sm:text-sm"
              />
              <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3">
                <div className="min-w-0 w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white [contain:inline-size]">
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="box-border block min-h-[3rem] min-w-0 w-full max-w-full border-0 bg-transparent px-3 py-3 text-start text-base [color-scheme:light] [font-variant-numeric:tabular-nums] outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300/60 sm:min-h-0 sm:px-4 sm:text-sm [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:max-w-full [&::-webkit-datetime-edit]:text-start [&::-webkit-datetime-edit-fields-wrapper]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:max-w-full [&::-webkit-datetime-edit-fields-wrapper]:py-0"
                  />
                </div>
                <div className="relative min-w-0 w-full">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    placeholder={t("planner.costPlaceholder")}
                    className="box-border min-h-[3rem] w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 pr-10 text-base sm:min-h-0 sm:px-4 sm:pr-10 sm:text-sm"
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
                    activityTitleSaveValue(rawStored, editTitle, language, {
                      displayBaseline: budgetEditingTitleBaseline,
                    }) || t("planner.activityNamePlaceholder");
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
      <div className="rounded-[2rem] bg-white/72 p-4 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/60 backdrop-blur-lg sm:p-5">
        <h2 className="text-xs font-normal uppercase tracking-[0.3em] text-slate-500">
          {t("chat.groupsTitle")}
        </h2>
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
                  type="button"
                  onClick={() => setChatTripId(String(trip.id))}
                  className={`block w-full overflow-hidden rounded-2xl border-0 bg-transparent p-0 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 ${
                    active
                      ? "text-white shadow-[0_16px_34px_rgba(2,6,23,0.24)]"
                      : "text-white shadow-[0_12px_26px_rgba(15,23,42,0.16)] hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.2)]"
                  }`}
                >
                  <TripLiquidGlassShell
                    imageTitle={String(trip?.destination || trip?.title || "voyage")}
                    active={active}
                    contrast="high"
                    className={`rounded-2xl border px-4 py-3 shadow-none ring-0 ${
                      active ? "border-white/55" : "border-white/40"
                    }`}
                  >
                    <div
                      style={{
                        textShadow:
                          "0 1px 2px rgba(0,0,0,0.85), 0 2px 16px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.9)",
                      }}
                    >
                      <p className="text-base font-normal tracking-[0.05em]">
                        <UiLocalizedTripTitle raw={String(trip.title || "")} emptyLabel={t("modals.tripDefault")} />
                      </p>
                      <p className="text-xs text-white/92">
                        {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        {participantsRaw.slice(0, 4).map((rawParticipant, idx) => {
                          const label = participantLabels[idx];
                          return (
                            <ParticipantCircleAvatar
                              key={`${String(trip.id)}-${String(rawParticipant)}`}
                              raw={rawParticipant}
                              session={session}
                              displayLabel={label}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ring-1 ring-white/45"
                            />
                          );
                        })}
                        {participantLabels.length > 4 ? (
                          <span className="text-[10px] text-white/90">+{participantLabels.length - 4}</span>
                        ) : null}
                      </div>
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
        <div className="fixed -inset-1 z-[70] flex items-center justify-center overflow-x-hidden bg-black/40 p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setChatTripId(""); }}>
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
                  className="break-words text-base font-normal leading-snug tracking-[0.04em] text-slate-900 sm:text-lg"
                >
                  <UiLocalizedTripTitle
                    raw={String(activeTrip.title || "")}
                    emptyLabel={t("modals.tripDefault")}
                  />
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
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-normal transition sm:px-4 sm:py-2.5 ${
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
                  className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-normal transition sm:px-4 sm:py-2.5 ${
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
                  <h3 className="break-words text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
                    {t("chat.messagesHeading")}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {participantsForAvatarRow(activeTrip).map((p) => {
                      const label = participantDisplayFromRaw(p, currentUserDisplayName);
                      return (
                        <ParticipantCircleAvatar
                          key={`active-${String(p)}`}
                          raw={p}
                          session={session}
                          displayLabel={label}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ring-1 ring-slate-200/70"
                        />
                      );
                    })}
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
                    <h3 className="text-xs font-normal uppercase tracking-[0.32em] text-slate-500">
                      {t("chat.votesHeading")}
                    </h3>
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
                                    <UiTranslatedActivityTitle
                                      raw={String(activity?.title || activity?.name || "")}
                                      emptyFallback={t("planner.activityNamePlaceholder")}
                                    />
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
  const [notice, setNoticeState] = useState("");
  const setNotice = useCallback(
    (msg) => {
      if (typeof msg === "function") {
        setNoticeState((prev) => formatNoticeForEndUser(session, msg(prev), t));
        return;
      }
      if (msg === "" || msg == null) {
        setNoticeState("");
        return;
      }
      setNoticeState(formatNoticeForEndUser(session, String(msg), t));
    },
    [session, t]
  );
  const [destinationConfirmed, setDestinationConfirmed] = useState(() => readStoredDestinationQuery());
  const [destinationInput, setDestinationInput] = useState(() => readStoredDestinationQuery());
  /** Monte le composant Recherche dès le départ pour que la vidéo et le DOM soient prêts. */
  const [destTabReady, setDestTabReady] = useState(true);
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
  const chatMessagesByTripRef = useRef(chatMessagesByTrip);
  chatMessagesByTripRef.current = chatMessagesByTrip;
  const [chatInput, setChatInput] = useState("");
  const [activityVotes, setActivityVotes] = useState([]);
  const [chatMessagesLocal, setChatMessagesLocal] = useState({});
  const chatMessagesLocalRef = useRef(chatMessagesLocal);
  chatMessagesLocalRef.current = chatMessagesLocal;
  const [activityVotesLocal, setActivityVotesLocal] = useState({});
  const [selectedDate, setSelectedDate] = useState(() => readStoredPlannerDate() || getTodayStr());
  const [monthCursor, setMonthCursor] = useState(() => {
    const sm = readStoredPlannerMonthCursor();
    if (sm) return sm;
    return monthCursorFromPlannerDate(readStoredPlannerDate() || getTodayStr());
  });
  const [plannerInviteOpen, setPlannerInviteOpen] = useState(false);
  const [plannerParticipantsListOpen, setPlannerParticipantsListOpen] = useState(false);
  const [budgetMemoriesOpen, setBudgetMemoriesOpen] = useState(false);

  useScrollLock(menuOpen);
  useScrollLock(accountOpen);
  useScrollLock(!!budgetDetailTrip);
  useScrollLock(!!chatTripId);
  useScrollLock(tripDateConflictModalOpen);

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
  /** User id déjà connu côté auth — évite de traiter un SIGNED_IN « fantôme » au retour app mobile comme une nouvelle connexion. */
  const authSessionUidRef = useRef(null);
  /** Évite les appels en double à updateUser pour initials_avatar_bg (StrictMode / re-renders). */
  const ensuredInitialsBgUidRef = useRef(null);

  const [tripExpenses, setTripExpenses] = useState([]);
  /** False si la table `trip_expenses` n’existe pas encore (script SQL non exécuté). */
  const [tripExpensesTableReady, setTripExpensesTableReady] = useState(true);
  /** Incrémenté au retour sur l’onglet si les dépenses groupe sont indisponibles — relance la lecture sans F5. */
  const [tripExpensesRetryNonce, setTripExpensesRetryNonce] = useState(0);
  const tripExpensesTableReadyRef = useRef(true);
  tripExpensesTableReadyRef.current = tripExpensesTableReady;

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
        if (mounted && data?.session?.user?.id) {
          authSessionUidRef.current = String(data.session.user.id);
        }
      } catch (e) {
        if (mounted) setNotice(String(e?.message || "Erreur authentification"));
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      const uid = newSession?.user?.id ? String(newSession.user.id) : null;
      const hadUid = authSessionUidRef.current;

      setSession(newSession || null);
      setAuthLoading(false);
      const authEmail = String(newSession?.user?.email || "").trim();
      if (authEmail && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        void tryMarkInviteeJoinedTrips(supabase);
      }

      if (!uid) {
        authSessionUidRef.current = null;
        return;
      }

      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        authSessionUidRef.current = uid;
      }

      if (event !== "SIGNED_IN") return;

      authSessionUidRef.current = uid;
      const isNewSignIn = hadUid !== uid;
      if (!isNewSignIn) return;

      setActiveTab("trips");
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
    const user = session?.user;
    if (!user?.id) {
      ensuredInitialsBgUidRef.current = null;
      return;
    }
    const bg = String(user.user_metadata?.initials_avatar_bg || "").trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(bg)) return;
    if (ensuredInitialsBgUidRef.current === user.id) return;
    ensuredInitialsBgUidRef.current = user.id;
    const color = randomInitialsBgFromPalette();
    void supabase.auth.updateUser({ data: { initials_avatar_bg: color } }).then(({ data: upd, error }) => {
      if (error) {
        ensuredInitialsBgUidRef.current = null;
        return;
      }
      if (upd?.user) {
        setSession((prev) => (prev?.user?.id === upd.user.id ? { ...prev, user: upd.user } : prev));
      }
    });
  }, [session?.user?.id, session?.user?.user_metadata?.initials_avatar_bg]);

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
      "Supprimer ton compte ? Cette action supprimera tes voyages et peut être irréversible."
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

  const updateMyAccount = async ({ first_name, last_name, email, password, avatar_url: avatarUrlPatch }) => {
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
      const dataPayload = {
        first_name: safeFirstName,
        last_name: safeLastName,
        full_name: `${safeFirstName} ${safeLastName}`.trim(),
      };
      const existingInitialsBg = String(session?.user?.user_metadata?.initials_avatar_bg || "").trim();
      if (/^#[0-9A-Fa-f]{6}$/i.test(existingInitialsBg)) {
        dataPayload.initials_avatar_bg = existingInitialsBg;
      }
      if (avatarUrlPatch !== undefined) {
        dataPayload.avatar_url = avatarUrlPatch;
      } else {
        const existingAvatar = String(session?.user?.user_metadata?.avatar_url || "").trim();
        if (existingAvatar) dataPayload.avatar_url = existingAvatar;
      }
      const payload = {
        email: safeEmail,
        data: dataPayload,
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
    if (typeof document === "undefined") return undefined;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!session || authLoading) return;
      if (!tripExpensesTableReadyRef.current) setTripExpensesRetryNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [session, authLoading]);

  useEffect(() => {
    if (authLoading || !session) {
      setTripExpenses([]);
      setTripExpensesTableReady(true);
      return undefined;
    }
    const myGen = ++loadTripExpensesGenRef.current;
    const loadTripExpenses = async () => {
      const rawTripIds = (tripsRef.current || []).map((t) => normTripId(t?.id)).filter(Boolean);
      const tripIds = rawTripIds.filter(isUuidLike);
      if (rawTripIds.length > 0 && tripIds.length === 0 && import.meta.env.DEV) {
        console.warn("[trip_expenses] aucun id voyage au format uuid — requête .in() ignorée", rawTripIds);
      }
      if (tripIds.length === 0) {
        if (myGen === loadTripExpensesGenRef.current) {
          setTripExpenses([]);
          setTripExpensesTableReady(true);
        }
        return;
      }
      try {
        const probe = () => supabase.from("trip_expenses").select("id").limit(1);
        let { error: probeErr } = await probe();
        if (probeErr?.code === "PGRST205" || /schema cache/i.test(String(probeErr?.message || ""))) {
          await new Promise((r) => setTimeout(r, 2000));
          ({ error: probeErr } = await probe());
        }
        if (probeErr?.code === "PGRST205" || /schema cache/i.test(String(probeErr?.message || ""))) {
          await new Promise((r) => setTimeout(r, 4000));
          ({ error: probeErr } = await probe());
        }
        if (probeErr) {
          if (isTripExpensesSchemaMissingError(probeErr)) {
            if (import.meta.env.DEV) {
              console.warn("[trip_expenses] sonde: table / cache", {
                code: probeErr?.code,
                message: probeErr?.message,
                details: probeErr?.details,
                hint: probeErr?.hint,
              });
            }
            if (myGen === loadTripExpensesGenRef.current) {
              setTripExpensesTableReady(false);
              setTripExpenses([]);
            }
            return;
          }
          throw probeErr;
        }
        // Toujours activer l’UI après sonde OK : ne pas exiger myGen ici (Strict Mode / re-renders
        // peuvent incrémenter la génération entre la sonde et ce point → bandeau bloqué à tort).
        setTripExpensesTableReady(true);

        if (myGen !== loadTripExpensesGenRef.current) return;

        let data;
        let error;
        const selectExpenses = () =>
          supabase.from("trip_expenses").select("*").in("trip_id", tripIds);
        ({ data, error } = await selectExpenses());
        if (error?.code === "PGRST205" || /schema cache/i.test(String(error?.message || ""))) {
          await new Promise((r) => setTimeout(r, 2000));
          ({ data, error } = await selectExpenses());
        }
        if (error?.code === "PGRST205" || /schema cache/i.test(String(error?.message || ""))) {
          await new Promise((r) => setTimeout(r, 4000));
          ({ data, error } = await selectExpenses());
        }
        if (error) {
          if (import.meta.env.DEV) {
            console.warn("[trip_expenses] lecture par trip_id", {
              code: error?.code,
              message: error?.message,
              tripIds,
            });
          }
          throw error;
        }
        if (myGen !== loadTripExpensesGenRef.current) return;
        setTripExpenses((data || []).map(normalizeTripExpenseRow).filter(Boolean));
      } catch (e) {
        if (myGen !== loadTripExpensesGenRef.current) return;
        if (!isTripExpensesSchemaMissingError(e)) {
          setTripExpensesTableReady(true);
        }
        setNotice(String(e?.message || "Erreur chargement depenses groupe"));
      }
    };
    loadTripExpenses();
    const exChannel = supabase
      .channel("trip-expenses-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_expenses" }, loadTripExpenses)
      .subscribe();
    return () => supabase.removeChannel(exChannel);
  }, [trips, session, authLoading, tripExpensesRetryNonce]);

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

      const cachedMessages = chatMessagesByTripRef.current[chatTripId];
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
        const prevList = chatMessagesByTripRef.current[chatTripId] || [];
        const localOnly = chatMessagesLocalRef.current[chatTripId] || [];
        const merged = mergeChatMessageLists(
          mergeChatMessageLists(prevList, localOnly),
          sortedMessages
        );
        setChatMessages(merged);
        setChatMessagesByTrip((prev) => ({ ...prev, [chatTripId]: merged }));
      } catch (_e) {
        const prevList = chatMessagesByTripRef.current[chatTripId] || [];
        const localFallback = chatMessagesLocalRef.current[chatTripId] || [];
        const merged = mergeChatMessageLists(prevList, localFallback);
        setChatMessages(merged);
        setChatMessagesByTrip((prev) => ({ ...prev, [chatTripId]: merged }));
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

  const sortChatMessagesList = (list) =>
    (Array.isArray(list) ? list : []).slice().sort((a, b) =>
      String(a?.created_at || "").localeCompare(String(b?.created_at || ""))
    );

  const sendChatMessage = () => {
    const content = String(chatInput || "").trim();
    if (!content || !chatTripId) return;
    const currentUserId = String(session?.user?.id || "");
    const userEmail = String(session?.user?.email || "");
    const authorName =
      String(session?.user?.user_metadata?.first_name || "").trim() ||
      String(userEmail).split("@")[0] ||
      "Membre";

    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();
    const optimisticMsg = {
      id: pendingId,
      trip_id: chatTripId,
      author_id: currentUserId,
      author_email: userEmail,
      author_name: authorName,
      content,
      created_at: nowIso,
    };

    setChatInput("");
    setChatMessages((prev) => sortChatMessagesList([...(prev || []), optimisticMsg]));
    setChatMessagesByTrip((prev) => ({
      ...prev,
      [chatTripId]: sortChatMessagesList([...(prev[chatTripId] || []), optimisticMsg]),
    }));

    let payload = {
      trip_id: chatTripId,
      author_id: currentUserId,
      author_email: userEmail,
      author_name: authorName,
      content,
    };

    const replacePendingWithList = (nextList) => {
      const sorted = sortChatMessagesList(nextList);
      setChatMessages(sorted);
      setChatMessagesByTrip((prev) => ({ ...prev, [chatTripId]: sorted }));
    };

    const removePendingAndApply = (fn) => {
      setChatMessages((prev) => {
        const without = (prev || []).filter((m) => String(m?.id) !== pendingId);
        return sortChatMessagesList(fn(without));
      });
      setChatMessagesByTrip((prev) => {
        const without = (prev[chatTripId] || []).filter((m) => String(m?.id) !== pendingId);
        return { ...prev, [chatTripId]: sortChatMessagesList(fn(without)) };
      });
    };

    void (async () => {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const { data: insertedRows, error } = await supabase
            .from("chat_messages")
            .insert(payload)
            .select("*");
          if (!error) {
            const row = Array.isArray(insertedRows) && insertedRows[0] ? insertedRows[0] : null;
            if (row) {
              removePendingAndApply((without) => [...without, row]);
              return;
            }
            const { data: fresh, error: fetchErr } = await supabase
              .from("chat_messages")
              .select("*")
              .eq("trip_id", chatTripId)
              .order("created_at", { ascending: true });
            if (!fetchErr) {
              replacePendingWithList(fresh || []);
              return;
            }
            removePendingAndApply((without) => without);
            setChatInput(content);
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
        throw new Error("chat insert failed");
      } catch (_e) {
        const localMsg = {
          id: `local-${Date.now()}`,
          trip_id: chatTripId,
          author_id: currentUserId,
          author_email: userEmail,
          author_name: authorName,
          content,
        };
        removePendingAndApply((without) => [...without, localMsg]);
        setChatMessagesLocal((prev) => ({
          ...prev,
          [chatTripId]: [...(prev[chatTripId] || []), localMsg],
        }));
      }
    })();
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
          return { title: String(item || "").trim(), date: "", time: "", location: "", cost: 0, description: "" };
        }
        return {
          title: String(item?.title || "").trim(),
          date: item?.date != null && String(item.date).trim() !== "" ? toYMDLoose(item.date) || toYMD(item.date, "") : "",
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

    let rows = normalizedItems.map((item, i) => {
      const safeDate = item.date && tripDaySet.has(item.date) ? item.date : toYMD(fallbackDates[i], toYMD(startYmd, getTodayStr()));
      const assignedTime = normalizeActivityTimeHHMM(item.time) || String(slots[i % slots.length]).slice(0, 5);
      const activityPrompt = `${item.title} ${safeDate} ${assignedTime}`;
      const fallbackPhoto = seededPicsumUrl(activityPrompt, 1200, 800) || seededPicsumUrl(`${item.title}|${tripId}`, 1200, 800);
      const row = {
        trip_id: normTripId(tripId), date: safeDate, date_key: safeDate, activity_date: safeDate,
        time: assignedTime, title: item.title, name: item.title, description: String(item.description || ""),
        cost: clampActivityCostEUR(item.cost), location: String(item.location || ""),
        photo_url: String(fallbackPhoto || ""), image_url: String(fallbackPhoto || ""),
      };
      if (String(userId || "").trim()) row.owner_id = String(userId).trim();
      return row;
    });

    let insertOk = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await supabase.from("activities").insert(rows);
      if (!error) { insertOk = true; break; }
      const msg = String(error?.message || "");
      const missing = parseMissingSchemaColumnName(error);
      if (missing && rows[0] && Object.prototype.hasOwnProperty.call(rows[0], missing)) {
        rows = rows.map((r) => { const { [missing]: _, ...rest } = r; return rest; });
        continue;
      }
      if (/uuid|22P02|invalid input syntax/i.test(msg) && rows[0]?.owner_id !== undefined) {
        rows = rows.map(({ owner_id: _, ...rest }) => rest);
        continue;
      }
      setNotice(String(error?.message || "Erreur enregistrement activités"));
      break;
    }

    try {
      const fresh = await fetchActivitiesRowsForTrip(tripId);
      replaceTripActivitiesInState(normTripId(tripId), fresh);
    } catch (_e) { /* ignore */ }
    return insertOk;
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
          if (activitiesInsertOk) {
            setNotice(inviteNotice);
          } else if (inviteNotice) {
            setNotice((prev) => {
              const base = String(prev || "").trim();
              return base ? `${base} — ${inviteNotice}` : inviteNotice;
            });
          }

          {
            const optimisticTrip = { ...body, id: newTripId };
            setTrips((prev) => [...(prev || []), optimisticTrip]);
            const tripStart = toYMD(body.start_date, getTodayStr());
            if (newTripId) {
              setSelectedTripId(normTripId(newTripId));
              setSelectedDate(tripStart);
              const md = new Date(`${tripStart}T12:00:00`);
              if (!Number.isNaN(md.getTime())) {
                setMonthCursor(new Date(md.getFullYear(), md.getMonth(), 1));
              }
            }
          }

          // Background refresh
          (async () => {
            try {
              for (let i = 0; i < TRIPS_SELECT_ATTEMPTS.length; i += 1) {
                const { data: d, error: selErr } = await supabase.from("trips").select(TRIPS_SELECT_ATTEMPTS[i]);
                if (!selErr) { setTrips(visibleTripsForSession(d, session)); break; }
              }
              if (newTripId && itemsToInsert.length > 0) {
                const actRows = await fetchActivitiesRowsForTrip(newTripId);
                replaceTripActivitiesInState(newTripId, actRows);
              }
            } catch (_e) { /* ignore */ }
          })()
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
    if (!tripExpensesTableReady) return false;
    const tid = normTripId(row?.trip_id);
    if (!tid) return false;
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
      if (!error) {
        const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (row) {
          const norm = normalizeTripExpenseRow(row);
          if (norm) setTripExpenses((prev) => [...(prev || []), norm]);
        } else {
          // INSERT OK mais pas de ligne renvoyée (RLS / cache PostgREST) : forcer un rechargement.
          setTripExpensesRetryNonce((n) => n + 1);
        }
        setNotice("");
        return true;
      }
      if (error) {
        const msg = String(error?.message || "");
        if (isTripExpensesSchemaMissingError(error)) {
          setTripExpensesTableReady(false);
          return false;
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
        return false;
      }
    }
    return false;
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
    if (isTripPastByEndDate(tricountTrip)) {
      setTricountTrip(null);
      return;
    }
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
    if (String(trip.start_date || "") > String(trip.end_date || "")) {
      setNotice(t("notices.invalidStartDate"));
      return;
    }
    try {
      const currentTrip = (trips || []).find((t) => String(t?.id) === String(trip?.id)) || trip || {};
      const pastDatesLocked = isTripPastByEndDate(currentTrip);
      const previousInvitedEmails = Array.isArray(currentTrip?.invited_emails) ? currentTrip.invited_emails : [];
      const titleForFormat = pastDatesLocked
        ? String(currentTrip?.title || trip?.title || "").trim()
        : String(trip?.title || "").trim();
      const safeTitle = formatCityName(titleForFormat);
      if (!safeTitle) {
        setNotice(t("notices.destinationRequired"));
        return;
      }

      const newStart = toYMD(String(trip.start_date || getTodayStr()), getTodayStr());
      const newEnd = toYMD(String(trip.end_date || newStart), newStart);
      const prevStart = toYMD(currentTrip?.start_date, newStart);
      const prevEnd = toYMD(currentTrip?.end_date, prevStart);
      const effectiveStart = pastDatesLocked ? prevStart : newStart;
      const effectiveEnd = pastDatesLocked ? prevEnd : newEnd;
      const datesChanged = prevStart !== effectiveStart || prevEnd !== effectiveEnd;
      if (datesChanged) {
        const dateConflicts = findTripsOverlappingDateRange(trips, effectiveStart, effectiveEnd, trip.id);
        if (dateConflicts.length > 0) {
          setTripDateConflictTrips(dateConflicts);
          setTripDateConflictModalOpen(true);
          return;
        }
      }
      const previousInvitedSet = new Set(previousInvitedEmails.map((m) => String(m || "").toLowerCase().trim()).filter(Boolean));

      const nextInvitedList = pastDatesLocked
        ? previousInvitedEmails
        : Array.isArray(trip?.invited_emails) && trip.invited_emails.length > 0
          ? trip.invited_emails
          : [];
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
        start_date: String(effectiveStart),
        end_date: String(effectiveEnd),
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

    // Optimistic UI : fermer la modal et retirer le voyage immédiatement
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
    if (String(selectedTripId) === idStr) setSelectedTripId("");
    setEditingTrip((t) => (t && String(t.id) === idStr ? null : t));
    setShareTrip((t) => (t && String(t.id) === idStr ? null : t));
    setTricountTrip((t) => (t && String(t.id) === idStr ? null : t));
    setBudgetDetailTrip((t) => (t && String(t.id) === idStr ? null : t));
    setTripToDelete(null);
    setDeletingTrip(false);

    // Suppression serveur en arrière-plan (enfants en parallèle)
    try {
      await Promise.all([
        supabase.from("activity_votes").delete().eq("trip_id", idStr),
        supabase.from("chat_messages").delete().eq("trip_id", idStr),
        supabase.from("activities").delete().eq("trip_id", idStr),
      ]);
      const { error } = await supabase.from("trips").delete().eq("id", tid);
      if (error) throw error;
    } catch (e) {
      setNotice(String(e?.message || "Erreur suppression voyage"));
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
      className="min-h-screen max-w-[100vw] overflow-x-clip pb-[calc(8.25rem+env(safe-area-inset-bottom,0px))]"
      style={{
        color: TEXT,
        background:
          "radial-gradient(circle at 18% -8%, #f4f8fc 0%, #eef4fa 40%, #e3edf6 100%)",
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
              visible={activeTab === "destination"}
              searchInput={destinationInput}
              onSearchInputChange={handleDestinationSearchChange}
              confirmedDestination={destinationConfirmed}
              onConfirmDestination={handleConfirmDestination}
              onBack={() => setActiveTab("trips")}
              trips={trips}
              onCreateTrip={async (payload) => {
                const ok = await createTrip(payload);
                if (ok) {
                  setActiveTab("planner");
                  if (payload?.plannerFocusTripAndCalendar) {
                    const run = () => {
                      const el = document.getElementById("tp-planner-main");
                      if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
                      else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
                    };
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        setTimeout(run, 0);
                      });
                    });
                  }
                }
                return ok;
              }}
            />
          </div>
        )}

        <div style={{ display: activeTab === "trips" ? undefined : "none" }}>
          <AllTripsView
            trips={trips}
            onOpenTrip={(trip) => {
              openPlannerToday(trip);
            }}
            onShareTrip={setShareTrip}
            onEditTrip={setEditingTrip}
            onDeleteTrip={deleteTrip}
          />
        </div>

        <div style={{ display: activeTab === "planner" ? undefined : "none" }}>
          <div
            id="tp-planner-main"
            className="space-y-4 scroll-mt-[max(6rem,env(safe-area-inset-top,0px)+4.5rem)]"
          >
            <div className="rounded-[2rem] bg-white/70 p-3 shadow-[0_14px_36px_rgba(2,6,23,0.07)] ring-1 ring-slate-200/55 backdrop-blur-lg sm:p-5">
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
                      <p className="text-[10px] font-normal uppercase tracking-[0.28em] text-white/80">
                        {t("planner.activeTrip")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                          style={{ backgroundColor: ACCENT }}
                        >
                          <MapPin size={10} className="mr-1 shrink-0" />
                          {t("destination.badgeDestination")}
                        </span>
                      </div>
                      <h3 className="mt-2 break-words font-display text-xl font-normal uppercase leading-tight tracking-[0.08em] text-white drop-shadow-sm sm:text-2xl sm:leading-none">
                        <UiLocalizedTripTitle
                          raw={String(selectedTrip?.destination || selectedTrip?.title || "")}
                          emptyLabel={t("modals.tripDefault")}
                        />
                      </h3>
                      <p className="mt-1 break-all text-xs text-white/85">
                        {formatDate(selectedTrip.start_date)} - {formatDate(selectedTrip.end_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                      {(() => {
                        const rawList = participantsForAvatarRow(selectedTrip);
                        const displayNameFn = (p) =>
                          participantDisplayFromRaw(p, getCurrentUserDisplayName(session));
                        const maxStack = 5;
                        const visible = rawList.slice(0, maxStack);
                        const extra = Math.max(0, rawList.length - visible.length);
                        return (
                          <button
                            type="button"
                            onClick={() => setPlannerParticipantsListOpen(true)}
                            className="group flex shrink-0 items-center rounded-full py-0.5 pl-0.5 pr-1 transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                            aria-label={t("planner.participantsListAria")}
                          >
                            <div className="flex items-center">
                              {visible.map((raw, i) => (
                                <div
                                  key={`planner-stack-${String(raw)}-${i}`}
                                  className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white shadow-md ring-2 ring-white"
                                  style={{
                                    zIndex: i + 1,
                                    marginLeft: i === 0 ? 0 : -20,
                                  }}
                                >
                                  <ParticipantCircleAvatar
                                    raw={raw}
                                    session={session}
                                    displayLabel={displayNameFn(raw)}
                                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold"
                                  />
                                </div>
                              ))}
                              {extra > 0 ? (
                                <div
                                  className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[10px] font-normal text-white shadow-md ring-2 ring-white"
                                  style={{
                                    zIndex: visible.length + 2,
                                    marginLeft: -20,
                                  }}
                                  aria-hidden
                                >
                                  +{extra}
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })()}
                      {!isTripPastByEndDate(selectedTrip) ? (
                        <button
                          type="button"
                          onClick={() => setPlannerInviteOpen(true)}
                          className="rounded-full border border-white/55 bg-white/85 p-2 text-slate-700 hover:bg-white"
                          title={t("modals.inviteByEmailTitle")}
                        >
                          <Mail size={16} />
                        </button>
                      ) : null}
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
        </div>

        <div style={{ display: activeTab === "budget" ? undefined : "none" }}>
          <section className="pb-4">
            <div className="mb-6 rounded-[2rem] border border-amber-100/80 bg-gradient-to-br from-amber-50/75 via-white/95 to-slate-50/75 p-4 shadow-[0_14px_40px_rgba(180,83,9,0.06)] ring-1 ring-amber-100/50 sm:p-6">
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
                        <h3 className="mb-1 font-display text-xs font-normal uppercase tracking-[0.28em] text-emerald-700">
                          {t("trips.badgeInProgress")}
                        </h3>
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
                        <h3 className="mb-1 font-display text-xs font-normal uppercase tracking-[0.28em] text-sky-700">
                          {t("trips.badgeUpcoming")}
                        </h3>
                        <p className="mb-3 text-[11px] text-sky-900/60">{t("trips.upcomingSubtitle")}</p>
                        <div className="grid gap-4">
                          {sections.upcoming.length > 0
                            ? sections.upcoming.map(renderBudgetTrip)
                            : <p className="text-sm text-slate-500">{t("trips.noUpcomingList")}</p>}
                        </div>
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
                            <h3 className="font-display text-xs font-normal uppercase tracking-[0.28em] text-slate-600">
                              {t("trips.badgePast")}
                            </h3>
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
        </div>

        <div style={{ display: activeTab === "chat" ? undefined : "none" }}>
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
        </div>
      </main>

      <nav className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 w-[min(100%-1.5rem,calc(100vw-1.5rem))] max-w-3xl -translate-x-1/2 rounded-[2.2rem] bg-white/92 p-1.5 shadow-[0_18px_44px_rgba(2,6,23,0.12)] backdrop-blur-xl sm:p-2">
        <div
          className="grid items-center gap-1 sm:gap-1"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour-id={`tab-${tab.id}`}
                onClick={() => {
                  if (tab.id === "planner") {
                    openPlannerToday();
                    return;
                  }
                  if (tab.id === "destination") {
                    openOrResetDestinationTab();
                    return;
                  }
                  setActiveTab(tab.id);
                }}
                className={`flex min-h-[2.75rem] items-center justify-center rounded-[2rem] px-1 py-1.5 text-xs ring-0 outline-none sm:min-h-0 sm:px-2 sm:py-2.5 ${
                  active ? "text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)]" : "text-slate-700 hover:bg-slate-100"
                }`}
                style={active ? { backgroundColor: ACCENT } : undefined}
                title={String(tab.label)}
                aria-label={String(tab.label)}
              >
                <Icon size={20} className="shrink-0" aria-hidden />
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
      <PlannerParticipantsListModal
        open={plannerParticipantsListOpen && !!selectedTrip}
        onClose={() => setPlannerParticipantsListOpen(false)}
        trip={selectedTrip}
        session={session}
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
          if (isTripPastByEndDate(selectedTrip)) {
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
            onShareTrip={(tr) => setShareTrip(tr)}
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
          className="fixed -inset-1 z-[72] flex items-center justify-center bg-black/40 p-4"
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
          className="fixed -inset-1 z-[73] flex items-center justify-center bg-black/40 p-4"
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
                    <UiLocalizedTripTitle
                      raw={String(tripDestinationDisplayName(tripRow) || "")}
                      emptyLabel={t("modals.tripDefault")}
                    />
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
