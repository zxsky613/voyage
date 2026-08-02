import { createClient } from "@supabase/supabase-js";
import { isValidPersistedTripHeroUrl } from "./tripHeroQuality.js";

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabaseClient = null;

/** @type {Map<string, Promise<boolean>>} */
const inFlight = new Map();

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = String(import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ""
  ).trim();
  if (!url || !key) return null;
  supabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabaseClient;
}

/** @param {string} url */
export function isPersistableTripHeroUrl(url) {
  return isValidPersistedTripHeroUrl(url);
}

/**
 * Persiste l'URL héro via RPC set_trip_hero (appartenance voyage, garde qualité SQL).
 * @param {string} tripId
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function persistTripHeroUrl(tripId, url) {
  const id = String(tripId || "").trim();
  const heroUrl = String(url || "").trim();
  if (!id || !isValidPersistedTripHeroUrl(heroUrl)) return false;

  const existing = inFlight.get(id);
  if (existing) return existing;

  const task = (async () => {
    const sb = getSupabase();
    if (!sb) return false;

    const { data: authData } = await sb.auth.getUser();
    if (!String(authData?.user?.id || "").trim()) return false;

    const { data, error } = await sb.rpc("set_trip_hero", {
      p_trip_id: id,
      p_url: heroUrl,
    });

    if (error) {
      if (import.meta.env.DEV) {
        console.warn("[trip-hero] set_trip_hero failed", error.message);
      }
      return false;
    }

    const row = data && typeof data === "object" ? data : {};
    const ok = row.ok === true;
    if (!ok && import.meta.env.DEV) {
      console.warn("[trip-hero] set_trip_hero rejected", row.reason || "unknown");
    }
    return ok;
  })().finally(() => {
    inFlight.delete(id);
  });

  inFlight.set(id, task);
  return task;
}

/**
 * Après création voyage — tente set_trip_hero (guide destination), sans INSERT direct.
 * @param {string} tripId
 * @param {string} candidateUrl
 * @returns {Promise<boolean>}
 */
export async function persistTripHeroAfterCreate(tripId, candidateUrl) {
  return persistTripHeroUrl(tripId, candidateUrl);
}
