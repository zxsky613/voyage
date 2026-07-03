import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeIcsText,
  formatIcsLocalDateTime,
  addHoursToIcsLocalDateTime,
  buildVeventBlock,
  buildTripIcs,
  buildActivityIcsUid,
} from "./buildTripIcs.js";

test("escapeIcsText escapes commas semicolons and newlines", () => {
  assert.equal(escapeIcsText("a,b;c\nd"), "a\\,b\\;c\\nd");
  assert.equal(escapeIcsText("back\\slash"), "back\\\\slash");
});

test("formatIcsLocalDateTime builds floating local datetime", () => {
  assert.equal(formatIcsLocalDateTime("2026-07-15", "09:30"), "20260715T093000");
  assert.equal(formatIcsLocalDateTime("bad"), null);
});

test("addHoursToIcsLocalDateTime adds duration", () => {
  assert.equal(addHoursToIcsLocalDateTime("20260715T090000", 2), "20260715T110000");
});

test("buildActivityIcsUid is stable for activity id", () => {
  assert.equal(buildActivityIcsUid({ id: "abc-123" }), "abc-123@justtrip.fr");
});

test("buildVeventBlock includes VALARM triggers", () => {
  const block = buildVeventBlock(
    {
      id: "act-1",
      title: "Palais de Knossos",
      date: "2026-07-15",
      time: "10:00",
      location: "Heraklion",
      estimated_price_eur: 15,
      description: "Visite guidée",
    },
    { destination: "Crète" }
  );
  assert.ok(block);
  assert.match(block, /BEGIN:VEVENT/);
  assert.match(block, /UID:act-1@justtrip\.fr/);
  assert.match(block, /DTSTART:20260715T100000/);
  assert.match(block, /DTEND:20260715T120000/);
  assert.match(block, /SUMMARY:Palais de Knossos/);
  assert.match(block, /LOCATION:Heraklion\\, Crète/);
  assert.match(block, /TRIGGER:-P1D/);
  assert.match(block, /TRIGGER:-PT2H/);
  assert.match(block, /ACTION:DISPLAY/);
  assert.equal((block.match(/BEGIN:VALARM/g) || []).length, 2);
});

test("buildTripIcs wraps events in VCALENDAR", () => {
  const ics = buildTripIcs({
    destination: "Crète",
    activities: [{ id: "x", title: "Musée", date: "2026-07-16", time: "14:00" }],
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /END:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
});
