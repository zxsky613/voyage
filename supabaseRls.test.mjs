import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSql(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

test("trip-scoped SQL does not ship authenticated-wide RLS", () => {
  for (const file of [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/trip_expenses.sql",
    "./supabase/sql/chat_trip_member_access.sql",
  ]) {
    const activeSql = stripSqlComments(readSql(file));
    assert.doesNotMatch(activeSql, /\bUSING\s*\(\s*true\s*\)/i, `${file} has global USING true`);
    assert.doesNotMatch(activeSql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, `${file} has global WITH CHECK true`);
  }
});

test("activities and trip expenses are scoped to visible trips", () => {
  for (const file of [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/trip_expenses.sql",
  ]) {
    const activeSql = stripSqlComments(readSql(file));
    assert.match(activeSql, /trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i);
  }
});

test("chat messages and activity votes bind writes to requester identity", () => {
  const activeSql = stripSqlComments(readSql("./supabase/sql/chat_trip_member_access.sql"));
  assert.match(activeSql, /requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  assert.match(activeSql, /requester_owns_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  assert.match(activeSql, /requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  assert.match(activeSql, /requester_owns_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  assert.match(activeSql, /trip_id_owned_by_requester\s*\(\s*trip_id\s*\)/i);
});
