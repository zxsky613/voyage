import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readSql(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function executableSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/g, ""))
    .join("\n");
}

test("trip-scoped SQL does not grant authenticated users unrestricted RLS access", () => {
  for (const path of [
    "./supabase/sql/trip_expenses.sql",
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/chat_trip_member_access.sql",
  ]) {
    const sql = executableSql(readSql(path));
    assert.doesNotMatch(sql, /\bUSING\s*\(\s*true\s*\)/i, `${path} has an unrestricted USING policy`);
    assert.doesNotMatch(sql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, `${path} has an unrestricted WITH CHECK policy`);
  }
});

test("expenses and activities are scoped to trips visible to the requester", () => {
  const expenses = executableSql(readSql("./supabase/sql/trip_expenses.sql"));
  const activities = executableSql(readSql("./supabase/sql/activities_rls_fix.sql"));

  for (const [name, sql] of [
    ["trip_expenses", expenses],
    ["activities", activities],
  ]) {
    const tripIdArg = `trip_id(?:::text)?`;
    assert.match(sql, new RegExp(`CREATE\\s+POLICY\\s+"${name}_trip_member_select"[\\s\\S]*public\\.trip_id_visible_to_requester\\(${tripIdArg}\\)`, "i"));
    assert.match(sql, new RegExp(`CREATE\\s+POLICY\\s+"${name}_trip_member_insert"[\\s\\S]*public\\.trip_id_visible_to_requester\\(${tripIdArg}\\)`, "i"));
    assert.match(sql, new RegExp(`CREATE\\s+POLICY\\s+"${name}_trip_member_update"[\\s\\S]*public\\.trip_id_visible_to_requester\\(${tripIdArg}\\)`, "i"));
    assert.match(sql, new RegExp(`CREATE\\s+POLICY\\s+"${name}_trip_member_delete"[\\s\\S]*public\\.trip_id_visible_to_requester\\(${tripIdArg}\\)`, "i"));
  }
});

test("chat messages and activity votes must match the authenticated identity", () => {
  const sql = executableSql(readSql("./supabase/sql/chat_trip_member_access.sql"));
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity/i);
  assert.match(sql, /chat_messages_trip_member_insert[\s\S]*requester_matches_identity\(author_id,\s*author_email\)/i);
  assert.match(sql, /chat_messages_trip_member_update[\s\S]*requester_matches_identity\(author_id,\s*author_email\)/i);
  assert.match(sql, /activity_votes_trip_member_insert[\s\S]*requester_matches_identity\(voter_id,\s*voter_email\)/i);
  assert.match(sql, /activity_votes_trip_member_update[\s\S]*requester_matches_identity\(voter_id,\s*voter_email\)/i);
  assert.match(sql, /chat_messages_trip_member_delete[\s\S]*trip_id_owned_by_requester\(trip_id\)/i);
  assert.match(sql, /activity_votes_trip_member_delete[\s\S]*trip_id_owned_by_requester\(trip_id\)/i);
});
