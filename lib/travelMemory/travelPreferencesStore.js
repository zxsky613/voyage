import {
  emptyTravelPreferencesDoc,
  normalizeTravelPreferencesDoc,
  deriveTravelPreferences,
} from "./travelPreferences.js";

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function fetchUserTravelPreferences(supabase, userId) {
  const uid = String(userId || "").trim();
  if (!supabase || !uid) return emptyTravelPreferencesDoc();

  const { data, error } = await supabase
    .from("profiles")
    .select("travel_preferences")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    if (String(error.code) === "42P01") return emptyTravelPreferencesDoc();
    console.warn("[travel-memory] fetch failed:", error.message);
    return emptyTravelPreferencesDoc();
  }

  return deriveTravelPreferences(normalizeTravelPreferencesDoc(data?.travel_preferences));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {object} travelPreferences
 */
export async function upsertUserTravelPreferences(supabase, userId, travelPreferences) {
  const uid = String(userId || "").trim();
  if (!supabase || !uid) return { ok: false, error: "not_authenticated" };

  const row = {
    id: uid,
    travel_preferences: travelPreferences,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
  if (error) {
    if (String(error.code) === "42P01") return { ok: false, error: "table_missing" };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function clearUserTravelPreferences(supabase, userId) {
  return upsertUserTravelPreferences(supabase, userId, emptyTravelPreferencesDoc());
}
