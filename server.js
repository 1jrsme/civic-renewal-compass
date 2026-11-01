import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const nominatimUrl = "https://nominatim.openstreetmap.org/search";
const nwsRoot = "https://api.weather.gov";
const horizonsUrl = "https://ssd.jpl.nasa.gov/api/horizons.api";
const overpassUrl = "https://overpass-api.de/api/interpreter";
const issPositionUrl = "https://api.wheretheiss.at/v1/satellites/25544";
const horizonsBodies = new Set(["10", "199", "299", "301", "399", "499", "599", "699", "799", "899", "999"]);
const landmarkSelectors = {
  police: ['nwr["amenity"="police"]'],
  medical: ['nwr["amenity"~"hospital|clinic|doctors"]'],
  airports: ['nwr["aeroway"~"aerodrome|helipad"]'],
  bus: ['nwr["amenity"="bus_station"]', 'nwr["public_transport"="station"]["bus"="yes"]'],
  rail: ['nwr["railway"="station"]'],
  ports: ['nwr["harbour"="yes"]', 'nwr["seamark:type"="harbour"]'],
  civic: ['nwr["office"="government"]', 'nwr["amenity"~"townhall|courthouse|fire_station|post_office"]'],
};
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function fetchNwsJson(fetchImpl, url, userAgent) {
  const target = new URL(url);
  if (target.origin !== nwsRoot) throw new Error("Unexpected NWS API URL.");
  const response = await fetchImpl(target, {
    headers: { Accept: "application/geo+json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = new Error(`NWS returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function createRequestHandler({
  weatherContact = process.env.WEATHER_CONTACT,
  fetchImpl = fetch,
} = {}) {
  const geocodeCache = new Map();
  const reverseGeocodeCache = new Map();
  const weatherCache = new Map();
  const lastWeatherRequestByIp = new Map();
  const horizonsCache = new Map();
  let issCache = null;
  let issCachedAt = 0;
  const landmarkCache = new Map();
  const lastHorizonsRequestByIp = new Map();
  const lastLandmarkRequestByIp = new Map();
  let lastGeocodeAt = 0;
  return async (request, response) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }

    if (url.pathname === "/api/geocode") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      const query = url.searchParams.get("q")?.trim();
      if (!query || query.length < 2 || query.length > 200) {
        sendJson(response, 400, { error: "Search text must be between 2 and 200 characters." });
        return;
      }
      const cacheKey = query.toLocaleLowerCase();
      const cached = geocodeCache.get(cacheKey);
      if (cached) {
        sendJson(response, 200, cached);
        return;
      }
      const delay = 1000 - (Date.now() - lastGeocodeAt);
      if (delay > 0) {
        response.writeHead(429, { "Cache-Control": "no-store", "Retry-After": String(Math.ceil(delay / 1000)) });
        response.end(JSON.stringify({ error: "Please wait before searching for another place." }));
        return;
      }
      lastGeocodeAt = Date.now();
      try {
        const search = new URLSearchParams({ q: query, format: "jsonv2", limit: "1" });
        const upstream = await fetchImpl(`${nominatimUrl}?${search}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "CivicRenewalAtlas/0.1 (open-source civic mapping app)",
          },
          signal: AbortSignal.timeout(15000),
        });
        const body = await upstream.text();
        if (!upstream.ok) {
          sendJson(response, 502, { error: "OpenStreetMap place search is temporarily unavailable." });
          return;
        }
        const results = JSON.parse(body);
        if (!Array.isArray(results)) throw new Error("Place search returned an unexpected response.");
        geocodeCache.set(cacheKey, results);
        if (geocodeCache.size > 500) geocodeCache.delete(geocodeCache.keys().next().value);
        sendJson(response, 200, results);
      } catch (error) {
        console.error("OpenStreetMap place search failed", error);
        sendJson(response, 502, { error: "OpenStreetMap place search request failed." });
      }
      return;
    }

    if (url.pathname === "/api/reverse-geocode") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      const latitudeValue = url.searchParams.get("lat");
      const longitudeValue = url.searchParams.get("lon");
      const latitude = Number(latitudeValue);
      const longitude = Number(longitudeValue);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitudeValue === null ||
        longitudeValue === null ||
        latitudeValue.trim() === "" ||
        longitudeValue.trim() === "" ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        sendJson(response, 400, { error: "Provide valid latitude and longitude values." });
        return;
      }
      const lat = latitude.toFixed(3);
      const lon = longitude.toFixed(3);
      const cacheKey = `${lat},${lon}`;
      const cached = reverseGeocodeCache.get(cacheKey);
      if (cached) {
        sendJson(response, 200, cached);
        return;
      }
      const delay = 1000 - (Date.now() - lastGeocodeAt);
      if (delay > 0) {
        response.writeHead(429, { "Cache-Control": "no-store", "Retry-After": String(Math.ceil(delay / 1000)) });
        response.end(JSON.stringify({ error: "Please wait before looking up another area." }));
        return;
      }
      lastGeocodeAt = Date.now();
      try {
        const search = new URLSearchParams({
          lat,
          lon,
          format: "jsonv2",
          zoom: "10",
          addressdetails: "1",
        });
        const upstream = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${search}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "CivicRenewalAtlas/0.1 (open-source civic mapping app)",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!upstream.ok) {
          sendJson(response, 502, { error: "OpenStreetMap area lookup is temporarily unavailable." });
          return;
        }
        const result = await upstream.json();
        const address = result.address || {};
        const area = {
          city: address.city || address.town || address.village || address.municipality || address.hamlet || "",
          county: address.county || "",
          state: address.state || "",
          postcode: address.postcode || "",
        };
        area.label = [area.city, area.county, area.state].filter(Boolean).join(", ");
        reverseGeocodeCache.set(cacheKey, area);
        if (reverseGeocodeCache.size > 500) reverseGeocodeCache.delete(reverseGeocodeCache.keys().next().value);
        sendJson(response, 200, area);
      } catch (error) {
        console.error("OpenStreetMap area lookup failed", error);
        sendJson(response, 502, { error: "OpenStreetMap area lookup request failed." });
      }
      return;
    }

    if (url.pathname === "/api/horizons") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      const target = url.searchParams.get("target") || "";
      const center = url.searchParams.get("center") || "";
      const timeValue = url.searchParams.get("time") || "";
      const instant = new Date(timeValue);
      if (
        !horizonsBodies.has(target) ||
        !(center === "0" || horizonsBodies.has(center)) ||
        !timeValue ||
        Number.isNaN(instant.getTime()) ||
        instant.getUTCFullYear() < 1600 ||
        instant.getUTCFullYear() > 2500
      ) {
        sendJson(response, 400, { error: "Choose a supported Solar System body, center, and UTC time from 1600 through 2500." });
        return;
      }
      const start = new Date(Math.floor(instant.getTime() / 60_000) * 60_000);
      const cacheKey = `${target}:${center}:${start.toISOString()}`;
      const cached = horizonsCache.get(cacheKey);
      if (cached) {
        sendJson(response, 200, cached);
        return;
      }
      const clientIp = request.socket.remoteAddress || "unknown";
      const lastRequestAt = lastHorizonsRequestByIp.get(clientIp) || 0;
      if (Date.now() - lastRequestAt < 1000) {
        response.writeHead(429, { "Cache-Control": "no-store", "Retry-After": "1" });
        response.end(JSON.stringify({ error: "Please wait before requesting another JPL Horizons vector." }));
        return;
      }
      lastHorizonsRequestByIp.set(clientIp, Date.now());
      const stop = new Date(start.getTime() + 60_000);
      const horizonsQuery = new URLSearchParams({
        format: "json",
        COMMAND: `'${target}'`,
        OBJ_DATA: "NO",
        MAKE_EPHEM: "YES",
        EPHEM_TYPE: "VECTORS",
        CENTER: `'500@${center}'`,
        START_TIME: `'${start.toISOString().slice(0, 16).replace("T", " ")}'`,
        STOP_TIME: `'${stop.toISOString().slice(0, 16).replace("T", " ")}'`,
        STEP_SIZE: "'1 m'",
        REF_PLANE: "ECLIPTIC",
        OUT_UNITS: "AU-D",
        VEC_TABLE: "2",
      });
      try {
        const upstream = await fetchImpl(`${horizonsUrl}?${horizonsQuery}`, {
          headers: { Accept: "application/json", "User-Agent": "CivicRenewalAtlas/0.1 (public Solar System position tool)" },
          signal: AbortSignal.timeout(20000),
        });
        if (!upstream.ok) {
          sendJson(response, 502, { error: `JPL Horizons returned HTTP ${upstream.status}.` });
          return;
        }
        const body = await upstream.text();
        if (body.length > 1_000_000) throw new Error("JPL Horizons response exceeded the size limit.");
        const payload = JSON.parse(body);
        if (payload.error || typeof payload.result !== "string" || !payload.result.includes("$$SOE")) {
          sendJson(response, 502, { error: payload.error || "JPL Horizons did not return a vector table." });
          return;
        }
        const result = {
          target,
          center,
          time: start.toISOString(),
          retrievedAt: new Date().toISOString(),
          result: payload.result,
          source: "NASA/JPL Horizons System",
        };
        horizonsCache.set(cacheKey, result);
        if (horizonsCache.size > 200) horizonsCache.delete(horizonsCache.keys().next().value);
        sendJson(response, 200, result);
      } catch (error) {
        console.error("JPL Horizons request failed", error);
        sendJson(response, 502, { error: "JPL Horizons could not be reached or returned invalid data." });
      }
      return;
    }

    if (url.pathname === "/api/iss") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      if (issCache && Date.now() - issCachedAt < 10_000) {
        sendJson(response, 200, issCache);
        return;
      }
      try {
        const upstream = await fetchImpl(issPositionUrl, {
          headers: { Accept: "application/json", "User-Agent": "CivicRenewalAtlas/0.1 (public ISS position display)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!upstream.ok) {
          sendJson(response, 502, { error: `WhereTheISS.at returned HTTP ${upstream.status}.` });
          return;
        }
        const payload = await upstream.json();
        const { latitude, longitude, altitude, velocity, timestamp } = payload;
        if (
          payload.id !== 25544 ||
          !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          !Number.isFinite(altitude) || altitude < 100 || altitude > 1000 ||
          !Number.isFinite(velocity) || velocity <= 0 || velocity > 100_000 ||
          !Number.isSafeInteger(timestamp) || timestamp <= 0
        ) {
          sendJson(response, 502, { error: "The public ISS position feed returned invalid coordinates or telemetry." });
          return;
        }
        issCache = {
          latitude,
          longitude,
          altitude,
          velocity,
          timestamp: new Date(timestamp * 1000).toISOString(),
          retrievedAt: new Date().toISOString(),
          source: "WhereTheISS.at",
          sourceUrl: "https://wheretheiss.at/",
        };
        issCachedAt = Date.now();
        sendJson(response, 200, issCache);
      } catch (error) {
        console.error("ISS position request failed", error);
        sendJson(response, 502, { error: "The public ISS position feed could not be reached or returned invalid data." });
      }
      return;
    }

    if (url.pathname === "/api/landmarks") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      const bounds = (url.searchParams.get("bbox") || "").split(",").map(Number);
      const requestedTypes = (url.searchParams.get("types") || "").split(",").filter(Boolean);
      const types = [...new Set(requestedTypes)].filter((type) => Object.hasOwn(landmarkSelectors, type));
      const [west, south, east, north] = bounds;
      if (
        bounds.length !== 4 ||
        bounds.some((coordinate) => !Number.isFinite(coordinate)) ||
        west < -180 || east > 180 || west >= east ||
        south < -90 || north > 90 || south >= north ||
        east - west > 2 || north - south > 2 ||
        types.length === 0 || types.length !== new Set(requestedTypes).size
      ) {
        sendJson(response, 400, { error: "Choose supported landmark types and a map area no larger than 2° by 2°." });
        return;
      }
      const cacheKey = `${bounds.map((coordinate) => coordinate.toFixed(3)).join(",")}:${types.sort().join(",")}`;
      const cached = landmarkCache.get(cacheKey);
      if (cached) {
        sendJson(response, 200, cached);
        return;
      }
      const clientIp = request.socket.remoteAddress || "unknown";
      const lastRequestAt = lastLandmarkRequestByIp.get(clientIp) || 0;
      if (Date.now() - lastRequestAt < 10_000) {
        response.writeHead(429, { "Cache-Control": "no-store", "Retry-After": "10" });
        response.end(JSON.stringify({ error: "Please wait before loading landmarks again." }));
        return;
      }
      lastLandmarkRequestByIp.set(clientIp, Date.now());
      const box = `${south},${west},${north},${east}`;
      const selectors = types.flatMap((type) => landmarkSelectors[type])
        .map((selector) => `${selector}(${box});`)
        .join("");
      const query = `[out:json][timeout:18];(${selectors});out center 500;`;
      try {
        const upstream = await fetchImpl(overpassUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "CivicRenewalAtlas/0.1 (open-source civic mapping app)",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(20000),
        });
        if (!upstream.ok) {
          sendJson(response, 502, { error: `OpenStreetMap Overpass returned HTTP ${upstream.status}.` });
          return;
        }
        const payload = await upstream.json();
        if (!Array.isArray(payload.elements)) throw new Error("Overpass returned an unexpected response.");
        const features = payload.elements.flatMap((element) => {
          const longitude = Number(element.lon ?? element.center?.lon);
          const latitude = Number(element.lat ?? element.center?.lat);
          const tags = element.tags || {};
          const name = tags.name || tags.operator || tags.official_name || "";
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !name) return [];
          const category = types.find((type) => {
            const selectorsForType = landmarkSelectors[type];
            return selectorsForType.some((selector) => {
              const keys = [...selector.matchAll(/\["([^"]+)"(?:=|~)"([^"]+)"/g)];
              return keys.every(([, key, value]) => {
                const actual = tags[key] || "";
                return value.includes("|") ? value.split("|").some((option) => actual === option) : actual === value;
              });
            });
          }) || types[0];
          return [{
            id: `osm-${element.type}-${element.id}`,
            name,
            category,
            coordinates: [longitude, latitude],
            sourceUrl: `https://www.openstreetmap.org/${encodeURIComponent(element.type)}/${encodeURIComponent(element.id)}`,
          }];
        });
        const result = {
          features,
          retrievedAt: new Date().toISOString(),
          source: "OpenStreetMap contributors via Overpass API",
          attribution: "© OpenStreetMap contributors · ODbL",
          truncated: payload.elements.length >= 500,
        };
        landmarkCache.set(cacheKey, result);
        if (landmarkCache.size > 100) landmarkCache.delete(landmarkCache.keys().next().value);
        sendJson(response, 200, result);
      } catch (error) {
        console.error("OpenStreetMap landmark request failed", error);
        sendJson(response, 502, { error: "OpenStreetMap landmarks could not be loaded right now." });
      }
      return;
    }

    if (url.pathname === "/api/weather") {
      if (request.method !== "GET") {
        response.writeHead(405, { Allow: "GET" }).end();
        return;
      }
      const latitudeValue = url.searchParams.get("lat");
      const longitudeValue = url.searchParams.get("lon");
      const latitude = Number(latitudeValue);
      const longitude = Number(longitudeValue);
      const requestedLayers = (url.searchParams.get("layers") || "")
        .split(",")
        .filter(Boolean);
      const requestedStation = url.searchParams.get("station") || "";
      const allowedLayers = new Set(["current", "forecast", "alerts"]);
      const layers = [...new Set(requestedLayers)].filter((layer) => allowedLayers.has(layer));
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitudeValue === null ||
        longitudeValue === null ||
        latitudeValue.trim() === "" ||
        longitudeValue.trim() === "" ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180 ||
        layers.length === 0 ||
        layers.length !== new Set(requestedLayers).size ||
        (requestedStation && (!/^[A-Z0-9_-]{1,20}$/.test(requestedStation) || !layers.includes("current")))
      ) {
        sendJson(response, 400, { error: "Provide valid coordinates, supported weather layers, and a valid station for current observations." });
        return;
      }

      const lat = latitude.toFixed(4);
      const lon = longitude.toFixed(4);
      const cacheKey = `${lat},${lon}:${layers.sort().join(",")}:${requestedStation}`;
      const cached = weatherCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        sendJson(response, 200, cached.data);
        return;
      }
      const clientIp = request.socket.remoteAddress || "unknown";
      const lastRequestAt = lastWeatherRequestByIp.get(clientIp) || 0;
      const waitMs = 1000 - (Date.now() - lastRequestAt);
      if (waitMs > 0) {
        response.writeHead(429, {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil(waitMs / 1000)),
        });
        response.end(JSON.stringify({ error: "Please wait before requesting weather again." }));
        return;
      }
      lastWeatherRequestByIp.set(clientIp, Date.now());
      const userAgent = `CivicRenewalAtlas/0.1${weatherContact ? ` (${weatherContact})` : ""}`;
      try {
        const point = await fetchNwsJson(fetchImpl, `${nwsRoot}/points/${lat},${lon}`, userAgent);
        const properties = point.properties || {};
        const result = {
          location: { latitude: Number(lat), longitude: Number(lon) },
          retrievedAt: new Date().toISOString(),
          current: null,
          stations: [],
          forecast: null,
          alerts: null,
          errors: {},
        };

        await Promise.all(layers.map(async (layer) => {
          try {
            if (layer === "current") {
              const stationList = await fetchNwsJson(fetchImpl, properties.observationStations, userAgent);
              result.stations = (stationList.features || [])
                .slice(0, 20)
                .flatMap((feature) => {
                  const stationProperties = feature.properties || {};
                  const id = stationProperties.stationIdentifier;
                  return id ? [{
                    id,
                    name: stationProperties.name || id,
                  }] : [];
                });
              const available = new Set(result.stations.map((station) => station.id));
              const station = requestedStation || result.stations[0]?.id;
              if (!station) {
                result.errors[layer] = "No nearby observation stations are available.";
                return;
              }
              if (!available.has(station)) {
                result.errors[layer] = "That station is not available near this weather location. Choose another local station.";
                return;
              }
              const observation = await fetchNwsJson(
                fetchImpl,
                `${nwsRoot}/stations/${encodeURIComponent(station)}/observations/latest`,
                userAgent,
              );
              const observationData = observation.properties || {};
              result.current = {
                station: observationData.stationId || station,
                stationName: result.stations.find((item) => item.id === station)?.name || station,
                description: observationData.textDescription || "Conditions not reported",
                temperature: observationData.temperature || null,
                windSpeed: observationData.windSpeed || null,
                windDirection: observationData.windDirection || null,
                observedAt: observationData.timestamp || null,
              };
            } else if (layer === "forecast") {
              const forecast = await fetchNwsJson(fetchImpl, properties.forecast, userAgent);
              result.forecast = (forecast.properties?.periods || []).slice(0, 5).map((period) => ({
                name: period.name,
                temperature: period.temperature,
                temperatureUnit: period.temperatureUnit,
                shortForecast: period.shortForecast,
                windSpeed: period.windSpeed,
                windDirection: period.windDirection,
              }));
            } else if (layer === "alerts") {
              const alertsUrl = new URL(`${nwsRoot}/alerts/active`);
              alertsUrl.searchParams.set("point", `${lat},${lon}`);
              const alerts = await fetchNwsJson(fetchImpl, alertsUrl, userAgent);
              result.alerts = (alerts.features || []).map((feature) => {
                const alert = feature.properties || {};
                return {
                  id: feature.id || alert.id,
                  event: alert.event || "Weather alert",
                  headline: alert.headline || alert.description || "Read alert details at the NWS.",
                  severity: alert.severity || "Unknown",
                  expires: alert.expires || alert.ends || null,
                  url: alert["@id"] || feature.id || null,
                };
              });
            }
          } catch (error) {
            console.error(`NWS ${layer} request failed`, error);
            result.errors[layer] = error.status === 404
              ? "Weather information is not available for this location."
              : "This weather layer could not be loaded right now.";
          }
        }));
        if (!properties.forecast || !properties.observationStations) {
          for (const layer of layers) {
            if (!result[layer] && !result.errors[layer]) {
              result.errors[layer] = "NWS does not provide this information for the selected location.";
            }
          }
        }
        weatherCache.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });
        if (weatherCache.size > 500) weatherCache.delete(weatherCache.keys().next().value);
        if (lastWeatherRequestByIp.size > 1000) lastWeatherRequestByIp.clear();
        sendJson(response, 200, result);
      } catch (error) {
        console.error("NWS point lookup failed", error);
        sendJson(response, error.status === 404 ? 422 : 502, {
          error: error.status === 404
            ? "The National Weather Service does not provide data for this map location."
            : "National Weather Service data could not be loaded.",
        });
      }
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const requested = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      if (!statSync(requested).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
    } catch {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(requested)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(requested).pipe(response);
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  createServer(createRequestHandler()).listen(port, "0.0.0.0", () => {
    console.log(`Civic Renewal Atlas is running at http://localhost:${port}`);
  });
}
