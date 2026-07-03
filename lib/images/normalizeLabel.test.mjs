import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLabel,
  normalizeLabelKey,
  normalizeKeyPart,
  splitResolveImageLabelContext,
} from "./normalizeLabel.js";

test("normalizeKeyPart strips accents and lowercases", () => {
  assert.equal(normalizeKeyPart("Ténérife"), "tenerife");
  assert.equal(normalizeKeyPart("  Canaries,   Espagne  "), "canaries, espagne");
});

test("normalizeLabel(Ténérife, Canaries, Espagne) matches seed cache key", () => {
  const key = normalizeLabel("Ténérife, Canaries, Espagne");
  assert.equal(key, "tenerife|canaries, espagne");
  assert.equal(normalizeLabelKey("Ténérife, Canaries, Espagne"), key);
});

test("normalizeLabel is stable with explicit context when label has no comma geo", () => {
  assert.equal(normalizeLabel("Tenerife", "Canary Islands, Spain"), "tenerife|canary islands, spain");
});

test("normalizeLabel ignores inferred context — only explicit API context or comma split", () => {
  assert.equal(normalizeLabel("Crete"), "crete");
  assert.equal(normalizeLabel("Crete", "Greece"), "crete|greece");
  assert.equal(normalizeLabel("Crete, Greece"), "crete|greece");
});

test("Crete variants share one cache key without context", () => {
  const keys = ["Crete", "Crète", "克里特岛"].map((l) => normalizeLabel(l));
  assert.equal(new Set(keys).size, 1);
  assert.equal(keys[0], "crete");
});

test("Capri homonyms produce distinct cache keys", () => {
  assert.notEqual(
    normalizeLabel("Capri, Gracias a Dios, Honduras"),
    normalizeLabel("Capri, Campania, Italie")
  );
});

test("splitResolveImageLabelContext prefers comma split over external context", () => {
  const split = splitResolveImageLabelContext("Ténérife, Canaries, Espagne", "Canaries, Espagne");
  assert.equal(split.searchLabel, "Ténérife");
  assert.equal(split.context, "Canaries, Espagne");
});

test("write/read key coherence — same label produces identical key", () => {
  const label = "Ténérife, Canaries, Espagne";
  const writeKey = normalizeLabel(label);
  const readKey = normalizeLabel(label);
  assert.equal(writeKey, readKey);
  assert.equal(writeKey, "tenerife|canaries, espagne");
});
