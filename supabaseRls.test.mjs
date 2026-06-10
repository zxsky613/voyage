import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("./supabase/sql/trip_expenses.sql", import.meta.url), "utf8");

test("trip_expenses RLS is scoped to visible trip members", () => {
  assert.doesNotMatch(
    sql,
    /CREATE\s+POLICY\s+"trip_expenses_authenticated_all"[\s\S]*?USING\s*\(\s*true\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*true\s*\)/i
  );

  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`trip_expenses_trip_member_${action}`, "i"));
  }

  assert.match(sql, /FOR\s+SELECT\s+TO\s+authenticated[\s\S]*?USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i);
  assert.match(sql, /FOR\s+INSERT\s+TO\s+authenticated[\s\S]*?WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i);
  assert.match(
    sql,
    /FOR\s+UPDATE\s+TO\s+authenticated[\s\S]*?USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i
  );
  assert.match(sql, /FOR\s+DELETE\s+TO\s+authenticated[\s\S]*?USING\s*\(\s*public\.trip_id_visible_to_requester\(trip_id\)\s*\)/i);
});
