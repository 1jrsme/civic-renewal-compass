const TIME_ZONE_ENDPOINT = "https://timeapi.io/api/timezone/coordinate";
const timeZoneCache = new Map();

export async function lookupTimeZone(coordinates, fetcher = fetch) {
  const [longitude, latitude] = coordinates || [];
  if (
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
  ) throw new RangeError("A valid observer latitude and longitude are required.");

  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  if (timeZoneCache.has(key)) return timeZoneCache.get(key);
  const query = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
  });
  const response = await fetcher(`${TIME_ZONE_ENDPOINT}?${query}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `Time-zone lookup returned HTTP ${response.status}.`);
  const timeZone = payload.timeZone || payload.timeZoneId || payload.timezone;
  if (typeof timeZone !== "string" || !timeZone) {
    throw new Error("The time-zone service returned no time-zone identifier.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new Error("The time-zone service returned an unsupported time-zone identifier.");
  }
  timeZoneCache.set(key, timeZone);
  return timeZone;
}
