const MAP_BOUNDS = [[-180, 85], [180, 85], [180, -85], [-180, -85]];
const mapModes = new WeakMap();
const sunImageKeys = new WeakMap();
const DAY_NIGHT_WIDTH = 720;
const DAY_NIGHT_HEIGHT = 360;

function dayNightImageUrl(sunSubpoint) {
  const canvas = document.createElement("canvas");
  canvas.width = DAY_NIGHT_WIDTH;
  canvas.height = DAY_NIGHT_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = context.createImageData(DAY_NIGHT_WIDTH, DAY_NIGHT_HEIGHT);
  const sunLatitude = sunSubpoint.latitude * Math.PI / 180;
  const sunLongitude = sunSubpoint.longitude * Math.PI / 180;
  const sinSunLatitude = Math.sin(sunLatitude);
  const cosSunLatitude = Math.cos(sunLatitude);

  for (let y = 0; y < DAY_NIGHT_HEIGHT; y += 1) {
    const latitude = (85 - (y + 0.5) * 170 / DAY_NIGHT_HEIGHT) * Math.PI / 180;
    const sinLatitude = Math.sin(latitude);
    const cosLatitude = Math.cos(latitude);
    for (let x = 0; x < DAY_NIGHT_WIDTH; x += 1) {
      const longitude = ((x + 0.5) * 360 / DAY_NIGHT_WIDTH - 180) * Math.PI / 180;
      const sunlight = sinLatitude * sinSunLatitude +
        cosLatitude * cosSunLatitude * Math.cos(longitude - sunLongitude);
      const offset = (y * DAY_NIGHT_WIDTH + x) * 4;
      if (sunlight < -0.08) {
        image.data[offset] = 18;
        image.data[offset + 1] = 31;
        image.data[offset + 2] = 57;
        image.data[offset + 3] = 112;
      } else if (sunlight < 0.07) {
        image.data[offset] = 194;
        image.data[offset + 1] = 117;
        image.data[offset + 2] = 47;
        image.data[offset + 3] = Math.round((0.07 - sunlight) / 0.15 * 48);
      }
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function createIssWorldMap(maplibregl, container) {
  const map = new maplibregl.Map({
    container,
    center: [0, 20],
    zoom: 0.7,
    minZoom: 0,
    maxZoom: 7,
    style: {
      version: 8,
      sources: {
        openstreetmap: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [{ id: "openstreetmap", type: "raster", source: "openstreetmap" }],
    },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.on("load", () => {
    map.addSource("day-night", {
      type: "image",
      url: dayNightImageUrl({ latitude: 0, longitude: 0 }),
      coordinates: MAP_BOUNDS,
    });
    map.addLayer({
      id: "day-night-shading",
      type: "raster",
      source: "day-night",
      paint: { "raster-fade-duration": 0 },
    });
    map.addSource("iss-position", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "iss-position-dot",
      type: "circle",
      source: "iss-position",
      paint: {
        "circle-radius": ["match", ["get", "kind"], "sun", 7, "moon", 6, 6],
        "circle-color": ["match", ["get", "kind"], "sun", "#e7a32b", "moon", "#5d8bb7", "#ce5c48"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.6,
      },
    });
    map.addLayer({
      id: "iss-position-label",
      type: "symbol",
      source: "iss-position",
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.25],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#233c35",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.4,
      },
    });
  });
  return map;
}

export function setIssWorldMapMode(map, mode) {
  if (!map || !["world-map", "perspective-map", "globe-map"].includes(mode) || mapModes.get(map) === mode) return;
  if (mode === "globe-map") {
    map.setProjection({ type: "globe" });
    map.setPitch(0);
    map.setBearing(0);
  } else {
    map.setProjection({ type: "mercator" });
    map.setPitch(mode === "perspective-map" ? 48 : 0);
    map.setBearing(mode === "perspective-map" ? -8 : 0);
  }
  mapModes.set(map, mode);
}

export function updateIssWorldMap(map, position, sky, display, mode = "world-map") {
  const source = map?.getSource("iss-position");
  if (!source) return;
  setIssWorldMapMode(map, mode);
  const features = [];
  if (display?.sun !== false && sky?.sun?.subpoint) {
    features.push({
      type: "Feature",
      properties: { kind: "sun", label: "Sun subpoint" },
      geometry: { type: "Point", coordinates: [sky.sun.subpoint.longitude, sky.sun.subpoint.latitude] },
    });
  }
  if (display?.moon !== false && sky?.moon?.subpoint) {
    features.push({
      type: "Feature",
      properties: { kind: "moon", label: "Moon subpoint" },
      geometry: { type: "Point", coordinates: [sky.moon.subpoint.longitude, sky.moon.subpoint.latitude] },
    });
  }
  if (display?.iss !== false && position) {
    features.push({
      type: "Feature",
      properties: {
        kind: "iss",
        label: "ISS",
        altitude: position.altitude,
        velocity: position.velocity,
      },
      geometry: { type: "Point", coordinates: [position.longitude, position.latitude] },
    });
  }
  source.setData({ type: "FeatureCollection", features });
  if (sky?.sun?.subpoint) {
    const imageKey = `${sky.sun.subpoint.latitude.toFixed(2)},${sky.sun.subpoint.longitude.toFixed(2)}`;
    if (sunImageKeys.get(map) === imageKey) return;
    map.getSource("day-night")?.updateImage({
      url: dayNightImageUrl(sky.sun.subpoint),
      coordinates: MAP_BOUNDS,
    });
    sunImageKeys.set(map, imageKey);
  }
}
