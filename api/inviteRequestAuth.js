import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./_helpers.js";

function getSupabaseAnonKey() {
  return String(
    process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ""
  ).trim();
}

/**
 * Require a valid Supabase user JWT on invite-send requests.
 * Fail closed: missing config or invalid/missing token → reject (never send mail anonymously).
 *
 * @param {import('http').IncomingMessage | { headers?: Record<string, string | string[] | undefined> }} req
 * @returns {Promise<{ ok: true, user: { id: string, email?: string } } | { ok: false, status: number, error: string }>}
 */
export async function requireInviteSender(req) {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    return {
      ok: false,
      status: 503,
      error: "Configuration auth invitations absente (SUPABASE_URL / clé anon).",
    };
  }

  const rawAuth = req?.headers?.authorization ?? req?.headers?.Authorization ?? "";
  const authHeader = Array.isArray(rawAuth) ? String(rawAuth[0] || "") : String(rawAuth || "");
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = match ? String(match[1] || "").trim() : "";
  if (!accessToken) {
    return { ok: false, status: 401, error: "Authentification requise pour envoyer des invitations." };
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      return { ok: false, status: 401, error: "Session invalide ou expirée." };
    }
    return {
      ok: true,
      user: {
        id: String(data.user.id),
        email: data.user.email ? String(data.user.email) : undefined,
      },
    };
  } catch (e) {
    return {
      ok: false,
      status: 503,
      error: `Vérification auth impossible: ${String(e?.message || e)}`,
    };
  }
}
