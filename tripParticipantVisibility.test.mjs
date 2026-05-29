import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeInvitedJoinedEmails } from "./tripParticipantVisibility.js";

test("empty invited_joined_emails keeps legacy all-invitee semantics", () => {
  assert.equal(normalizeInvitedJoinedEmails([]), null);
  assert.equal(normalizeInvitedJoinedEmails(null), null);
  assert.equal(normalizeInvitedJoinedEmails(undefined), null);
});

test("joined invitees are normalized for case and duplicates", () => {
  assert.deepEqual(normalizeInvitedJoinedEmails([" A@example.COM ", "a@example.com", "", null]), [
    "a@example.com",
  ]);
});

test("profile RPC treats empty invited_joined_emails as legacy", () => {
  const sql = readFileSync("supabase/sql/get_invitee_public_profiles_for_trip.sql", "utf8");
  assert.match(sql, /invited_joined_emails IS NULL OR cardinality\(t\.invited_joined_emails\) = 0/);
});
