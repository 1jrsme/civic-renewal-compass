import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  normalizeDegrees,
  computeGyroState,
  compassHeadingFromMessage,
} from "../src/gyro-model.js";

test("angles wrap correctly and output stays within safe limits", () => {
  assert.equal(normalizeDegrees(450), 90);
  assert.equal(normalizeDegrees(-10), 350);
  assert.equal(clamp(22, 0, 10), 10);
  assert.equal(clamp(-4, 0, 10), 0);
});

test("gyro state sanitizes heading, pitch, roll, and spin rate", () => {
  const result = computeGyroState({
    heading: 365,
    pitch: 95,
    roll: -200,
    spinRate: 900,
    stability: 110,
  });
  assert.equal(result.heading, 5);
  assert.equal(result.pitch, 90);
  assert.equal(result.roll, -180);
  assert.equal(result.spinRate, 720);
  assert.equal(result.stability, 100);
  assert.equal(result.safe, false);
});

test("reads compass heading updates and ignores messages without heading data", () => {
  assert.equal(compassHeadingFromMessage({ type: "heading", heading: 370 }), 10);
  assert.equal(compassHeadingFromMessage({ type: "state", heading: -10 }), 350);
  assert.equal(compassHeadingFromMessage({ type: "bezel", bearing: 90 }), null);
  assert.equal(compassHeadingFromMessage({ type: "heading", heading: "north" }), null);
});
