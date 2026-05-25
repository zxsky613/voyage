import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInvitedJoinedEmailsForParticipantVisibility } from "./tripParticipantVisibility.js";

test("empty invited_joined_emails keeps legacy all-invited participant visibility", () => {
  assert.equal(normalizeInvitedJoinedEmailsForParticipantVisibility([]), null);
});

test("non-empty invited_joined_emails remains an explicit joined subset", () => {
  const joined = ["guest@example.com"];
  assert.equal(normalizeInvitedJoinedEmailsForParticipantVisibility(joined), joined);
});
