import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEpaRecords,
  safeHttpUrl,
  retrievedLabel,
} from "../src/data.js";

test("normalizes EPA locations and drops sites without valid coordinates", () => {
  const result = normalizeEpaRecords([
    {
      site_id: "123",
      name: "Example site",
      primary_latitude_decimal_val: "40.1",
      primary_longitude_decimal_val: "-75.2",
      fk_ref_state_code: "PA",
      npl_status_name: "Final",
    },
    { name: "No coordinates", primary_latitude_decimal_val: null },
    {
      name: "Null coordinates",
      primary_latitude_decimal_val: null,
      primary_longitude_decimal_val: null,
    },
    {
      name: "Out-of-range coordinates",
      primary_latitude_decimal_val: "91",
      primary_longitude_decimal_val: "0",
    },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].coordinates, [-75.2, 40.1]);
  assert.equal(result[0].kind, "epa");
  assert.equal(result[0].statusName, "Final");
  assert.equal(result[0].sourceId, "123");
});

test("rejects unsafe URLs and labels retrieval time", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("https://example.gov/data"), "https://example.gov/data");
  assert.match(retrievedLabel(new Date("2026-01-01T12:00:00Z")), /Retrieved/);
});
