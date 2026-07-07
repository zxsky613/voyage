import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGetYourGuideActivityDeepLink,
  buildGetYourGuideAffiliateUrl,
  buildGygWidgetMountConfig,
  gygLocaleCodeFromAppLanguage,
  GYG_CAMPAIGN_ITINERARY,
  GYG_CAMPAIGN_WIDGET,
  GYG_PARTNER_ID_DEFAULT,
  isGygEligibleItineraryActivity,
  resolveGygPartnerId,
} from "./getYourGuide.js";

describe("getYourGuide", () => {
  it("resolveGygPartnerId falls back to PJB9REI", () => {
    assert.equal(resolveGygPartnerId(), GYG_PARTNER_ID_DEFAULT);
  });

  it("gygLocaleCodeFromAppLanguage maps fr to fr-FR", () => {
    assert.equal(gygLocaleCodeFromAppLanguage("fr"), "fr-FR");
    assert.equal(gygLocaleCodeFromAppLanguage("en"), "en-US");
  });

  it("buildGetYourGuideAffiliateUrl includes partner_id and widget campaign", () => {
    const url = new URL(buildGetYourGuideAffiliateUrl("Palerme, Italie", "PJB9REI"));
    assert.equal(url.searchParams.get("partner_id"), "PJB9REI");
    assert.equal(url.searchParams.get("cmp"), GYG_CAMPAIGN_WIDGET);
    assert.match(url.searchParams.get("q") || "", /Palerme/i);
  });

  it("buildGetYourGuideActivityDeepLink uses distinct itinerary campaign", () => {
    const url = new URL(buildGetYourGuideActivityDeepLink("Teatro Massimo", "Palerme", "PJB9REI"));
    assert.match(url.searchParams.get("q") || "", /Teatro Massimo/i);
    assert.equal(url.searchParams.get("partner_id"), "PJB9REI");
    assert.equal(url.searchParams.get("cmp"), GYG_CAMPAIGN_ITINERARY);
    assert.notEqual(url.searchParams.get("cmp"), GYG_CAMPAIGN_WIDGET);
  });

  it("buildGygWidgetMountConfig sets EUR and 3-4 items", () => {
    const cfg = buildGygWidgetMountConfig({
      cityLabel: "Annecy, France",
      language: "fr",
      partnerId: "PJB9REI",
      numberOfItems: 4,
    });
    assert.equal(cfg.dataset["data-gyg-currency"], "EUR");
    assert.equal(cfg.dataset["data-gyg-number-of-items"], "4");
    assert.equal(cfg.dataset["data-gyg-partner-id"], "PJB9REI");
    assert.equal(cfg.dataset["data-gyg-cmp"], GYG_CAMPAIGN_WIDGET);
  });

  it("isGygEligibleItineraryActivity requires verified + paid", () => {
    assert.equal(
      isGygEligibleItineraryActivity({ status: "verified", estimatedPriceEur: 12 }),
      true
    );
    assert.equal(
      isGygEligibleItineraryActivity({ status: "verified", estimatedPriceEur: 0 }),
      false
    );
    assert.equal(
      isGygEligibleItineraryActivity({ status: "partial", estimatedPriceEur: 20 }),
      false
    );
  });
});
