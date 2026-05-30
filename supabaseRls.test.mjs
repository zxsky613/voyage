import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readSql(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function normalizedExecutableSql(path) {
  return stripSqlComments(readSql(path)).replace(/\s+/g, " ").trim();
}

test("trip-scoped SQL does not grant authenticated-wide access", () => {
  const files = [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/chat_trip_member_access.sql",
    "./supabase/sql/trip_expenses.sql",
  ];

  for (const file of files) {
    const sql = normalizedExecutableSql(file);
    assert.doesNotMatch(sql, /\bUSING\s*\(\s*true\s*\)/i, file);
    assert.doesNotMatch(sql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, file);
    assert.match(sql, /trip_id_visible_to_requester/i, file);
  }
});

test("chat messages and activity votes are bound to the authenticated identity", () => {
  const sql = normalizedExecutableSql("./supabase/sql/chat_trip_member_access.sql");

  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity\s*\(\s*p_user_id\s+text\s*,\s*p_email\s+text\s*\)/i);

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?trip_id_visible_to_requester\s*\(\s*trip_id\s*\)[\s\S]*?requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)[\s\S]*?\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*?USING\s*\([\s\S]*?requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)[\s\S]*?\)[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)[\s\S]*?\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_delete"[\s\S]*?USING\s*\([\s\S]*?trip_id_owned_by_requester\s*\(\s*trip_id\s*\)[\s\S]*?requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)[\s\S]*?\)/i
  );

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?trip_id_visible_to_requester\s*\(\s*trip_id\s*\)[\s\S]*?requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)[\s\S]*?\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*?USING\s*\([\s\S]*?requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)[\s\S]*?\)[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)[\s\S]*?\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_delete"[\s\S]*?USING\s*\([\s\S]*?trip_id_owned_by_requester\s*\(\s*trip_id\s*\)[\s\S]*?requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)[\s\S]*?\)/i
  );
});
