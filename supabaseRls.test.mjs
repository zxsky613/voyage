import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./supabase/sql/chat_trip_member_access.sql", import.meta.url), "utf8");

function policy(name) {
  const match = sql.match(new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`, "i"));
  assert.ok(match, `missing policy ${name}`);
  return match[0].replace(/\s+/g, " ").toLowerCase();
}

test("chat message writes are bound to the authenticated author", () => {
  const insert = policy("chat_messages_trip_member_insert");
  assert.match(insert, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(insert, /author_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(insert, /lower\(trim\(author_email\)\)\s*=\s*public\.requester_normalized_email\(\)/);

  const update = policy("chat_messages_trip_member_update");
  assert.match(update, /using \([^;]*author_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(update, /with check \([^;]*author_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(update, /lower\(trim\(author_email\)\)\s*=\s*public\.requester_normalized_email\(\)/);

  const del = policy("chat_messages_trip_member_delete");
  assert.match(del, /using \([^;]*author_id\s*=\s*auth\.uid\(\)::text/);
});

test("activity vote writes are bound to the authenticated voter", () => {
  const insert = policy("activity_votes_trip_member_insert");
  assert.match(insert, /public\.trip_id_visible_to_requester\(trip_id\)/);
  assert.match(insert, /voter_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(insert, /lower\(trim\(voter_email\)\)\s*=\s*public\.requester_normalized_email\(\)/);

  const update = policy("activity_votes_trip_member_update");
  assert.match(update, /using \([^;]*voter_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(update, /with check \([^;]*voter_id\s*=\s*auth\.uid\(\)::text/);
  assert.match(update, /lower\(trim\(voter_email\)\)\s*=\s*public\.requester_normalized_email\(\)/);

  const del = policy("activity_votes_trip_member_delete");
  assert.match(del, /using \([^;]*voter_id\s*=\s*auth\.uid\(\)::text/);
});
