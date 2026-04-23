/**
 * Masque les détails techniques des toasts pour les utilisateurs finaux.
 * Les comptes listés dans VITE_DEVELOPER_UI_EMAILS (ou VITE_DEVELOPER_EMAILS) voient le message brut.
 */

function parseDeveloperUiEmailAllowlist() {
  const raw = String(
    import.meta.env.VITE_DEVELOPER_UI_EMAILS || import.meta.env.VITE_DEVELOPER_EMAILS || ""
  ).trim();
  if (!raw) return [];
  return raw
    .split(/[,;\s\n]+/)
    .map((x) => String(x || "").trim().toLowerCase())
    .filter(Boolean);
}

let cachedAllowlist = null;
function developerUiEmailAllowlist() {
  if (cachedAllowlist == null) cachedAllowlist = parseDeveloperUiEmailAllowlist();
  return cachedAllowlist;
}

export function isDeveloperUiViewer(session) {
  const email = String(session?.user?.email || "").trim().toLowerCase();
  if (!email) return false;
  const list = developerUiEmailAllowlist();
  return list.length > 0 && list.includes(email);
}

export function messageLooksTechnicalOrLeak(text) {
  const s = String(text || "");
  if (!s.trim()) return false;
  if (s.length > 900) return true;
  const patterns = [
    /resend/i,
    /vercel/i,
    /\.env\b/i,
    /RESEND_/i,
    /SUPABASE_|service_role|postgres(ql)?/i,
    /schema cache/i,
    /Could not find the '/i,
    /column "[^"]+" does not exist/i,
    /invalid input syntax for type uuid/i,
    /JWT|jwt expired|token expired/i,
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i,
    /fetch failed/i,
    /NetworkError/i,
    /Unexpected token/i,
    /SyntaxError[: ]/,
    /at\s+[\w./]+\([^)]*\)/i,
    /testing emails to your own email/i,
    /verify a domain/i,
    /onboarding@resend\.dev/i,
    /api\.resend\.com/i,
    /sqlstate|\bSQL\b|constraint violation|PGRST/i,
    /functions\/v1\//i,
    /<html/i,
    /Internal Server Error/i,
    /500\s*\(Internal/i,
    /TypeError[: ]/,
    /ReferenceError[: ]/,
    /Astuce\s*:\s*avec un compte de test/i,
    /NODE_ENV/i,
  ];
  return patterns.some((re) => re.test(s));
}

function looksLikeTripOrInviteContext(s) {
  return /voyage|trip|reise|viaje|viaggio|旅行|modifié|modifiée|enregistré|enregistrée|créé|créée|participant|invitation|invité|invitée|e-?mail|email|invite|saved|modified|created|guests?/i.test(
    s
  );
}

/**
 * @param {object|null} session
 * @param {string} raw
 * @param {(key: string) => string} t - i18n fonction
 */
export function formatNoticeForEndUser(session, raw, t) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (isDeveloperUiViewer(session)) return String(raw ?? "");

  if (!messageLooksTechnicalOrLeak(s)) return String(raw ?? "");

  try {
    console.warn("[Justtrip] Notice masquée pour l’utilisateur (détail technique) :", s);
  } catch (_e) {
    /* ignore */
  }

  if (looksLikeTripOrInviteContext(s)) {
    return t("notices.tripOrInviteTechnicalGeneric");
  }
  return t("notices.technicalIssueGeneric");
}
