import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const chatSql = readFileSync(new URL("./supabase/sql/chat_trip_member_access.sql", import.meta.url), "utf8");

function policyBody(policyName) {
  const pattern = new RegExp(
    `CREATE POLICY "${policyName}"[\\s\\S]*?(?=\\nCREATE POLICY |\\n-- |\\nALTER TABLE |\\nDO \\$\\$|$)`
  );
  const match = chatSql.match(pattern);
  assert.ok(match, `missing policy ${policyName}`);
  return match[0];
}

test("chat RLS binds message authors to the authenticated requester", () => {
  assert.match(chatSql, /CREATE OR REPLACE FUNCTION public\.requester_matches_identity\(p_user_id text, p_email text\)/);
  assert.match(policyBody("chat_messages_trip_member_insert"), /requester_matches_identity\(author_id, author_email\)/);
  assert.match(policyBody("chat_messages_trip_member_update"), /requester_matches_identity\(author_id, author_email\)/);
});

test("activity vote RLS binds voters to the authenticated requester", () => {
  assert.match(policyBody("activity_votes_trip_member_insert"), /requester_matches_identity\(voter_id, voter_email\)/);
  assert.match(policyBody("activity_votes_trip_member_update"), /requester_matches_identity\(voter_id, voter_email\)/);
});

test("trip owners can still delete chat and vote rows during trip cleanup", () => {
  assert.match(chatSql, /CREATE OR REPLACE FUNCTION public\.trip_id_owned_by_requester\(p_trip_id uuid\)/);
  assert.match(policyBody("chat_messages_trip_member_delete"), /trip_id_owned_by_requester\(trip_id\)/);
  assert.match(policyBody("activity_votes_trip_member_delete"), /trip_id_owned_by_requester\(trip_id\)/);
});
