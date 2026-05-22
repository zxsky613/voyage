import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function policyBlock(sql, policyName) {
  const match = sql.match(new RegExp(`CREATE\\s+POLICY\\s+"${policyName}"[\\s\\S]*?;`, "i"));
  assert.ok(match, `missing policy ${policyName}`);
  return match[0];
}

test("chat and activity vote writes are bound to the requester identity", async () => {
  const sql = await read("./supabase/sql/chat_trip_member_access.sql");

  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity/i);

  for (const name of [
    "chat_messages_trip_member_insert",
    "chat_messages_trip_member_update",
    "chat_messages_trip_member_delete",
  ]) {
    assert.match(policyBlock(sql, name), /public\.requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  }

  for (const name of [
    "activity_votes_trip_member_insert",
    "activity_votes_trip_member_update",
    "activity_votes_trip_member_delete",
  ]) {
    assert.match(policyBlock(sql, name), /public\.requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  }
});

test("trip-scoped tables do not grant authenticated users global access", async () => {
  for (const path of ["./supabase/sql/activities_rls_fix.sql", "./supabase/sql/trip_expenses.sql"]) {
    const uncommented = stripSqlComments(await read(path));
    assert.doesNotMatch(uncommented, /\bUSING\s*\(\s*true\s*\)/i, path);
    assert.doesNotMatch(uncommented, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, path);
    assert.match(uncommented, /public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i, path);
  }
});

test("invitee profile RPC only returns users who actually joined", async () => {
  const sql = stripSqlComments(await read("./supabase/sql/get_invitee_public_profiles_for_trip.sql"));

  assert.doesNotMatch(sql, /WHEN\s+t\.invited_joined_emails\s+IS\s+NULL/i);
  assert.match(sql, /unnest\s*\(\s*COALESCE\s*\(\s*t\.invited_joined_emails\s*,\s*ARRAY\[\]::text\[\]\s*\)\s*\)/i);
});
