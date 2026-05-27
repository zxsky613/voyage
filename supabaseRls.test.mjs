import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSql(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

test("trip-scoped SQL does not ship authenticated-wide RLS policies", () => {
  const files = [
    "supabase/sql/activities_rls_fix.sql",
    "supabase/sql/trip_expenses.sql",
    "supabase/sql/chat_trip_member_access.sql",
  ];

  for (const file of files) {
    const uncommented = stripSqlComments(readSql(file));
    assert.doesNotMatch(uncommented, /\bUSING\s*\(\s*true\s*\)/i, file);
    assert.doesNotMatch(uncommented, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, file);
  }
});

test("activities and group expenses are scoped to visible trip members", () => {
  const activities = stripSqlComments(readSql("supabase/sql/activities_rls_fix.sql"));
  assert.match(
    activities,
    /CREATE\s+POLICY\s+"activities_trip_member_select"[\s\S]*USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id::text\)\s*\)/i
  );
  assert.match(
    activities,
    /CREATE\s+POLICY\s+"activities_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id::text\)\s*\)/i
  );
  assert.match(
    activities,
    /CREATE\s+POLICY\s+"activities_trip_member_delete"[\s\S]*USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id::text\)\s*\)/i
  );

  const expenses = stripSqlComments(readSql("supabase/sql/trip_expenses.sql"));
  assert.match(
    expenses,
    /CREATE\s+POLICY\s+"trip_expenses_trip_member_select"[\s\S]*USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i
  );
  assert.match(
    expenses,
    /CREATE\s+POLICY\s+"trip_expenses_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i
  );
  assert.match(
    expenses,
    /CREATE\s+POLICY\s+"trip_expenses_trip_member_delete"[\s\S]*USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i
  );
});

test("chat messages and activity votes bind row identity to the requester", () => {
  const chat = stripSqlComments(readSql("supabase/sql/chat_trip_member_access.sql"));
  assert.match(
    chat,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity\(p_user_id text,\s*p_email text\)/i
  );

  assert.match(
    chat,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\([\s\S]*public\.trip_id_visible_to_requester\(trip_id\)[\s\S]*AND[\s\S]*public\.requester_matches_identity\(author_id,\s*author_email\)[\s\S]*\)/i
  );
  assert.match(
    chat,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*WITH\s+CHECK\s*\([\s\S]*public\.trip_id_visible_to_requester\(trip_id\)[\s\S]*AND[\s\S]*public\.requester_matches_identity\(author_id,\s*author_email\)[\s\S]*\)/i
  );
  assert.match(
    chat,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_delete"[\s\S]*public\.trip_id_owned_by_requester\(trip_id\)[\s\S]*OR[\s\S]*public\.requester_matches_identity\(author_id,\s*author_email\)/i
  );

  assert.match(
    chat,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\([\s\S]*public\.trip_id_visible_to_requester\(trip_id\)[\s\S]*AND[\s\S]*public\.requester_matches_identity\(voter_id,\s*voter_email\)[\s\S]*\)/i
  );
  assert.match(
    chat,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*WITH\s+CHECK\s*\([\s\S]*public\.trip_id_visible_to_requester\(trip_id\)[\s\S]*AND[\s\S]*public\.requester_matches_identity\(voter_id,\s*voter_email\)[\s\S]*\)/i
  );
  assert.match(
    chat,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_delete"[\s\S]*public\.trip_id_owned_by_requester\(trip_id\)[\s\S]*OR[\s\S]*public\.requester_matches_identity\(voter_id,\s*voter_email\)/i
  );
});
