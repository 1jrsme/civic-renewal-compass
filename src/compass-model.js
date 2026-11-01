const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;
const AU_METERS = 149_597_870_700;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const SOLAR_SYSTEM_BODIES = [
  { id: "10", name: "Sun" },
  { id: "199", name: "Mercury" },
  { id: "299", name: "Venus" },
  { id: "399", name: "Earth" },
  { id: "301", name: "Moon" },
  { id: "499", name: "Mars" },
  { id: "599", name: "Jupiter" },
  { id: "699", name: "Saturn" },
  { id: "799", name: "Uranus" },
  { id: "899", name: "Neptune" },
  { id: "999", name: "Pluto" },
];

const PLANET_ELEMENTS = {
  "199": [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  "299": [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  "399": [0.99999642, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000026, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  "499": [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  "599": [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  "699": [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  "799": [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  "899": [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
};

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function radians(degrees) {
  return degrees * DEG_TO_RAD;
}

function degrees(radiansValue) {
  return radiansValue * RAD_TO_DEG;
}

export function bearingAndDistance(origin, target) {
  const [originLongitude, originLatitude] = origin;
  const [targetLongitude, targetLatitude] = target;
  const latitude1 = radians(originLatitude);
  const latitude2 = radians(targetLatitude);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = radians(targetLongitude - originLongitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude);
  return {
    bearingDegrees: normalizeDegrees(degrees(Math.atan2(y, x))),
    distanceMeters: EARTH_MEAN_RADIUS_METERS * angularDistance,
  };
}

export function calculateIssSkyPosition(originCoordinates, observerAltitudeMeters, issPosition) {
  const [originLongitude, originLatitude] = originCoordinates || [];
  const { latitude, longitude, altitude: altitudeKilometers } = issPosition || {};
  if (
    !Number.isFinite(originLatitude) || originLatitude < -90 || originLatitude > 90 ||
    !Number.isFinite(originLongitude) || originLongitude < -180 || originLongitude > 180 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(altitudeKilometers) || altitudeKilometers <= 0 ||
    (observerAltitudeMeters !== null && observerAltitudeMeters !== undefined &&
      (!Number.isFinite(observerAltitudeMeters) || observerAltitudeMeters < -500 || observerAltitudeMeters > 100_000))
  ) {
    throw new RangeError("ISS position or observer coordinates are invalid.");
  }
  const observerAltitude = Number.isFinite(observerAltitudeMeters) ? observerAltitudeMeters : 0;
  const originLat = radians(originLatitude);
  const originLon = radians(originLongitude);
  const issLat = radians(latitude);
  const issLon = radians(longitude);
  const earthRadius = EARTH_MEAN_RADIUS_METERS;
  const observer = [
    (earthRadius + observerAltitude) * Math.cos(originLat) * Math.cos(originLon),
    (earthRadius + observerAltitude) * Math.cos(originLat) * Math.sin(originLon),
    (earthRadius + observerAltitude) * Math.sin(originLat),
  ];
  const satelliteRadius = earthRadius + altitudeKilometers * 1000;
  const satellite = [
    satelliteRadius * Math.cos(issLat) * Math.cos(issLon),
    satelliteRadius * Math.cos(issLat) * Math.sin(issLon),
    satelliteRadius * Math.sin(issLat),
  ];
  const dx = satellite[0] - observer[0];
  const dy = satellite[1] - observer[1];
  const dz = satellite[2] - observer[2];
  const east = -Math.sin(originLon) * dx + Math.cos(originLon) * dy;
  const north = -Math.sin(originLat) * Math.cos(originLon) * dx -
    Math.sin(originLat) * Math.sin(originLon) * dy +
    Math.cos(originLat) * dz;
  const up = Math.cos(originLat) * Math.cos(originLon) * dx +
    Math.cos(originLat) * Math.sin(originLon) * dy +
    Math.sin(originLat) * dz;
  const rangeMeters = Math.hypot(east, north, up);
  const altitudeDegrees = degrees(Math.atan2(up, Math.hypot(east, north)));
  return {
    azimuthDegrees: normalizeDegrees(degrees(Math.atan2(east, north))),
    altitudeDegrees,
    rangeMeters,
    aboveHorizon: altitudeDegrees >= 0,
    accuracy: "Approximate spherical-Earth line of sight",
  };
}

export function localEastNorthUp(origin, target) {
  const [originLongitude, originLatitude] = origin.coordinates;
  const [targetLongitude, targetLatitude] = target.coordinates;
  const latitude = radians(originLatitude);
  const longitudeDelta = ((targetLongitude - originLongitude + 540) % 360 - 180) * DEG_TO_RAD;
  const altitudeAvailable =
    Number.isFinite(origin.altitudeMeters) && Number.isFinite(target.altitudeMeters);
  return {
    xMeters: EARTH_MEAN_RADIUS_METERS * Math.cos(latitude) * longitudeDelta,
    yMeters: EARTH_MEAN_RADIUS_METERS * radians(targetLatitude - originLatitude),
    zMeters: altitudeAvailable ? target.altitudeMeters - origin.altitudeMeters : null,
  };
}

export function earthCenteredEcefDifference(origin, target) {
  const semiMajorAxis = 6_378_137;
  const eccentricitySquared = 6.69437999014e-3;
  const toEcef = ({ coordinates, altitudeMeters = 0 }) => {
    const [longitude, latitude] = coordinates;
    const lat = radians(latitude);
    const lon = radians(longitude);
    const normalRadius = semiMajorAxis / Math.sqrt(1 - eccentricitySquared * Math.sin(lat) ** 2);
    return [
      (normalRadius + altitudeMeters) * Math.cos(lat) * Math.cos(lon),
      (normalRadius + altitudeMeters) * Math.cos(lat) * Math.sin(lon),
      (normalRadius * (1 - eccentricitySquared) + altitudeMeters) * Math.sin(lat),
    ];
  };
  const originVector = toEcef(origin);
  const targetVector = toEcef(target);
  return {
    xMeters: targetVector[0] - originVector[0],
    yMeters: targetVector[1] - originVector[1],
    zMeters: targetVector[2] - originVector[2],
    altitudeAssumed: !Number.isFinite(origin.altitudeMeters) || !Number.isFinite(target.altitudeMeters),
  };
}

export function formatAngle(valueDegrees, unit = "degrees", normalize = false) {
  if (!Number.isFinite(valueDegrees)) return "—";
  const value = normalize ? normalizeDegrees(valueDegrees) : valueDegrees;
  if (unit === "radians") return `${(value * DEG_TO_RAD).toFixed(3)} rad`;
  if (unit === "gradians") return `${(value * 10 / 9).toFixed(1)} gon`;
  if (unit === "mils") return `${Math.round(value * 6400 / 360)} mil`;
  return `${value.toFixed(1)}°`;
}

export function formatDistance(distanceMeters, unit = "meters") {
  if (!Number.isFinite(distanceMeters)) return "—";
  const conversions = {
    meters: [1, "m"],
    kilometers: [0.001, "km"],
    feet: [3.280839895, "ft"],
    miles: [0.000621371192, "mi"],
    nautical: [0.000539956803, "nmi"],
  };
  const [scale, label] = conversions[unit] || conversions.meters;
  const value = distanceMeters * scale;
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${label}`;
}

function validEphemerisDate(date) {
  const instant = date instanceof Date ? date : new Date(date);
  if (
    Number.isNaN(instant.getTime()) ||
    instant.getUTCFullYear() < 1800 ||
    instant.getUTCFullYear() > 2200
  ) {
    throw new RangeError("Choose a valid date from 1800 through 2200 for offline orbital estimates.");
  }
  return instant;
}

function orbitalPosition(a, eccentricity, inclination, meanLongitude, longitudePeriapsis, longitudeAscendingNode) {
  const meanAnomaly = radians(normalizeDegrees(meanLongitude - longitudePeriapsis));
  let eccentricAnomaly = meanAnomaly;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }
  const orbitalX = a * (Math.cos(eccentricAnomaly) - eccentricity);
  const orbitalY = a * Math.sqrt(1 - eccentricity ** 2) * Math.sin(eccentricAnomaly);
  const argumentPeriapsis = radians(longitudePeriapsis - longitudeAscendingNode);
  const ascendingNode = radians(longitudeAscendingNode);
  const orbitalInclination = radians(inclination);
  const cosNode = Math.cos(ascendingNode);
  const sinNode = Math.sin(ascendingNode);
  const cosPeriapsis = Math.cos(argumentPeriapsis);
  const sinPeriapsis = Math.sin(argumentPeriapsis);
  const cosInclination = Math.cos(orbitalInclination);
  const sinInclination = Math.sin(orbitalInclination);
  return [
    (cosNode * cosPeriapsis - sinNode * sinPeriapsis * cosInclination) * orbitalX +
      (-cosNode * sinPeriapsis - sinNode * cosPeriapsis * cosInclination) * orbitalY,
    (sinNode * cosPeriapsis + cosNode * sinPeriapsis * cosInclination) * orbitalX +
      (-sinNode * sinPeriapsis + cosNode * cosPeriapsis * cosInclination) * orbitalY,
    (sinPeriapsis * sinInclination) * orbitalX +
      (cosPeriapsis * sinInclination) * orbitalY,
  ];
}

function heliocentricPosition(bodyId, daysSinceJ2000) {
  if (bodyId === "10") return [0, 0, 0];
  if (bodyId === "301") {
    const earth = heliocentricPosition("399", daysSinceJ2000);
    const meanAnomaly = 115.3654 + 13.06499295 * daysSinceJ2000;
    const longitudePeriapsis = 318.0634 + 0.1643573 * daysSinceJ2000;
    const moon = orbitalPosition(
      384_400_000 / AU_METERS,
      0.0549,
      5.1454,
      meanAnomaly + longitudePeriapsis,
      longitudePeriapsis,
      125.1228 - 0.0529538 * daysSinceJ2000,
    );
    return earth.map((coordinate, index) => coordinate + moon[index]);
  }
  const elements = PLANET_ELEMENTS[bodyId];
  if (!elements) {
    if (bodyId === "999") throw new RangeError("Offline estimates do not include Pluto; use JPL Horizons.");
    throw new RangeError("Choose a supported Solar System body.");
  }
  const centuries = daysSinceJ2000 / 36_525;
  const [a0, e0, i0, longitude0, periapsis0, node0, da, de, di, dLongitude, dPeriapsis, dNode] = elements;
  return orbitalPosition(
    a0 + da * centuries,
    e0 + de * centuries,
    i0 + di * centuries,
    longitude0 + dLongitude * centuries,
    periapsis0 + dPeriapsis * centuries,
    node0 + dNode * centuries,
  );
}

export function calculateSolarSystemVector(targetBodyId, centerBodyId, date) {
  const instant = validEphemerisDate(date);
  const daysSinceJ2000 = (instant.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const target = heliocentricPosition(String(targetBodyId), daysSinceJ2000);
  const center = heliocentricPosition(String(centerBodyId), daysSinceJ2000);
  const vectorAU = target.map((coordinate, index) => coordinate - center[index]);
  return {
    xAu: vectorAU[0],
    yAu: vectorAU[1],
    zAu: vectorAU[2],
    distanceAu: Math.hypot(...vectorAU),
    accuracy: "Offline Keplerian estimate",
  };
}

export function formatSpatialCoordinate(valueAu, unit = "au") {
  if (!Number.isFinite(valueAu)) return "—";
  if (unit === "kilometers") return `${(valueAu * AU_METERS / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
  if (unit === "million-kilometers") return `${(valueAu * AU_METERS / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} million km`;
  return `${valueAu.toFixed(6)} AU`;
}

export function parseHorizonsVector(resultText) {
  const table = resultText.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
  if (!table) throw new Error("JPL Horizons did not return a vector table.");
  const readAxis = (axis) => {
    const match = table[1].match(new RegExp(`\\b${axis}\\s*=\\s*([+-]?\\d+(?:\\.\\d*)?(?:[Ee][+-]?\\d+)?)`));
    const value = Number(match?.[1]);
    if (!Number.isFinite(value)) throw new Error(`JPL Horizons returned no valid ${axis} coordinate.`);
    return value;
  };
  const xAu = readAxis("X");
  const yAu = readAxis("Y");
  const zAu = readAxis("Z");
  return { xAu, yAu, zAu, distanceAu: Math.hypot(xAu, yAu, zAu) };
}

function equatorialToHorizon(rightAscension, declination, date, latitude, longitude) {
  const daysSinceJ2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const siderealDegrees = normalizeDegrees(
    280.46061837 + 360.98564736629 * daysSinceJ2000 + longitude,
  );
  const hourAngle = radians(((siderealDegrees - degrees(rightAscension) + 540) % 360) - 180);
  const observerLatitude = radians(latitude);
  const altitude = Math.asin(
    Math.sin(observerLatitude) * Math.sin(declination) +
    Math.cos(observerLatitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(observerLatitude) -
      Math.tan(declination) * Math.cos(observerLatitude),
  );
  return {
    azimuthDegrees: normalizeDegrees(degrees(azimuth) + 180),
    altitudeDegrees: degrees(altitude),
  };
}

function sunEquatorialPosition(days) {
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * days);
  const meanAnomaly = radians(normalizeDegrees(357.528 + 0.9856003 * days));
  const eclipticLongitude = radians(
    meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly),
  );
  const obliquity = radians(23.439 - 0.0000004 * days);
  return {
    rightAscension: Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude)),
    declination: Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)),
    eclipticLongitude: normalizeDegrees(degrees(eclipticLongitude)),
  };
}

function moonEquatorialPosition(days) {
  const meanLongitude = normalizeDegrees(218.316 + 13.176396 * days);
  const meanAnomaly = radians(normalizeDegrees(134.963 + 13.064993 * days));
  const argumentLatitude = radians(normalizeDegrees(93.272 + 13.22935 * days));
  const elongation = radians(normalizeDegrees(297.85 + 12.190749 * days));
  const solarMeanAnomaly = radians(normalizeDegrees(357.529 + 0.98560028 * days));
  const longitude = radians(normalizeDegrees(
    meanLongitude +
    6.289 * Math.sin(meanAnomaly) +
    1.274 * Math.sin(2 * elongation - meanAnomaly) +
    0.658 * Math.sin(2 * elongation) +
    0.214 * Math.sin(2 * meanAnomaly) -
    0.186 * Math.sin(solarMeanAnomaly) -
    0.059 * Math.sin(2 * elongation - 2 * meanAnomaly) -
    0.057 * Math.sin(2 * elongation - meanAnomaly - solarMeanAnomaly) +
    0.053 * Math.sin(2 * elongation + meanAnomaly) +
    0.046 * Math.sin(2 * elongation - solarMeanAnomaly) +
    0.041 * Math.sin(meanAnomaly - solarMeanAnomaly) -
    0.035 * Math.sin(elongation) -
    0.031 * Math.sin(meanAnomaly + solarMeanAnomaly) -
    0.015 * Math.sin(2 * argumentLatitude - 2 * elongation) +
    0.011 * Math.sin(2 * elongation - 4 * meanAnomaly),
  ));
  const latitude = radians(
    5.128 * Math.sin(argumentLatitude) +
    0.28 * Math.sin(meanAnomaly + argumentLatitude) +
    0.277 * Math.sin(meanAnomaly - argumentLatitude) +
    0.173 * Math.sin(2 * elongation - argumentLatitude) +
    0.055 * Math.sin(2 * elongation + argumentLatitude - meanAnomaly) +
    0.046 * Math.sin(2 * elongation - argumentLatitude - meanAnomaly) +
    0.033 * Math.sin(2 * elongation + argumentLatitude) +
    0.017 * Math.sin(2 * meanAnomaly + argumentLatitude),
  );
  const obliquity = radians(23.439 - 0.0000004 * days);
  return {
    rightAscension: Math.atan2(
      Math.sin(longitude) * Math.cos(obliquity) - Math.tan(latitude) * Math.sin(obliquity),
      Math.cos(longitude),
    ),
    declination: Math.asin(
      Math.sin(latitude) * Math.cos(obliquity) +
        Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude),
    ),
    eclipticLongitude: degrees(longitude),
  };
}

function moonPhaseName(angle) {
  const phases = [
    "New Moon",
    "Waxing Crescent",
    "First Quarter",
    "Waxing Gibbous",
    "Full Moon",
    "Waning Gibbous",
    "Last Quarter",
    "Waning Crescent",
  ];
  return phases[Math.round(normalizeDegrees(angle) / 45) % phases.length];
}

function subpoint(rightAscension, declination, date) {
  const daysSinceJ2000 = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const siderealDegrees = normalizeDegrees(280.46061837 + 360.98564736629 * daysSinceJ2000);
  const longitudeDegrees = normalizeDegrees(degrees(rightAscension) - siderealDegrees);
  return {
    latitude: degrees(declination),
    longitude: longitudeDegrees > 180 ? longitudeDegrees - 360 : longitudeDegrees,
  };
}

export function formatObservationTimes(value, observerTimeZone = null) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new RangeError("A valid observation time is required.");
  return {
    local: instant.toLocaleString(),
    localZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "device time",
    observerLocal: observerTimeZone
      ? instant.toLocaleString(undefined, { timeZone: observerTimeZone })
      : null,
    observerTimeZone,
    utc: `${instant.toISOString().slice(0, 19).replace("T", " ")} UTC`,
  };
}

export function calculateSunMoon(date, latitude, longitude) {
  const instant = date instanceof Date ? date : new Date(date);
  if (
    Number.isNaN(instant.getTime()) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    throw new RangeError("A valid time and latitude/longitude are required.");
  }
  const days = (instant.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const sun = sunEquatorialPosition(days);
  const moon = moonEquatorialPosition(days);
  const moonSunAngle = normalizeDegrees(moon.eclipticLongitude - sun.eclipticLongitude);
  const sunHorizon = equatorialToHorizon(sun.rightAscension, sun.declination, instant, latitude, longitude);
  const moonHorizon = equatorialToHorizon(moon.rightAscension, moon.declination, instant, latitude, longitude);
  return {
    sun: {
      ...sunHorizon,
      aboveHorizon: sunHorizon.altitudeDegrees >= 0,
      subpoint: subpoint(sun.rightAscension, sun.declination, instant),
    },
    moon: {
      ...moonHorizon,
      aboveHorizon: moonHorizon.altitudeDegrees >= 0,
      phase: moonPhaseName(moonSunAngle),
      illumination: (1 - Math.cos(radians(moonSunAngle))) / 2,
      subpoint: subpoint(moon.rightAscension, moon.declination, instant),
    },
  };
}
