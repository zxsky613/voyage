import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeTricountBalances } from "./tricountLogic.js";

const chatSql = readFileSync(new URL("./supabase/sql/chat_trip_member_access.sql", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

function policyBlock(name) {
  const match = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`).exec(chatSql);
  assert.ok(match, `missing policy ${name}`);
  return match[0];
}

test("chat RLS writes are bound to the authenticated author", () => {
  assert.match(chatSql, /CREATE OR REPLACE FUNCTION public\.requester_matches_identity\(p_user_id text, p_email text\)/);
  for (const name of [
    "chat_messages_trip_member_insert",
    "chat_messages_trip_member_update",
    "chat_messages_trip_member_delete",
  ]) {
    assert.match(policyBlock(name), /public\.requester_matches_identity\(author_id, author_email\)/);
  }
});

test("activity vote RLS writes are bound to the authenticated voter", () => {
  for (const name of [
    "activity_votes_trip_member_insert",
    "activity_votes_trip_member_update",
    "activity_votes_trip_member_delete",
  ]) {
    assert.match(policyBlock(name), /public\.requester_matches_identity\(voter_id, voter_email\)/);
  }
});

test("explicit Tricount splits survive later participant-list changes", () => {
  const balances = computeTricountBalances(["Moi", "alice@example.com"], [
    {
      amount: 90,
      paid_by: "Moi",
      split_between: ["Moi", "alice@example.com", "bob@example.com"],
    },
  ]);

  assert.equal(balances.Moi, 60);
  assert.equal(balances["alice@example.com"], -30);
  assert.equal(balances["bob@example.com"], -30);
});

test("group expense saves keep explicit split snapshots", () => {
  assert.doesNotMatch(appSource, /split_between:\s*splitArr\.length === parts\.length \? \[\] : splitArr/);
  assert.match(appSource, /split_between:\s*splitArr,/);
});
