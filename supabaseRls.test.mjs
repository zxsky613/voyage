import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function sql(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/g, ""))
    .join("\n");
}

test("trip-scoped SQL does not ship authenticated-wide RLS policies", () => {
  const executable = [
    "./supabase/sql/chat_trip_member_access.sql",
    "./supabase/sql/trip_expenses.sql",
    "./supabase/sql/activities_rls_fix.sql",
  ]
    .map((path) => stripSqlComments(sql(path)))
    .join("\n");

  assert.doesNotMatch(executable, /\bUSING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(executable, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(executable, /\bFOR\s+ALL\s+TO\s+authenticated\b/i);
});

test("chat message writes are bound to the authenticated author identity", () => {
  const source = stripSqlComments(sql("./supabase/sql/chat_trip_member_access.sql"));
  const authorIdentityChecks = source.match(/requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/gi) || [];

  assert.ok(authorIdentityChecks.length >= 3);
  assert.match(source, /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  assert.match(source, /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  assert.match(source, /CREATE\s+POLICY\s+"chat_messages_trip_member_delete"[\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
});

test("activity vote writes are bound to the authenticated voter identity", () => {
  const source = stripSqlComments(sql("./supabase/sql/chat_trip_member_access.sql"));
  const voterIdentityChecks = source.match(/requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/gi) || [];

  assert.ok(voterIdentityChecks.length >= 3);
  assert.match(source, /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  assert.match(source, /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  assert.match(source, /CREATE\s+POLICY\s+"activity_votes_trip_member_delete"[\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
});

test("activities and group expenses are scoped to visible trip ids", () => {
  for (const path of ["./supabase/sql/trip_expenses.sql", "./supabase/sql/activities_rls_fix.sql"]) {
    const source = stripSqlComments(sql(path));
    assert.match(source, /trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
    assert.match(source, /FOR\s+SELECT[\s\S]*trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
    assert.match(source, /FOR\s+INSERT[\s\S]*trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
    assert.match(source, /FOR\s+UPDATE[\s\S]*trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
    assert.match(source, /FOR\s+DELETE[\s\S]*trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
  }
});
