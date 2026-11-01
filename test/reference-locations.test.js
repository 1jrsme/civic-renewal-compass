import test from "node:test";
import assert from "node:assert/strict";
import {
  REFERENCE_LOCATIONS,
  REFERENCE_LOCATION_CATEGORIES,
  STARTING_LOCATIONS,
  getStartingLocation,
  referenceMapUrl,
} from "../src/reference-locations.js";
import {
  COMMUNITY_PROGRAMS,
  buildCommunityProgramSearchUrl,
} from "../src/program-directory.js";

test("bundles nationwide reference points for every requested facility category", () => {
  const ids = new Set();
  for (const category of REFERENCE_LOCATION_CATEGORIES) {
    const points = REFERENCE_LOCATIONS.filter((location) => location.kind === category.id);
    assert.ok(points.length > 0, `Missing reference points for ${category.label}`);
  }
  for (const location of REFERENCE_LOCATIONS) {
    assert.ok(!ids.has(location.id), `Duplicate reference id: ${location.id}`);
    ids.add(location.id);
    assert.equal(location.coordinates.length, 2);
    const [longitude, latitude] = location.coordinates;
    assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
    assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
    assert.ok(location.name && location.city);
  }
  assert.ok(REFERENCE_LOCATIONS.length >= 30);
});

test("reference map links encode the bundled coordinate", () => {
  const location = REFERENCE_LOCATIONS[0];
  const url = new URL(referenceMapUrl(location));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "www.openstreetmap.org");
  assert.equal(url.searchParams.get("mlat"), String(location.coordinates[1]));
  assert.equal(url.searchParams.get("mlon"), String(location.coordinates[0]));
});

test("starting location choices include city, county, and airports with safe fallback", () => {
  assert.ok(STARTING_LOCATIONS.some((location) => location.id === "tallahassee-city"));
  assert.ok(STARTING_LOCATIONS.some((location) => location.id === "leon-county"));
  assert.ok(STARTING_LOCATIONS.some((location) => location.id === "tallahassee-airport"));
  assert.ok(STARTING_LOCATIONS.some((location) => location.group === "airport"));
  assert.equal(getStartingLocation("not-a-location").id, "tallahassee-city");
  for (const location of STARTING_LOCATIONS) {
    assert.ok(location.search);
    assert.ok(Number.isFinite(location.coordinates[0]));
    assert.ok(Number.isFinite(location.coordinates[1]));
  }
});

test("community programs cover government levels and build domain-scoped searches", () => {
  assert.deepEqual(Object.keys(COMMUNITY_PROGRAMS), ["federal", "state", "county", "city", "other"]);
  for (const level of Object.values(COMMUNITY_PROGRAMS)) {
    assert.ok(level.resources.length > 0);
    for (const resource of level.resources) {
      const url = new URL(resource.url);
      assert.equal(url.protocol, "https:");
      assert.ok(url.hostname === resource.domain || url.hostname.endsWith(`.${resource.domain}`));
      const search = new URL(buildCommunityProgramSearchUrl(resource, "Tallahassee, Florida", "parks"));
      assert.equal(search.hostname, "www.google.com");
      assert.match(search.searchParams.get("q"), new RegExp(`site:${resource.domain.replaceAll(".", "\\.")}`));
      assert.match(search.searchParams.get("q"), /Tallahassee, Florida/);
      assert.match(search.searchParams.get("q"), /parks/);
    }
  }
});
