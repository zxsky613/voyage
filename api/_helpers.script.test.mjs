/**
 * Garde-fou régression : scripts locaux (CJC, kana, hangul, thaï) dans les bundles « suggestions »
 * alors que l’UI voyageur est en alphabet latin.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestionsBundleContainsForbiddenNonLatinScript,
  tipsContainForbiddenNonLatinScript,
} from "./_helpers.js";

test("tipsContainForbiddenNonLatinScript is true for kanji when UI is fr", () => {
  assert.equal(
    tipsContainForbiddenNonLatinScript({ do: ["Pour 清水寺 réserve"], dont: [] }, "fr"),
    true
  );
});

test("tipsContainForbiddenNonLatinScript is false when UI is ja", () => {
  assert.equal(
    tipsContainForbiddenNonLatinScript({ do: ["清水寺は早朝がおすすめ"], dont: [] }, "ja"),
    false
  );
});

test("suggestionsBundle detects CJK in tips or activities for en UI", () => {
  assert.equal(
    suggestionsBundleContainsForbiddenNonLatinScript(
      {
        tips: { do: ["Book 東京 tower"], dont: [] },
        suggestedActivities: [],
      },
      "en"
    ),
    true
  );
  assert.equal(
    suggestionsBundleContainsForbiddenNonLatinScript(
      {
        tips: { do: ["Only Latin."], dont: ["Also Latin."] },
        suggestedActivities: [
          { title: "Shibuya", location: "Tokyo", description: "Walk", costNote: "Free" },
        ],
      },
      "en"
    ),
    false
  );
  assert.equal(
    suggestionsBundleContainsForbiddenNonLatinScript(
      {
        tips: { do: ["Latin only."], dont: ["Latin."] },
        suggestedActivities: [
          { title: "大阪城", location: "Osaka", description: "", costNote: "" },
        ],
      },
      "en"
    ),
    true
  );
});
