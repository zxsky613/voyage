import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readSql = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("trip-scoped tables do not ship authenticated-wide RLS policies", () => {
  const activities = readSql("./supabase/sql/activities_rls_fix.sql");
  const expenses = readSql("./supabase/sql/trip_expenses.sql");

  for (const [name, sql] of [
    ["activities", activities],
    ["trip_expenses", expenses],
  ]) {
    assert.doesNotMatch(sql, /USING\s*\(\s*true\s*\)/i, `${name} exposes all rows with USING (true)`);
    assert.doesNotMatch(sql, /WITH\s+CHECK\s*\(\s*true\s*\)/i, `${name} accepts all rows with WITH CHECK (true)`);
    assert.match(
      sql,
      /public\.trip_id_visible_to_requester\s*\(/i,
      `${name} policy must be scoped to trips visible to the requester`
    );
  }
});

test("chat messages and votes bind writes to requester identity", () => {
  const sql = readSql("./supabase/sql/chat_trip_member_access.sql");

  assert.match(sql, /FUNCTION\s+public\.requester_matches_identity\s*\(\s*p_user_id\s+text\s*,\s*p_email\s+text\s*\)/i);
  assert.match(sql, /FUNCTION\s+public\.trip_id_owned_by_requester\s*\(\s*p_trip_id\s+uuid\s*\)/i);
  assert.match(sql, /IF\s+EXISTS\s*\([\s\S]*t\.owner_id\s*=\s*u[\s\S]*RETURN\s+true;/i);

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\([\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*USING\s*\([\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)[\s\S]*WITH\s+CHECK\s*\([\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_delete"[\s\S]*trip_id_owned_by_requester\s*\(\s*trip_id\s*\)[\s\S]*requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i
  );

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*WITH\s+CHECK\s*\([\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*USING\s*\([\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)[\s\S]*WITH\s+CHECK\s*\([\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_delete"[\s\S]*trip_id_owned_by_requester\s*\(\s*trip_id\s*\)[\s\S]*requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i
  );
});
