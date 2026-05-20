import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chatSql = readFileSync(new URL("./supabase/sql/chat_trip_member_access.sql", import.meta.url), "utf8");

function policySql(policyName) {
  const re = new RegExp(`CREATE POLICY "${policyName}"[\\s\\S]*?;`, "m");
  const match = chatSql.match(re);
  assert.ok(match, `missing policy ${policyName}`);
  return match[0];
}

test("chat message writes are bound to the authenticated author", () => {
  assert.match(policySql("chat_messages_trip_member_insert"), /requester_matches_identity\(author_id,\s*author_email\)/);
  assert.match(policySql("chat_messages_trip_member_update"), /requester_matches_identity\(author_id,\s*author_email\)/);
  assert.match(policySql("chat_messages_trip_member_delete"), /requester_matches_identity\(author_id,\s*author_email\)/);
  assert.match(policySql("chat_messages_trip_member_delete"), /trip_id_owned_by_requester\(trip_id\)/);

  assert.doesNotMatch(
    policySql("chat_messages_trip_member_insert"),
    /WITH CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)\s*;/
  );
});

test("activity vote writes are bound to the authenticated voter", () => {
  assert.match(policySql("activity_votes_trip_member_insert"), /requester_matches_identity\(voter_id,\s*voter_email\)/);
  assert.match(policySql("activity_votes_trip_member_update"), /requester_matches_identity\(voter_id,\s*voter_email\)/);
  assert.match(policySql("activity_votes_trip_member_delete"), /requester_matches_identity\(voter_id,\s*voter_email\)/);
  assert.match(policySql("activity_votes_trip_member_delete"), /trip_id_owned_by_requester\(trip_id\)/);

  assert.doesNotMatch(
    policySql("activity_votes_trip_member_insert"),
    /WITH CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)\s*;/
  );
});
