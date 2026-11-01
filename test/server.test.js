import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequestHandler } from "../server.js";

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("place search identifies the app and caches repeated searches", async () => {
  let calls = 0;
  await withServer(createRequestHandler({
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(new URL(url).origin, "https://nominatim.openstreetmap.org");
      assert.match(options.headers["User-Agent"], /^CivicRenewalAtlas\//);
      return new Response(JSON.stringify([{ lat: "38.9", lon: "-77.0" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  }), async (base) => {
    const first = await fetch(`${base}/api/geocode?q=Washington%2C%20DC`);
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/api/geocode?q=washington%2C%20dc`);
    assert.equal(second.status, 200);
    assert.equal(calls, 1);
  });
});

test("place search rate-limits uncached requests to one per second", async () => {
  let calls = 0;
  await withServer(createRequestHandler({
    fetchImpl: async () => {
      calls += 1;
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }), async (base) => {
    const first = await fetch(`${base}/api/geocode?q=Boston`);
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/api/geocode?q=Chicago`);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get("retry-after"), "1");
    assert.equal(calls, 1);
  });
});

test("approximate area lookup validates, minimizes, and caches coordinates", async () => {
  let calls = 0;
  let upstreamUrl;
  await withServer(createRequestHandler({
    fetchImpl: async (url, options) => {
      calls += 1;
      upstreamUrl = new URL(url);
      assert.equal(upstreamUrl.origin, "https://nominatim.openstreetmap.org");
      assert.equal(upstreamUrl.pathname, "/reverse");
      assert.match(options.headers["User-Agent"], /^CivicRenewalAtlas\//);
      return new Response(JSON.stringify({
        address: { city: "Springfield", county: "Greene County", state: "Missouri", postcode: "65806" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }), async (base) => {
    const invalid = await fetch(`${base}/api/reverse-geocode?lat=&lon=-93.292`);
    assert.equal(invalid.status, 400);
    const first = await fetch(`${base}/api/reverse-geocode?lat=37.209876&lon=-93.292345`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), {
      city: "Springfield",
      county: "Greene County",
      state: "Missouri",
      postcode: "65806",
      label: "Springfield, Greene County, Missouri",
    });
    assert.equal(upstreamUrl.searchParams.get("lat"), "37.210");
    assert.equal(upstreamUrl.searchParams.get("lon"), "-93.292");
    const cached = await fetch(`${base}/api/reverse-geocode?lat=37.2097&lon=-93.2924`);
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
  });
});

test("weather proxy fetches selected NWS layers and caches results", async () => {
  const calls = [];
  const mockData = {
    "https://api.weather.gov/points/38.9000,-77.0000": {
      properties: {
        forecast: "https://api.weather.gov/gridpoints/TOP/31,80/forecast",
        observationStations: "https://api.weather.gov/gridpoints/TOP/31,80/stations",
      },
    },
    "https://api.weather.gov/gridpoints/TOP/31,80/stations": {
      features: [{ properties: { stationIdentifier: "KABC", name: "Local Airport" } }],
    },
    "https://api.weather.gov/stations/KABC/observations/latest": {
      properties: {
        stationId: "KABC",
        textDescription: "Clear",
        temperature: { value: 20, unitCode: "wmoUnit:degC" },
      },
    },
    "https://api.weather.gov/gridpoints/TOP/31,80/forecast": {
      properties: { periods: [{ name: "This Afternoon", temperature: 75, temperatureUnit: "F" }] },
    },
    "https://api.weather.gov/alerts/active?point=38.9000%2C-77.0000": {
      features: [{
        id: "https://api.weather.gov/alerts/1",
        properties: { event: "Flood Watch", severity: "Moderate", headline: "Flooding possible." },
      }],
    },
  };
  await withServer(createRequestHandler({
    weatherContact: "test@example.org",
    fetchImpl: async (url, options) => {
      const href = String(url);
      calls.push(href);
      assert.match(options.headers["User-Agent"], /CivicRenewalAtlas\/0\.1 \(test@example\.org\)/);
      const body = mockData[href];
      assert.ok(body, `Unexpected NWS request: ${href}`);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });
    },
  }), async (base) => {
    const query = "lat=38.9&lon=-77&layers=current%2Cforecast%2Calerts";
    const first = await fetch(`${base}/api/weather?${query}`);
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.current.description, "Clear");
    assert.deepEqual(result.stations, [{ id: "KABC", name: "Local Airport" }]);
    assert.equal(result.forecast[0].temperature, 75);
    assert.equal(result.alerts[0].event, "Flood Watch");
    assert.equal(calls.length, 5);
    const cached = await fetch(`${base}/api/weather?${query}`);
    assert.equal(cached.status, 200);
    assert.equal(calls.length, 5);
  });
});

test("ISS position proxy validates, labels, and caches live telemetry", async () => {
  let calls = 0;
  await withServer(createRequestHandler({
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(String(url), "https://api.wheretheiss.at/v1/satellites/25544");
      assert.match(options.headers["User-Agent"], /^CivicRenewalAtlas\//);
      return new Response(JSON.stringify({
        id: 25544,
        latitude: 12.5,
        longitude: -45.25,
        altitude: 421.8,
        velocity: 27570,
        timestamp: 1793497515,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }), async (base) => {
    const first = await fetch(`${base}/api/iss`);
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.deepEqual(result, {
      latitude: 12.5,
      longitude: -45.25,
      altitude: 421.8,
      velocity: 27570,
      timestamp: "2026-11-01T01:45:15.000Z",
      retrievedAt: result.retrievedAt,
      source: "WhereTheISS.at",
      sourceUrl: "https://wheretheiss.at/",
    });
    assert.equal(Number.isNaN(new Date(result.retrievedAt).getTime()), false);
    const cached = await fetch(`${base}/api/iss`);
    assert.equal(cached.status, 200);
    assert.equal((await cached.json()).timestamp, result.timestamp);
    assert.equal(calls, 1);
  });
});

test("ISS position proxy rejects invalid telemetry", async () => {
  await withServer(createRequestHandler({
    fetchImpl: async () => new Response(JSON.stringify({
      id: 25544,
      latitude: 95,
      longitude: 0,
      altitude: 420,
      velocity: 27_000,
      timestamp: 1_793_497_515,
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
  }), async (base) => {
    const response = await fetch(`${base}/api/iss`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /invalid coordinates or telemetry/);
  });
});

test("weather proxy lets a user select an available local or airport station", async () => {
  const calls = [];
  const responses = {
    "https://api.weather.gov/points/40.0000,-75.0000": {
      properties: { observationStations: "https://api.weather.gov/gridpoints/PHI/1,1/stations" },
    },
    "https://api.weather.gov/gridpoints/PHI/1,1/stations": {
      features: [
        { properties: { stationIdentifier: "KLOC", name: "Local Observation Site" } },
        { properties: { stationIdentifier: "KPHL", name: "Philadelphia International Airport" } },
      ],
    },
    "https://api.weather.gov/stations/KPHL/observations/latest": {
      properties: { stationId: "KPHL", textDescription: "Cloudy" },
    },
  };
  await withServer(createRequestHandler({
    fetchImpl: async (url) => {
      const href = String(url);
      calls.push(href);
      assert.ok(responses[href], `Unexpected NWS request: ${href}`);
      return new Response(JSON.stringify(responses[href]), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });
    },
  }), async (base) => {
    const selected = await fetch(`${base}/api/weather?lat=40&lon=-75&layers=current&station=KPHL`);
    assert.equal(selected.status, 200);
    const data = await selected.json();
    assert.equal(data.current.station, "KPHL");
    assert.equal(data.current.stationName, "Philadelphia International Airport");
    assert.equal(data.stations.length, 2);
    assert.equal(calls.at(-1), "https://api.weather.gov/stations/KPHL/observations/latest");
  });
});

test("weather proxy rejects invalid coordinates and unrecognized layers", async () => {
  let calls = 0;
  await withServer(createRequestHandler({
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    },
  }), async (base) => {
    const missingCoordinates = await fetch(`${base}/api/weather?layers=current`);
    assert.equal(missingCoordinates.status, 400);
    const badCoordinate = await fetch(`${base}/api/weather?lat=91&lon=0&layers=current`);
    assert.equal(badCoordinate.status, 400);
    const badLayer = await fetch(`${base}/api/weather?lat=40&lon=-75&layers=current%2Cprivate`);
    assert.equal(badLayer.status, 400);
    const stationWithoutCurrent = await fetch(`${base}/api/weather?lat=40&lon=-75&layers=forecast&station=KPHL`);
    assert.equal(stationWithoutCurrent.status, 400);
    const invalidStationId = await fetch(`${base}/api/weather?lat=40&lon=-75&layers=current&station=bad%20id`);
    assert.equal(invalidStationId.status, 400);
    assert.equal(calls, 0);
  });
});

test("JPL Horizons proxy validates inputs, requests vectors, and caches a minute", async () => {
  let calls = 0;
  let upstreamUrl;
  await withServer(createRequestHandler({
    fetchImpl: async (url) => {
      calls += 1;
      upstreamUrl = new URL(url);
      assert.equal(upstreamUrl.origin, "https://ssd.jpl.nasa.gov");
      assert.equal(upstreamUrl.pathname, "/api/horizons.api");
      return new Response(JSON.stringify({
        result: "$$SOE\n X = 1.0E+00 Y = 2.0E+00 Z = 3.0E+00\n$$EOE",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }), async (base) => {
    const invalid = await fetch(`${base}/api/horizons?target=bad&center=10&time=2026-03-19T12%3A00%3A00Z`);
    assert.equal(invalid.status, 400);
    const query = "target=499&center=10&time=2026-03-19T12%3A00%3A00Z";
    const first = await fetch(`${base}/api/horizons?${query}`);
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.target, "499");
    assert.equal(result.center, "10");
    assert.match(result.result, /\$\$SOE/);
    assert.equal(upstreamUrl.searchParams.get("CENTER"), "'500@10'");
    assert.equal(upstreamUrl.searchParams.get("EPHEM_TYPE"), "VECTORS");
    const cached = await fetch(`${base}/api/horizons?${query}`);
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
  });
});

test("public landmark proxy validates map area and returns named OSM landmarks", async () => {
  let calls = 0;
  let submittedQuery = "";
  await withServer(createRequestHandler({
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, "https://overpass-api.de/api/interpreter");
      submittedQuery = new URLSearchParams(options.body).get("data");
      return new Response(JSON.stringify({
        elements: [
          { type: "node", id: 1, lat: 30.45, lon: -84.28, tags: { name: "City Hospital", amenity: "hospital" } },
          { type: "way", id: 2, center: { lat: 30.46, lon: -84.27 }, tags: { name: "Central Police", amenity: "police" } },
          { type: "node", id: 3, lat: 30.47, lon: -84.26, tags: { amenity: "police" } },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  }), async (base) => {
    const invalid = await fetch(`${base}/api/landmarks?bbox=-84.3,30.4,-81,30.8&types=police`);
    assert.equal(invalid.status, 400);
    const query = "bbox=-84.4,30.3,-84.2,30.5&types=medical,police";
    const first = await fetch(`${base}/api/landmarks?${query}`);
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.features.length, 2);
    assert.equal(result.features[0].name, "City Hospital");
    assert.equal(result.features[0].category, "medical");
    assert.equal(result.features[1].category, "police");
    assert.match(result.attribution, /ODbL/);
    assert.match(submittedQuery, /amenity/);
    const cached = await fetch(`${base}/api/landmarks?${query}`);
    assert.equal(cached.status, 200);
    assert.equal(calls, 1);
  });
});
