import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaEnrichmentMode,
  isTripAdvisorAllowedInVerify,
  getTaMonthlyCap,
  shouldUseEnrichmentCacheInVerify,
} from "./taEnrichment.js";

test("getTaEnrichmentMode defaults to off", () => {
  const prev = process.env.TA_ENRICHMENT;
  const prevLegacy = process.env.DISABLE_TRIPADVISOR;
  delete process.env.TA_ENRICHMENT;
  delete process.env.DISABLE_TRIPADVISOR;
  assert.equal(getTaEnrichmentMode(), "off");
  process.env.TA_ENRICHMENT = prev;
  process.env.DISABLE_TRIPADVISOR = prevLegacy;
});

test("DISABLE_TRIPADVISOR legacy maps to off", () => {
  const prev = process.env.TA_ENRICHMENT;
  const prevLegacy = process.env.DISABLE_TRIPADVISOR;
  process.env.DISABLE_TRIPADVISOR = "1";
  delete process.env.TA_ENRICHMENT;
  assert.equal(getTaEnrichmentMode(), "off");
  process.env.TA_ENRICHMENT = prev;
  process.env.DISABLE_TRIPADVISOR = prevLegacy;
});

test("isTripAdvisorAllowedInVerify is always false", () => {
  assert.equal(isTripAdvisorAllowedInVerify(), false);
});

test("shouldUseEnrichmentCacheInVerify skips tripadvisor cache", () => {
  assert.equal(shouldUseEnrichmentCacheInVerify("tripadvisor"), false);
  assert.equal(shouldUseEnrichmentCacheInVerify("foursquare"), true);
});

test("getTaMonthlyCap defaults to 200", () => {
  const prev = process.env.TA_MONTHLY_CAP;
  delete process.env.TA_MONTHLY_CAP;
  assert.equal(getTaMonthlyCap(), 200);
  process.env.TA_MONTHLY_CAP = prev;
});
