import test from "node:test";
import assert from "node:assert/strict";
import { encodePhotoUrlForDisplay } from "./encodePhotoUrl.js";
import {
  activityBalloonImageId,
  buildActivityBalloonSvg,
} from "../map/activityBalloonMarker.js";

test("encodePhotoUrlForDisplay encodes Commons path segments", () => {
  const raw =
    "https://upload.wikimedia.org/wikipedia/commons/4/4f/Caf%C3%A9_de_Flore.jpg";
  const out = encodePhotoUrlForDisplay(raw);
  assert.ok(out.includes("Caf%C3%A9") || out.includes("Caf%25C3%25A9"));
});

test("encodePhotoUrlForDisplay encodes apostrophe in filename", () => {
  const raw =
    "https://upload.wikimedia.org/wikipedia/commons/a/ab/L'Horloge.jpg";
  const out = encodePhotoUrlForDisplay(raw);
  assert.ok(!out.includes("L'Horloge"));
  assert.match(out, /L(%27|&#39;)/);
});

test("activityBalloonImageId normal and selected", () => {
  assert.equal(activityBalloonImageId(2), "activity-balloon-2");
  assert.equal(activityBalloonImageId(2, true), "activity-balloon-2-sel");
});

test("buildActivityBalloonSvg uses brand orange and contrast num color", () => {
  const svg = buildActivityBalloonSvg(3, { selected: true });
  assert.match(svg, /#F16A2E/i);
  assert.match(svg, /#C2551F/i);
  assert.match(svg, />3</);
});
