/**
 * Account deletion must not destroy owned trip data unless Auth deletion succeeds.
 * Client-side trip wipe-before-auth was a data-loss footgun when RPC / Auth DELETE failed.
 */

export const DELETE_ACCOUNT_RPC_REQUIRED_NOTICE =
  "Suppression de compte indisponible. Active la fonction SQL delete_my_account sur Supabase, puis réessaie.";

/**
 * Decide whether client code may delete owned trips/activities before Auth is removed.
 * Always false: fail closed.
 */
export function mayWipeOwnedTripsBeforeAuthDeletion() {
  return false;
}

/**
 * Orchestrate account deletion.
 *
 * @param {{
 *   rpcDeleteAccount: () => Promise<{ ok: boolean, error?: string }>,
 *   wipeOwnedTripData?: () => Promise<void>,
 * }} deps
 * @returns {Promise<{ authDeleted: true } | { authDeleted: false, error: string }>}
 */
export async function runDeleteMyAccount(deps) {
  const rpcDeleteAccount = deps?.rpcDeleteAccount;
  if (typeof rpcDeleteAccount !== "function") {
    return { authDeleted: false, error: DELETE_ACCOUNT_RPC_REQUIRED_NOTICE };
  }

  // Never wipe trip rows before Auth deletion — if Auth fails, data is already gone.
  if (mayWipeOwnedTripsBeforeAuthDeletion() && typeof deps.wipeOwnedTripData === "function") {
    await deps.wipeOwnedTripData();
  }

  try {
    const result = await rpcDeleteAccount();
    if (result?.ok) return { authDeleted: true };
    const msg = String(result?.error || "").trim();
    return {
      authDeleted: false,
      error: msg || DELETE_ACCOUNT_RPC_REQUIRED_NOTICE,
    };
  } catch (e) {
    const msg = String(e?.message || e || "").trim();
    return {
      authDeleted: false,
      error: msg || DELETE_ACCOUNT_RPC_REQUIRED_NOTICE,
    };
  }
}
