import test from "node:test";
import assert from "node:assert/strict";
import {
  dropPlacesWrongScriptForUiLang,
  pickPlacesListAfterScriptFilter,
  sanitizeMustSeePlaces,
} from "./placeGuards.js";

test("dropPlacesWrongScriptForUiLang removes Thai when UI is French", () => {
  const mixed = ["Grand Palace", "พระบรมมหาราชวัง", "Wat Pho"];
  const fr = dropPlacesWrongScriptForUiLang(mixed, "fr");
  assert.deepEqual(fr, ["Grand Palace", "Wat Pho"]);
});

test("pickPlacesListAfterScriptFilter returns [] when all Thai and UI is FR", () => {
  const thai = ["พิพิธภัณฑ์ศิลปะไทยร่วมสมัย", "หอประวัติ"];
  assert.deepEqual(pickPlacesListAfterScriptFilter(thai, "fr"), []);
});

test("pickPlacesListAfterScriptFilter keeps Thai when UI is Thai", () => {
  const thai = ["วัดพระแก้ว"];
  const out = pickPlacesListAfterScriptFilter(thai, "th");
  assert.deepEqual(out, thai);
});

test("sanitize + script filter does not resurrect Thai via fallback", () => {
  const raw = ["พระที่นั่งดุสิตมหาปราสาท"];
  const city = "Bangkok";
  const sanitized = sanitizeMustSeePlaces(raw, city);
  assert.ok(sanitized.length > 0);
  const forFr = pickPlacesListAfterScriptFilter(sanitized, "fr");
  assert.deepEqual(forFr, []);
});
