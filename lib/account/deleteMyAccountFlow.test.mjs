import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELETE_ACCOUNT_RPC_REQUIRED_NOTICE,
  mayWipeOwnedTripsBeforeAuthDeletion,
  runDeleteMyAccount,
} from "./deleteMyAccountFlow.js";

describe("deleteMyAccountFlow", () => {
  it("never allows wiping owned trips before Auth deletion", () => {
    assert.equal(mayWipeOwnedTripsBeforeAuthDeletion(), false);
  });

  it("succeeds when RPC deletes the account without touching wipeOwnedTripData", async () => {
    let wiped = false;
    const result = await runDeleteMyAccount({
      rpcDeleteAccount: async () => ({ ok: true }),
      wipeOwnedTripData: async () => {
        wiped = true;
      },
    });
    assert.deepEqual(result, { authDeleted: true });
    assert.equal(wiped, false);
  });

  it("fails closed when RPC is missing and does not wipe trip data", async () => {
    let wiped = false;
    const result = await runDeleteMyAccount({
      rpcDeleteAccount: async () => ({
        ok: false,
        error: "Could not find the function public.delete_my_account without parameters in the schema cache",
      }),
      wipeOwnedTripData: async () => {
        wiped = true;
      },
    });
    assert.equal(result.authDeleted, false);
    assert.equal(wiped, false);
    assert.match(String(result.error), /delete_my_account|schema cache/i);
  });

  it("fails closed when rpcDeleteAccount is not provided", async () => {
    let wiped = false;
    const result = await runDeleteMyAccount({
      wipeOwnedTripData: async () => {
        wiped = true;
      },
    });
    assert.deepEqual(result, {
      authDeleted: false,
      error: DELETE_ACCOUNT_RPC_REQUIRED_NOTICE,
    });
    assert.equal(wiped, false);
  });

  it("surfaces thrown RPC errors without wiping", async () => {
    let wiped = false;
    const result = await runDeleteMyAccount({
      rpcDeleteAccount: async () => {
        throw new Error("network down");
      },
      wipeOwnedTripData: async () => {
        wiped = true;
      },
    });
    assert.equal(result.authDeleted, false);
    assert.equal(result.error, "network down");
    assert.equal(wiped, false);
  });
});
