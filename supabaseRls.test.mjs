import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

function readSql(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function assertTripScopedPolicies(relativePath, tableName, legacyPolicyName) {
  const sql = stripSqlComments(readSql(relativePath));
  assert.equal(
    /\bUSING\s*\(\s*true\s*\)/i.test(sql),
    false,
    `${relativePath} must not allow global SELECT/UPDATE/DELETE via USING (true)`
  );
  assert.equal(
    /\bWITH\s+CHECK\s*\(\s*true\s*\)/i.test(sql),
    false,
    `${relativePath} must not allow global INSERT/UPDATE via WITH CHECK (true)`
  );
  assert.match(
    sql,
    new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${legacyPolicyName}"\\s+ON\\s+public\\.${tableName}`, "i"),
    `${relativePath} should remove the legacy permissive policy`
  );
  assert.match(
    sql,
    new RegExp(`CREATE\\s+POLICY\\s+"${tableName}_trip_member_select"[\\s\\S]+?USING\\s*\\(\\s*public\\.trip_id_visible_to_requester\\(trip_id\\)\\s*\\)`, "i"),
    `${relativePath} SELECT policy should be trip-member scoped`
  );
  assert.match(
    sql,
    new RegExp(`CREATE\\s+POLICY\\s+"${tableName}_trip_member_insert"[\\s\\S]+?WITH\\s+CHECK\\s*\\(\\s*public\\.trip_id_visible_to_requester\\(trip_id\\)\\s*\\)`, "i"),
    `${relativePath} INSERT policy should be trip-member scoped`
  );
  assert.match(
    sql,
    new RegExp(`CREATE\\s+POLICY\\s+"${tableName}_trip_member_update"[\\s\\S]+?USING\\s*\\(\\s*public\\.trip_id_visible_to_requester\\(trip_id\\)\\s*\\)[\\s\\S]+?WITH\\s+CHECK\\s*\\(\\s*public\\.trip_id_visible_to_requester\\(trip_id\\)\\s*\\)`, "i"),
    `${relativePath} UPDATE policy should be trip-member scoped`
  );
  assert.match(
    sql,
    new RegExp(`CREATE\\s+POLICY\\s+"${tableName}_trip_member_delete"[\\s\\S]+?USING\\s*\\(\\s*public\\.trip_id_visible_to_requester\\(trip_id\\)\\s*\\)`, "i"),
    `${relativePath} DELETE policy should be trip-member scoped`
  );
}

test("activities RLS is limited to visible trip members", () => {
  assertTripScopedPolicies(
    "supabase/sql/activities_rls_fix.sql",
    "activities",
    "activities_allow_authenticated_all"
  );
});

test("trip_expenses RLS is limited to visible trip members", () => {
  assertTripScopedPolicies(
    "supabase/sql/trip_expenses.sql",
    "trip_expenses",
    "trip_expenses_authenticated_all"
  );
});
