import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("new invited trips start with no joined invitees for tricount splitting", async () => {
  const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  const createTripBody = app.match(
    /const createTrip = async \(payload\) => \{[\s\S]*?let body = \{([\s\S]*?)\n\s*\};[\s\S]*?for \(let attempt = 0; attempt < 6;/m
  );

  assert.ok(createTripBody, "createTrip insert payload should be located");
  assert.match(
    createTripBody[1],
    /invited_joined_emails:\s*\[\]/,
    "new trips should not split expenses with invited emails before those users join"
  );
  assert.doesNotMatch(
    createTripBody[1],
    /invited_joined_emails:\s*null/,
    "null means legacy all-invitee participation and corrupts default tricount splits for new trips"
  );
});
