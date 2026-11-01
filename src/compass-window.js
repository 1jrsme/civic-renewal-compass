import {
  SOLAR_SYSTEM_BODIES,
  bearingAndDistance,
  calculateIssSkyPosition,
  calculateSolarSystemVector,
  calculateSunMoon,
  earthCenteredEcefDifference,
  formatAngle,
  formatDistance,
  formatObservationTimes,
  formatSpatialCoordinate,
  localEastNorthUp,
  parseHorizonsVector,
} from "./compass-model.js?v=iss-sky-normalize";
import { COMMUNITY_PROGRAMS } from "./program-directory.js";
import { EPA_SOURCE, EPA_URL } from "./data.js";
import {
  DEFAULT_CELESTIAL_BEZEL,
  DEFAULT_BEZEL_DISPLAY,
  normalizeBezelDisplay,
  normalizeCelestialBezel,
  renderCelestialBezel,
  renderCelestialSkyChart,
  renderBezelOverlay,
  renderBearingArrows,
  bearingArrowColor,
} from "./bezel-model.js";
import { createIssWorldMap, updateIssWorldMap } from "./iss-map.js";
import { lookupTimeZone } from "./time-zone.js";
import { BASEMAP_DEFINITIONS } from "./basemap-definitions.js";

const byId = (id) => document.getElementById(id);
const maplibregl = window.maplibregl;
if (!maplibregl) throw new Error("The MapLibre map library did not load.");
const channel = "BroadcastChannel" in window
  ? new BroadcastChannel("civic-renewal-atlas-compass")
  : null;
const basemapDefinitions = BASEMAP_DEFINITIONS;
const mapLayerControls = {
  epa: "window-layer-epa",
  buildings: "window-layer-buildings",
  reference: "window-layer-reference",
};
const publicSources = [
  { id: "epa-records", group: "public-data", name: "EPA Envirofacts cleanup-site records", description: "Live EPA site records used by the map.", url: EPA_URL },
  { id: "epa-api", group: "public-data", name: "EPA Envirofacts API documentation", description: "EPA source documentation and API guidance.", url: EPA_SOURCE },
  { id: "va-locator", group: "public-data", name: "VA facility locator", description: "Official VA health care and service locations.", url: "https://www.va.gov/find-locations/" },
  { id: "va-api", group: "public-data", name: "VA Facilities API documentation", description: "Official API; registration or credentials may be required.", url: "https://developer.va.gov/explore/api/va-facilities" },
  { id: "gsa-property", group: "public-data", name: "GSA Real Estate Sales", description: "Browse federal surplus properties; no verified live map feed is integrated.", url: "https://realestatesales.gov/" },
  { id: "nws-api", group: "public-data", name: "National Weather Service API", description: "Official weather API documentation.", url: "https://www.weather.gov/documentation/services-web-api" },
  { id: "data-gov", group: "public-data", name: "Data.gov catalog", description: "Search federal open-data dataset descriptions.", url: "https://catalog.data.gov/" },
  { id: "fema-api", group: "public-data", name: "FEMA OpenFEMA", description: "Public disaster and recovery datasets.", url: "https://www.fema.gov/about/openfema/api" },
  { id: "census-api", group: "public-data", name: "U.S. Census data API", description: "Census data access and API documentation.", url: "https://www.census.gov/data/developers/guidance/api-user-guide.html" },
  { id: "cms-data", group: "public-data", name: "CMS Provider Data", description: "Public health-care provider datasets.", url: "https://data.cms.gov/provider-data/" },
  { id: "usgs-map", group: "public-data", name: "USGS National Map Downloader", description: "Download public geospatial data by area.", url: "https://apps.nationalmap.gov/downloader/" },
  { id: "osm-overpass", group: "public-data", name: "OpenStreetMap / Overpass", description: "Community-mapped landmarks; ODbL and shared-service limits apply.", url: "https://overpass-api.de/" },
  { id: "osm-copyright", group: "public-data", name: "OpenStreetMap data terms", description: "Attribution and Open Database License information.", url: "https://www.openstreetmap.org/copyright" },
  { id: "osm-tiles", group: "public-data", name: "OpenStreetMap street tiles", description: "Street basemap provider and tile-use policy.", url: "https://operations.osmfoundation.org/policies/tiles/" },
  { id: "esri-tiles", group: "public-data", name: "Esri World Imagery", description: "Satellite basemap provider and terms.", url: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" },
  { id: "opentopomap", group: "public-data", name: "OpenTopoMap", description: "Terrain basemap provider and attribution.", url: "https://opentopomap.org/" },
  { id: "usgs-topo", group: "public-data", name: "USGS The National Map topographic tiles", description: "Public USGS topographic basemap tiles.", url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer" },
  { id: "nasa-gibs", group: "public-data", name: "NASA GIBS Blue Marble tiles", description: "Public NASA global imagery tiles with a fixed 2016 Blue Marble date.", url: "https://earthdata.nasa.gov/data/tools/gibs" },
  { id: "noaa-charts", group: "public-data", name: "NOAA nautical chart tiles", description: "Public NOAA nautical chart tiles for marine areas; chart coverage is limited to U.S. waters.", url: "https://www.charts.noaa.gov/" },
];
const programSources = Object.entries(COMMUNITY_PROGRAMS).flatMap(([group, directory]) =>
  directory.resources.map((resource, index) => ({
    id: `program-${group}-${index}`,
    group,
    name: resource.name,
    description: resource.description,
    domain: resource.domain,
    url: resource.url,
  }))
);
const sourceCatalog = [...publicSources, ...programSources];
const selectedSourceIds = new Set();
const state = {
  heading: null,
  bezel: 0,
  connected: false,
  listening: false,
  locations: [],
  mapLocationsOverlay: true,
  mapCenter: [-84.28, 30.44],
  mapZoom: 12,
  basemap: "street",
  mapFeatures: [],
  mapLayerSelection: { epa: false, buildings: false, reference: false },
  jplVector: null,
  issPosition: null,
  issError: "",
  issWorldMap: null,
  currentSky: null,
  observerTimeZone: null,
  observerTimeZoneError: "",
  observerTimeZoneKey: "",
  observerTimeZonePending: false,
  settings: {
    mode: "earth-compass",
    frame: "local-enu",
    originLocationId: "map-center",
    originBodyId: "10",
    targetBodyId: "499",
    ephemerisSource: "offline",
    angleUnit: "degrees",
    distanceUnit: "kilometers",
    spatialUnit: "au",
    bearingReference: "device",
    liveTime: true,
    selectedTime: new Date().toISOString(),
    timeStep: "day",
    targetLocationIds: [],
    bezelDisplay: normalizeBezelDisplay(DEFAULT_BEZEL_DISPLAY),
    celestialBezel: normalizeCelestialBezel(DEFAULT_CELESTIAL_BEZEL),
  },
};
let applyingRemoteMapView = false;
let miniMapReady = false;
const miniMap = new maplibregl.Map({
  container: "window-map",
  center: state.mapCenter,
  zoom: state.mapZoom,
  minZoom: 2,
  maxZoom: 17,
  style: createMiniMapStyle(),
});
miniMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
miniMap.on("load", () => {
  miniMapReady = true;
  updateMiniMapVisibility();
  renderMiniMapFeatures();
  if (state.connected) moveMiniMapToState();
  byId("window-map-status").textContent = state.connected
    ? "Map view synchronized with the civic atlas."
    : "Map preview ready · connect the main map to sync data.";
});
miniMap.on("moveend", () => {
  if (applyingRemoteMapView) {
    applyingRemoteMapView = false;
    return;
  }
  state.mapCenter = miniMap.getCenter().toArray();
  state.mapZoom = miniMap.getZoom();
  render();
  channel?.postMessage({
    type: "map-view",
    center: state.mapCenter,
    zoom: state.mapZoom,
  });
  byId("window-map-status").textContent = "Map view synchronized with the civic atlas.";
});
miniMap.on("click", "window-session-points", (event) => showMiniMapPopup(event));
miniMap.on("click", "window-data-points", (event) => showMiniMapPopup(event));
miniMap.on("mouseenter", "window-session-points", () => { miniMap.getCanvas().style.cursor = "pointer"; });
miniMap.on("mouseleave", "window-session-points", () => { miniMap.getCanvas().style.cursor = ""; });
miniMap.on("mouseenter", "window-data-points", () => { miniMap.getCanvas().style.cursor = "pointer"; });
miniMap.on("mouseleave", "window-data-points", () => { miniMap.getCanvas().style.cursor = ""; });

function createMiniMapStyle() {
  return {
    version: 8,
    sources: {
      ...Object.fromEntries(
        Object.entries(basemapDefinitions).map(([id, definition]) => [`window-basemap-${id}`, definition.source]),
      ),
      "window-session-locations": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
      "window-civic-data": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    layers: [
      ...Object.keys(basemapDefinitions).map((id) => ({
        id: `window-basemap-${id}`,
        type: "raster",
        source: `window-basemap-${id}`,
        layout: { visibility: id === state.basemap ? "visible" : "none" },
      })),
      {
        id: "window-session-points",
        type: "circle",
        source: "window-session-locations",
        paint: {
          "circle-radius": 6,
          "circle-color": "#176b53",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
      {
        id: "window-data-points",
        type: "circle",
        source: "window-civic-data",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match", ["get", "kind"],
            "epa", "#d67843",
            "va", "#4988bb",
            "buildings", "#8c6cb3",
            "#4d8c69",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
    ],
  };
}

function updateMiniMapVisibility() {
  if (!miniMapReady) return;
  for (const id of Object.keys(basemapDefinitions)) {
    miniMap.setLayoutProperty(`window-basemap-${id}`, "visibility", id === state.basemap ? "visible" : "none");
  }
  miniMap.setLayoutProperty("window-session-points", "visibility", state.mapLocationsOverlay ? "visible" : "none");
  miniMap.setLayoutProperty(
    "window-data-points",
    "visibility",
    Object.values(state.mapLayerSelection).some(Boolean) ? "visible" : "none",
  );
}

function renderMiniMapFeatures() {
  if (!miniMapReady) return;
  const locations = state.locations.filter((location) => location.visible);
  miniMap.getSource("window-session-locations").setData({
    type: "FeatureCollection",
    features: locations.map((location) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: location.coordinates },
      properties: { name: location.name, category: location.category || "Session location" },
    })),
  });
  const selectedKinds = new Set(
    Object.entries(state.mapLayerSelection).filter(([, enabled]) => enabled).map(([kind]) => kind),
  );
  const features = state.mapFeatures.filter((feature) =>
    selectedKinds.has(feature.properties?.layer || feature.properties?.kind)
  );
  miniMap.getSource("window-civic-data").setData({
    type: "FeatureCollection",
    features,
  });
  updateMiniMapVisibility();
}

function showMiniMapPopup(event) {
  const feature = event.features?.[0];
  if (!feature) return;
  const content = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = feature.properties.name || "Map point";
  content.append(title);
  if (feature.properties.detail || feature.properties.category) {
    const detail = document.createElement("p");
    detail.textContent = feature.properties.detail || feature.properties.category;
    content.append(detail);
  }
  new maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
    .setLngLat(event.lngLat)
    .setDOMContent(content)
    .addTo(miniMap);
}

function moveMiniMapToState() {
  if (!miniMapReady || !Array.isArray(state.mapCenter)) return;
  const current = miniMap.getCenter();
  if (Math.abs(current.lng - state.mapCenter[0]) < 0.00001 &&
      Math.abs(current.lat - state.mapCenter[1]) < 0.00001 &&
      Math.abs(miniMap.getZoom() - state.mapZoom) < 0.01) return;
  applyingRemoteMapView = true;
  miniMap.jumpTo({ center: state.mapCenter, zoom: state.mapZoom });
}

function setMiniBasemap(id) {
  if (!Object.prototype.hasOwnProperty.call(basemapDefinitions, id)) return;
  state.basemap = id;
  byId("window-basemap-select").value = id;
  updateMiniMapVisibility();
}

function readBezelDisplayControls(prefix) {
  const systems = ["degrees", "gradians", "radians", "mils"];
  return normalizeBezelDisplay({
    zoom: Number(byId(`${prefix}-zoom`).value) / 100,
    ...Object.fromEntries(
    ["outer", "inner"].map((ring) => [ring, {
      visible: byId(`${prefix}-${ring}-visible`).checked,
      systems: systems.filter((system) => byId(`${prefix}-${ring}-${system}`).checked),
      interval: Number(byId(`${prefix}-${ring}-interval`).value),
      color: byId(`${prefix}-${ring}-color`).value,
      rotation: Number(byId(`${prefix}-${ring}-rotation`).value),
      radius: Number(byId(`${prefix}-${ring}-radius`).value),
      labelRadius: Number(byId(`${prefix}-${ring}-label-radius`).value),
      labelSize: Number(byId(`${prefix}-${ring}-label-size`).value),
      systemSpacing: Number(byId(`${prefix}-${ring}-system-spacing`).value),
    }]),
    ),
  });
}

function updateBezelAdjustmentReadouts(prefix) {
  const zoomControl = byId(`${prefix}-zoom`);
  document.querySelector(`[data-bezel-zoom="${zoomControl.id}"]`).textContent = `${zoomControl.value}%`;
  for (const ring of ["outer", "inner"]) {
    const colorControl = byId(`${prefix}-${ring}-color`);
    const color = colorControl.value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (color) {
      const [red, green, blue] = color.slice(1).map((channel) => Number.parseInt(channel, 16));
      document.querySelector(`[data-bezel-color-value="${colorControl.id}"]`).textContent =
        `rgb(${red}, ${green}, ${blue})`;
    }
    for (const property of ["rotation", "radius", "label-radius", "label-size", "system-spacing"]) {
      const control = byId(`${prefix}-${ring}-${property}`);
      const output = document.querySelector(`[data-bezel-value="${control.id}"]`);
      const value = Number(control.value).toLocaleString(undefined, { maximumFractionDigits: 1 });
      output.textContent = property === "rotation" ? `${value}°` : value;
    }
  }
}

function applyBezelDisplayControls(prefix, value) {
  const display = normalizeBezelDisplay(value);
  byId(`${prefix}-zoom`).value = String(Math.round(display.zoom * 100));
  for (const ring of ["outer", "inner"]) {
    byId(`${prefix}-${ring}-visible`).checked = display[ring].visible;
    byId(`${prefix}-${ring}-interval`).value = String(display[ring].interval);
    byId(`${prefix}-${ring}-color`).value = display[ring].color;
    byId(`${prefix}-${ring}-rotation`).value = String(display[ring].rotation);
    byId(`${prefix}-${ring}-radius`).value = String(display[ring].radius);
    byId(`${prefix}-${ring}-label-radius`).value = String(display[ring].labelRadius);
    byId(`${prefix}-${ring}-label-size`).value = String(display[ring].labelSize);
    byId(`${prefix}-${ring}-system-spacing`).value = String(display[ring].systemSpacing);
    for (const system of ["degrees", "gradians", "radians", "mils"]) {
      byId(`${prefix}-${ring}-${system}`).checked = display[ring].systems.includes(system);
    }
  }
  updateBezelAdjustmentReadouts(prefix);
}

function readCelestialBezelControls(prefix) {
  return normalizeCelestialBezel({
    visible: byId(`${prefix}-visible`).checked,
    sun: byId(`${prefix}-sun`).checked,
    moon: byId(`${prefix}-moon`).checked,
    iss: byId(`${prefix}-iss`).checked,
    interval: Number(byId(`${prefix}-interval`).value),
    view: byId(`${prefix}-view`).value,
  });
}

function applyCelestialBezelControls(prefix, value) {
  const display = normalizeCelestialBezel(value);
  byId(`${prefix}-visible`).checked = display.visible;
  byId(`${prefix}-sun`).checked = display.sun;
  byId(`${prefix}-moon`).checked = display.moon;
  byId(`${prefix}-iss`).checked = display.iss;
  byId(`${prefix}-interval`).value = String(display.interval);
  byId(`${prefix}-view`).value = display.view;
}

function renderSourceOptions() {
  const query = byId("window-source-search").value.trim().toLocaleLowerCase();
  const group = byId("window-source-level").value;
  const container = byId("window-source-options");
  container.replaceChildren();
  const sources = sourceCatalog.filter((source) => {
    const matchesGroup = group === "all" || source.group === group;
    const matchesQuery = !query ||
      `${source.name} ${source.description} ${source.domain || ""}`.toLocaleLowerCase().includes(query);
    return matchesGroup && matchesQuery;
  });
  for (const source of sources) {
    const label = document.createElement("label");
    label.className = "window-source-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedSourceIds.has(source.id);
    checkbox.dataset.sourceId = source.id;
    const detail = document.createElement("span");
    detail.textContent = source.name;
    const domain = document.createElement("small");
    domain.textContent = `${source.domain || new URL(source.url).hostname} · ${source.description}`;
    detail.append(domain);
    label.append(checkbox, detail);
    container.append(label);
  }
  if (!sources.length) {
    const empty = document.createElement("p");
    empty.className = "compass-window-status";
    empty.textContent = "No sources match this filter.";
    container.append(empty);
  }
  renderSelectedSources();
}

function renderSelectedSources() {
  const list = byId("window-selected-sources");
  list.replaceChildren();
  const sources = sourceCatalog.filter((source) => selectedSourceIds.has(source.id));
  if (!sources.length) {
    const empty = document.createElement("li");
    empty.textContent = "Select sources above to show their links here.";
    list.append(empty);
    return;
  }
  for (const source of sources) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const url = new URL(source.url);
    if (url.protocol !== "https:") continue;
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.name} ↗`;
    item.append(link, document.createTextNode(` — ${source.description}`));
    list.append(item);
  }
}

for (const body of SOLAR_SYSTEM_BODIES) {
  byId("spatial-origin-body").add(new Option(body.name, body.id));
  byId("spatial-target-body").add(new Option(body.name, body.id));
}
byId("compass-time").value = localDateTimeValue(state.settings.selectedTime);
byId("compass-live-time").checked = true;
byId("spatial-target-body").value = state.settings.targetBodyId;
byId("spatial-origin-body").value = state.settings.originBodyId;

function localDateTimeValue(isoTime) {
  const date = new Date(isoTime);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function syncSettingsFromControls() {
  const selectedTime = new Date(byId("compass-time").value);
  if (Number.isNaN(selectedTime.getTime())) return;
  state.settings = {
    ...state.settings,
    mode: byId("compass-mode").value,
    frame: byId("spatial-frame").value,
    originLocationId: byId("compass-origin-location").value,
    originBodyId: byId("spatial-origin-body").value,
    targetBodyId: byId("spatial-target-body").value,
    ephemerisSource: byId("ephemeris-source").value,
    angleUnit: byId("angle-unit").value,
    distanceUnit: byId("distance-unit").value,
    spatialUnit: byId("spatial-unit").value,
    bearingReference: byId("bearing-reference").value,
    liveTime: byId("compass-live-time").checked,
    selectedTime: selectedTime.toISOString(),
    timeStep: byId("compass-time-step").value,
    targetLocationIds: state.locations.filter((location) => location.compassSelected).map((location) => location.id),
    bezelDisplay: readBezelDisplayControls("window-bezel"),
    celestialBezel: readCelestialBezelControls("celestial-bezel"),
  };
  applyBezelDisplayControls("window-bezel", state.settings.bezelDisplay);
  applyCelestialBezelControls("celestial-bezel", state.settings.celestialBezel);
  state.jplVector = null;
  renderModeOptions();
  render();
  channel?.postMessage({ type: "compass-settings", settings: state.settings });
}

function applySettings(settings) {
  const pairs = [
    ["mode", "compass-mode"],
    ["frame", "spatial-frame"],
    ["originBodyId", "spatial-origin-body"],
    ["targetBodyId", "spatial-target-body"],
    ["ephemerisSource", "ephemeris-source"],
    ["angleUnit", "angle-unit"],
    ["distanceUnit", "distance-unit"],
    ["spatialUnit", "spatial-unit"],
    ["bearingReference", "bearing-reference"],
    ["timeStep", "compass-time-step"],
  ];
  for (const [key, id] of pairs) {
    const select = byId(id);
    if (typeof settings[key] === "string" && [...select.options].some((option) => option.value === settings[key])) {
      select.value = settings[key];
    }
  }
  if (typeof settings.liveTime === "boolean") {
    byId("compass-live-time").checked = settings.liveTime;
  }
  if (typeof settings.selectedTime === "string" && !Number.isNaN(new Date(settings.selectedTime).getTime())) {
    byId("compass-time").value = localDateTimeValue(settings.selectedTime);
  }
  const bezelDisplay = settings.bezelDisplay
    ? normalizeBezelDisplay(settings.bezelDisplay)
    : state.settings.bezelDisplay;
  const celestialBezel = settings.celestialBezel
    ? normalizeCelestialBezel(settings.celestialBezel)
    : state.settings.celestialBezel;
  applyBezelDisplayControls("window-bezel", bezelDisplay);
  applyCelestialBezelControls("celestial-bezel", celestialBezel);
  state.settings = { ...state.settings, ...settings, bezelDisplay, celestialBezel };
  renderTargets();
  renderModeOptions();
}

function renderTargets() {
  const select = byId("compass-origin-location");
  const previous = state.settings.originLocationId;
  select.replaceChildren(new Option("Current map center", "map-center"));
  for (const location of state.locations) select.add(new Option(location.name, location.id));
  select.value = state.locations.some((location) => location.id === previous) ? previous : "map-center";
  state.settings.originLocationId = select.value;
  const list = byId("compass-target-list");
  list.replaceChildren();
  const filter = byId("compass-target-filter").value.trim().toLocaleLowerCase();
  const locations = state.locations.filter((location) =>
    !filter || `${location.name} ${location.category || ""}`.toLocaleLowerCase().includes(filter)
  );
  for (const location of locations) {
    const item = document.createElement("li");
    const controls = document.createElement("span");
    controls.className = "compass-target-controls";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(location.compassSelected);
    checkbox.dataset.targetToggle = location.id;
    const name = document.createElement("span");
    name.textContent = `${location.name} · ${location.coordinates[1].toFixed(4)}, ${location.coordinates[0].toFixed(4)}`;
    label.append(checkbox, name);
    const mapLabel = document.createElement("label");
    const mapCheckbox = document.createElement("input");
    mapCheckbox.type = "checkbox";
    mapCheckbox.checked = Boolean(location.visible);
    mapCheckbox.dataset.mapToggle = location.id;
    mapCheckbox.setAttribute("aria-label", `Show ${location.name} on map`);
    mapLabel.append(mapCheckbox, document.createTextNode("Map"));
    controls.append(label, mapLabel);
    item.append(controls);
    list.append(item);
  }
  if (locations.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = state.locations.length
      ? "No compass locations match this search."
      : "Connect to the map to add searchable public landmarks or session locations.";
    list.append(empty);
  }
  const selectedCount = state.locations.filter((location) => location.compassSelected).length;
  byId("compass-target-count").textContent = `${selectedCount} selected`;
  byId("compass-map-overlay-toggle").checked = state.mapLocationsOverlay;
}

function renderModeOptions() {
  const advanced = state.settings.mode === "3d-coordinate";
  const planetary = advanced && !["local-enu", "earth-ecef"].includes(state.settings.frame);
  byId("spatial-frame").closest("label").hidden = !advanced;
  byId("compass-coordinate-options").hidden = !planetary;
  byId("spatial-origin-body").closest("label").hidden = state.settings.frame !== "body-centered-ecliptic";
  byId("ephemeris-load").hidden = !planetary || state.settings.ephemerisSource !== "jpl";
  byId("spatial-unit").closest("label").hidden = !planetary;
}

function originPlace() {
  const location = state.locations.find((item) => item.id === state.settings.originLocationId);
  return location
    ? { coordinates: location.coordinates, altitudeMeters: location.altitudeMeters ?? null, name: location.name }
    : { coordinates: state.mapCenter, altitudeMeters: null, name: "Current map center" };
}

function addMetric(parent, label, value) {
  const item = document.createElement("p");
  const title = document.createElement("strong");
  title.textContent = `${label}: `;
  const detail = document.createElement("span");
  detail.textContent = value;
  item.append(title, detail);
  parent.append(item);
}

function updateObserverTimeZone(coordinates) {
  const [longitude, latitude] = coordinates;
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  if (state.observerTimeZoneKey === key) return;
  state.observerTimeZoneKey = key;
  state.observerTimeZone = null;
  state.observerTimeZoneError = "";
  state.observerTimeZonePending = true;
  void lookupTimeZone(coordinates).then((timeZone) => {
    if (state.observerTimeZoneKey !== key) return;
    state.observerTimeZone = timeZone;
  }).catch((error) => {
    if (state.observerTimeZoneKey !== key) return;
    state.observerTimeZoneError = error.message;
  }).finally(() => {
    if (state.observerTimeZoneKey !== key) return;
    state.observerTimeZonePending = false;
    render();
  });
}

function renderObservationTimeReadout(date, origin) {
  const times = formatObservationTimes(date, state.observerTimeZone);
  byId("celestial-local-time").textContent = times.local;
  byId("celestial-local-zone").textContent = times.localZone;
  byId("celestial-utc-time").textContent = times.utc;
  byId("celestial-observer-time").textContent = times.observerLocal ||
    (state.observerTimeZonePending
      ? "Looking up time zone…"
      : state.observerTimeZoneError
        ? "Unavailable · online lookup failed"
        : "Not available");
  byId("celestial-observer-zone").textContent = times.observerTimeZone
    ? `${origin.name} · ${times.observerTimeZone}`
    : state.observerTimeZoneError || "Selected observer location";
}

function renderCelestialViews(sky) {
  const display = state.settings.celestialBezel;
  const mode = display.view;
  const mapMode = ["world-map", "perspective-map", "globe-map"].includes(mode);
  const figure = byId("celestial-bezel-figure");
  const worldMap = byId("iss-world-map");
  state.currentSky = sky;
  figure.hidden = !display.visible || (!mapMode && !sky);
  worldMap.hidden = !display.visible || !mapMode;
  renderCelestialBezel(byId("celestial-bezel-svg"), sky, display, "sphere");
  renderCelestialSkyChart(byId("celestial-sky-chart-svg"), sky, display);
  if (mode === "sphere") {
    byId("celestial-display-caption").textContent = "3D local sky · azimuth 000° is north, 090° east · altitude 0° is the horizon. Approximate for the selected time and origin.";
  } else if (mode === "sky-chart") {
    byId("celestial-display-caption").textContent = "2D sky chart · azimuth runs left to right and altitude bottom to top. ISS position uses the live feed timestamp.";
  } else {
    byId("celestial-display-caption").textContent = mode === "globe-map"
      ? "Interactive Earth globe · blue shading marks night, amber follows twilight, and Sun/Moon markers show approximate subpoints. © OpenStreetMap contributors."
      : mode === "perspective-map"
        ? "Tilted 3D perspective · blue shading marks night, amber follows twilight, and Sun/Moon markers show approximate subpoints. © OpenStreetMap contributors."
        : "Flat 2D world map · blue shading marks night, amber follows twilight, and Sun/Moon markers show approximate subpoints. © OpenStreetMap contributors.";
    if (display.visible && !state.issWorldMap) {
      state.issWorldMap = createIssWorldMap(maplibregl, worldMap);
      state.issWorldMap.once("load", () =>
        updateIssWorldMap(state.issWorldMap, state.issPosition, state.currentSky, display, mode)
      );
    } else if (display.visible) {
      requestAnimationFrame(() => state.issWorldMap?.resize());
      updateIssWorldMap(state.issWorldMap, state.issPosition, sky, display, mode);
    }
  }
}

let issRequestPending = false;
async function refreshIssPosition() {
  if (issRequestPending) return;
  issRequestPending = true;
  try {
    const response = await fetch("/api/iss", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `ISS position request returned HTTP ${response.status}.`);
    state.issPosition = payload;
    state.issError = "";
    updateIssWorldMap(
      state.issWorldMap,
      state.issPosition,
      state.currentSky,
      state.settings.celestialBezel,
      state.settings.celestialBezel.view,
    );
  } catch (error) {
    state.issError = error.message;
    console.error("ISS position could not be refreshed", error);
  } finally {
    issRequestPending = false;
    render();
    if (state.issPosition) channel?.postMessage({ type: "iss-position", position: state.issPosition });
  }
}

function render() {
  const trueNorth = state.settings.bearingReference === "true-north";
  const heading = trueNorth ? 0 : state.heading;
  const bearing = ((heading || 0) + state.bezel) % 360;
  byId("window-heading").textContent = trueNorth
    ? "N"
    : heading === null
      ? "—"
      : formatAngle(heading, state.settings.angleUnit, true);
  byId("window-bearing").textContent = `Bearing: ${formatAngle(bearing, state.settings.angleUnit, true)}`;
  byId("window-needle").style.transform = `rotate(${bearing}deg)`;
  byId("window-bezel-value").value = formatAngle(state.bezel, state.settings.angleUnit, true);
  renderBezelOverlay(
    byId("window-bezel-overlay"),
    state.settings.bezelDisplay,
    state.bezel,
  );
  const origin = originPlace();
  const bearings = state.locations
    .filter((location) =>
      location.compassSelected && location.id !== state.settings.originLocationId
    )
    .map((location) => ({
      id: location.id,
      name: location.name,
      bearingDegrees: bearingAndDistance(origin.coordinates, location.coordinates).bearingDegrees,
    }));
  renderBearingArrows(byId("window-bearing-overlay"), bearings, state.bezel);

  const measurements = byId("compass-measurements");
  const celestial = byId("celestial-measurements");
  measurements.replaceChildren();
  celestial.replaceChildren();
  const selectedDate = new Date(state.settings.selectedTime);
  updateObserverTimeZone(origin.coordinates);
  renderObservationTimeReadout(selectedDate, origin);
  const originTitle = document.createElement("strong");
  originTitle.textContent = `Origin: ${origin.name}`;
  measurements.append(originTitle);

  if (state.settings.mode === "3d-coordinate" &&
      !["local-enu", "earth-ecef"].includes(state.settings.frame)) {
    const frame = state.settings.frame;
    const center = frame === "heliocentric-ecliptic"
      ? "10"
      : frame === "earth-centered-ecliptic"
        ? "399"
        : frame === "barycentric-icrf"
          ? "0"
          : state.settings.originBodyId;
    const target = state.settings.targetBodyId;
    const targetName = SOLAR_SYSTEM_BODIES.find((body) => body.id === target)?.name || target;
    const centerName = center === "0"
      ? "Solar System barycenter"
      : SOLAR_SYSTEM_BODIES.find((body) => body.id === center)?.name || center;
    try {
      let vector;
      if (state.settings.ephemerisSource === "jpl") {
        const minute = new Date(Math.floor(selectedDate.getTime() / 60_000) * 60_000).toISOString();
        if (state.jplVector?.target === target && state.jplVector?.center === center &&
            state.jplVector?.time === minute) {
          vector = state.jplVector.vector;
          addMetric(measurements, "Source", `NASA/JPL Horizons · retrieved ${new Date(state.jplVector.retrievedAt).toLocaleString()}`);
        } else {
          addMetric(measurements, "Source", "NASA/JPL Horizons · choose Load precise JPL vector");
        }
      } else {
        vector = calculateSolarSystemVector(target, center, selectedDate);
        addMetric(measurements, "Source", `${vector.accuracy} · approximate`);
      }
      if (vector) {
        addMetric(measurements, "Target", `${targetName} from ${centerName}`);
        addMetric(measurements, "X", formatSpatialCoordinate(vector.xAu, state.settings.spatialUnit));
        addMetric(measurements, "Y", formatSpatialCoordinate(vector.yAu, state.settings.spatialUnit));
        addMetric(measurements, "Z", formatSpatialCoordinate(vector.zAu, state.settings.spatialUnit));
        addMetric(measurements, "3D distance", formatSpatialCoordinate(vector.distanceAu, state.settings.spatialUnit));
      }
    } catch (error) {
      addMetric(measurements, "Unavailable", error.message);
    }
  } else {
    const targets = state.locations.filter((location) =>
      location.compassSelected && location.id !== state.settings.originLocationId
    );
    if (targets.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Select one or more compass locations to calculate bearings or 3D offsets.";
      measurements.append(empty);
    }
    for (const [index, target] of targets.entries()) {
      const row = document.createElement("article");
      row.className = "compass-measurement-row";
      row.style.setProperty("--bearing-color", bearingArrowColor(index));
      const name = document.createElement("strong");
      name.classList.add("compass-bearing-name");
      name.textContent = target.name;
      row.append(name);
      const bearing = bearingAndDistance(origin.coordinates, target.coordinates);
      addMetric(row, "Bearing", formatAngle(bearing.bearingDegrees, state.settings.angleUnit, true));
      if (state.settings.mode === "earth-compass") {
        addMetric(row, "Distance", formatDistance(bearing.distanceMeters, state.settings.distanceUnit));
      } else {
        const targetPlace = { coordinates: target.coordinates, altitudeMeters: target.altitudeMeters ?? null };
        const vector = state.settings.frame === "earth-ecef"
          ? earthCenteredEcefDifference(origin, targetPlace)
          : localEastNorthUp(origin, targetPlace);
        addMetric(row, state.settings.frame === "earth-ecef" ? "ECEF X" : "East X", formatDistance(vector.xMeters, state.settings.distanceUnit));
        addMetric(row, state.settings.frame === "earth-ecef" ? "ECEF Y" : "North Y", formatDistance(vector.yMeters, state.settings.distanceUnit));
        addMetric(row, state.settings.frame === "earth-ecef" ? "ECEF Z" : "Up Z", vector.zMeters === null
          ? "Unknown · altitude not supplied at both points"
          : formatDistance(vector.zMeters, state.settings.distanceUnit));
        addMetric(row, "XY plane", formatDistance(Math.hypot(vector.xMeters, vector.yMeters), state.settings.distanceUnit));
        if (vector.zMeters !== null) {
          addMetric(row, "XZ / YZ planes", `${formatDistance(Math.hypot(vector.xMeters, vector.zMeters), state.settings.distanceUnit)} / ${formatDistance(Math.hypot(vector.yMeters, vector.zMeters), state.settings.distanceUnit)}`);
        }
        if (vector.altitudeAssumed) addMetric(row, "Altitude", "Sea-level value assumed where missing");
      }
      measurements.append(row);
    }
  }

  if (!Number.isNaN(selectedDate.getTime())) {
    try {
      const sky = calculateSunMoon(selectedDate, origin.coordinates[1], origin.coordinates[0]);
      if (state.issPosition) {
        sky.iss = calculateIssSkyPosition(origin.coordinates, origin.altitudeMeters, state.issPosition);
      }
      renderCelestialViews(sky);
      const skyTitle = document.createElement("strong");
      skyTitle.textContent = `Sun, Moon & ISS · ${selectedDate.toLocaleString()}`;
      celestial.append(skyTitle);
      addMetric(celestial, "Sun", `${formatAngle(sky.sun.azimuthDegrees, state.settings.angleUnit, true)} azimuth · ${formatAngle(sky.sun.altitudeDegrees, state.settings.angleUnit)} altitude · ${sky.sun.aboveHorizon ? "above horizon" : "below horizon"}`);
      addMetric(celestial, "Moon", `${formatAngle(sky.moon.azimuthDegrees, state.settings.angleUnit, true)} azimuth · ${formatAngle(sky.moon.altitudeDegrees, state.settings.angleUnit)} altitude · ${sky.moon.phase} · ${Math.round(sky.moon.illumination * 100)}% illuminated`);
      if (state.issPosition && sky.iss) {
        addMetric(celestial, "ISS", `${formatAngle(sky.iss.azimuthDegrees, state.settings.angleUnit, true)} azimuth · ${formatAngle(sky.iss.altitudeDegrees, state.settings.angleUnit)} altitude · ${formatDistance(sky.iss.rangeMeters, "kilometers")} range · ${sky.iss.aboveHorizon ? "above horizon" : "below horizon"} · ${state.issPosition.latitude.toFixed(2)}°, ${state.issPosition.longitude.toFixed(2)}°`);
        addMetric(celestial, "ISS altitude / speed", `${state.issPosition.altitude.toFixed(1)} km · ${state.issPosition.velocity.toFixed(0)} km/h`);
        addMetric(celestial, "ISS position time", new Date(state.issPosition.timestamp).toLocaleTimeString());
        const source = document.createElement("p");
        const sourceLabel = document.createElement("strong");
        sourceLabel.textContent = "ISS source: ";
        const sourceLink = document.createElement("a");
        sourceLink.href = "https://wheretheiss.at/";
        sourceLink.target = "_blank";
        sourceLink.rel = "noreferrer";
        sourceLink.textContent = "WhereTheISS.at";
        source.append(sourceLabel, sourceLink, document.createTextNode(` · refreshed ${new Date(state.issPosition.retrievedAt).toLocaleTimeString()}`));
        celestial.append(source);
      } else {
        addMetric(celestial, "ISS", state.issError || "Loading live position…");
      }
    } catch (error) {
      renderCelestialViews(null);
      addMetric(celestial, "Sky position", error.message);
    }
  }
  const centerForTarget = state.settings.frame === "heliocentric-ecliptic"
    ? "10"
    : state.settings.frame === "earth-centered-ecliptic"
      ? "399"
      : state.settings.frame === "barycentric-icrf"
        ? "0"
        : state.settings.originBodyId;
  byId("ephemeris-load").disabled = state.settings.targetBodyId === centerForTarget;
}

function stepTime(direction) {
  const date = new Date(state.settings.selectedTime);
  const step = byId("compass-time-step").value;
  if (step === "minute") date.setMinutes(date.getMinutes() + direction);
  else if (step === "hour") date.setHours(date.getHours() + direction);
  else if (step === "day") date.setDate(date.getDate() + direction);
  else if (step === "week") date.setDate(date.getDate() + 7 * direction);
  else if (step === "month") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + direction);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  } else {
    const month = date.getMonth();
    const day = date.getDate();
    date.setDate(1);
    date.setFullYear(date.getFullYear() + direction);
    date.setMonth(month);
    date.setDate(Math.min(day, new Date(date.getFullYear(), month + 1, 0).getDate()));
  }
  state.settings.liveTime = false;
  byId("compass-live-time").checked = false;
  byId("compass-time").value = localDateTimeValue(date.toISOString());
  syncSettingsFromControls();
}

async function loadJplVector() {
  if (state.settings.liveTime) {
    byId("compass-time").value = localDateTimeValue(new Date().toISOString());
    syncSettingsFromControls();
  }
  const button = byId("ephemeris-load");
  const frame = state.settings.frame;
  const target = state.settings.targetBodyId;
  const center = frame === "heliocentric-ecliptic"
    ? "10"
    : frame === "earth-centered-ecliptic"
      ? "399"
      : frame === "barycentric-icrf"
        ? "0"
        : state.settings.originBodyId;
  const selected = new Date(state.settings.selectedTime);
  const instant = new Date(Math.floor(selected.getTime() / 60_000) * 60_000);
  if (target === center) {
    byId("ephemeris-status").textContent = "Choose a target different from the selected 3D origin.";
    return;
  }
  button.disabled = true;
  button.textContent = "Requesting JPL vector…";
  byId("ephemeris-status").textContent = "Requesting a vector from NASA/JPL Horizons…";
  try {
    const query = new URLSearchParams({ target, center, time: instant.toISOString() });
    const response = await fetch(`/api/horizons?${query}`, { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `JPL Horizons request returned HTTP ${response.status}.`);
    state.jplVector = {
      target,
      center,
      time: payload.time,
      retrievedAt: payload.retrievedAt,
      vector: parseHorizonsVector(payload.result),
    };
    byId("ephemeris-status").textContent = "JPL Horizons vector loaded. Only body IDs and selected UTC time are sent.";
    channel?.postMessage({ type: "ephemeris-result", vector: state.jplVector });
    render();
  } catch (error) {
    byId("ephemeris-status").textContent = `JPL Horizons unavailable: ${error.message}`;
    console.error("Separate-window JPL request failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Load precise JPL vector";
  }
}

function addSessionLocation(name, coordinates, source = "manual", metadata = {}) {
  const [longitude, latitude] = coordinates;
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    byId("window-location-status").textContent =
      "Coordinates are invalid. Latitude must be -90 to 90 and longitude -180 to 180.";
    return;
  }
  const cleanName = name.trim().slice(0, 100) || "Compass location";
  if (state.connected && channel) {
    channel.postMessage({
      type: "location-add",
      location: {
        name: cleanName,
        coordinates: [longitude, latitude],
        source,
        altitudeMeters: Number.isFinite(metadata.altitudeMeters) ? metadata.altitudeMeters : null,
        accuracyMeters: Number.isFinite(metadata.accuracyMeters) ? metadata.accuracyMeters : null,
      },
    });
    byId("window-location-status").textContent = `Adding ${cleanName} to the shared session locations.`;
    return;
  }
  state.locations.push({
    id: `compass-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    coordinates: [longitude, latitude],
    visible: true,
    compassSelected: true,
    source,
    altitudeMeters: Number.isFinite(metadata.altitudeMeters) ? metadata.altitudeMeters : null,
  });
  renderTargets();
  renderMiniMapFeatures();
  render();
  byId("window-location-status").textContent =
    `${cleanName} added to this compass window. Open the map page to share it between windows.`;
}

async function searchAndAddPlace(event) {
  event.preventDefault();
  const query = byId("window-place-search").value.trim();
  if (!query) {
    byId("window-location-status").textContent = "Enter a place, airport, address, or ZIP code.";
    return;
  }
  const button = byId("window-place-search-form").querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Searching…";
  byId("window-location-status").textContent = "Searching the public place index…";
  try {
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`, {
      headers: { Accept: "application/json" },
    });
    const places = await response.json();
    if (!response.ok) throw new Error(places.error || `Place search returned HTTP ${response.status}.`);
    const place = places[0];
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) {
      throw new Error("No matching place was found.");
    }
    const coordinates = [Number(place.lon), Number(place.lat)];
    addSessionLocation(place.display_name || query, coordinates, "search");
    if (!state.connected) miniMap.flyTo({ center: coordinates, zoom: Math.max(miniMap.getZoom(), 12) });
  } catch (error) {
    byId("window-location-status").textContent = error.message || "Place search is unavailable.";
    console.error("Compass-window place search failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
}

function addEnteredCoordinates(event) {
  event.preventDefault();
  const latitude = Number(byId("window-location-latitude").value);
  const longitude = Number(byId("window-location-longitude").value);
  if (!byId("window-location-latitude").value || !byId("window-location-longitude").value) {
    byId("window-location-status").textContent = "Enter both latitude and longitude.";
    return;
  }
  addSessionLocation(
    byId("window-location-name").value || "Manual location",
    [longitude, latitude],
  );
}

function addCurrentMapCenter() {
  const center = miniMap.getCenter();
  addSessionLocation(
    byId("window-location-name").value || "Map center",
    [center.lng, center.lat],
  );
}

function requestWindowGps() {
  const button = byId("window-add-gps");
  if (!navigator.geolocation) {
    byId("window-location-status").textContent = "Location is not supported by this browser.";
    return;
  }
  button.disabled = true;
  button.textContent = "Requesting location…";
  byId("window-location-status").textContent = "Waiting for your permission and a location fix…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const coordinates = [coords.longitude, coords.latitude];
      addSessionLocation("My GPS location", coordinates, "gps", {
        altitudeMeters: Number.isFinite(coords.altitude) ? coords.altitude : null,
        accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
      });
      if (!state.connected) miniMap.flyTo({ center: coordinates, zoom: Math.max(miniMap.getZoom(), 12) });
      button.disabled = false;
      button.textContent = "Add my GPS location";
    },
    (error) => {
      byId("window-location-status").textContent = error.code === 1
        ? "Location permission was not granted."
        : error.code === 3 ? "Location request timed out. Try again." : "Could not obtain your location.";
      button.disabled = false;
      button.textContent = "Add my GPS location";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}

function mapBoundsForRequest() {
  const bounds = miniMap.getBounds();
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
}

async function loadLandmarksFromCompass() {
  const types = [...document.querySelectorAll("[data-landmark-type]:checked")]
    .map((input) => input.dataset.landmarkType);
  if (!types.length) {
    byId("public-landmark-status").textContent = "Select at least one public-landmark category.";
    return;
  }
  const button = byId("load-public-landmarks");
  button.disabled = true;
  button.textContent = "Loading public data…";
  byId("public-landmark-status").textContent = "Searching the selected area through the Overpass public-data service…";
  const bounds = mapBoundsForRequest();
  const query = new URLSearchParams({
    bbox: bounds.map((value) => value.toFixed(5)).join(","),
    types: types.join(","),
  });
  try {
    const response = await fetch(`/api/landmarks?${query}`, { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Landmark search returned HTTP ${response.status}.`);
    let added = 0;
    for (const feature of payload.features || []) {
      const duplicate = state.locations.find((location) =>
        location.coordinates[0].toFixed(5) === feature.coordinates?.[0]?.toFixed?.(5) &&
        location.coordinates[1].toFixed(5) === feature.coordinates?.[1]?.toFixed?.(5)
      );
      if (duplicate) continue;
      state.locations.push({
        id: feature.id,
        name: feature.name,
        coordinates: feature.coordinates,
        visible: true,
        compassSelected: true,
        source: "osm-public",
        sourceUrl: feature.sourceUrl,
        category: feature.category,
        retrievedAt: payload.retrievedAt,
        altitudeMeters: null,
      });
      added += 1;
    }
    if (state.connected && channel) {
      channel.postMessage({
        type: "landmark-import",
        features: payload.features || [],
        retrievedAt: payload.retrievedAt,
      });
    }
    state.publicLandmarkRetrievedAt = payload.retrievedAt;
    const status = `${(payload.features || []).length} named features returned; ${added} new compass locations added.${payload.truncated ? " Results may be truncated; zoom in to narrow the area." : ""}`;
    byId("public-landmark-status").textContent = status;
    byId("public-landmark-source-updated").textContent = `Retrieved ${new Date(payload.retrievedAt).toLocaleString()}`;
    renderTargets();
    renderMiniMapFeatures();
    render();
  } catch (error) {
    byId("public-landmark-status").textContent = error.message.includes("2° by 2°")
      ? "Zoom in to a map area no larger than 2° by 2°, then try again."
      : error.message;
    console.error("Compass-window public landmark search failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Load in this map view";
  }
}

function acceptIssPosition(position) {
  if (
    !position || !Number.isFinite(position.latitude) || position.latitude < -90 || position.latitude > 90 ||
    !Number.isFinite(position.longitude) || position.longitude < -180 || position.longitude > 180 ||
    !Number.isFinite(position.altitude) || position.altitude < 100 || position.altitude > 1000 ||
    !Number.isFinite(position.velocity) || position.velocity <= 0 ||
    Number.isNaN(new Date(position.timestamp).getTime()) ||
    Number.isNaN(new Date(position.retrievedAt).getTime())
  ) return false;
  state.issPosition = position;
  state.issError = "";
  updateIssWorldMap(state.issWorldMap, state.issPosition);
  return true;
}

function applyState(data) {
  state.connected = true;
  acceptIssPosition(data.issPosition);
  if (typeof data.issError === "string") state.issError = data.issError;
  state.heading = Number.isFinite(data.heading) ? data.heading : null;
  state.bezel = Number.isFinite(data.bearing) ? data.bearing : state.bezel;
  state.mapCenter = Array.isArray(data.mapCenter) && data.mapCenter.length === 2
    ? data.mapCenter
    : state.mapCenter;
  state.mapZoom = Number.isFinite(data.mapZoom) ? data.mapZoom : state.mapZoom;
  if (typeof data.basemap === "string" && Object.prototype.hasOwnProperty.call(basemapDefinitions, data.basemap)) {
    setMiniBasemap(data.basemap);
  }
  state.mapFeatures = Array.isArray(data.mapFeatures)
    ? data.mapFeatures.filter((feature) =>
      feature?.geometry?.type === "Point" &&
      Array.isArray(feature.geometry.coordinates) &&
      feature.geometry.coordinates.length === 2 &&
      feature.geometry.coordinates.every(Number.isFinite)
    )
    : state.mapFeatures;
  if (data.mapLayerSelection && typeof data.mapLayerSelection === "object") {
    state.mapLayerSelection = {
      epa: data.mapLayerSelection.epa === true,
      buildings: data.mapLayerSelection.buildings === true,
      reference: data.mapLayerSelection.reference === true,
    };
  }
  state.locations = Array.isArray(data.locations)
    ? data.locations.filter((location) =>
      typeof location.id === "string" &&
      typeof location.name === "string" &&
      Array.isArray(location.coordinates) &&
      location.coordinates.length === 2 &&
      location.coordinates.every(Number.isFinite)
    )
    : [];
  state.jplVector = data.jplVector || state.jplVector;
  state.mapLocationsOverlay = data.mapLocationsOverlay !== false;
  byId("compass-map-overlay-toggle").checked = state.mapLocationsOverlay;
  for (const [kind, id] of Object.entries(mapLayerControls)) {
    byId(id).checked = state.mapLayerSelection[kind];
  }
  renderMiniMapFeatures();
  moveMiniMapToState();
  byId("window-map-status").textContent = "Map view, selected layers, and session locations synchronized.";
  if (data.settings) applySettings(data.settings);
  byId("window-bezel").value = String(state.bezel);
  byId("window-compass-status").textContent = data.status || "Connected to the map compass.";
  if (state.locations.length) {
    byId("public-landmark-status").textContent = "Location choices synchronized with the map window.";
  }
  if (typeof data.publicLandmarkStatus === "string") {
    byId("public-landmark-status").textContent = data.publicLandmarkStatus;
  }
  if (data.publicLandmarkRetrievedAt) {
    byId("public-landmark-source-updated").textContent =
      `Retrieved ${new Date(data.publicLandmarkRetrievedAt).toLocaleString()}`;
  }
  renderTargets();
  render();
}

byId("window-bezel").addEventListener("input", (event) => {
  state.bezel = Number(event.currentTarget.value);
  render();
  channel?.postMessage({ type: "bezel", bearing: state.bezel });
});
for (const id of [
  "compass-mode",
  "spatial-frame",
  "spatial-origin-body",
  "spatial-target-body",
  "ephemeris-source",
  "bearing-reference",
  "angle-unit",
  "distance-unit",
  "spatial-unit",
  "compass-time-step",
]) {
  byId(id).addEventListener("change", syncSettingsFromControls);
}
for (const control of document.querySelectorAll(".bezel-display-options input, .bezel-display-options select")) {
  control.addEventListener("change", syncSettingsFromControls);
}
for (const control of document.querySelectorAll(".bezel-ring-adjustments input, .bezel-zoom-control input")) {
  control.addEventListener("input", () => {
    updateBezelAdjustmentReadouts("window-bezel");
    syncSettingsFromControls();
  });
}
for (const control of document.querySelectorAll(".celestial-bezel-controls input, .celestial-bezel-controls select, .celestial-view-picker select")) {
  control.addEventListener("change", syncSettingsFromControls);
}
byId("compass-origin-location").addEventListener("change", syncSettingsFromControls);
byId("compass-target-filter").addEventListener("input", renderTargets);
byId("compass-target-list").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-target-toggle]");
  const mapCheckbox = event.target.closest("[data-map-toggle]");
  const locationId = checkbox?.dataset.targetToggle || mapCheckbox?.dataset.mapToggle;
  if (!locationId) return;
  const location = state.locations.find((item) => item.id === locationId);
  if (!location) return;
  if (checkbox) location.compassSelected = checkbox.checked;
  if (mapCheckbox) {
    location.visible = mapCheckbox.checked;
    channel?.postMessage({ type: "location-visibility", id: location.id, visible: location.visible });
  }
  renderTargets();
  syncSettingsFromControls();
});
byId("compass-map-overlay-toggle").addEventListener("change", (event) => {
  state.mapLocationsOverlay = event.currentTarget.checked;
  channel?.postMessage({ type: "location-overlay", enabled: state.mapLocationsOverlay });
  updateMiniMapVisibility();
});
byId("compass-time").addEventListener("change", () => {
  byId("compass-live-time").checked = false;
  syncSettingsFromControls();
});
byId("compass-live-time").addEventListener("change", (event) => {
  state.settings.liveTime = event.currentTarget.checked;
  if (event.currentTarget.checked) byId("compass-time").value = localDateTimeValue(new Date().toISOString());
  syncSettingsFromControls();
});
byId("compass-time-now").addEventListener("click", () => {
  byId("compass-live-time").checked = true;
  byId("compass-time").value = localDateTimeValue(new Date().toISOString());
  syncSettingsFromControls();
});
byId("compass-time-back").addEventListener("click", () => stepTime(-1));
byId("compass-time-forward").addEventListener("click", () => stepTime(1));
byId("ephemeris-load").addEventListener("click", loadJplVector);
byId("window-basemap-select").addEventListener("change", (event) => {
  const basemap = event.currentTarget.value;
  if (!Object.prototype.hasOwnProperty.call(basemapDefinitions, basemap)) return;
  setMiniBasemap(basemap);
  channel?.postMessage({ type: "basemap", id: basemap });
});
for (const [kind, id] of Object.entries(mapLayerControls)) {
  byId(id).addEventListener("change", (event) => {
    state.mapLayerSelection[kind] = event.currentTarget.checked;
    renderMiniMapFeatures();
    channel?.postMessage({
      type: "data-layer-toggle",
      kind,
      enabled: state.mapLayerSelection[kind],
    });
  });
}
byId("window-place-search-form").addEventListener("submit", searchAndAddPlace);
byId("window-coordinate-form").addEventListener("submit", addEnteredCoordinates);
byId("window-add-map-center").addEventListener("click", addCurrentMapCenter);
byId("window-add-gps").addEventListener("click", requestWindowGps);
byId("load-public-landmarks").addEventListener("click", loadLandmarksFromCompass);
byId("window-source-search").addEventListener("input", renderSourceOptions);
byId("window-source-level").addEventListener("change", renderSourceOptions);
byId("window-source-options").addEventListener("change", (event) => {
  const sourceId = event.target.dataset.sourceId;
  if (!sourceId) return;
  if (event.target.checked) selectedSourceIds.add(sourceId);
  else selectedSourceIds.delete(sourceId);
  renderSelectedSources();
});
byId("window-compass-enable").addEventListener("click", async () => {
  if (state.listening) return;
  if (!("DeviceOrientationEvent" in window)) {
    byId("window-compass-status").textContent = "This device does not provide compass heading.";
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        byId("window-compass-status").textContent = "Compass permission was not granted.";
        return;
      }
    }
    const eventName = "ondeviceorientationabsolute" in window
      ? "deviceorientationabsolute"
      : "deviceorientation";
    window.addEventListener(eventName, (event) => {
      const nextHeading = Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : Number.isFinite(event.alpha) ? (360 - event.alpha) % 360 : null;
      if (nextHeading === null) return;
      state.heading = nextHeading;
      byId("window-compass-status").textContent = "Compass is active. Metal or magnets may affect accuracy.";
      render();
      channel?.postMessage({ type: "heading", heading: nextHeading });
    });
    state.listening = true;
    byId("window-compass-enable").disabled = true;
    byId("window-compass-status").textContent = "Move the device for a heading. Metal or magnets may affect accuracy.";
  } catch (error) {
    byId("window-compass-status").textContent = "Compass permission or device orientation is unavailable.";
    console.error("Separate-window compass could not be enabled", error);
  }
});

channel?.addEventListener("message", ({ data }) => {
  if (!data || typeof data.type !== "string") return;
  if (data.type === "state") applyState(data);
  else if (data.type === "iss-position" && acceptIssPosition(data.position)) render();
  else if (data.type === "ephemeris-result" && data.vector) {
    state.jplVector = data.vector;
    byId("ephemeris-status").textContent = "JPL Horizons vector synchronized from the map window.";
    render();
  }
});

if (channel) {
  channel.postMessage({ type: "ready" });
  window.setTimeout(() => {
    if (!state.connected) {
      byId("window-compass-status").textContent = "No map window is connected. Compass settings and calculations work locally.";
    }
  }, 1400);
} else {
  byId("window-compass-status").textContent =
    "This browser does not support syncing with the map window. Compass calculations still work locally.";
}

window.setInterval(() => {
  if (!state.settings.liveTime) return;
  byId("compass-time").value = localDateTimeValue(new Date().toISOString());
  syncSettingsFromControls();
}, 60_000);
applyBezelDisplayControls("window-bezel", state.settings.bezelDisplay);
applyCelestialBezelControls("celestial-bezel", state.settings.celestialBezel);
renderTargets();
renderModeOptions();
renderSourceOptions();
render();
window.setTimeout(() => {
  if (!state.connected) void refreshIssPosition();
}, 1500);
window.setInterval(() => {
  if (!state.connected) void refreshIssPosition();
}, 15_000);
window.addEventListener("pagehide", () => channel?.close(), { once: true });
