import test from "node:test";
import assert from "node:assert/strict";
import {
  bearingAndDistance,
  calculateIssSkyPosition,
  calculateSunMoon,
  calculateSolarSystemVector,
  formatAngle,
  formatDistance,
  formatObservationTimes,
  formatSpatialCoordinate,
  localEastNorthUp,
  parseHorizonsVector,
} from "../src/compass-model.js";

test("calculates a north-east bearing and surface distance", () => {
  const result = bearingAndDistance([0, 0], [1, 1]);
  assert.ok(Math.abs(result.bearingDegrees - 45) < 0.1);
  assert.ok(Math.abs(result.distanceMeters - 157_249) < 100);
});

test("reports east/north axes and leaves unavailable elevation unknown", () => {
  const result = localEastNorthUp(
    { coordinates: [0, 0], altitudeMeters: 10 },
    { coordinates: [1, 1], altitudeMeters: 16 },
  );
  assert.ok(Math.abs(result.xMeters - 111_195) < 20);
  assert.ok(Math.abs(result.yMeters - 111_195) < 20);
  assert.equal(result.zMeters, 6);
  assert.equal(
    localEastNorthUp({ coordinates: [0, 0] }, { coordinates: [0, 1] }).zMeters,
    null,
  );
});

test("calculates an ISS sky direction and visible range from an observer", () => {
  const overhead = calculateIssSkyPosition([0, 0], 0, {
    latitude: 0,
    longitude: 0,
    altitude: 420,
  });
  assert.equal(overhead.azimuthDegrees, 0);
  assert.equal(overhead.altitudeDegrees, 90);
  assert.equal(overhead.aboveHorizon, true);
  assert.ok(Math.abs(overhead.rangeMeters - 420_000) < 1);
  const farSide = calculateIssSkyPosition([0, 0], null, {
    latitude: 0,
    longitude: 180,
    altitude: 420,
  });
  assert.equal(farSide.aboveHorizon, false);
  assert.ok(farSide.altitudeDegrees < 0);
});

test("rejects invalid ISS or observer coordinates", () => {
  assert.throws(() => calculateIssSkyPosition([181, 0], null, {
    latitude: 0,
    longitude: 0,
    altitude: 420,
  }), RangeError);
  assert.throws(() => calculateIssSkyPosition([0, 0], null, {
    latitude: 0,
    longitude: 0,
    altitude: 0,
  }), RangeError);
});

test("formats degrees, radians, gradians, mils, and common distances", () => {
  assert.equal(formatAngle(90, "degrees", true), "90.0°");
  assert.equal(formatAngle(180, "radians"), "3.142 rad");
  assert.equal(formatAngle(90, "gradians"), "100.0 gon");
  assert.equal(formatAngle(90, "mils"), "1600 mil");
  assert.equal(formatDistance(1_000, "kilometers"), "1.00 km");
});

test("estimates Sun and Moon azimuth and altitude for a valid observation", () => {
  const result = calculateSunMoon(new Date("2024-03-20T12:00:00Z"), 0, 0);
  assert.ok(result.sun.altitudeDegrees > 85);
  assert.ok(result.sun.azimuthDegrees >= 0 && result.sun.azimuthDegrees < 360);
  assert.ok(result.moon.altitudeDegrees >= -90 && result.moon.altitudeDegrees <= 90);
  assert.ok(result.moon.illumination >= 0 && result.moon.illumination <= 1);
  assert.equal(result.sun.aboveHorizon, result.sun.altitudeDegrees >= 0);
  assert.ok(result.moon.phase);
  assert.ok(Math.abs(result.sun.subpoint.longitude) < 5);
  assert.ok(Math.abs(result.sun.subpoint.latitude) < 2);
  assert.ok(Math.abs(result.moon.subpoint.latitude) <= 30);
});

test("formats observation time in device-local time and UTC", () => {
  const result = formatObservationTimes(new Date("2024-03-20T12:34:00Z"), "America/New_York");
  assert.ok(result.local.length > 0);
  assert.ok(result.localZone.length > 0);
  assert.equal(result.observerLocal, "3/20/2024, 8:34:00 AM");
  assert.equal(result.observerTimeZone, "America/New_York");
  assert.equal(result.utc, "2024-03-20 12:34:00 UTC");
  assert.throws(() => formatObservationTimes("not a time"), RangeError);
});

test("rejects invalid time or coordinates for sky calculations", () => {
  assert.throws(() => calculateSunMoon("not a time", 0, 0), RangeError);
  assert.throws(() => calculateSunMoon(new Date(), 91, 0), RangeError);
});

test("calculates offline heliocentric and body-centered positions", () => {
  const date = new Date("2000-01-01T12:00:00Z");
  const earth = calculateSolarSystemVector("399", "10", date);
  assert.ok(earth.distanceAu > 0.98 && earth.distanceAu < 1.02);
  assert.equal(earth.accuracy, "Offline Keplerian estimate");
  const earthCentered = calculateSolarSystemVector("399", "399", date);
  assert.equal(earthCentered.distanceAu, 0);
  const moon = calculateSolarSystemVector("301", "399", date);
  assert.ok(moon.distanceAu > 0.0024 && moon.distanceAu < 0.0028);
});

test("formats spatial coordinates and parses a JPL Horizons vector table", () => {
  assert.equal(formatSpatialCoordinate(1, "au"), "1.000000 AU");
  assert.equal(formatSpatialCoordinate(0.001, "million-kilometers"), "149.6 million km");
  assert.deepEqual(
    parseHorizonsVector("header\n$$SOE\n  X = 1.250000000000E+00 Y = -2.500000000000E-01 Z = 3.000000000000E-02\n$$EOE"),
    {
      xAu: 1.25,
      yAu: -0.25,
      zAu: 0.03,
      distanceAu: Math.hypot(1.25, -0.25, 0.03),
    },
  );
  assert.throws(() => parseHorizonsVector("No vector data"), /vector table/);
});

test("rejects offline orbital estimates outside the supported time range", () => {
  assert.throws(
    () => calculateSolarSystemVector("399", "10", new Date("2300-01-01T00:00:00Z")),
    RangeError,
  );
});
