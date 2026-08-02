/**
 * Hero unique par voyage — test croisé (3 surfaces + 2e écrivain + membre).
 * Usage: npm run dev, node scripts/verify-trip-hero-cross-surface.mjs
 *
 * Prérequis : migration supabase/sql/set_trip_hero.sql appliquée en base.
 * Interdit : routes ?preview=* et composants *Preview (URLs inline codées en dur).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { isBlockedTripHeroUrl, isValidPersistedTripHeroUrl } from "../lib/trips/tripHeroQuality.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SELECTED_TRIP_STORAGE_KEY = "tp_selected_trip_v1";

const FORBIDDEN_PREVIEW_FRAGMENTS = [
  "preview=trips-compact",
  "preview=trip-hero-resolve",
  "preview=planner-sheet",
  "TripsCompactPreview",
  "TripHeroResolvePreview",
];

/** @param {string} envPath */
function loadEnvFile(envPath) {
  /** @type {Record<string, string>} */
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = v;
  }
  return env;
}

/** @param {string} supabaseUrl */
function authStorageKey(supabaseUrl) {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

function todayYmd() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function inProgressDates() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 2);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

/** URL satellite — rejetée par garde qualité (simule guide.landscapeImageUrl sale). */
const BLOCKED_HERO_AT_CREATE =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Satellite_view_of_Marseille.jpg/1280px-Satellite_view_of_Marseille.jpg";

const env = loadEnvFile(path.join(__dirname, "..", ".env.local"));
const supabaseUrl = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || "";
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || "";
const baseUrl = (process.env.PREVIEW_URL || "http://localhost:5173").replace(/\/$/, "");

for (const frag of FORBIDDEN_PREVIEW_FRAGMENTS) {
  if (baseUrl.includes(frag)) {
    console.error(`FAIL: route preview interdite (${frag})`);
    process.exit(1);
  }
}
if (baseUrl.includes("preview=")) {
  console.error("FAIL: aucune route ?preview=* — utiliser l'app réelle (npm run dev).");
  process.exit(1);
}

if (!supabaseUrl || !anonKey || !serviceRole) {
  console.error("FAIL: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runTag = Date.now().toString(36);
const ownerEmail = `verify-hero-owner-${runTag}@justtrip-test.invalid`;
const memberEmail = `verify-hero-member-${runTag}@justtrip-test.invalid`;
const testPassword = `VerifyHero!${runTag}`;

/** @type {string[]} */
const createdTripIds = [];
/** @type {string[]} */
const createdUserIds = [];

/** @param {string} msg */
function fail(msg) {
  return { ok: false, detail: msg };
}

/** @param {string} msg */
function pass(msg) {
  return { ok: true, detail: msg };
}

/**
 * @param {import('playwright').Page} page
 * @param {object} session
 */
async function injectSupabaseSession(page, session) {
  const key = authStorageKey(supabaseUrl);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(
    ({ storageKey, sess, selectedTripId, activeTab }) => {
      localStorage.setItem(storageKey, JSON.stringify(sess));
      if (selectedTripId) localStorage.setItem("tp_selected_trip_v1", selectedTripId);
      if (activeTab) localStorage.setItem("tp_active_tab_v1", activeTab);
    },
    {
      storageKey: key,
      sess: session,
      selectedTripId: "",
      activeTab: "trips",
    }
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
}

/** @param {import('playwright').Page} page */
async function waitAppShell(page) {
  await page.waitForSelector('[data-tour-id="tab-trips"]', { timeout: 45000 });
}

/** @param {import('playwright').Page} page @param {'trips'|'planner'|'budget'} tab @param {string} [tripId] */
async function switchTab(page, tab, tripId = "") {
  await page.evaluate(
    ({ tabId, id }) => {
      localStorage.setItem("tp_active_tab_v1", tabId);
      if (id) localStorage.setItem("tp_selected_trip_v1", id);
    },
    { tabId: tab, id: tripId }
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitAppShell(page);
  if (tab === "planner") {
    await page.waitForSelector("#tp-planner-main", { timeout: 20000 }).catch(() => {});
  }
}

/**
 * Lit le src réellement rendu (<img> monté, naturalWidth > 0). Pas de cache localStorage.
 * @param {import('playwright').Page} page
 * @param {string} tripId
 * @param {string} [anchorText]
 * @param {'trips'|'planner'|'budget'} surface
 */
async function readRenderedHeroUrl(page, tripId, anchorText, surface) {
  if (surface === "trips") {
    await page
      .waitForResponse(
        (r) => r.url().includes("/api/images/resolve") && r.request().method() === "POST",
        { timeout: 35000 }
      )
      .catch(() => {});
  }

  await page.evaluate(async (id) => {
    const root = document.querySelector(`[data-trip-hero-root="${id}"]`);
    root?.scrollIntoView({ block: "center", inline: "nearest" });
    const img = root?.querySelector("img[src^='http']");
    if (img) {
      img.loading = "eager";
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          /* ignore */
        }
      }
    }
  }, tripId);

  await page
    .waitForFunction(
      (id) => {
        const root = document.querySelector(`[data-trip-hero-root="${id}"]`);
        const img = root?.querySelector("img[src^='http']");
        return Boolean(img?.src);
      },
      tripId,
      { timeout: 45000 }
    )
    .catch(() => {});

  await page
    .waitForFunction(
      (id) => {
        const root = document.querySelector(`[data-trip-hero-root="${id}"]`);
        const img = root?.querySelector("img[src^='http']");
        return Boolean(
          img && img.src && (img.naturalWidth > 0 || (img.complete && img.naturalHeight > 0))
        );
      },
      tripId,
      { timeout: 45000 }
    )
    .catch(() => {});

  return page.evaluate((id) => {
    const root = document.querySelector(`[data-trip-hero-root="${id}"]`);
    const img = root?.querySelector("img[src^='http']");
    if (!img?.src) return "";
    if (img.naturalWidth > 0 || (img.complete && img.naturalHeight > 0)) return img.src;
    return "";
  }, tripId);
}

/** @param {string} tripId */
async function readDbHeroUrl(tripId) {
  const { data, error } = await admin.from("trips").select("hero_image_url").eq("id", tripId).maybeSingle();
  if (error) throw new Error(`DB read failed: ${error.message}`);
  return String(data?.hero_image_url || "").trim();
}

/** @param {import('playwright').Page} page @param {object} session @param {string} tripId @param {string} tripTitle @param {string} destinationLabel */
async function collectCrossSurfaceUrls(page, session, tripId, tripTitle, destinationLabel) {
  await injectSupabaseSession(page, session);
  await waitAppShell(page);

  await page.evaluate(
    ({ id }) => {
      localStorage.setItem("tp_selected_trip_v1", id);
      localStorage.removeItem(`tp_trip_hero_v2_${id}`);
    },
    { id: tripId }
  );

  /** @type {Record<'trips'|'planner'|'budget', string>} */
  const urls = { trips: "", planner: "", budget: "" };

  await switchTab(page, "planner", tripId);
  urls.planner = await readRenderedHeroUrl(page, tripId, tripTitle, "planner");

  await switchTab(page, "budget", tripId);
  await page.waitForSelector(`h3:has-text("${destinationLabel}")`, { timeout: 30000 }).catch(() => {});
  urls.budget = await readRenderedHeroUrl(page, tripId, destinationLabel, "budget");

  await switchTab(page, "trips", tripId);
  await page.waitForSelector(`[data-trip-hero-root="${tripId}"]`, { timeout: 30000 }).catch(() => {});
  urls.trips = await readRenderedHeroUrl(page, tripId, tripTitle, "trips");

  return urls;
}

async function setupUsers() {
  const { data: ownerCreated, error: ownerErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (ownerErr) throw new Error(`owner create: ${ownerErr.message}`);
  createdUserIds.push(ownerCreated.user.id);

  const { data: memberCreated, error: memberErr } = await admin.auth.admin.createUser({
    email: memberEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (memberErr) throw new Error(`member create: ${memberErr.message}`);
  createdUserIds.push(memberCreated.user.id);

  const { data: ownerSignIn, error: signInErr } = await anon.auth.signInWithPassword({
    email: ownerEmail,
    password: testPassword,
  });
  if (signInErr || !ownerSignIn.session) throw new Error(`owner sign-in: ${signInErr?.message || "no session"}`);

  const { data: memberSignIn, error: memberSignInErr } = await anon.auth.signInWithPassword({
    email: memberEmail,
    password: testPassword,
  });
  if (memberSignInErr || !memberSignIn.session) {
    throw new Error(`member sign-in: ${memberSignInErr?.message || "no session"}`);
  }

  return {
    ownerId: ownerCreated.user.id,
    ownerSession: ownerSignIn.session,
    memberSession: memberSignIn.session,
  };
}

/** @param {string} ownerId @param {object} row */
async function insertIsolatedTrip(ownerId, row) {
  const dates = inProgressDates();
  const { data, error } = await admin
    .from("trips")
    .insert({
      start_date: dates.start,
      end_date: dates.end,
      owner_id: ownerId,
      participants: row.participants ?? ["Moi"],
      invited_emails: row.invited_emails ?? [],
      invited_joined_emails: row.invited_joined_emails ?? null,
      fixed_url: "",
      ...row,
    })
    .select("id, title")
    .single();
  if (error) throw new Error(`trip insert (${row.title}): ${error.message}`);
  createdTripIds.push(data.id);
  return { tripId: data.id, tripTitle: String(data.title || row.title) };
}

async function cleanup() {
  if (createdTripIds.length) {
    await admin.from("activities").delete().in("trip_id", createdTripIds);
    await admin.from("trips").delete().in("id", createdTripIds);
  }
  for (const uid of createdUserIds) {
    await admin.auth.admin.deleteUser(uid);
  }
}

console.log("\n=== Trip hero cross-surface (étape 3) ===\n");
console.log(`Base URL: ${baseUrl}`);
console.log(`Date test: ${todayYmd()}`);
console.log(`Owner: ${ownerEmail}`);
console.log(`Member: ${memberEmail}\n`);

/** @type {{ name: string, result: { ok: boolean, detail: string } }[]} */
const results = [];

let users;
const browser = await chromium.launch();

try {
  users = await setupUsers();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__TP_TEST_EAGER_HERO__ = true;
  });

  // --- Cas 1 : même tripId → même URL sur 3 surfaces, avant + après reload ---
  console.log("--- Cas 1 : cross-surface (Mes voyages / Planning / Budget) ---");
  const cross = await insertIsolatedTrip(users.ownerId, {
    title: `VH-CROSS-MRS-${runTag}`,
    name: `VH-CROSS-MRS-${runTag}`,
    destination: "Marseille",
    hero_image_url: null,
  });

  const before = await collectCrossSurfaceUrls(
    page,
    users.ownerSession,
    cross.tripId,
    cross.tripTitle,
    "Marseille"
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitAppShell(page);

  const after = { trips: "", planner: "", budget: "" };
  await switchTab(page, "trips", cross.tripId);
  after.trips = await readRenderedHeroUrl(page, cross.tripId, cross.tripTitle, "trips");
  await switchTab(page, "planner", cross.tripId);
  after.planner = await readRenderedHeroUrl(page, cross.tripId, cross.tripTitle, "planner");
  await switchTab(page, "budget", cross.tripId);
  after.budget = await readRenderedHeroUrl(page, cross.tripId, "Marseille", "budget");

  console.log("  Avant reload:");
  console.log(`    trips   : ${before.trips.slice(0, 100) || "(vide)"}`);
  console.log(`    planner : ${before.planner.slice(0, 100) || "(vide)"}`);
  console.log(`    budget  : ${before.budget.slice(0, 100) || "(vide)"}`);
  console.log("  Après reload:");
  console.log(`    trips   : ${after.trips.slice(0, 100) || "(vide)"}`);
  console.log(`    planner : ${after.planner.slice(0, 100) || "(vide)"}`);
  console.log(`    budget  : ${after.budget.slice(0, 100) || "(vide)"}`);

  const allPresent = before.trips && before.planner && before.budget;
  const sameTriple =
    allPresent && before.trips === before.planner && before.planner === before.budget;
  const stableReload =
    before.trips === after.trips &&
    before.planner === after.planner &&
    before.budget === after.budget;

  if (!allPresent) {
    results.push({ name: "cross-surface", result: fail("au moins une surface sans <img> hero rendu") });
  } else if (!sameTriple) {
    results.push({
      name: "cross-surface",
      result: fail(`URLs divergentes entre surfaces (tripId=${cross.tripId})`),
    });
  } else if (!stableReload) {
    results.push({ name: "cross-surface", result: fail("URLs instables après reload") });
  } else {
    results.push({ name: "cross-surface", result: pass("même URL DOM sur 3 surfaces, stable au reload") });
  }

  // --- Cas 2 : legacy empoisonné en base → cascade ignore, DB réécrite propre ---
  console.log("\n--- Cas 2 : deuxième écrivain (URL bloquée legacy en base) ---");
  const blocked = await insertIsolatedTrip(users.ownerId, {
    title: `VH-BLOCKED-${runTag}`,
    name: `VH-BLOCKED-${runTag}`,
    destination: "Marseille",
    hero_image_url: BLOCKED_HERO_AT_CREATE,
  });

  await injectSupabaseSession(page, users.ownerSession);
  await waitAppShell(page);
  await page.evaluate(
    ({ id }) => {
      localStorage.removeItem(`tp_trip_hero_v2_${id}`);
      localStorage.setItem("tp_active_tab_v1", "trips");
    },
    { id: blocked.tripId }
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitAppShell(page);
  await switchTab(page, "trips", blocked.tripId);

  const blockedDisplayed = await readRenderedHeroUrl(page, blocked.tripId, blocked.tripTitle, "trips");
  await page.waitForTimeout(3000);
  const dbHeroBlocked = await readDbHeroUrl(blocked.tripId);

  console.log(`  URL legacy (seed): ${BLOCKED_HERO_AT_CREATE.slice(0, 90)}…`);
  console.log(`  DB après vue    : ${dbHeroBlocked ? `${dbHeroBlocked.slice(0, 90)}…` : "NULL"}`);
  console.log(`  UI Mes voyages  : ${blockedDisplayed.slice(0, 90) || "(vide)"}`);

  const dbClean = !dbHeroBlocked || isValidPersistedTripHeroUrl(dbHeroBlocked);
  const uiClean =
    blockedDisplayed &&
    isValidPersistedTripHeroUrl(blockedDisplayed) &&
    blockedDisplayed !== BLOCKED_HERO_AT_CREATE;

  if (!uiClean) {
    results.push({
      name: "second-writer",
      result: fail("UI affiche encore une URL bloquée/absente au lieu d'un hero résolu"),
    });
  } else if (!dbClean || isBlockedTripHeroUrl(dbHeroBlocked)) {
    results.push({
      name: "second-writer",
      result: fail("DB conserve une URL bloquée — set_trip_hero / cascade devrait la remplacer"),
    });
  } else {
    results.push({
      name: "second-writer",
      result: pass("legacy bloqué ignoré, UI + DB propres via useTripHero + set_trip_hero"),
    });
  }

  // --- Cas 3 : membre — set_trip_hero via appartenance ---
  console.log("\n--- Cas 3 : membre (set_trip_hero appartenance) ---");
  const memberTrip = await insertIsolatedTrip(users.ownerId, {
    title: `VH-MEMBER-${runTag}`,
    name: `VH-MEMBER-${runTag}`,
    destination: "Lyon",
    hero_image_url: null,
    participants: ["Moi", memberEmail],
    invited_emails: [memberEmail],
    invited_joined_emails: [memberEmail],
  });

  await injectSupabaseSession(page, users.memberSession);
  await waitAppShell(page);
  await page.evaluate(
    ({ id }) => {
      localStorage.setItem("tp_selected_trip_v1", id);
      localStorage.removeItem(`tp_trip_hero_v2_${id}`);
      localStorage.setItem("tp_active_tab_v1", "trips");
    },
    { id: memberTrip.tripId }
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitAppShell(page);
  await switchTab(page, "trips", memberTrip.tripId);

  const memberDisplayed = await readRenderedHeroUrl(page, memberTrip.tripId, memberTrip.tripTitle, "trips");
  await page.waitForTimeout(3000);
  const dbAfterMember = await readDbHeroUrl(memberTrip.tripId);

  console.log(`  DB après vue membre: ${dbAfterMember || "NULL"}`);
  console.log(`  UI membre          : ${memberDisplayed.slice(0, 90) || "(vide)"}`);

  const memberPersisted = isValidPersistedTripHeroUrl(dbAfterMember);
  const memberSeesHero = isValidPersistedTripHeroUrl(memberDisplayed);

  if (memberPersisted && memberSeesHero) {
    results.push({
      name: "member-writer",
      result: pass("membre amorce hero en base via set_trip_hero (appartenance)"),
    });
  } else if (!memberSeesHero) {
    results.push({ name: "member-writer", result: fail("membre : pas de hero rendu dans le DOM") });
  } else {
    results.push({
      name: "member-writer",
      result: fail("membre voit le hero mais set_trip_hero n'a pas persisté en base"),
    });
  }

  await page.close();
} catch (err) {
  console.error("\nERREUR setup/exécution:", err);
  results.push({ name: "runtime", result: fail(String(err?.message || err)) });
} finally {
  await browser.close();
  await cleanup();
}

console.log("\n--- Synthèse ---");
for (const r of results) {
  console.log(`  ${r.result.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.result.detail}`);
}

const allPass = results.length > 0 && results.every((r) => r.result.ok);
console.log(allPass ? "\nPASS" : "\nFAIL");
process.exit(allPass ? 0 : 1);
