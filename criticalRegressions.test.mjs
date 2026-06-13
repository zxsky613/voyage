import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeTricountBalances } from "./tricountLogic.js";

const rootDir = dirname(fileURLToPath(import.meta.url));

function readWorkspaceFile(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/g, ""))
    .join("\n");
}

test("explicit Tricount splits remain authoritative when participant eligibility changes", () => {
  const balances = computeTricountBalances(["Moi", "joined@example.com"], [
    {
      amount: 120,
      paid_by: "Moi",
      split_between: ["Moi", "joined@example.com", "later@example.com"],
    },
  ]);

  assert.equal(balances["Moi"], 80);
  assert.equal(balances["joined@example.com"], -40);
  assert.equal(balances["later@example.com"], -40);
});

test("new Tricount expenses persist the selected split instead of the mutable empty-array shorthand", () => {
  const app = readWorkspaceFile("App.jsx");

  assert.match(app, /split_between:\s*splitArr,/);
  assert.doesNotMatch(
    app,
    /split_between:\s*splitArr\.length\s*===\s*parts\.length\s*\?\s*\[\]\s*:\s*splitArr/
  );
});

test("legacy empty invited_joined_emails keeps expense participants aligned with avatar participants", () => {
  const app = readWorkspaceFile("App.jsx");
  const expenseHelper = app.match(/function participantsForExpenseSplit[\s\S]*?\n}\n/)?.[0] || "";

  assert.match(expenseHelper, /Array\.isArray\(joined\)\s*&&\s*joined\.length\s*===\s*0/);
  assert.match(expenseHelper, /joined\s*=\s*null/);
});

test("trip-scoped SQL files do not grant authenticated-wide data access", () => {
  for (const file of [
    "supabase/sql/activities_rls_fix.sql",
    "supabase/sql/trip_expenses.sql",
    "supabase/sql/chat_trip_member_access.sql",
  ]) {
    const sql = stripSqlComments(readWorkspaceFile(file));
    assert.doesNotMatch(sql, /\bUSING\s*\(\s*true\s*\)/i, `${file} has authenticated-wide read/write RLS`);
    assert.doesNotMatch(sql, /\bWITH\s+CHECK\s*\(\s*true\s*\)/i, `${file} has authenticated-wide insert/update RLS`);
  }
});

test("activities and group expenses are guarded by trip membership RLS", () => {
  for (const [file, table] of [
    ["supabase/sql/activities_rls_fix.sql", "activities"],
    ["supabase/sql/trip_expenses.sql", "trip_expenses"],
  ]) {
    const sql = stripSqlComments(readWorkspaceFile(file));
    for (const action of ["select", "insert", "update", "delete"]) {
      assert.match(
        sql,
        new RegExp(`CREATE\\s+POLICY\\s+"${table}_trip_member_${action}"[\\s\\S]*public\\.trip_id_visible_to_requester\\(trip_id::text\\)`, "i"),
        `${file} missing trip membership guard for ${action}`
      );
    }
  }
});

test("chat messages and activity votes bind mutation identities to auth.uid", () => {
  const sql = stripSqlComments(readWorkspaceFile("supabase/sql/chat_trip_member_access.sql"));

  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.requester_matches_identity/i);
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_insert"[\s\S]*public\.requester_matches_identity\(author_id,\s*author_email\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"chat_messages_trip_member_update"[\s\S]*public\.requester_matches_identity\(author_id,\s*author_email\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_insert"[\s\S]*public\.requester_matches_identity\(voter_id,\s*voter_email\)/i
  );
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"activity_votes_trip_member_update"[\s\S]*public\.requester_matches_identity\(voter_id,\s*voter_email\)/i
  );
});
