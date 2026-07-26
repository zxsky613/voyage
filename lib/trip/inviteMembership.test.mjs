import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendInviteEmail,
  diffNewlyAddedInviteEmails,
  invitedEmailsFromParticipantList,
  normalizeInviteEmail,
} from "./inviteMembership.js";

describe("normalizeInviteEmail", () => {
  it("lowercases and trims valid emails", () => {
    assert.equal(normalizeInviteEmail("  Alice@Example.COM "), "alice@example.com");
  });
  it("rejects non-emails", () => {
    assert.equal(normalizeInviteEmail("Moi"), "");
    assert.equal(normalizeInviteEmail("not-an-email"), "");
  });
});

describe("appendInviteEmail", () => {
  it("adds a new invite without duplicating", () => {
    const first = appendInviteEmail(["a@x.com"], "B@X.com");
    assert.deepEqual(first.next, ["a@x.com", "b@x.com"]);
    assert.equal(first.added, true);

    const again = appendInviteEmail(first.next, "b@x.com");
    assert.deepEqual(again.next, ["a@x.com", "b@x.com"]);
    assert.equal(again.added, false);
  });
});

describe("invitedEmailsFromParticipantList", () => {
  it("keeps only valid emails so removals revoke membership", () => {
    assert.deepEqual(
      invitedEmailsFromParticipantList(["Moi", "a@x.com", "b@x.com", "Bob"]),
      ["a@x.com", "b@x.com"]
    );
    assert.deepEqual(
      invitedEmailsFromParticipantList(["Moi", "a@x.com"]),
      ["a@x.com"]
    );
    assert.deepEqual(invitedEmailsFromParticipantList(["Moi"]), []);
  });
});

describe("diffNewlyAddedInviteEmails", () => {
  it("returns only newly added addresses", () => {
    assert.deepEqual(
      diffNewlyAddedInviteEmails(["a@x.com"], ["a@x.com", "b@x.com"]),
      ["b@x.com"]
    );
    assert.deepEqual(diffNewlyAddedInviteEmails(["a@x.com", "b@x.com"], ["a@x.com"]), []);
  });
});
