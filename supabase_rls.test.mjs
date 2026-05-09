import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function sqlWithoutComments(filePath) {
  return readFileSync(filePath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

test("trip member tables do not allow every authenticated user", () => {
  for (const filePath of [
    "supabase/sql/trip_expenses.sql",
    "supabase/sql/activities_rls_fix.sql",
  ]) {
    const sql = sqlWithoutComments(filePath);
    assert.doesNotMatch(sql, /FOR\s+ALL\s+TO\s+authenticated[\s\S]*?USING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(sql, /WITH\s+CHECK\s*\(\s*true\s*\)/i);
    assert.match(sql, /public\.trip_id_visible_to_requester\s*\(\s*trip_id\s*\)/i);
  }
});

test("trip expenses policies are scoped to visible trip members", () => {
  const sql = sqlWithoutComments("supabase/sql/trip_expenses.sql");
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`trip_expenses_trip_member_${action}`, "i"));
  }
});

test("activities policies are scoped to visible trip members", () => {
  const sql = sqlWithoutComments("supabase/sql/activities_rls_fix.sql");
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`activities_trip_member_${action}`, "i"));
  }
});
