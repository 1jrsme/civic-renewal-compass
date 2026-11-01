import test from "node:test";
import assert from "node:assert/strict";
import { createMapCsv } from "../src/downloads.js";

const feature = (name, overrides = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-84.28, 30.44] },
  properties: { name, kind: "epa", statusName: "Active", source: "https://epa.gov/data", ...overrides },
});

test("exports selected map features as CSV with coordinates and source", () => {
  const csv = createMapCsv([feature("Cleanup site")]);
  assert.match(csv, /name,kind,longitude,latitude,status,detail,source,source_id,reference/);
  assert.match(csv, /"Cleanup site","epa","-84\.28","30\.44","Active","","https:\/\/epa\.gov\/data"/);
});

test("quotes CSV fields and neutralizes spreadsheet formulas", () => {
  const csv = createMapCsv([feature('=HYPERLINK("https://example.com")', { detail: "Line 1\nLine 2" })]);
  assert.ok(csv.includes("'=HYPERLINK("));
  assert.ok(csv.includes('""https://example.com""'));
  assert.match(csv, /"Line 1\nLine 2"/);
});

test("exports empty feature lists with a valid CSV header", () => {
  assert.equal(
    createMapCsv([]),
    "name,kind,longitude,latitude,status,detail,source,source_id,reference\r\n",
  );
});
