import assert from "node:assert/strict";
import test from "node:test";
import { classifyTrips } from "./classifyTrips.js";

function offsetYmd(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

test("classifyTrips puts in-range trip in now (active hero)", () => {
  const trip = {
    id: "active",
    title: "Cassis",
    start_date: offsetYmd(-2),
    end_date: offsetYmd(5),
  };
  const { now, upcoming, memories } = classifyTrips([trip]);
  assert.equal(now.length, 1);
  assert.equal(now[0].id, "active");
  assert.equal(upcoming.length, 0);
  assert.equal(memories.length, 0);
});

test("classifyTrips sends ended trip to memories", () => {
  const trip = {
    id: "past",
    title: "Marseille",
    start_date: offsetYmd(-30),
    end_date: offsetYmd(-5),
  };
  const { now, memories } = classifyTrips([trip]);
  assert.equal(now.length, 0);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].id, "past");
});
