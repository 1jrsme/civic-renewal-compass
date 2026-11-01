import test from "node:test";
import assert from "node:assert/strict";
import {
  BEZEL_INTERVALS,
  DEFAULT_BEZEL_DISPLAY,
  DEFAULT_CELESTIAL_BEZEL,
  BEARING_ARROW_COLORS,
  bearingArrowColor,
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
  assert.deepEqual(settings.outer, {
    ...DEFAULT_BEZEL_DISPLAY.outer,
    visible: true,
    systems: ["degrees"],
  });
  assert.deepEqual(settings.inner, {
    ...DEFAULT_BEZEL_DISPLAY.inner,
    visible: false,
    systems: ["radians"],
    interval: 5,
  });
  assert.deepEqual(BEZEL_INTERVALS, [1, 5, 10, 15, 30, 45, 90]);
});

test("bezel colors and independent ring and numbering adjustments are normalized", () => {
  const display = normalizeBezelDisplay({
    outer: {
      color: "#Aa20fF",
      rotation: 28.7,
      radius: 46.5,
      labelRadius: 41.2,
      labelSize: 5.6,
      systemSpacing: 7.3,
      systems: ["degrees", "mils"],
    },
    inner: {
      color: "red",
      rotation: -900,
      radius: 100,
      labelRadius: 2,
      labelSize: 20,
      systemSpacing: 0,
    },
  });

  assert.equal(display.outer.color, "#aa20ff");
  assert.equal(display.outer.rotation, 28.7);
  assert.equal(display.outer.radius, 46.5);
  assert.equal(display.outer.labelRadius, 41.2);
  assert.equal(display.outer.labelSize, 5.6);
  assert.equal(display.outer.systemSpacing, 7.3);
  assert.equal(display.inner.color, DEFAULT_BEZEL_DISPLAY.inner.color);
  assert.equal(display.inner.rotation, -180);
  assert.equal(display.inner.radius, 47);
  assert.equal(display.inner.labelRadius, 15);
  assert.equal(display.inner.labelSize, 8);
  assert.equal(display.inner.systemSpacing, 1);
});

test("compass zoom is bounded and legacy settings use the enlarged default", () => {
  assert.equal(normalizeBezelDisplay({}).zoom, 1.2);
  assert.equal(normalizeBezelDisplay({ zoom: 2 }).zoom, 1.8);
  assert.equal(normalizeBezelDisplay({ zoom: 0.1 }).zoom, 0.8);
  assert.equal(normalizeBezelDisplay({ zoom: "invalid" }).zoom, 1.2);
});

test("bearing arrows use distinct, repeatable colors for multiple targets", () => {
  const colors = Array.from({ length: BEARING_ARROW_COLORS.length }, (_, index) => bearingArrowColor(index));
  assert.equal(new Set(colors).size, BEARING_ARROW_COLORS.length);
  assert.equal(bearingArrowColor(0), colors[0]);
  assert.equal(bearingArrowColor(BEARING_ARROW_COLORS.length), colors[0]);
});

test("every visible ring keeps a numbered scale when its final system is unchecked", () => {
  const display = normalizeBezelDisplay({
    outer: { visible: true, systems: [], interval: 15 },
    inner: { visible: true, systems: [], interval: 45 },
  });
  assert.deepEqual(display.outer.systems, ["degrees"]);
  assert.deepEqual(display.inner.systems, ["degrees"]);
});

test("numbering systems use the selected radius, size, and spacing for each ring", () => {
  const labels = buildBezelLabels({
    outer: {
      visible: true,
      systems: ["degrees", "mils"],
      interval: 90,
      labelRadius: 40,
      labelSize: 5,
      systemSpacing: 7,
    },
    inner: {
      visible: true,
      systems: ["degrees"],
      interval: 180,
      labelRadius: 27,
      labelSize: 3.5,
    },
  });
  assert.deepEqual(
    labels.filter((label) => label.ring === "outer").map(({ radius, size }) => ({ radius, size })),
    [{ radius: 40, size: 5 }, { radius: 40, size: 5 }, { radius: 40, size: 5 }, { radius: 40, size: 5 },
      { radius: 33, size: 5 }, { radius: 33, size: 5 }, { radius: 33, size: 5 }, { radius: 33, size: 5 }],
  );
  assert.ok(labels.filter((label) => label.ring === "inner").every((label) => label.radius === 27 && label.size === 3.5));
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
