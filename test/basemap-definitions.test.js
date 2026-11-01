import test from "node:test";
import assert from "node:assert/strict";
import { BASEMAP_DEFINITIONS } from "../src/basemap-definitions.js";

test("public basemaps expose supported raster tiles and provider attribution", () => {
  for (const id of ["usgsTopo", "nasaBlueMarble", "noaaNautical"]) {
    const definition = BASEMAP_DEFINITIONS[id];
    assert.ok(definition, `${id} is registered`);
    assert.equal(definition.source.type, "raster");
    assert.equal(definition.source.tileSize, 256);
    assert.match(definition.source.tiles[0], /^https:\/\//);
    assert.ok(definition.source.attribution.length > 0);
  }
});

test("NASA and NOAA basemaps declare their coverage limits", () => {
  assert.equal(BASEMAP_DEFINITIONS.nasaBlueMarble.source.maxzoom, 8);
  assert.deepEqual(BASEMAP_DEFINITIONS.noaaNautical.source.bounds, [-180, 15, -60, 75]);
});