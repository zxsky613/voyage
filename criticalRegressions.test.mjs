import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeTricountBalances } from "./tricountLogic.js";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

test("trip-scoped SQL scripts do not grant authenticated-wide row access", () => {
  for (const path of [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/trip_expenses.sql",
    "./supabase/sql/chat_trip_member_access.sql",
  ]) {
    const sql = stripSqlComments(read(path));
    assert.doesNotMatch(sql, /\bUSING\s*\(\s*true\s*\)/i, path);
    assert.doesNotMatch(sql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, path);
  }
});

test("chat and vote mutation policies are bound to the authenticated identity", () => {
  const sql = stripSqlComments(read("./supabase/sql/chat_trip_member_access.sql"));

  assert.match(sql, /requester_matches_identity\s*\(\s*author_id\s*,\s*author_email\s*\)/i);
  assert.match(sql, /requester_matches_identity\s*\(\s*voter_id\s*,\s*voter_email\s*\)/i);
  assert.match(sql, /requester_matches_identity\s*\(\s*author_id\s*\)/i);
  assert.match(sql, /requester_matches_identity\s*\(\s*voter_id\s*\)/i);
  assert.doesNotMatch(
    sql,
    /chat_messages_trip_member_insert[\s\S]*WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id\s*\)\s*\)/i
  );
  assert.doesNotMatch(
    sql,
    /activity_votes_trip_member_insert[\s\S]*WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id\s*\)\s*\)/i
  );
});

test("Tricount explicit splits are not recomputed from the current participant base", () => {
  const balances = computeTricountBalances(
    ["Moi", "alice@example.com"],
    [{ amount: 90, paid_by: "Moi", split_between: ["Moi", "bob@example.com"] }]
  );

  assert.equal(balances["Moi"], 45);
  assert.equal(balances["alice@example.com"], 0);
  assert.equal(balances["bob@example.com"], -45);
});

test("new Tricount expenses persist explicit split participants", () => {
  const app = read("./App.jsx");

  assert.match(app, /split_between:\s*splitArr\.map\(String\)/);
  assert.doesNotMatch(app, /splitArr\.length\s*===\s*parts\.length\s*\?\s*\[\]\s*:\s*splitArr/);
});
