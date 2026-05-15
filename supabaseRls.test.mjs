import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSql = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const stripSqlComments = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

const assertNoAuthenticatedWideOpenPolicy = (name, sql) => {
  const activeSql = stripSqlComments(sql);
  assert.doesNotMatch(
    activeSql,
    /CREATE\s+POLICY[\s\S]*?TO\s+authenticated[\s\S]*?USING\s*\(\s*true\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*true\s*\)/i,
    `${name} must not grant authenticated users unrestricted table access`,
  );
};

test("activities RLS is scoped to visible trips", () => {
  const sql = readSql("./supabase/sql/activities_rls_fix.sql");
  assertNoAuthenticatedWideOpenPolicy("activities", sql);
  assert.match(sql, /DROP\s+POLICY\s+IF\s+EXISTS\s+"activities_allow_authenticated_all"/i);
  assert.match(sql, /CREATE\s+POLICY\s+"activities_trip_member_select"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"activities_trip_member_insert"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"activities_trip_member_update"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"activities_trip_member_delete"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
});

test("trip expenses RLS is scoped to visible trips", () => {
  const sql = readSql("./supabase/sql/trip_expenses.sql");
  assertNoAuthenticatedWideOpenPolicy("trip_expenses", sql);
  assert.match(sql, /DROP\s+POLICY\s+IF\s+EXISTS\s+"trip_expenses_authenticated_all"/i);
  assert.match(sql, /CREATE\s+POLICY\s+"trip_expenses_trip_member_select"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"trip_expenses_trip_member_insert"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"trip_expenses_trip_member_update"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
  assert.match(sql, /CREATE\s+POLICY\s+"trip_expenses_trip_member_delete"[\s\S]*?trip_id_visible_to_requester\(trip_id\)/i);
});

test("trip visibility helper accepts uuid and text trip ids", () => {
  for (const path of [
    "./supabase/sql/activities_rls_fix.sql",
    "./supabase/sql/trip_expenses.sql",
    "./supabase/sql/chat_trip_member_access.sql",
  ]) {
    const sql = readSql(path);
    assert.match(sql, /FUNCTION\s+public\.trip_id_visible_to_requester\(p_trip_id\s+uuid\)/i);
    assert.match(sql, /FUNCTION\s+public\.trip_id_visible_to_requester\(p_trip_id\s+text\)/i);
    assert.match(sql, /t\.owner_id::text\s*=\s*u::text/i);
  }
});
