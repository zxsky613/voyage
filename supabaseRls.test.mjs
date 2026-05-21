import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(new URL("./supabase/sql/chat_trip_member_access.sql", import.meta.url), "utf8");

function policyBody(policyName) {
  const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sql.match(new RegExp(`CREATE POLICY "${escaped}"[\\s\\S]*?;`));
  assert.ok(match, `missing policy ${policyName}`);
  return match[0];
}

function occurrences(text, regex) {
  return (text.match(regex) || []).length;
}

test("chat message writes are bound to the authenticated author's identity", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.requester_matches_identity\(p_user_id text, p_email text\)/);
  assert.match(sql, /p_user_id = u::text/);
  assert.match(sql, /lower\(trim\(COALESCE\(p_email, ''\)\)\) = em/);

  const insert = policyBody("chat_messages_trip_member_insert");
  assert.match(insert, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(insert, /public\.requester_matches_identity\(author_id, author_email\)/);

  const update = policyBody("chat_messages_trip_member_update");
  assert.match(update, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.equal(
    occurrences(update, /public\.requester_matches_identity\(author_id, author_email\)/g),
    2,
    "chat update must verify both old and new row identity"
  );

  const deletePolicy = policyBody("chat_messages_trip_member_delete");
  assert.match(deletePolicy, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(deletePolicy, /public\.requester_matches_identity\(author_id, author_email\)/);
});

test("activity vote writes are bound to the authenticated voter's identity", () => {
  const insert = policyBody("activity_votes_trip_member_insert");
  assert.match(insert, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(insert, /public\.requester_matches_identity\(voter_id, voter_email\)/);

  const update = policyBody("activity_votes_trip_member_update");
  assert.match(update, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.equal(
    occurrences(update, /public\.requester_matches_identity\(voter_id, voter_email\)/g),
    2,
    "vote update must verify both old and new row identity"
  );

  const deletePolicy = policyBody("activity_votes_trip_member_delete");
  assert.match(deletePolicy, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(deletePolicy, /public\.requester_matches_identity\(voter_id, voter_email\)/);
});
