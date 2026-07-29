import { createClient } from "@supabase/supabase-js";

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
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u);
}

/**
 * Persiste l'URL héro en base (1re fois seulement — ne remplace pas une URL déjà enregistrée).
 * RLS trips_owner_update : UPDATE uniquement si auth.uid() = owner_id.
 * @param {string} tripId
 * @param {string} url
 * @returns {Promise<boolean>} true si écrit ou déjà présent en base
 */
export async function persistTripHeroUrl(tripId, url) {
  const id = String(tripId || "").trim();
  const heroUrl = String(url || "").trim();
  if (!id || !isPersistableTripHeroUrl(heroUrl)) return false;

  const existing = inFlight.get(id);
  if (existing) return existing;

  const task = (async () => {
    const sb = getSupabase();
    if (!sb) return false;

    const { data: authData } = await sb.auth.getUser();
    const uid = String(authData?.user?.id || "").trim();
    if (!uid) return false;

    const { data: row, error: readErr } = await sb
      .from("trips")
      .select("hero_image_url, owner_id")
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      if (import.meta.env.DEV) {
        console.warn("[trip-hero] read failed", readErr.message);
      }
      return false;
    }

    const ownerId = String(row?.owner_id || "").trim();
    if (!ownerId || ownerId !== uid) {
      if (import.meta.env.DEV) {
        console.warn("[trip-hero] persist skipped (not trip owner, RLS trips_owner_update)");
      }
      return false;
    }

    const current = String(row?.hero_image_url || "").trim();
    if (isPersistableTripHeroUrl(current)) return true;

    const { error: writeErr } = await sb.from("trips").update({ hero_image_url: heroUrl }).eq("id", id);
    if (writeErr) {
      if (import.meta.env.DEV) {
        console.warn("[trip-hero] persist failed", writeErr.message);
      }
      return false;
    }
    return true;
  })().finally(() => {
    inFlight.delete(id);
  });

  inFlight.set(id, task);
  return task;
}
