import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INVITE_RECIPIENTS,
  isAllowedInviteOrigin,
  normalizeOrigin,
  resolveSafeInviteBaseUrl,
  resolveSafeTripLink,
  sendTripInvitesWithResend,
} from "./invite-send-core.js";

describe("invite-send-core allowlist", () => {
  it("normalizes origins without path or trailing slash", () => {
    assert.equal(normalizeOrigin("https://www.justtrip.fr/foo"), "https://www.justtrip.fr");
    assert.equal(normalizeOrigin("https://evil.example"), "https://evil.example");
    assert.equal(normalizeOrigin("not-a-url"), "");
  });

  it("allows production and localhost origins only", () => {
    assert.equal(isAllowedInviteOrigin("https://www.justtrip.fr"), true);
    assert.equal(isAllowedInviteOrigin("https://justtrip.fr"), true);
    assert.equal(isAllowedInviteOrigin("http://localhost:5173"), true);
    assert.equal(isAllowedInviteOrigin("https://evil.example"), false);
    assert.equal(isAllowedInviteOrigin("https://justtrip.fr.evil.example"), false);
  });

  it("rejects phishing invite base URLs and falls back to Justtrip", () => {
    assert.equal(resolveSafeInviteBaseUrl("https://evil.example"), "https://www.justtrip.fr");
    assert.equal(resolveSafeInviteBaseUrl("https://www.justtrip.fr"), "https://www.justtrip.fr");
  });

  it("strips non-allowlisted trip links", () => {
    assert.equal(resolveSafeTripLink("https://evil.example/phish"), "");
    assert.equal(
      resolveSafeTripLink("https://www.justtrip.fr/?invite=1"),
      "https://www.justtrip.fr/?invite=1"
    );
  });
});

describe("invite-send-core recipient cap", () => {
  it("rejects more than MAX_INVITE_RECIPIENTS before calling Resend", async () => {
    const many = Array.from({ length: MAX_INVITE_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`);
    const result = await sendTripInvitesWithResend({
      apiKey: "re_test_key",
      to: many,
      trip: { title: "Test" },
      inviteBaseUrl: "https://www.justtrip.fr",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(String(result.error || ""), /Trop de destinataires/);
  });
});
