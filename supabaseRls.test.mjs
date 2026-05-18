import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const TRIP_SCOPED_SQL_FILES = [
  "supabase/sql/activities_rls_fix.sql",
  "supabase/sql/trip_expenses.sql",
];

function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

test("trip-scoped RLS does not grant global authenticated access", () => {
  for (const file of TRIP_SCOPED_SQL_FILES) {
    const executableSql = stripSqlComments(readFileSync(file, "utf8"));

    assert.doesNotMatch(
      executableSql,
      /CREATE\s+POLICY[\s\S]+?FOR\s+ALL\s+TO\s+authenticated[\s\S]+?USING\s*\(\s*true\s*\)[\s\S]+?WITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${file} must not allow every authenticated user to read/write all rows`
    );
    assert.doesNotMatch(
      executableSql,
      /TO\s+authenticated[\s\S]{0,180}USING\s*\(\s*true\s*\)/i,
      `${file} must scope authenticated SELECT/UPDATE/DELETE policies`
    );
    assert.doesNotMatch(
      executableSql,
      /TO\s+authenticated[\s\S]{0,220}WITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${file} must scope authenticated INSERT/UPDATE policies`
    );
    assert.match(
      executableSql,
      /public\.trip_id_visible_to_requester\s*\(\s*trip_id::text\s*\)/i,
      `${file} should scope rows through trip visibility`
    );
  }
});
