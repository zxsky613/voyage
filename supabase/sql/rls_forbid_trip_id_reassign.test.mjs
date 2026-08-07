import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(root, "rls_forbid_trip_id_reassign.sql"), "utf8");
const isolation = readFileSync(join(root, "rls_trip_member_isolation.sql"), "utf8");

test("forbid_trip_id_reassign SQL freezes trip_id on child tables", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.forbid_trip_id_reassign/);
  assert.match(sql, /RETURNS trigger/);
  assert.match(sql, /NEW\.trip_id IS DISTINCT FROM OLD\.trip_id/);
  assert.match(sql, /BEFORE UPDATE OF trip_id ON public\.activities/);
  assert.match(sql, /trip_expenses_forbid_trip_id_reassign/);
  assert.match(sql, /chat_messages_forbid_trip_id_reassign/);
  assert.match(sql, /activity_votes_forbid_trip_id_reassign/);
});

test("isolation SQL documents the trip_id reassignment gap", () => {
  assert.match(isolation, /rls_forbid_trip_id_reassign\.sql/);
});
