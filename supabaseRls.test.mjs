import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSql(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function createPolicyBlocks(sql) {
  return stripSqlComments(sql).match(/CREATE\s+POLICY\b[\s\S]*?;/gi) || [];
}

function assertNoAuthenticatedWideOpenPolicy(sql, tableName) {
  const blocks = createPolicyBlocks(sql).filter((block) =>
    new RegExp(`ON\\s+public\\.${tableName}\\b`, "i").test(block)
  );
  assert.ok(blocks.length > 0, `${tableName} should define RLS policies`);

  for (const block of blocks) {
    assert.doesNotMatch(
      block,
      /TO\s+authenticated[\s\S]*(USING\s*\(\s*true\s*\)|WITH\s+CHECK\s*\(\s*true\s*\))/i,
      `${tableName} must not grant every authenticated user full access`
    );
  }
}

test("activities RLS is scoped to visible trips", () => {
  const sql = readSql("./supabase/sql/activities_rls_fix.sql");

  assertNoAuthenticatedWideOpenPolicy(sql, "activities");
  assert.match(sql, /DROP\s+POLICY\s+IF\s+EXISTS\s+"activities_allow_authenticated_all"/i);
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trip_id_visible_to_requester\s*\(\s*p_trip_id\s+text\s*\)/i);
  assert.match(sql, /USING\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)\s*\)/i);
  assert.match(sql, /WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)\s*\)/i);
});

test("trip_expenses RLS is scoped to visible trips", () => {
  const sql = readSql("./supabase/sql/trip_expenses.sql");

  assertNoAuthenticatedWideOpenPolicy(sql, "trip_expenses");
  assert.match(sql, /DROP\s+POLICY\s+IF\s+EXISTS\s+"trip_expenses_authenticated_all"/i);
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.trip_id_visible_to_requester\s*\(\s*p_trip_id\s+text\s*\)/i);
  assert.match(sql, /USING\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)\s*\)/i);
  assert.match(sql, /WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)\s*\)/i);
});
