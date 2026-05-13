import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readSql(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

test("activities and trip_expenses RLS stay scoped to visible trip members", async () => {
  for (const file of ["./supabase/sql/activities_rls_fix.sql", "./supabase/sql/trip_expenses.sql"]) {
    const sql = stripSqlComments(await readSql(file));

    assert.doesNotMatch(
      sql,
      /CREATE\s+POLICY\s+"[^"]+"\s+ON\s+public\.(?:activities|trip_expenses)[\s\S]*?FOR\s+ALL[\s\S]*?TO\s+authenticated[\s\S]*?USING\s*\(\s*true\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${file} must not grant all authenticated users global row access`
    );
    assert.match(
      sql,
      /public\.trip_id_visible_to_requester\(trip_id\)/,
      `${file} must scope policies through trip membership`
    );
  }
});

test("chat messages cannot be inserted or updated as another user", async () => {
  const sql = stripSqlComments(await readSql("./supabase/sql/chat_trip_member_access.sql"));

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?author_id\s*=\s*auth\.uid\(\)::text[\s\S]*?lower\(trim\(author_email\)\)\s*=\s*public\.requester_email_lower\(\)[\s\S]*?\);/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*?USING\s*\([\s\S]*?author_id\s*=\s*auth\.uid\(\)::text[\s\S]*?\)[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?author_id\s*=\s*auth\.uid\(\)::text[\s\S]*?lower\(trim\(author_email\)\)\s*=\s*public\.requester_email_lower\(\)[\s\S]*?\);/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_delete"[\s\S]*?author_id\s*=\s*auth\.uid\(\)::text[\s\S]*?public\.trip_id_owned_by_requester\(trip_id\)/i
  );
});

test("activity votes cannot be inserted or updated for another voter", async () => {
  const sql = stripSqlComments(await readSql("./supabase/sql/chat_trip_member_access.sql"));

  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?voter_id\s*=\s*auth\.uid\(\)::text[\s\S]*?lower\(trim\(voter_email\)\)\s*=\s*public\.requester_email_lower\(\)[\s\S]*?\);/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*?USING\s*\([\s\S]*?voter_id\s*=\s*auth\.uid\(\)::text[\s\S]*?\)[\s\S]*?WITH\s+CHECK\s*\([\s\S]*?voter_id\s*=\s*auth\.uid\(\)::text[\s\S]*?lower\(trim\(voter_email\)\)\s*=\s*public\.requester_email_lower\(\)[\s\S]*?\);/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_delete"[\s\S]*?voter_id\s*=\s*auth\.uid\(\)::text[\s\S]*?public\.trip_id_owned_by_requester\(trip_id\)/i
  );
});
