import test from "node:test";
import assert from "node:assert/strict";
import { lookupTimeZone } from "../src/time-zone.js";

test("looks up and caches a valid observer time zone", async () => {
  let requests = 0;
  const fetcher = async (url) => {
    requests += 1;
    assert.match(url, /latitude=30\.43830/);
    assert.match(url, /longitude=-84\.28070/);
    return { ok: true, json: async () => ({ timeZone: "America/New_York" }) };
  };
  assert.equal(await lookupTimeZone([-84.2807, 30.4383], fetcher), "America/New_York");
  assert.equal(await lookupTimeZone([-84.2807, 30.4383], fetcher), "America/New_York");
  assert.equal(requests, 1);
});

test("rejects invalid coordinates and incomplete time-zone responses", async () => {
  await assert.rejects(lookupTimeZone([181, 0]), RangeError);
  await assert.rejects(
    lookupTimeZone([12.345, 47.123], async () => ({
      ok: true,
      json: async () => ({}),
    })),
    /no time-zone identifier/,
  );
});

