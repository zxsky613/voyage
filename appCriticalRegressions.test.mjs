import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const brace = app.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < app.length; i += 1) {
    if (app[i] === "{") depth += 1;
    if (app[i] === "}") depth -= 1;
    if (depth === 0) return app.slice(brace + 1, i);
  }
  assert.fail(`${name} body not closed`);
}

test("legacy empty invited_joined_emails keeps budget splits aligned with avatars", () => {
  const body = functionBody("participantsForExpenseSplit");
  assert.match(body, /let\s+joined\s*=\s*trip\?\.invited_joined_emails/);
  assert.match(body, /Array\.isArray\(joined\)\s*&&\s*joined\.length\s*===\s*0[\s\S]*joined\s*=\s*null/);
  assert.match(body, /if\s*\(\s*joined\s*==\s*null\s*\)[\s\S]*dedupeCurrentUserInAvatarRow\(full,\s*session,\s*trip\)/);
});

test("confirmed chat inserts are deduped against realtime-loaded messages", () => {
  assert.match(
    app,
    /removePendingAndApply\(\(without\)\s*=>\s*mergeChatMessageLists\(without,\s*\[row\]\)\);/
  );
});
