import test from "node:test";
import assert from "node:assert/strict";
import {
  mergePass1Candidates,
  contractRelaxFill,
  clusteredParJour,
} from "./clusterCompletion.js";

test("mergePass1Candidates preserves ids and dedupes", () => {
  const merged = mergePass1Candidates(
    [
      { id: "c1", name: "Teide", searchName: "Teide" },
      { id: "c2", name: "Loro Parque", searchName: "Loro Parque" },
      { name: "Teide", searchName: "Mount Teide" },
      { name: "Anaga", searchName: "Anaga" },
    ],
    "Tenerife"
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, "c1");
  assert.ok(merged.some((c) => c.name === "Anaga" && /^c\d+$/.test(String(c.id))));
});

test("contractRelaxFill reaches perDay from spare pool", () => {
  const scored = [
    { id: "c1", name: "A", score: 10 },
    { id: "c2", name: "B", score: 9 },
    { id: "c3", name: "C", score: 8 },
    { id: "c4", name: "D", score: 7 },
  ];
  const { dayAssignments, contractRelaxed } = contractRelaxFill([[{ id: "c1" }]], scored, 2, 1);
  assert.deepEqual(clusteredParJour(dayAssignments), [2]);
  assert.deepEqual(contractRelaxed, [1]);
});
