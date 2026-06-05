import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

test("trip-scoped activity and expense SQL does not grant authenticated-wide RLS", async () => {
  const files = [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/trip_expenses.sql",
  ];

  for (const file of files) {
    const executableSql = stripSqlComments(await readText(file));
    assert.doesNotMatch(
      executableSql,
      /\bUSING\s*\(\s*true\s*\)/i,
      `${file} must not allow every authenticated user to read or mutate every row`
    );
    assert.doesNotMatch(
      executableSql,
      /\bWITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${file} must not allow every authenticated user to write every row`
    );
    assert.match(
      executableSql,
      /public\.trip_id_visible_to_requester\(trip_id\)/,
      `${file} must scope policies to trips visible to the requester`
    );
  }
});

test("chat messages and activity votes bind mutations to the requester identity", async () => {
  const executableSql = stripSqlComments(await readText("./supabase/sql/chat_trip_member_access.sql"));

  assert.match(
    executableSql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity\s*\(/i,
    "chat/vote RLS must expose an identity matcher"
  );
  assert.match(
    executableSql,
    /chat_messages_trip_member_insert[\s\S]*requester_matches_identity\(author_id,\s*author_email\)/i,
    "chat inserts must require author_id/author_email to match auth.uid/email"
  );
  assert.match(
    executableSql,
    /chat_messages_trip_member_update[\s\S]*requester_matches_identity\(author_id,\s*author_email\)/i,
    "chat updates must require author_id/author_email to match auth.uid/email"
  );
  assert.match(
    executableSql,
    /chat_messages_trip_member_delete[\s\S]*requester_matches_identity\(author_id,\s*author_email\)/i,
    "chat deletes must require the author identity or trip owner"
  );
  assert.match(
    executableSql,
    /activity_votes_trip_member_insert[\s\S]*requester_matches_identity\(voter_id,\s*voter_email\)/i,
    "vote inserts must require voter_id/voter_email to match auth.uid/email"
  );
  assert.match(
    executableSql,
    /activity_votes_trip_member_update[\s\S]*requester_matches_identity\(voter_id,\s*voter_email\)/i,
    "vote updates must require voter_id/voter_email to match auth.uid/email"
  );
  assert.match(
    executableSql,
    /activity_votes_trip_member_delete[\s\S]*requester_matches_identity\(voter_id,\s*voter_email\)/i,
    "vote deletes must require the voter identity or trip owner"
  );
});
