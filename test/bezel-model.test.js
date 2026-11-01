import test from "node:test";
import assert from "node:assert/strict";
import {
  BEZEL_INTERVALS,
  DEFAULT_BEZEL_DISPLAY,
  DEFAULT_CELESTIAL_BEZEL,
  buildBezelLabels,
  normalizeCelestialBezel,
  normalizeBezelDisplay,
  projectCelestialDirection,
} from "../src/bezel-model.js";

test("default bezel shows a readable outer degree scale and hides the inner ring", () => {
  const labels = buildBezelLabels(DEFAULT_BEZEL_DISPLAY);
  assert.equal(labels.length, 12);
  assert.ok(labels.every((label) => label.ring === "outer" && label.system === "degrees"));
  assert.equal(labels[0].text, "000");
  assert.equal(labels.at(-1).text, "330");
});

test("each selectable number system uses its own range without a duplicate endpoint", () => {
  const systems = ["degrees", "gradians", "radians", "mils"];
  const labels = buildBezelLabels({
    outer: { visible: true, systems, interval: 45 },
    inner: { visible: false, systems: [], interval: 45 },
  });
  assert.equal(labels.length, 32);
  assert.equal(labels.filter((label) => label.system === "degrees").at(-1).text, "315");
  assert.equal(labels.filter((label) => label.system === "gradians")[2].text, "100g");
  assert.equal(labels.filter((label) => label.system === "radians")[2].text, "π/2");
  assert.equal(labels.filter((label) => label.system === "mils")[2].text, "1600");
});

test("one-degree intervals cover 0 through 359 and allow separate inner scales", () => {
  const labels = buildBezelLabels({
    outer: { visible: true, systems: ["degrees"], interval: 1 },
    inner: { visible: true, systems: ["degrees"], interval: 90 },
  });
  const outer = labels.filter((label) => label.ring === "outer");
  const inner = labels.filter((label) => label.ring === "inner");
  assert.equal(outer.length, 360);
  assert.equal(outer[0].text, "000");
  assert.equal(outer[359].text, "359");
  assert.deepEqual(inner.map((label) => label.text), ["000", "090", "180", "270"]);
});

test("invalid bezel settings are normalized to supported defaults", () => {
  const settings = normalizeBezelDisplay({
    outer: { visible: true, systems: ["degrees", "unknown", "degrees"], interval: 2 },
    inner: { visible: false, systems: ["radians"], interval: 5 },
  });
  assert.deepEqual(settings.outer, { visible: true, systems: ["degrees"], interval: 30 });
  assert.deepEqual(settings.inner, { visible: false, systems: ["radians"], interval: 5 });
  assert.deepEqual(BEZEL_INTERVALS, [1, 5, 10, 15, 30, 45, 90]);
});

test("every visible ring keeps a numbered scale when its final system is unchecked", () => {
  const display = normalizeBezelDisplay({
    outer: { visible: true, systems: [], interval: 15 },
    inner: { visible: true, systems: [], interval: 45 },
  });
  assert.deepEqual(display.outer.systems, ["degrees"]);
  assert.deepEqual(display.inner.systems, ["degrees"]);
});

test("celestial bezel options validate body toggles and supported label intervals", () => {
  assert.deepEqual(normalizeCelestialBezel(DEFAULT_CELESTIAL_BEZEL), DEFAULT_CELESTIAL_BEZEL);
  assert.deepEqual(
    normalizeCelestialBezel({ visible: false, sun: false, moon: true, interval: 10 }),
    { visible: false, sun: false, moon: true, iss: true, interval: 10, view: "sphere" },
  );
  assert.deepEqual(
    normalizeCelestialBezel({ visible: "yes", sun: 1, moon: false, interval: 2 }),
    { visible: true, sun: true, moon: false, iss: true, interval: 30, view: "sphere" },
  );
  assert.equal(normalizeCelestialBezel({ view: "world-map" }).view, "world-map");
  assert.equal(normalizeCelestialBezel({ view: "globe-map" }).view, "globe-map");
  assert.equal(normalizeCelestialBezel({ view: "unsupported" }).view, "sphere");
});

test("3D celestial projection places horizon directions on the bezel and zenith above them", () => {
  const north = projectCelestialDirection(0, 0);
  const east = projectCelestialDirection(90, 0);
  const zenith = projectCelestialDirection(0, 90);
  assert.ok(north.y < 62);
  assert.ok(east.x > 80);
  assert.ok(zenith.y < north.y);
  assert.ok(Math.hypot(north.x - 80, north.y - 62) <= 42);
  assert.ok(Math.hypot(east.x - 80, east.y - 62) <= 42);
});
