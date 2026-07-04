import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readText(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n\r]*/g, "");
}

test("trip-scoped SQL scripts do not grant global authenticated CRUD", () => {
  const files = [
    ["activities", "./supabase/sql/activities_rls_fix.sql"],
    ["trip_expenses", "./supabase/sql/trip_expenses.sql"],
  ];

  for (const [table, path] of files) {
    const sql = stripSqlComments(readText(path));
    assert.doesNotMatch(
      sql,
      /CREATE\s+POLICY\s+"[^"]*authenticated_all"[\s\S]*?USING\s*\(\s*true\s*\)[\s\S]*?WITH\s+CHECK\s*\(\s*true\s*\)/i,
      `${table} must not ship authenticated-wide RLS policies`
    );
    assert.doesNotMatch(
      sql,
      /ON\s+public\.(?:activities|trip_expenses)[\s\S]*?USING\s*\(\s*true\s*\)/i,
      `${table} must not allow all authenticated users to read or mutate every trip`
    );

    for (const action of ["select", "insert", "update", "delete"]) {
      assert.match(
        sql,
        new RegExp(
          `CREATE\\s+POLICY\\s+"${table}_trip_member_${action}"[\\s\\S]*?public\\.trip_id_visible_to_requester\\(trip_id\\)`,
          "i"
        ),
        `${table} ${action} policy must be scoped through trip visibility`
      );
    }
  }
});

test("trip deletion does not wipe child data before the trip delete succeeds", () => {
  const app = readText("./App.jsx");
  const start = app.indexOf("const confirmDeleteTrip = async () => {");
  const end = app.indexOf("const tabs = [", start);
  assert.notEqual(start, -1, "confirmDeleteTrip must exist");
  assert.notEqual(end, -1, "confirmDeleteTrip function boundary must be found");
  const fn = app.slice(start, end);

  const tripDelete = fn.indexOf('supabase.from("trips").delete()');
  const childCleanup = fn.indexOf('supabase.from("activities").delete()');
  const removeTripFromState = fn.indexOf("setTrips((prev)");
  const finalDeletingReset = fn.lastIndexOf("setDeletingTrip(false)");

  assert.notEqual(tripDelete, -1, "server trip delete must be performed");
  assert.notEqual(childCleanup, -1, "child cleanup should still be attempted after trip delete");
  assert.notEqual(removeTripFromState, -1, "successful deletion should remove the trip from local state");
  assert.ok(
    tripDelete < childCleanup,
    "child rows must not be deleted before the trip row delete succeeds"
  );
  assert.ok(
    tripDelete < removeTripFromState,
    "local trip state must not be removed before the server delete succeeds"
  );
  assert.match(fn, /finally\s*\{[\s\S]*setDeletingTrip\(false\);[\s\S]*\}/);
  assert.equal(
    finalDeletingReset,
    fn.indexOf("setDeletingTrip(false)", fn.indexOf("finally")),
    "deleting guard should reset only from the finally block"
  );
});
