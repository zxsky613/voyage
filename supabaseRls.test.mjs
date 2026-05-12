import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardedScripts = [
  "supabase/sql/activities_rls_fix.sql",
  "supabase/sql/trip_expenses.sql",
];

for (const script of guardedScripts) {
  test(`${script} restricts authenticated rows by trip membership`, async () => {
    const sql = await readFile(new URL(script, import.meta.url), "utf8");

    assert.match(sql, /DROP POLICY IF EXISTS\s+"[^"]*authenticated_all"/i);
    assert.match(sql, /public\.trip_id_visible_to_requester\(trip_id\)/);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*?TO authenticated[\s\S]*?USING\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*?TO authenticated[\s\S]*?WITH CHECK\s*\(\s*true\s*\)/i);
  });
}
