import test from "node:test";
import assert from "node:assert/strict";
import {
  dropPlacesWrongScriptForUiLang,
  pickPlacesListAfterScriptFilter,
  sanitizeMustSeePlaces,
  filterTipLinesForUiLang,
  filterSuggestedActivitiesForUiLang,
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

test("filterTipLinesForUiLang drops mixed French+Thai tip lines when UI is FR", () => {
  const line =
    "À Bangkok, pour พิพิธภัณฑ์ศิลปะไทยร่วมสมัย et พิพิธภัณฑ์ธนาคารแห่งประเทศไทย, réserve sur les sites officiels.";
  const out = filterTipLinesForUiLang([line, "Phrase 100 % française sans problème."], "fr");
  assert.deepEqual(out, ["Phrase 100 % française sans problème."]);
});

test("filterTipLinesForUiLang keeps Thai tips for Thai UI", () => {
  const th = ["วัดพระแก้ว — จองล่วงหน้า"];
  assert.deepEqual(filterTipLinesForUiLang(th, "th"), th);
});

test("filterTipLinesForUiLang drops lines with Japanese mixed in French for FR UI", () => {
  const line =
    "À Kyoto, pour 岩倉具視幽棲旧宅 et ガーデン ミュージアム 比叡, réserve sur les sites officiels.";
  const out = filterTipLinesForUiLang([line, "Conseil sans caractères japonais."], "fr");
  assert.deepEqual(out, ["Conseil sans caractères japonais."]);
});

test("filterSuggestedActivitiesForUiLang removes activity with Japanese title for FR UI", () => {
  const acts = [
    { title: "清水寺", location: "Kyoto", cost: 0, description: "", costNote: "" },
    { title: "Musée national", location: "Kyoto", cost: 5, description: "Visite", costNote: "" },
  ];
  const out = filterSuggestedActivitiesForUiLang(acts, "fr");
  assert.equal(out.length, 1);
  assert.match(out[0].title, /Musée national/);
});

test("filterSuggestedActivitiesForUiLang keeps Japanese titles for ja UI", () => {
  const acts = [{ title: "清水寺", location: "京都", cost: 0, description: "", costNote: "" }];
  assert.deepEqual(filterSuggestedActivitiesForUiLang(acts, "ja"), acts);
});
