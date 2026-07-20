import assert from "node:assert/strict";
import { test } from "node:test";
import { canCurrentUserDeleteTrip } from "./tripOwnership.js";

test("only the trip owner can use destructive trip deletion", () => {
  const ownerSession = { user: { id: "owner-123" } };
  const invitedSession = { user: { id: "guest-456" } };
  const trip = { id: "trip-1", owner_id: "owner-123" };

  assert.equal(canCurrentUserDeleteTrip(ownerSession, trip), true);
  assert.equal(canCurrentUserDeleteTrip(invitedSession, trip), false);
});

test("trip deletion fails closed when ownership is unavailable", () => {
  assert.equal(canCurrentUserDeleteTrip(null, { owner_id: "owner-123" }), false);
  assert.equal(canCurrentUserDeleteTrip({ user: { id: "owner-123" } }, { id: "trip-1" }), false);
  assert.equal(canCurrentUserDeleteTrip({ user: { id: " " } }, { owner_id: " " }), false);
});
