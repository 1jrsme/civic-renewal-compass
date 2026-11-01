import {
  EPA_URL,
  normalizeEpaRecords,
  safeHttpUrl,
  retrievedLabel,
} from "./data.js";
import {
  REFERENCE_LOCATIONS,
  STARTING_LOCATIONS,
  getStartingLocation,
} from "./reference-locations.js?v=starting-locations";
import { createMapCsv } from "./downloads.js";
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

const maplibregl = window.maplibregl;
if (!maplibregl) throw new Error("The MapLibre map library did not load.");
const initialLocation = getStartingLocation(loadDefaultLocationId());
const baseMapPreference = loadBaseMapPreference();
const baseMapDefinitions = {
  street: {
    label: "Street map · © OpenStreetMap contributors",
    source: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  satellite: {
    label: "Satellite imagery · Tiles © Esri and imagery contributors",
    source: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  terrain: {
    label: "Terrain map · © OpenTopoMap, © OpenStreetMap contributors, SRTM",
    source: {
      type: "raster",
      tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "Map style: © OpenTopoMap (CC-BY-SA) · Map data: © OpenStreetMap contributors, SRTM",
    },
  },
};

const map = new maplibregl.Map({
  container: "map",
  center: initialLocation.coordinates,
  zoom: initialLocation.zoom,
  minZoom: 2,
  maxZoom: 17,
  style: createBaseMapStyle(baseMapPreference),
  preserveDrawingBuffer: true,
});

const state = {
  epa: [],
  epaLoading: false,
  epaLoaded: false,
  buildings: loadReports(),
  mapLocations: [],
  mapLocationsOverlay: true,
  userLocation: null,
  gpsAccuracy: null,
  gpsTimestamp: null,
  deviceHeading: null,
  headingListening: false,
  bezelBearing: 0,
  weatherLocation: null,
  weatherStation: "",
  providerMode: loadProviderMode(),
  localAgencyArea: null,
  defaultLocation: initialLocation,
  compassSettings: {
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
    bezelDisplay: normalizeBezelDisplay(DEFAULT_BEZEL_DISPLAY),
    celestialBezel: normalizeCelestialBezel(DEFAULT_CELESTIAL_BEZEL),
  },
  jplVector: null,
  publicLandmarkRetrievedAt: null,
  publicLandmarkStatus: "No public landmark query has been made.",
  issPosition: null,
  issError: "",
  issWorldMap: null,
  currentSky: null,
  observerTimeZone: null,
  observerTimeZoneError: "",
  observerTimeZoneKey: "",
  observerTimeZonePending: false,
};
const byId = (id) => document.getElementById(id);
const compassNeedle = byId("compass-needle");
const compassChannel = "BroadcastChannel" in window
  ? new BroadcastChannel("civic-renewal-atlas-compass")
  : null;
byId("provider-mode").value = state.providerMode;
byId("basemap-select").value = baseMapPreference;
byId("basemap-attribution-note").textContent = baseMapDefinitions[baseMapPreference].label;
initializeCompassTools();
populateDefaultLocationOptions();
renderPublicDataLinks();
const toggleConfigs = [
  ["toggle-epa", "epa"],
  ["toggle-buildings", "buildings"],
  ["toggle-reference", "reference"],
];
for (const [id] of toggleConfigs) byId(id).checked = false;
for (const input of document.querySelectorAll("[data-weather-layer]")) input.checked = false;
updateSelectedLayerCount();
for (const input of document.querySelectorAll(".layer-toggle input[type=checkbox]")) {
  updateLayerOptions(input);
}
for (const control of document.querySelectorAll(".celestial-bezel-controls input, .celestial-bezel-controls select, .celestial-view-picker select")) {
  control.addEventListener("change", () => {
    syncCompassSettingsFromControls();
    renderCompassMeasurements();
    publishCompassState();
  });
}

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.on("load", () => {
  map.addSource("atlas-points", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 48,
  });
  map.addLayer({
    id: "atlas-clusters",
    type: "circle",
    source: "atlas-points",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#4d8c69", 25, "#36785a", 100, "#245e49"],
      "circle-radius": ["step", ["get", "point_count"], 16, 25, 20, 100, 25],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "atlas-cluster-count",
    type: "symbol",
    source: "atlas-points",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 11,
    },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "atlas-unclustered",
    type: "circle",
    source: "atlas-points",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "kind"],
        "epa", "#d67843",
        "va", "#4988bb",
        "airport", "#2676a8",
        "bus", "#439b8d",
        "train", "#7564a7",
        "port", "#277b77",
        "public-works", "#bd813a",
        "user-location", "#176b53",
        "#8c6cb3",
      ],
      "circle-radius": 6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
  map.on("click", "atlas-clusters", (event) => {
    const [feature] = map.queryRenderedFeatures(event.point, { layers: ["atlas-clusters"] });
    if (!feature) return;
    map.getSource("atlas-points").getClusterExpansionZoom(feature.properties.cluster_id, (error, zoom) => {
      if (!error) map.easeTo({ center: feature.geometry.coordinates, zoom });
    });
  });
  map.on("click", "atlas-unclustered", (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const properties = feature.properties;
    const coordinates = feature.geometry.coordinates;
    new maplibregl.Popup({ offset: 12 })
      .setLngLat(coordinates)
      .setDOMContent(createPopupContent(properties, coordinates))
      .addTo(map);
  });
  for (const layer of ["atlas-clusters", "atlas-unclustered"]) {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  }
  renderMarkers();
});

document.addEventListener("atlas:show-reference-location", (event) => {
  const location = event.detail;
  if (!location || !Array.isArray(location.coordinates)) return;
  byId("toggle-reference").checked = true;
  updateLayerOptions(byId("toggle-reference"));
  renderMarkers();
  map.flyTo({ center: location.coordinates, zoom: 14 });
});

function loadDefaultLocationId() {
  try {
    return localStorage.getItem("civic-atlas-default-location") || "tallahassee-city";
  } catch (error) {
    console.error("Saved default location could not be read", error);
    return "tallahassee-city";
  }
}

function loadBaseMapPreference() {
  try {
    const saved = localStorage.getItem("civic-atlas-basemap");
    return saved && Object.prototype.hasOwnProperty.call(baseMapDefinitions, saved)
      ? saved
      : "street";
  } catch (error) {
    console.error("Saved base map preference could not be read", error);
    return "street";
  }
}

function createBaseMapStyle(selectedBaseMap) {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: Object.fromEntries(
      Object.entries(baseMapDefinitions).map(([id, definition]) => [`basemap-${id}`, definition.source]),
    ),
    layers: Object.keys(baseMapDefinitions).map((id) => ({
      id: `basemap-${id}`,
      type: "raster",
      source: `basemap-${id}`,
      layout: { visibility: id === selectedBaseMap ? "visible" : "none" },
    })),
  };
}

function updateSelectedLayerCount() {
  const inputs = [
    ...toggleConfigs.map(([id]) => byId(id)),
    ...document.querySelectorAll("[data-weather-layer]"),
  ];
  const selected = inputs.filter((input) => input.checked).length;
  byId("selected-layer-count").textContent = `${selected} data ${selected === 1 ? "layer" : "layers"} selected`;
  byId("clear-all-layers").disabled = selected === 0;
}

function populateDefaultLocationOptions() {
  const select = byId("default-location-select");
  const groups = [
    { label: "Tallahassee area", locations: STARTING_LOCATIONS.filter((item) => item.group === "local") },
    { label: "Major airports", locations: STARTING_LOCATIONS.filter((item) => item.group === "airport") },
  ];
  select.replaceChildren();
  for (const group of groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    for (const location of group.locations) {
      const option = document.createElement("option");
      option.value = location.id;
      option.textContent = location.name;
      optgroup.append(option);
    }
    select.append(optgroup);
  }
  select.value = state.defaultLocation.id;
  byId("place-search").value = state.defaultLocation.search;
  byId("program-area").value = state.defaultLocation.search;
  byId("search-status").textContent =
    `Starting map area: ${state.defaultLocation.name}. Select layers to load data.`;
  select.addEventListener("change", () => {
    const location = getStartingLocation(select.value);
    state.defaultLocation = location;
    state.weatherLocation = null;
    byId("place-search").value = location.search;
    byId("search-status").textContent = `Default map location: ${location.name}. Select layers to load data.`;
    byId("program-area").value = location.search;
    try {
      localStorage.setItem("civic-atlas-default-location", location.id);
    } catch (error) {
      console.error("Default map location could not be saved", error);
      showToast("Location changed, but the default could not be saved on this device.");
    }
    map.flyTo({ center: location.coordinates, zoom: location.zoom });
    if ([...document.querySelectorAll("[data-weather-layer]:checked")].length) refreshWeather();
  });
}

byId("compass-toggle").addEventListener("click", (event) => {
  const panel = byId("compass-panel");
  panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  if (!panel.hidden) {
    updateCompassDisplay();
    if (state.deviceHeading === null) {
      byId("compass-status").textContent = "Tap Enable compass to request device heading.";
      publishCompassState();
    }
  }
});

byId("compass-window-open").addEventListener("click", () => {
  const compassWindow = window.open(
    new URL("./compass.html", window.location.href).href,
    "civic-renewal-atlas-compass",
    "popup,width=470,height=900,resizable=yes",
  );
  byId("compass-window-status").textContent = compassWindow
    ? "Compass window opened. Heading and bezel stay in sync."
    : "The browser blocked the new window. Allow pop-ups for this site and try again.";
});

compassChannel?.addEventListener("message", ({ data }) => {
  if (!data || typeof data.type !== "string") return;
  if (data.type === "ready") {
    publishCompassState();
  } else if (data.type === "heading" && Number.isFinite(data.heading)) {
    state.deviceHeading = ((data.heading % 360) + 360) % 360;
    byId("compass-status").textContent = "Device heading shared from the separate compass window.";
    updateCompassDisplay();
  } else if (data.type === "bezel" && Number.isFinite(data.bearing)) {
    state.bezelBearing = Math.max(0, Math.min(359, Math.round(data.bearing)));
    byId("bezel-control").value = String(state.bezelBearing);
    byId("bezel-value").value = `${state.bezelBearing}°`;
    updateCompassDisplay();
  } else if (data.type === "compass-settings" && data.settings) {
    applyCompassSettings(data.settings, false);
  } else if (data.type === "landmark-request") {
    loadPublicLandmarks(data.types, data.bounds);
  } else if (data.type === "basemap" && typeof data.id === "string" &&
      Object.prototype.hasOwnProperty.call(baseMapDefinitions, data.id)) {
    byId("basemap-select").value = data.id;
    byId("basemap-select").dispatchEvent(new Event("change", { bubbles: true }));
  } else if (data.type === "data-layer-toggle" &&
      ["epa", "buildings", "reference"].includes(data.kind) &&
      typeof data.enabled === "boolean") {
    const layerIds = { epa: "toggle-epa", buildings: "toggle-buildings", reference: "toggle-reference" };
    const input = byId(layerIds[data.kind]);
    input.checked = data.enabled;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (data.type === "map-view" && Array.isArray(data.center) &&
      data.center.length === 2 && data.center.every(Number.isFinite) &&
      Math.abs(data.center[0]) <= 180 && Math.abs(data.center[1]) <= 90 &&
      Number.isFinite(data.zoom)) {
    map.jumpTo({
      center: data.center,
      zoom: Math.max(2, Math.min(17, data.zoom)),
    });
  } else if (data.type === "location-add" && data.location &&
      typeof data.location.name === "string" &&
      Array.isArray(data.location.coordinates) &&
      data.location.coordinates.length === 2 &&
      data.location.coordinates.every(Number.isFinite)) {
    const [longitude, latitude] = data.location.coordinates;
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      const source = ["gps", "search", "manual"].includes(data.location.source)
        ? data.location.source
        : "manual";
      addMapLocation(data.location.name.slice(0, 100), [longitude, latitude], source, {
        altitudeMeters: Number.isFinite(data.location.altitudeMeters) ? data.location.altitudeMeters : null,
        accuracyMeters: Number.isFinite(data.location.accuracyMeters) ? data.location.accuracyMeters : null,
      });
      if (source === "gps") {
        state.userLocation = [longitude, latitude];
        state.gpsAccuracy = Number.isFinite(data.location.accuracyMeters) ? data.location.accuracyMeters : null;
        state.gpsTimestamp = Date.now();
        byId("gps-position").textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        byId("gps-accuracy").textContent = state.gpsAccuracy === null
          ? "GPS location added to this session. Not saved."
          : `Accuracy ±${Math.round(state.gpsAccuracy)} m · Not saved.`;
        updateCompassDisplay();
      }
    }
  } else if (data.type === "landmark-import" && Array.isArray(data.features)) {
    let added = 0;
    for (const feature of data.features) {
      if (!feature || typeof feature.name !== "string" ||
          !Array.isArray(feature.coordinates) || feature.coordinates.length !== 2 ||
          !feature.coordinates.every(Number.isFinite)) continue;
      const [longitude, latitude] = feature.coordinates;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
      const duplicate = state.mapLocations.find((location) =>
        location.coordinates[0].toFixed(5) === longitude.toFixed(5) &&
        location.coordinates[1].toFixed(5) === latitude.toFixed(5)
      );
      if (duplicate) {
        duplicate.visible = true;
        duplicate.compassSelected = true;
        continue;
      }
      state.mapLocations.push({
        id: typeof feature.id === "string" ? feature.id : `osm-public-${Date.now()}-${added}`,
        name: feature.name.slice(0, 120),
        coordinates: [longitude, latitude],
        visible: true,
        compassSelected: true,
        source: "osm-public",
        sourceUrl: safeHttpUrl(feature.sourceUrl),
        category: typeof feature.category === "string" ? feature.category : "Public landmark",
        retrievedAt: data.retrievedAt,
        altitudeMeters: null,
      });
      added += 1;
    }
    state.publicLandmarkRetrievedAt = data.retrievedAt || new Date().toISOString();
    state.publicLandmarkStatus = `${data.features.length} landmark features returned; ${added} new locations added from the compass map.`;
    byId("public-landmark-status").textContent = state.publicLandmarkStatus;
    byId("public-landmark-source-updated").textContent =
      `Retrieved ${new Date(state.publicLandmarkRetrievedAt).toLocaleString()}`;
    renderMapLocationList();
    renderMarkers();
    renderCompassMeasurements();
    publishCompassState();
  } else if (data.type === "location-overlay" && typeof data.enabled === "boolean") {
    state.mapLocationsOverlay = data.enabled;
    byId("map-locations-overlay").checked = data.enabled;
    byId("compass-map-overlay-toggle").checked = data.enabled;
    renderMarkers();
    publishCompassState();
  } else if (data.type === "location-visibility" && typeof data.id === "string" && typeof data.visible === "boolean") {
    const location = state.mapLocations.find((item) => item.id === data.id);
    if (location) {
      location.visible = data.visible;
      renderMapLocationList();
      renderMarkers();
      publishCompassState();
    }
  } else if (data.type === "ephemeris-result" && data.vector) {
    state.jplVector = data.vector;
    byId("ephemeris-status").textContent = "JPL Horizons vector synchronized from the separate compass window.";
    renderCompassMeasurements();
    publishCompassState();
  }
});

byId("bezel-control").addEventListener("input", (event) => {
  state.bezelBearing = Number(event.currentTarget.value);
  byId("bezel-value").value = `${state.bezelBearing}°`;
  updateCompassDisplay();
});

byId("gps-refresh").addEventListener("click", requestGpsPosition);
byId("map-location-gps").addEventListener("click", addGpsMapLocation);
byId("map-locations-clear").addEventListener("click", clearMapLocations);
byId("map-location-search-form").addEventListener("submit", searchAndAddMapLocation);
byId("map-coordinate-form").addEventListener("submit", addCoordinateLocation);
byId("map-location-list").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-location-toggle]");
  const compassCheckbox = event.target.closest("[data-compass-toggle]");
  const locationId = checkbox?.dataset.locationToggle || compassCheckbox?.dataset.compassToggle;
  if (!locationId) return;
  const location = state.mapLocations.find((item) => item.id === locationId);
  if (!location) return;
  if (checkbox) location.visible = checkbox.checked;
  if (compassCheckbox) location.compassSelected = compassCheckbox.checked;
  renderMapLocationList();
  renderMarkers();
  renderCompassMeasurements();
  publishCompassState();
});
byId("map-location-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-location-action]");
  if (!button) return;
  const location = state.mapLocations.find((item) => item.id === button.dataset.locationId);
  if (!location) return;
  if (button.dataset.locationAction === "remove") {
    state.mapLocations = state.mapLocations.filter((item) => item.id !== location.id);
    renderMapLocationList();
    renderMarkers();
    renderCompassMeasurements();
    publishCompassState();
    byId("map-locations-status").textContent = `${location.name} removed from this session.`;
  } else if (button.dataset.locationAction === "center") {
    map.flyTo({ center: location.coordinates, zoom: Math.max(map.getZoom(), 12) });
  }
});
byId("map-locations-overlay").addEventListener("change", (event) => {
  state.mapLocationsOverlay = event.currentTarget.checked;
  byId("compass-map-overlay-toggle").checked = state.mapLocationsOverlay;
  renderMarkers();
  publishCompassState();
});
byId("compass-map-overlay-toggle").addEventListener("change", (event) => {
  state.mapLocationsOverlay = event.currentTarget.checked;
  byId("map-locations-overlay").checked = state.mapLocationsOverlay;
  renderMarkers();
  publishCompassState();
});
byId("map-location-filter").addEventListener("input", renderMapLocationList);
byId("compass-target-filter").addEventListener("input", renderCompassTargetControls);
byId("load-public-landmarks").addEventListener("click", () => loadPublicLandmarks());
byId("compass-target-list").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-target-toggle]");
  const mapCheckbox = event.target.closest("[data-map-toggle]");
  const locationId = checkbox?.dataset.targetToggle || mapCheckbox?.dataset.mapToggle;
  if (!locationId) return;
  const location = state.mapLocations.find((item) => item.id === locationId);
  if (!location) return;
  if (checkbox) location.compassSelected = checkbox.checked;
  if (mapCheckbox) location.visible = mapCheckbox.checked;
  renderMapLocationList();
  renderCompassMeasurements();
  renderMarkers();
  publishCompassState();
});
byId("compass-origin-location").addEventListener("change", (event) => {
  state.compassSettings.originLocationId = event.currentTarget.value;
  renderCompassMeasurements();
  publishCompassState();
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
  byId(id).addEventListener("change", () => {
    syncCompassSettingsFromControls();
    renderCompassMeasurements();
    publishCompassState();
  });
}
for (const control of document.querySelectorAll(".bezel-display-options input, .bezel-display-options select")) {
  control.addEventListener("change", () => {
    syncCompassSettingsFromControls();
    updateCompassDisplay();
  });
}
for (const control of document.querySelectorAll(".bezel-ring-adjustments input, .bezel-zoom-control input")) {
  control.addEventListener("input", () => {
    updateBezelAdjustmentReadouts("bezel");
    syncCompassSettingsFromControls();
    updateCompassDisplay();
  });
}
byId("compass-time").addEventListener("change", (event) => {
  const selected = new Date(event.currentTarget.value);
  if (Number.isNaN(selected.getTime())) return;
  state.compassSettings.liveTime = false;
  state.compassSettings.selectedTime = selected.toISOString();
  byId("compass-live-time").checked = false;
  state.jplVector = null;
  renderCompassMeasurements();
  publishCompassState();
});
byId("compass-live-time").addEventListener("change", (event) => {
  state.compassSettings.liveTime = event.currentTarget.checked;
  if (event.currentTarget.checked) state.compassSettings.selectedTime = new Date().toISOString();
  state.jplVector = null;
  updateCompassTimeControl();
  renderCompassMeasurements();
  publishCompassState();
});
byId("compass-time-now").addEventListener("click", () => {
  state.compassSettings.liveTime = true;
  state.compassSettings.selectedTime = new Date().toISOString();
  byId("compass-live-time").checked = true;
  state.jplVector = null;
  updateCompassTimeControl();
  renderCompassMeasurements();
  publishCompassState();
});
byId("compass-time-back").addEventListener("click", () => stepCompassTime(-1));
byId("compass-time-forward").addEventListener("click", () => stepCompassTime(1));
byId("ephemeris-load").addEventListener("click", loadJplVector);
byId("local-search-button").addEventListener("click", findLocalAgencies);
byId("local-contact-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const service = byId("local-contact-type").value;
  const area = byId("local-contact-area").value.trim();
  if (!service || !area) {
    byId("local-contact-status").textContent = "Choose a service and enter a city, county, state, or ZIP.";
    return;
  }
  renderNonEmergencyContacts(service, area);
});
byId("compass-enable").addEventListener("click", enableDeviceHeading);
byId("locate-button").addEventListener("click", () => {
  byId("compass-panel").hidden = false;
  byId("compass-toggle").setAttribute("aria-expanded", "true");
  requestGpsPosition();
});
map.on("moveend", () => {
  renderCompassMeasurements();
  publishCompassState();
  if (!state.weatherLocation && [...document.querySelectorAll("[data-weather-layer]:checked")].length) {
    state.weatherStation = "";
    queueWeatherRefresh();
  }
});

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

function updateCompassDisplay() {
  const trueNorth = state.compassSettings.bearingReference === "true-north";
  const heading = trueNorth ? 0 : state.deviceHeading;
  const relativeBearing = ((heading || 0) + state.bezelBearing) % 360;
  byId("compass-heading").textContent = trueNorth
    ? "N"
    : heading === null
      ? "—"
      : formatAngle(heading, state.compassSettings.angleUnit, true);
  byId("bearing-readout").textContent = trueNorth
    ? `True-north bezel: ${formatAngle(relativeBearing, state.compassSettings.angleUnit, true)}`
    : `Bezel bearing: ${formatAngle(relativeBearing, state.compassSettings.angleUnit, true)}`;
  byId("bezel-value").value = formatAngle(state.bezelBearing, state.compassSettings.angleUnit, true);
  compassNeedle.style.transform = `rotate(${relativeBearing}deg)`;
  renderBezelOverlay(
    byId("compass-bezel-overlay"),
    state.compassSettings.bezelDisplay,
    state.bezelBearing,
  );
  renderCompassBearingArrows();
  byId("compass-status").textContent = trueNorth
    ? "Geographic north reference · no magnetic declination correction"
    : heading === null
      ? "Compass heading unavailable; use the bezel or select true north."
      : `Device heading${state.userLocation ? " · GPS available" : " · enable GPS for coordinates"}`;
  renderCompassMeasurements();
  publishCompassState();
}

function renderCompassBearingArrows() {
  const origin = getCompassOrigin();
  const bearings = state.mapLocations
    .filter((location) =>
      location.compassSelected && location.id !== state.compassSettings.originLocationId
    )
    .map((location) => ({
      id: location.id,
      name: location.name,
      bearingDegrees: bearingAndDistance(origin.coordinates, location.coordinates).bearingDegrees,
    }));
  renderBearingArrows(byId("compass-bearing-overlay"), bearings, state.bezelBearing);
}

function publishCompassState() {
  compassChannel?.postMessage({
    type: "state",
    heading: state.deviceHeading,
    bearing: state.bezelBearing,
    status: byId("compass-status").textContent,
    settings: compassSettingsSnapshot(),
    locations: state.mapLocations,
    mapLocationsOverlay: state.mapLocationsOverlay,
    mapCenter: map.getCenter().toArray(),
    mapZoom: map.getZoom(),
    basemap: byId("basemap-select").value,
    mapLayerSelection: {
      epa: byId("toggle-epa").checked,
      buildings: byId("toggle-buildings").checked,
      reference: byId("toggle-reference").checked,
    },
    mapFeatures: getMapFeatures(),
    userLocation: state.userLocation,
    jplVector: state.jplVector,
    publicLandmarkRetrievedAt: state.publicLandmarkRetrievedAt,
    publicLandmarkStatus: state.publicLandmarkStatus,
    publicLandmarkCount: state.mapLocations.filter((location) => location.source === "osm-public").length,
    issPosition: state.issPosition,
    issError: state.issError,
  });
}

function initializeCompassTools() {
  for (const body of SOLAR_SYSTEM_BODIES) {
    byId("spatial-origin-body").add(new Option(body.name, body.id));
    byId("spatial-target-body").add(new Option(body.name, body.id));
  }
  byId("spatial-origin-body").value = state.compassSettings.originBodyId;
  byId("spatial-target-body").value = state.compassSettings.targetBodyId;
  byId("compass-mode").value = state.compassSettings.mode;
  byId("spatial-frame").value = state.compassSettings.frame;
  byId("ephemeris-source").value = state.compassSettings.ephemerisSource;
  byId("angle-unit").value = state.compassSettings.angleUnit;
  byId("distance-unit").value = state.compassSettings.distanceUnit;
  byId("spatial-unit").value = state.compassSettings.spatialUnit;
  byId("bearing-reference").value = state.compassSettings.bearingReference || "device";
  byId("compass-time-step").value = state.compassSettings.timeStep;
  applyBezelDisplayControls("bezel", state.compassSettings.bezelDisplay);
  applyCelestialBezelControls("celestial-bezel", state.compassSettings.celestialBezel);
  updateCompassTimeControl();
  renderCompassTargetControls();
  updateCompassModeOptions();
  renderCompassMeasurements();
  window.setInterval(() => {
    if (!state.compassSettings.liveTime) return;
    state.compassSettings.selectedTime = new Date().toISOString();
    updateCompassTimeControl();
    state.jplVector = null;
    renderCompassMeasurements();
    publishCompassState();
  }, 60_000);
  void refreshIssPosition();
  window.setInterval(() => void refreshIssPosition(), 15_000);
}

function compassSettingsSnapshot() {
  return {
    ...state.compassSettings,
    targetLocationIds: state.mapLocations
      .filter((location) => location.compassSelected)
      .map((location) => location.id),
  };
}

function syncCompassSettingsFromControls() {
  const previous = state.compassSettings;
  const selectedTime = new Date(byId("compass-time").value);
  state.compassSettings = {
    ...previous,
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
    selectedTime: Number.isNaN(selectedTime.getTime()) ? previous.selectedTime : selectedTime.toISOString(),
    timeStep: byId("compass-time-step").value,
    bezelDisplay: readBezelDisplayControls("bezel"),
    celestialBezel: readCelestialBezelControls("celestial-bezel"),
  };
  applyBezelDisplayControls("bezel", state.compassSettings.bezelDisplay);
  applyCelestialBezelControls("celestial-bezel", state.compassSettings.celestialBezel);
  if (
    previous.targetBodyId !== state.compassSettings.targetBodyId ||
    previous.originBodyId !== state.compassSettings.originBodyId ||
    previous.frame !== state.compassSettings.frame ||
    previous.selectedTime !== state.compassSettings.selectedTime ||
    previous.ephemerisSource !== state.compassSettings.ephemerisSource
  ) state.jplVector = null;
  updateCompassModeOptions();
}

function applyCompassSettings(settings, broadcast = true) {
  const selectValues = [
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
  for (const [key, id] of selectValues) {
    const select = byId(id);
    if (typeof settings[key] === "string" && [...select.options].some((option) => option.value === settings[key])) {
      select.value = settings[key];
    }
  }
  if (typeof settings.originLocationId === "string") {
    state.compassSettings.originLocationId = settings.originLocationId;
  }
  if (typeof settings.liveTime === "boolean") {
    byId("compass-live-time").checked = settings.liveTime;
    state.compassSettings.liveTime = settings.liveTime;
  }
  if (typeof settings.selectedTime === "string" && !Number.isNaN(new Date(settings.selectedTime).getTime())) {
    state.compassSettings.selectedTime = new Date(settings.selectedTime).toISOString();
  }
  if (settings.bezelDisplay && typeof settings.bezelDisplay === "object") {
    state.compassSettings.bezelDisplay = normalizeBezelDisplay(settings.bezelDisplay);
    applyBezelDisplayControls("bezel", state.compassSettings.bezelDisplay);
  }
  if (settings.celestialBezel && typeof settings.celestialBezel === "object") {
    state.compassSettings.celestialBezel = normalizeCelestialBezel(settings.celestialBezel);
    applyCelestialBezelControls("celestial-bezel", state.compassSettings.celestialBezel);
  }
  if (Array.isArray(settings.targetLocationIds)) {
    const selectedIds = new Set(settings.targetLocationIds.filter((id) => typeof id === "string"));
    for (const location of state.mapLocations) location.compassSelected = selectedIds.has(location.id);
  }
  updateCompassTimeControl();
  renderCompassTargetControls();
  syncCompassSettingsFromControls();
  renderMapLocationList();
  renderCompassMeasurements();
  updateCompassDisplay();
  if (broadcast) publishCompassState();
}

function updateCompassModeOptions() {
  const advanced = state.compassSettings.mode === "3d-coordinate";
  const planetary = advanced && !["local-enu", "earth-ecef"].includes(state.compassSettings.frame);
  byId("spatial-frame").closest("label").hidden = !advanced;
  byId("compass-coordinate-options").hidden = !planetary;
  byId("spatial-origin-body").closest("label").hidden =
    state.compassSettings.frame !== "body-centered-ecliptic";
  byId("ephemeris-load").hidden = !planetary || state.compassSettings.ephemerisSource !== "jpl";
  byId("spatial-unit").closest("label").hidden = !planetary;
}

function updateCompassTimeControl() {
  const date = new Date(state.compassSettings.selectedTime);
  const localValue = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  byId("compass-time").value = localValue;
}

function refreshCompassTimeIfLive() {
  if (!state.compassSettings.liveTime) return;
  state.compassSettings.selectedTime = new Date().toISOString();
  state.jplVector = null;
  updateCompassTimeControl();
  renderCompassMeasurements();
  publishCompassState();
}

function stepCompassTime(direction) {
  const date = new Date(state.compassSettings.selectedTime);
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
  state.compassSettings.liveTime = false;
  state.compassSettings.selectedTime = date.toISOString();
  byId("compass-live-time").checked = false;
  state.jplVector = null;
  updateCompassTimeControl();
  renderCompassMeasurements();
  publishCompassState();
}

function renderCompassTargetControls() {
  const originSelect = byId("compass-origin-location");
  const priorOrigin = state.compassSettings.originLocationId;
  originSelect.replaceChildren(new Option("Current map center", "map-center"));
  for (const location of state.mapLocations) {
    originSelect.add(new Option(location.name, location.id));
  }
  originSelect.value = state.mapLocations.some((location) => location.id === priorOrigin)
    ? priorOrigin
    : "map-center";
  state.compassSettings.originLocationId = originSelect.value;
  const list = byId("compass-target-list");
  list.replaceChildren();
  const filter = byId("compass-target-filter").value.trim().toLocaleLowerCase();
  const locations = state.mapLocations.filter((location) =>
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
    empty.textContent = state.mapLocations.length
      ? "No compass locations match this search."
      : "Search for a place, add coordinates, load public landmarks, or opt in to GPS.";
    list.append(empty);
  }
  const selectedCount = state.mapLocations.filter((location) => location.compassSelected).length;
  byId("compass-target-count").textContent = `${selectedCount} selected`;
  byId("compass-map-overlay-toggle").checked = state.mapLocationsOverlay;
}

function appendMeasurement(parent, label, value) {
  const item = document.createElement("p");
  const name = document.createElement("strong");
  name.textContent = `${label}: `;
  const detail = document.createElement("span");
  detail.textContent = value;
  item.append(name, detail);
  parent.append(item);
}

function getCompassOrigin() {
  const location = state.mapLocations.find((item) => item.id === state.compassSettings.originLocationId);
  return location
    ? { coordinates: location.coordinates, altitudeMeters: location.altitudeMeters ?? null, name: location.name }
    : { coordinates: map.getCenter().toArray(), altitudeMeters: null, name: "Current map center" };
}

function renderCelestialViews(sky) {
  const display = state.compassSettings.celestialBezel;
  const mode = display.view;
  const mapMode = ["world-map", "perspective-map", "globe-map"].includes(mode);
  const figure = byId("celestial-bezel-figure");
  const worldMap = byId("iss-world-map");
  const caption = byId("celestial-display-caption");
  state.currentSky = sky;
  figure.hidden = !display.visible || (!mapMode && !sky);
  worldMap.hidden = !display.visible || !mapMode;
  renderCelestialBezel(byId("celestial-bezel-svg"), sky, display, "sphere");
  renderCelestialSkyChart(byId("celestial-sky-chart-svg"), sky, display);
  if (mode === "sphere") {
    caption.textContent = "3D local sky · azimuth 000° is north, 090° east · altitude 0° is the horizon. Approximate for the selected time and origin.";
  } else if (mode === "sky-chart") {
    caption.textContent = "2D sky chart · azimuth runs left to right and altitude bottom to top. ISS position uses the live feed timestamp.";
  } else {
    caption.textContent = mode === "globe-map"
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
    renderCompassMeasurements();
  });
}

function renderObservationTimeReadout(date, origin) {
  const localTime = byId("celestial-local-time");
  const localZone = byId("celestial-local-zone");
  const observerTime = byId("celestial-observer-time");
  const observerZone = byId("celestial-observer-zone");
  const utcTime = byId("celestial-utc-time");
  const times = formatObservationTimes(date, state.observerTimeZone);
  localTime.textContent = times.local;
  localZone.textContent = times.localZone;
  utcTime.textContent = times.utc;
  if (times.observerLocal) {
    observerTime.textContent = times.observerLocal;
    observerZone.textContent = `${origin.name} · ${times.observerTimeZone}`;
  } else {
    observerTime.textContent = state.observerTimeZonePending
      ? "Looking up time zone…"
      : state.observerTimeZoneError
        ? "Unavailable · online lookup failed"
        : "Not available";
    observerZone.textContent = state.observerTimeZoneError || "Selected observer location";
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
      state.compassSettings.celestialBezel,
      state.compassSettings.celestialBezel.view,
    );
  } catch (error) {
    state.issError = error.message;
    console.error("ISS position could not be refreshed", error);
  } finally {
    issRequestPending = false;
    renderCompassMeasurements();
    publishCompassState();
  }
}

function renderCompassMeasurements() {
  const measurements = byId("compass-measurements");
  const celestial = byId("celestial-measurements");
  measurements.replaceChildren();
  celestial.replaceChildren();
  const origin = getCompassOrigin();
  renderCompassBearingArrows();
  const selectedDate = new Date(state.compassSettings.selectedTime);
  updateObserverTimeZone(origin.coordinates);
  renderObservationTimeReadout(selectedDate, origin);
  const heading = document.createElement("strong");
  heading.textContent = `Origin: ${origin.name}`;
  measurements.append(heading);
  if (state.compassSettings.mode === "3d-coordinate" &&
      !["local-enu", "earth-ecef"].includes(state.compassSettings.frame)) {
    const frame = state.compassSettings.frame;
    const centerBody = frame === "heliocentric-ecliptic"
      ? "10"
      : frame === "earth-centered-ecliptic"
        ? "399"
        : frame === "barycentric-icrf"
          ? "0"
          : state.compassSettings.originBodyId;
    const targetBody = state.compassSettings.targetBodyId;
    const bodyName = SOLAR_SYSTEM_BODIES.find((body) => body.id === targetBody)?.name || targetBody;
    const centerName = centerBody === "0"
      ? "Solar System barycenter"
      : SOLAR_SYSTEM_BODIES.find((body) => body.id === centerBody)?.name || centerBody;
    try {
      let vector;
      if (state.compassSettings.ephemerisSource === "jpl") {
        const jpl = state.jplVector;
        const selectedMinute = new Date(Math.floor(selectedDate.getTime() / 60_000) * 60_000).toISOString();
        if (jpl && jpl.target === targetBody && jpl.center === centerBody &&
            jpl.time === selectedMinute) {
          vector = jpl.vector;
          appendMeasurement(measurements, "Source", `NASA/JPL Horizons · retrieved ${new Date(jpl.retrievedAt).toLocaleString()}`);
        } else {
          appendMeasurement(measurements, "Source", "NASA/JPL Horizons · choose Load precise JPL vector");
        }
      } else {
        vector = calculateSolarSystemVector(targetBody, centerBody, selectedDate);
        appendMeasurement(measurements, "Source", `${vector.accuracy} · approximate`);
      }
      if (vector) {
        appendMeasurement(measurements, "Target", `${bodyName} from ${centerName}`);
        appendMeasurement(measurements, "X", formatSpatialCoordinate(vector.xAu, state.compassSettings.spatialUnit));
        appendMeasurement(measurements, "Y", formatSpatialCoordinate(vector.yAu, state.compassSettings.spatialUnit));
        appendMeasurement(measurements, "Z", formatSpatialCoordinate(vector.zAu, state.compassSettings.spatialUnit));
        appendMeasurement(measurements, "3D distance", formatSpatialCoordinate(vector.distanceAu, state.compassSettings.spatialUnit));
      }
    } catch (error) {
      appendMeasurement(measurements, "Unavailable", error.message);
    }
  } else {
    const targets = state.mapLocations.filter((location) =>
      location.compassSelected && location.id !== state.compassSettings.originLocationId
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
      appendMeasurement(row, "Bearing", formatAngle(bearing.bearingDegrees, state.compassSettings.angleUnit, true));
      if (state.compassSettings.mode === "earth-compass") {
        appendMeasurement(row, "Distance", formatDistance(bearing.distanceMeters, state.compassSettings.distanceUnit));
      } else {
        const targetPlace = {
          coordinates: target.coordinates,
          altitudeMeters: target.altitudeMeters ?? null,
        };
        const vector = state.compassSettings.frame === "earth-ecef"
          ? earthCenteredEcefDifference(origin, targetPlace)
          : localEastNorthUp(origin, targetPlace);
        appendMeasurement(row, state.compassSettings.frame === "earth-ecef" ? "ECEF X" : "East X", formatDistance(vector.xMeters, state.compassSettings.distanceUnit));
        appendMeasurement(row, state.compassSettings.frame === "earth-ecef" ? "ECEF Y" : "North Y", formatDistance(vector.yMeters, state.compassSettings.distanceUnit));
        appendMeasurement(row, state.compassSettings.frame === "earth-ecef" ? "ECEF Z" : "Up Z", vector.zMeters === null
          ? "Unknown · altitude not supplied at both points"
          : formatDistance(vector.zMeters, state.compassSettings.distanceUnit));
        appendMeasurement(row, "XY plane", formatDistance(Math.hypot(vector.xMeters, vector.yMeters), state.compassSettings.distanceUnit));
        if (vector.zMeters !== null) {
          appendMeasurement(row, "XZ / YZ planes", `${formatDistance(Math.hypot(vector.xMeters, vector.zMeters), state.compassSettings.distanceUnit)} / ${formatDistance(Math.hypot(vector.yMeters, vector.zMeters), state.compassSettings.distanceUnit)}`);
        }
        if (vector.altitudeAssumed) appendMeasurement(row, "Altitude", "Sea-level value assumed where missing");
      }
      measurements.append(row);
    }
  }
  byId("ephemeris-load").disabled = state.compassSettings.targetBodyId === (
    state.compassSettings.frame === "heliocentric-ecliptic"
      ? "10"
      : state.compassSettings.frame === "earth-centered-ecliptic"
        ? "399"
        : state.compassSettings.frame === "barycentric-icrf"
          ? "0"
          : state.compassSettings.originBodyId
  );
  if (!Number.isNaN(selectedDate.getTime()) && origin.coordinates) {
    try {
      const sky = calculateSunMoon(selectedDate, origin.coordinates[1], origin.coordinates[0]);
      if (state.issPosition) {
        sky.iss = calculateIssSkyPosition(
          origin.coordinates,
          origin.altitudeMeters,
          state.issPosition,
        );
      }
      renderCelestialViews(sky);
      const skyHeading = document.createElement("strong");
      skyHeading.textContent = `Sun, Moon & ISS · ${selectedDate.toLocaleString()}`;
      celestial.append(skyHeading);
      appendMeasurement(celestial, "Sun", `${formatAngle(sky.sun.azimuthDegrees, state.compassSettings.angleUnit, true)} azimuth · ${formatAngle(sky.sun.altitudeDegrees, state.compassSettings.angleUnit)} altitude · ${sky.sun.aboveHorizon ? "above horizon" : "below horizon"}`);
      appendMeasurement(celestial, "Moon", `${formatAngle(sky.moon.azimuthDegrees, state.compassSettings.angleUnit, true)} azimuth · ${formatAngle(sky.moon.altitudeDegrees, state.compassSettings.angleUnit)} altitude · ${sky.moon.phase} · ${Math.round(sky.moon.illumination * 100)}% illuminated`);
      if (state.issPosition && sky.iss) {
        appendMeasurement(celestial, "ISS", `${formatAngle(sky.iss.azimuthDegrees, state.compassSettings.angleUnit, true)} azimuth · ${formatAngle(sky.iss.altitudeDegrees, state.compassSettings.angleUnit)} altitude · ${formatDistance(sky.iss.rangeMeters, "kilometers")} range · ${sky.iss.aboveHorizon ? "above horizon" : "below horizon"} · ${state.issPosition.latitude.toFixed(2)}°, ${state.issPosition.longitude.toFixed(2)}°`);
        appendMeasurement(celestial, "ISS altitude / speed", `${state.issPosition.altitude.toFixed(1)} km · ${state.issPosition.velocity.toFixed(0)} km/h`);
        appendMeasurement(celestial, "ISS position time", new Date(state.issPosition.timestamp).toLocaleTimeString());
        const source = document.createElement("p");
        const name = document.createElement("strong");
        name.textContent = "ISS source: ";
        const link = document.createElement("a");
        link.href = "https://wheretheiss.at/";
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "WhereTheISS.at";
        source.append(name, link, document.createTextNode(` · refreshed ${new Date(state.issPosition.retrievedAt).toLocaleTimeString()}`));
        celestial.append(source);
      } else {
        appendMeasurement(celestial, "ISS", state.issError || "Loading live position…");
      }
    } catch (error) {
      renderCelestialViews(null);
      appendMeasurement(celestial, "Sky position", error.message);
    }
  }
}

async function loadJplVector() {
  refreshCompassTimeIfLive();
  const button = byId("ephemeris-load");
  const frame = state.compassSettings.frame;
  const target = state.compassSettings.targetBodyId;
  const center = frame === "heliocentric-ecliptic"
    ? "10"
    : frame === "earth-centered-ecliptic"
      ? "399"
      : frame === "barycentric-icrf"
        ? "0"
        : state.compassSettings.originBodyId;
  const selectedInstant = new Date(state.compassSettings.selectedTime);
  const instant = new Date(Math.floor(selectedInstant.getTime() / 60_000) * 60_000);
  if (target === center) {
    byId("ephemeris-status").textContent = "Choose a target different from the selected 3D origin.";
    return;
  }
  button.disabled = true;
  button.textContent = "Requesting JPL vector…";
  byId("ephemeris-status").textContent = "Requesting a single vector from NASA/JPL Horizons…";
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
    byId("ephemeris-status").textContent = "JPL Horizons vector loaded. The request sends only body IDs and the selected UTC time.";
    renderCompassMeasurements();
    compassChannel?.postMessage({ type: "ephemeris-result", vector: state.jplVector });
    publishCompassState();
  } catch (error) {
    byId("ephemeris-status").textContent = `JPL Horizons unavailable: ${error.message}`;
    console.error("Precise ephemeris request failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Load precise JPL vector";
  }
}

function renderEpaStatusOptions() {
  const select = byId("epa-status-filter");
  const selected = select.value;
  const statuses = [...new Set(state.epa.map((item) => item.statusName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  select.replaceChildren(new Option("All statuses", ""));
  for (const status of statuses) select.add(new Option(status, status));
  select.disabled = statuses.length === 0;
  select.value = statuses.includes(selected) ? selected : "";
}

async function enableDeviceHeading() {
  if (state.headingListening) return;
  if (!("DeviceOrientationEvent" in window)) {
    byId("compass-status").textContent = "This device does not provide compass heading.";
    publishCompassState();
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        byId("compass-status").textContent = "Compass permission was not granted.";
        publishCompassState();
        return;
      }
    }
    const eventName = "ondeviceorientationabsolute" in window
      ? "deviceorientationabsolute"
      : "deviceorientation";
    window.addEventListener(eventName, (event) => {
      const heading = Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading
        : Number.isFinite(event.alpha) ? (360 - event.alpha) % 360 : null;
      if (heading === null) return;
      state.deviceHeading = heading;
      updateCompassDisplay();
    });
    state.headingListening = true;
    byId("compass-status").textContent =
      "Move the device for a heading. Metal or magnets may affect accuracy.";
    publishCompassState();
  } catch (error) {
    byId("compass-status").textContent = "Compass permission or device orientation is unavailable.";
    publishCompassState();
    console.error("Device compass could not be enabled", error);
  }
}

function requestGpsPosition() {
  if (!navigator.geolocation) {
    byId("gps-accuracy").textContent = "Location is not supported by this browser.";
    return;
  }
  byId("gps-refresh").disabled = true;
  byId("gps-refresh").textContent = "Locating…";
  byId("gps-accuracy").textContent = "Waiting for your permission and a GPS fix…";
  navigator.geolocation.getCurrentPosition(
    ({ coords, timestamp }) => {
      state.userLocation = [coords.longitude, coords.latitude];
      state.gpsAccuracy = coords.accuracy;
      state.gpsTimestamp = timestamp;
      byId("gps-position").textContent =
        `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      byId("gps-accuracy").textContent =
        `Accuracy ±${Math.round(coords.accuracy)} m · ${new Date(timestamp).toLocaleTimeString()} · device source varies`;
      byId("gps-refresh").textContent = "Update location";
      byId("gps-refresh").disabled = false;
      addMapLocation("My GPS location", state.userLocation, "gps", {
        altitudeMeters: Number.isFinite(coords.altitude) ? coords.altitude : null,
      });
      byId("local-tools").open = true;
      byId("local-services").hidden = false;
      byId("local-area").textContent = "Area lookup only after you tap Find agencies.";
      byId("local-search-results").replaceChildren();
      renderMarkers();
      queueWeatherRefresh();
      updateCompassDisplay();
    },
    (error) => {
      byId("gps-accuracy").textContent = error.code === 1
        ? "Location permission was not granted."
        : error.code === 3 ? "Location request timed out. Try again." : "Could not obtain location.";
      byId("gps-refresh").textContent = "Try location again";
      byId("gps-refresh").disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}

async function findLocalAgencies() {
  if (!state.userLocation) {
    byId("local-area").textContent = "Use device location first.";
    return;
  }
  const button = byId("local-search-button");
  const results = byId("local-search-results");
  button.disabled = true;
  button.textContent = "Looking up…";
  results.replaceChildren();
  try {
    const query = new URLSearchParams({
      lat: state.userLocation[1].toFixed(3),
      lon: state.userLocation[0].toFixed(3),
    });
    const response = await fetch(`/api/reverse-geocode?${query}`, {
      headers: { Accept: "application/json" },
    });
    const area = await response.json();
    if (response.status === 429) throw new Error("Please wait a moment before trying another area lookup.");
    if (!response.ok) throw new Error(area.error || `Area lookup returned HTTP ${response.status}`);
    if (!area.label) throw new Error("Could not identify a local government area for this location.");
    state.localAgencyArea = area;
    byId("local-area").textContent = area.label;
    if (!byId("local-contact-area").value.trim()) byId("local-contact-area").value = area.label;
    byId("public-data-location").textContent = `Public data search will include ${area.label}.`;
    renderAgencySearchLinks(area);
  } catch (error) {
    byId("local-area").textContent = error.message || "Local area lookup is unavailable.";
    console.error("Local agency area lookup failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Find agencies";
  }
}

function renderAgencySearchLinks(area) {
  const results = byId("local-search-results");
  results.replaceChildren();
  const location = area.label;
  const categories = [
    {
      title: "Environmental",
      terms: "environmental protection agency cleanup brownfields environmental health",
      apiUrl: "https://www.epa.gov/enviro/envirofacts-data-service-api",
    },
    {
      title: "Veterans’ services",
      terms: "veterans affairs service office veterans service officer benefits",
      apiUrl: "https://developer.va.gov/explore/api/va-facilities",
    },
    {
      title: "Hospitals and clinics",
      terms: "hospital emergency department clinic community health center",
      apiUrl: "https://data.cms.gov/provider-data/",
    },
    {
      title: "Shelters and housing",
      terms: "homeless shelter emergency shelter warming center housing assistance",
      websiteUrl: "https://www.211.org/",
    },
    {
      title: "Building reuse",
      terms: "public surplus buildings vacant property redevelopment community reuse",
      websiteUrl: "https://realestatesales.gov/",
    },
    {
      title: "Housing and community services",
      terms: "housing assistance community development public services",
      websiteUrl: "https://www.usa.gov/benefits",
    },
    {
      title: "Parks and recreation",
      terms: "city county state parks recreation department public parks trails",
      websiteUrl: "https://www.nps.gov/",
    },
  ];
  for (const category of categories) {
    const item = document.createElement("article");
    item.className = "local-search-item";
    const heading = document.createElement("strong");
    heading.textContent = category.title;
    item.append(heading);
    if (state.providerMode === "api") {
      if (category.apiUrl) {
        appendSearchLink(item, category.apiUrl, "Public API/data reference ↗");
      } else {
        const note = document.createElement("span");
        note.textContent = "No common public API identified; manual/provider search.";
        item.append(note);
      }
      appendSearchLink(
        item,
        `https://www.google.com/search?q=${encodeURIComponent(`${category.terms} ${location} public API open data`)}`,
        "Search local public data feeds ↗",
      );
    } else {
      if (category.websiteUrl) {
        appendSearchLink(item, category.websiteUrl, "Official/provider website ↗");
      }
      appendSearchLink(
        item,
        `https://www.google.com/search?q=${encodeURIComponent(`${category.terms} ${location} local services official`)}`,
        "Search government/provider websites ↗",
      );
      appendSearchLink(
        item,
        `https://www.bing.com/search?q=${encodeURIComponent(`${category.terms} ${location}`)}`,
        "Broader web search ↗",
      );
    }
    results.append(item);
  }
}

function appendSearchLink(parent, href, text) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  parent.append(link);
}

function renderNonEmergencyContacts(service, area) {
  const results = byId("local-contact-results");
  results.replaceChildren();
  const query = `${service} ${area} official contact phone`;
  const searches = [
    ["Search Google", `https://www.google.com/search?q=${encodeURIComponent(query)}`],
    ["Search Bing", `https://www.bing.com/search?q=${encodeURIComponent(query)}`],
  ];
  for (const [label, href] of searches) {
    const item = document.createElement("article");
    item.className = "local-contact-item";
    const heading = document.createElement("strong");
    heading.textContent = label;
    const detail = document.createElement("p");
    detail.textContent = `Look for the official ${service} contact page serving ${area}.`;
    item.append(heading, detail);
    appendSearchLink(item, href, "View search results ↗");
    results.append(item);
  }
  if (service.startsWith("211 ")) {
    const item = document.createElement("article");
    item.className = "local-contact-item";
    const heading = document.createElement("strong");
    heading.textContent = "211 community resource line";
    const detail = document.createElement("p");
    detail.textContent = "Call 211 where available, or use the official 211 locator to check service coverage in your area.";
    const callLink = document.createElement("a");
    callLink.href = "tel:211";
    callLink.textContent = "Call 211 ↗";
    item.append(heading, detail, callLink);
    appendSearchLink(item, "https://www.211.org/", "Check the 211 locator ↗");
    results.append(item);
  }
  byId("local-contact-status").textContent =
    `Search results for ${area}. Verify the agency, number, and non-emergency status before calling.`;
}

function renderPublicDataLinks(topic = "") {
  const results = byId("public-data-links");
  if (!results) return;
  results.replaceChildren();
  const area = state.localAgencyArea?.label || "";
  const searchTerms = [topic, area].filter(Boolean).join(" ");
  const encoded = encodeURIComponent(searchTerms);
  const sources = [
    {
      name: "Data.gov catalog",
      detail: "Federal, state, local, and tribal dataset listings. Catalog metadata links to the publishing agency.",
      url: `https://catalog.data.gov/dataset${searchTerms ? `?q=${encoded}` : ""}`,
      label: "Search public dataset listings ↗",
    },
    {
      name: "EPA Envirofacts",
      detail: "Environmental datasets and API documentation; many queries are available without an API key.",
      url: "https://www.epa.gov/enviro/envirofacts-data-service-api",
      label: state.providerMode === "api" ? "API and dataset reference ↗" : "EPA data portal ↗",
    },
    {
      name: "FEMA OpenFEMA",
      detail: "Public disaster, assistance, and risk datasets; API access is generally available without a key.",
      url: state.providerMode === "api"
        ? "https://www.fema.gov/about/openfema/api"
        : "https://www.fema.gov/about/openfema",
      label: state.providerMode === "api" ? "API documentation ↗" : "FEMA data portal ↗",
    },
    {
      name: "U.S. Census Bureau",
      detail: "Population and community statistics. API keys are optional for lower-volume public queries and required for higher-volume use.",
      url: state.providerMode === "api"
        ? "https://www.census.gov/data/developers/data-sets.html"
        : "https://data.census.gov/",
      label: state.providerMode === "api" ? "API datasets ↗" : "Search Census data ↗",
    },
    {
      name: "National Weather Service",
      detail: "Forecasts, observations, and alerts; public API, no key required.",
      url: state.providerMode === "api"
        ? "https://www.weather.gov/documentation/services-web-api"
        : "https://www.weather.gov/",
      label: state.providerMode === "api" ? "API documentation ↗" : "NWS website ↗",
    },
    {
      name: "CMS Provider Data",
      detail: "Public healthcare provider and facility datasets; check each dataset’s update schedule and use terms.",
      url: "https://data.cms.gov/provider-data/",
      label: "Browse CMS datasets ↗",
    },
  ];
  for (const source of sources) {
    const item = document.createElement("article");
    item.className = "public-data-item";
    const heading = document.createElement("strong");
    heading.textContent = source.name;
    const detail = document.createElement("p");
    detail.textContent = source.detail;
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = source.label;
    item.append(heading, detail, link);
    results.append(item);
  }
  const localSearch = document.createElement("article");
  localSearch.className = "public-data-item";
  const localHeading = document.createElement("strong");
  localHeading.textContent = "State and local open-data portals";
  const localDetail = document.createElement("p");
  localDetail.textContent = area
    ? `Search official state, county, and city data portals near ${area}.`
    : "Search for official state, county, and city open-data portals.";
  const localLink = document.createElement("a");
  localLink.href = `https://www.google.com/search?q=${encodeURIComponent(`site:gov open data portal ${searchTerms}`)}`;
  localLink.target = "_blank";
  localLink.rel = "noreferrer";
  localLink.textContent = "Find local government data portals ↗";
  localSearch.append(localHeading, localDetail, localLink);
  results.append(localSearch);
}

async function loadEpa() {
  if (state.epaLoading || state.epaLoaded) return;
  state.epaLoading = true;
  byId("map-status").textContent = "Loading the first 1,000 EPA sample records…";
  try {
    const response = await fetch(EPA_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`EPA returned HTTP ${response.status}`);
    state.epa = normalizeEpaRecords(await response.json());
    state.epaLoaded = true;
    renderEpaStatusOptions();
    byId("epa-freshness").textContent = `${retrievedLabel()} · ${state.epa.length} mapped records`;
    byId("map-status").textContent =
      `Showing ${state.epa.length} geolocated EPA sample records · not a complete inventory`;
    renderMarkers();
    publishCompassState();
  } catch (error) {
    byId("epa-freshness").textContent = "Could not load; check network or EPA availability";
    byId("map-status").textContent = "EPA data could not be loaded. Use the source link to check the dataset.";
    console.error("EPA data load failed", error);
  } finally {
    state.epaLoading = false;
  }
}

function loadReports() {
  try {
    const saved = JSON.parse(localStorage.getItem("civic-atlas-reports") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.error("Saved local reports could not be read", error);
    return [];
  }
}

function loadProviderMode() {
  try {
    return localStorage.getItem("civic-atlas-provider-mode") === "website" ? "website" : "api";
  } catch (error) {
    console.error("Provider access preference could not be read", error);
    return "api";
  }
}

function saveReports() {
  localStorage.setItem("civic-atlas-reports", JSON.stringify(state.buildings));
}

function renderMarkers() {
  const source = map.getSource("atlas-points");
  if (!source) {
    updateMapDownloadActions();
    return;
  }
  source.setData({ type: "FeatureCollection", features: getMapFeatures() });
  updateMapDownloadActions();
}

function getMapFeatures() {
  const visible = new Set(toggleConfigs.filter(([id]) => byId(id).checked).map(([, key]) => key));
  const selectedReferenceKind = byId("reference-layer-kind").value;
  const references = byId("toggle-reference").checked
    ? REFERENCE_LOCATIONS.filter((item) => !selectedReferenceKind || item.kind === selectedReferenceKind)
    : [];
  const selectedEpaStatus = byId("epa-status-filter").value;
  const selectedCommunityKind = byId("community-kind-filter").value;
  const features = [...state.epa, ...state.buildings, ...references]
    .filter((item) =>
      (item.city ? visible.has("reference") : visible.has(item.kind)) &&
      (item.kind !== "epa" || !selectedEpaStatus || item.statusName === selectedEpaStatus) &&
      (item.kind !== "buildings" || !selectedCommunityKind || item.reportKind === selectedCommunityKind) &&
      item.status !== "pending" &&
      Array.isArray(item.coordinates)
    )
    .map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: item.coordinates },
      properties: {
        kind: item.kind,
        layer: item.city ? "reference" : item.kind,
        name: item.name,
        detail: item.detail || (
          item.city
            ? `Approximate ${item.kind.replace("-", " ")} reference · ${item.city} · ${item.coordinates[1].toFixed(5)}, ${item.coordinates[0].toFixed(5)}`
            : "Public data; verify with the source."
        ),
        source: item.source || (item.city ? "Bundled offline reference points" : "Local community report"),
        statusName: item.statusName || "",
        sourceId: item.sourceId || "",
        reference: item.city ? "true" : "false",
      },
    }));
  features.push(...state.mapLocations
    .filter((location) => state.mapLocationsOverlay && location.visible)
    .map((location) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: location.coordinates },
    properties: {
      kind: "user-location",
      name: location.name,
      detail: location.source === "osm-public"
        ? `Public OpenStreetMap landmark · ${location.category || "public site"} · retrieved ${new Date(location.retrievedAt).toLocaleString()}`
        : `Added this session · ${location.coordinates[1].toFixed(6)}, ${location.coordinates[0].toFixed(6)}`,
      source: location.source === "osm-public"
        ? `OpenStreetMap public landmark · ${location.category || "public site"}`
        : "Added in this browser session",
      sourceUrl: location.sourceUrl || "",
      retrievedAt: location.retrievedAt || "",
      reference: "true",
    },
  })));
  return features;
}

function renderMapLocationList() {
  const list = byId("map-location-list");
  list.replaceChildren();
  const filter = byId("map-location-filter").value.trim().toLocaleLowerCase();
  for (const location of state.mapLocations.filter((item) =>
    !filter || `${item.name} ${item.category || ""}`.toLocaleLowerCase().includes(filter)
  )) {
    const item = document.createElement("li");
    item.className = "map-location-item";
    const label = document.createElement("label");
    label.className = "map-location-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = location.visible;
    checkbox.dataset.locationToggle = location.id;
    checkbox.setAttribute("aria-label", `Show ${location.name} on map`);
    const description = document.createElement("span");
    description.className = "map-location-description";
    const name = document.createElement("strong");
    name.textContent = location.name;
    const coordinates = document.createElement("small");
    coordinates.textContent = `${location.coordinates[1].toFixed(5)}, ${location.coordinates[0].toFixed(5)}${location.source === "gps" ? " · GPS (session only)" : location.category ? ` · ${location.category}` : ""}${Number.isFinite(location.altitudeMeters) ? ` · ${location.altitudeMeters.toFixed(1)} m` : ""}`;
    description.append(name, coordinates);
    label.append(checkbox, description);
    const actions = document.createElement("span");
    actions.className = "map-location-item-actions";
    const compassLabel = document.createElement("label");
    compassLabel.className = "map-location-compass-choice";
    const compassCheckbox = document.createElement("input");
    compassCheckbox.type = "checkbox";
    compassCheckbox.checked = Boolean(location.compassSelected);
    compassCheckbox.dataset.compassToggle = location.id;
    compassCheckbox.setAttribute("aria-label", `Use ${location.name} for compass calculations`);
    compassLabel.append(compassCheckbox, document.createTextNode("Compass"));
    const center = document.createElement("button");
    center.type = "button";
    center.className = "text-button";
    center.dataset.locationAction = "center";
    center.dataset.locationId = location.id;
    center.textContent = "Center";
    center.setAttribute("aria-label", `Center map on ${location.name}`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-button";
    remove.dataset.locationAction = "remove";
    remove.dataset.locationId = location.id;
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${location.name}`);
    actions.append(compassLabel, center, remove);
    item.append(label, actions);
    list.append(item);
  }
  const selectedCount = state.mapLocations.filter((location) => location.visible).length;
  byId("map-location-count").textContent = `${selectedCount} selected`;
  byId("map-locations-clear").disabled = state.mapLocations.length === 0;
  renderCompassTargetControls();
  if (state.mapLocations.length === 0) {
    byId("map-locations-status").textContent =
      "No locations added. Search for a place or enter coordinates to start.";
  }
}

function addMapLocation(name, coordinates, source = "manual", metadata = {}) {
  const [longitude, latitude] = coordinates;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    byId("map-locations-status").textContent =
      "Coordinates are invalid. Latitude must be -90 to 90 and longitude -180 to 180.";
    return false;
  }
  const duplicate = state.mapLocations.find((location) =>
    location.coordinates[0].toFixed(5) === longitude.toFixed(5) &&
    location.coordinates[1].toFixed(5) === latitude.toFixed(5)
  );
  if (duplicate) {
    duplicate.visible = true;
    duplicate.compassSelected = true;
    if (Number.isFinite(metadata.altitudeMeters)) duplicate.altitudeMeters = metadata.altitudeMeters;
    renderMapLocationList();
    renderMarkers();
    renderCompassMeasurements();
    publishCompassState();
    map.flyTo({ center: duplicate.coordinates, zoom: Math.max(map.getZoom(), 12) });
    byId("map-locations-status").textContent = `${duplicate.name} is already in the list and is now shown on the map.`;
    return true;
  }
  const id = globalThis.crypto?.randomUUID?.() || `location-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.mapLocations.push({
    id,
    name: name.trim() || `Location ${state.mapLocations.length + 1}`,
    coordinates: [longitude, latitude],
    visible: true,
    compassSelected: true,
    source,
    ...metadata,
  });
  renderMapLocationList();
  renderMarkers();
  map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 12) });
  byId("map-locations-status").textContent =
    `${name.trim() || "Location"} added and shown on the map. Use its checkbox to hide or show it.`;
  renderCompassMeasurements();
  publishCompassState();
  return true;
}

async function loadPublicLandmarks(requestedTypes = null, requestedBounds = null) {
  refreshCompassTimeIfLive();
  const button = byId("load-public-landmarks");
  const checkedTypes = [...document.querySelectorAll("[data-landmark-type]:checked")]
    .map((input) => input.dataset.landmarkType);
  const types = Array.isArray(requestedTypes)
    ? requestedTypes.filter((type) => checkedTypes.includes(type))
    : checkedTypes;
  if (types.length === 0) {
    byId("public-landmark-status").textContent = "Select at least one public-landmark category.";
    return;
  }
  const mapBounds = map.getBounds();
  const bounds = Array.isArray(requestedBounds) &&
      requestedBounds.length === 4 &&
      requestedBounds.every(Number.isFinite)
    ? requestedBounds
    : [
      mapBounds.getWest(),
      mapBounds.getSouth(),
      mapBounds.getEast(),
      mapBounds.getNorth(),
    ];
  const query = new URLSearchParams({
    bbox: bounds.map((value) => value.toFixed(5)).join(","),
    types: types.join(","),
  });
  button.disabled = true;
  button.textContent = "Loading public data…";
  byId("public-landmark-status").textContent = "Querying public OpenStreetMap features in the current map view…";
  try {
    const response = await fetch(`/api/landmarks?${query}`, { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Landmark search returned HTTP ${response.status}.`);
    let added = 0;
    for (const feature of payload.features) {
      const duplicate = state.mapLocations.find((location) =>
        location.coordinates[0].toFixed(5) === feature.coordinates[0].toFixed(5) &&
        location.coordinates[1].toFixed(5) === feature.coordinates[1].toFixed(5)
      );
      if (duplicate) {
        duplicate.visible = true;
        duplicate.compassSelected = true;
        continue;
      }
      state.mapLocations.push({
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
    state.publicLandmarkRetrievedAt = payload.retrievedAt;
    state.publicLandmarkStatus =
      `${payload.features.length} named features returned; ${added} new locations added. ${payload.truncated ? "Results may be truncated; zoom in to narrow the area." : ""}`;
    byId("public-landmark-source-updated").textContent =
      `Retrieved ${new Date(payload.retrievedAt).toLocaleString()}`;
    byId("public-landmark-status").textContent = state.publicLandmarkStatus;
    renderMapLocationList();
    renderMarkers();
    renderCompassMeasurements();
    publishCompassState();
  } catch (error) {
    byId("public-landmark-status").textContent = error.message.includes("2° by 2°")
      ? "Zoom in to a map area no larger than 2° by 2°, then try again."
      : error.message;
    state.publicLandmarkStatus = byId("public-landmark-status").textContent;
    console.error("Public landmark search failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Load in current map view";
  }
}

async function searchAndAddMapLocation(event) {
  event.preventDefault();
  const input = byId("map-location-search");
  const query = input.value.trim();
  if (!query) return;
  const button = event.submitter || byId("map-location-search-form").querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Searching…";
  byId("map-locations-status").textContent = "Searching OpenStreetMap for the place…";
  try {
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 429) {
      byId("map-locations-status").textContent = "Please wait a moment before searching again.";
      return;
    }
    if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
    const [result] = await response.json();
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      byId("map-locations-status").textContent = "No matching place with valid coordinates was found.";
      return;
    }
    addMapLocation(result.display_name || query, [longitude, latitude], "search");
    input.value = "";
  } catch (error) {
    byId("map-locations-status").textContent = "Place search is unavailable right now. Try again shortly.";
    console.error("Map location search failed", error);
  } finally {
    button.disabled = false;
    button.textContent = "Search and add";
  }
}

function addCoordinateLocation(event) {
  event.preventDefault();
  const latitude = Number(byId("map-location-latitude").value);
  const longitude = Number(byId("map-location-longitude").value);
  const altitudeValue = byId("map-location-altitude").value.trim();
  const name = byId("map-location-label").value.trim();
  const altitudeMeters = altitudeValue === "" ? null : Number(altitudeValue);
  if (altitudeValue !== "" && !Number.isFinite(altitudeMeters)) {
    byId("map-locations-status").textContent = "Altitude must be a valid number of meters.";
    return;
  }
  if (addMapLocation(name, [longitude, latitude], "manual", { altitudeMeters })) {
    byId("map-coordinate-form").reset();
  }
}

function addGpsMapLocation() {
  const button = byId("map-location-gps");
  if (!navigator.geolocation) {
    byId("map-locations-status").textContent = "Location is not supported by this browser.";
    return;
  }
  button.disabled = true;
  button.textContent = "Requesting location…";
  byId("map-locations-status").textContent = "Waiting for your permission and a GPS fix…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const coordinates = [coords.longitude, coords.latitude];
      state.userLocation = coordinates;
      state.gpsAccuracy = coords.accuracy;
      addMapLocation("My GPS location", coordinates, "gps", {
        altitudeMeters: Number.isFinite(coords.altitude) ? coords.altitude : null,
      });
      byId("gps-position").textContent = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
      byId("gps-accuracy").textContent = `Accuracy ±${Math.round(coords.accuracy)} m · device source varies. Not saved.`;
      byId("local-tools").open = true;
      byId("local-services").hidden = false;
      byId("local-area").textContent = "Area lookup only after you tap Find agencies.";
      byId("local-search-results").replaceChildren();
      queueWeatherRefresh();
      updateCompassDisplay();
      button.disabled = false;
      button.textContent = "Add my GPS location";
    },
    (error) => {
      byId("map-locations-status").textContent = error.code === 1
        ? "Location permission was not granted."
        : error.code === 3 ? "Location request timed out. Try again." : "Could not obtain your location.";
      button.disabled = false;
      button.textContent = "Add my GPS location";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
}

function clearMapLocations() {
  state.mapLocations = [];
  renderMapLocationList();
  renderMarkers();
  renderCompassMeasurements();
  publishCompassState();
  byId("map-locations-status").textContent = "All session locations removed from the map.";
}

function createPopupContent(properties, coordinates) {
  const popup = document.createElement("div");
  popup.className = "popup";
  const title = document.createElement("strong");
  title.textContent = properties.name;
  const detail = document.createElement("p");
  detail.textContent = properties.detail;
  popup.append(title, detail);
  if (properties.sourceId && properties.kind === "epa") {
    const sourceUrl = safeHttpUrl(
      `https://data.epa.gov/dmapservice/sems.envirofacts_site/site_id/equals/${encodeURIComponent(properties.sourceId)}/1:1/JSON`,
    );
    if (sourceUrl) addPopupLink(popup, sourceUrl, "Check EPA record ↗");
  }
  if (properties.reference === "true" && !properties.sourceUrl) {
    const latitude = coordinates[1];
    const longitude = coordinates[0];
    addPopupLink(
      popup,
      `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
      "Open reference point in OpenStreetMap ↗",
    );
  }
  const landmarkUrl = safeHttpUrl(properties.sourceUrl);
  if (landmarkUrl && properties.kind === "user-location") {
    addPopupLink(popup, landmarkUrl, "Open OpenStreetMap feature ↗");
    if (properties.retrievedAt) {
      const updated = document.createElement("p");
      updated.textContent = `Retrieved ${new Date(properties.retrievedAt).toLocaleString()}`;
      popup.append(updated);
    }
  }
  if (state.userLocation) {
    const [startLon, startLat] = state.userLocation;
    const [endLon, endLat] = coordinates;
    const route = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${startLat},${startLon};${endLat},${endLon}`;
    addPopupLink(popup, route, "Route here ↗");
  }
  return popup;
}

function addPopupLink(parent, href, text) {
  const safeUrl = safeHttpUrl(href);
  if (!safeUrl) return;
  const link = document.createElement("a");
  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  link.style.display = "block";
  parent.append(link);
}

for (const [id, key] of toggleConfigs) {
  byId(id).addEventListener("change", () => {
    updateLayerOptions(byId(id));
    renderMarkers();
    updateSelectedLayerCount();
    if (key === "epa" && byId(id).checked) loadEpa();
    publishCompassState();
  });
}
byId("epa-status-filter").addEventListener("change", () => {
  renderMarkers();
  publishCompassState();
});
byId("community-kind-filter").addEventListener("change", () => {
  renderMarkers();
  publishCompassState();
});
byId("reference-layer-kind").addEventListener("change", () => {
  renderMarkers();
  publishCompassState();
});
byId("weather-forecast-count").addEventListener("change", refreshWeather);
byId("weather-alert-severity").addEventListener("change", refreshWeather);
for (const input of document.querySelectorAll("[data-weather-layer]")) {
  input.addEventListener("change", () => {
    updateLayerOptions(input);
    updateSelectedLayerCount();
    queueWeatherRefresh();
  });
}

byId("select-all-layers").addEventListener("click", () => {
  for (const input of [
    ...toggleConfigs.map(([id]) => byId(id)),
    ...document.querySelectorAll("[data-weather-layer]"),
  ]) {
    if (input.checked) continue;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

byId("clear-all-layers").addEventListener("click", () => {
  for (const input of [
    ...toggleConfigs.map(([id]) => byId(id)),
    ...document.querySelectorAll("[data-weather-layer]"),
  ]) {
    if (!input.checked) continue;
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

byId("basemap-select").addEventListener("change", (event) => {
  const selectedBaseMap = event.currentTarget.value;
  if (!Object.prototype.hasOwnProperty.call(baseMapDefinitions, selectedBaseMap)) return;
  byId("basemap-attribution-note").textContent = baseMapDefinitions[selectedBaseMap].label;
  try {
    localStorage.setItem("civic-atlas-basemap", selectedBaseMap);
  } catch (error) {
    console.error("Base map preference could not be saved", error);
    showToast("Base map changed, but the preference could not be saved on this device.");
  }
  const updateVisibility = () => {
    for (const id of Object.keys(baseMapDefinitions)) {
      map.setLayoutProperty(
        `basemap-${id}`,
        "visibility",
        id === byId("basemap-select").value ? "visible" : "none",
      );
    }
  };
  if (map.isStyleLoaded()) updateVisibility();
  else map.once("load", updateVisibility);
  publishCompassState();
});

function updateMapDownloadActions() {
  const featureCount = getMapFeatures().length;
  const hasFeatures = featureCount > 0;
  byId("download-map-csv").disabled = !hasFeatures;
  byId("download-map-geojson").disabled = !hasFeatures;
  byId("download-map-data-status").textContent = hasFeatures
    ? `${featureCount} visible mapped features available.`
    : "Select and load a map data layer to enable CSV and GeoJSON downloads.";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getDownloadTimestamp() {
  return new Date().toISOString().slice(0, 10);
}

async function createMapImageBlob() {
  if (!map.loaded()) {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        map.off("idle", onIdle);
        reject(new Error("The map is still loading. Wait for the map tiles, then try again."));
      }, 15000);
      const onIdle = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      map.once("idle", onIdle);
    });
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const source = map.getCanvas();
  const scale = source.width / Math.max(1, source.clientWidth);
  const padding = Math.round(14 * scale);
  const lineHeight = Math.round(17 * scale);
  const attribution = (
    map.getContainer().querySelector(".maplibregl-ctrl-attrib-inner")?.textContent ||
    baseMapDefinitions[byId("basemap-select").value].source.attribution
  ).replace(/\s+/g, " ").trim();
  const output = document.createElement("canvas");
  const context = output.getContext("2d");
  if (!context) throw new Error("This browser could not prepare a map image.");
  context.font = `${Math.max(11, Math.round(12 * scale))}px sans-serif`;
  const maxTextWidth = Math.max(100, source.width - padding * 2);
  const words = attribution.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxTextWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const captionHeight = padding * 2 + lines.length * lineHeight;
  output.width = source.width;
  output.height = source.height + captionHeight;
  context.drawImage(source, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, source.height, output.width, captionHeight);
  context.fillStyle = "#18312d";
  context.font = `${Math.max(11, Math.round(12 * scale))}px sans-serif`;
  context.textBaseline = "top";
  lines.forEach((text, index) => {
    context.fillText(text, padding, source.height + padding + index * lineHeight);
  });
  return new Promise((resolve, reject) => {
    try {
      output.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not create the map image."));
      }, "image/png");
    } catch (error) {
      reject(new Error("The selected map provider does not allow this image to be exported from the browser."));
    }
  });
}

byId("download-map-image").addEventListener("click", async () => {
  const status = byId("download-map-data-status");
  status.textContent = "Preparing the current map image…";
  try {
    const blob = await createMapImageBlob();
    downloadBlob(blob, `civic-renewal-atlas-map-${getDownloadTimestamp()}.png`);
    status.textContent = "Map image downloaded with provider attribution.";
  } catch (error) {
    status.textContent = error.message || "Map image could not be created.";
    console.error("Map image export failed", error);
  }
});

byId("download-map-csv").addEventListener("click", () => {
  const features = getMapFeatures();
  if (!features.length) return;
  downloadBlob(
    new Blob([createMapCsv(features)], { type: "text/csv;charset=utf-8" }),
    `civic-renewal-atlas-data-${getDownloadTimestamp()}.csv`,
  );
  byId("download-map-data-status").textContent = `Downloaded ${features.length} visible mapped features as CSV.`;
});

byId("download-map-geojson").addEventListener("click", () => {
  const features = getMapFeatures();
  if (!features.length) return;
  const collection = {
    type: "FeatureCollection",
    name: "Civic Renewal Atlas selected map layers",
    generatedAt: new Date().toISOString(),
    features,
  };
  downloadBlob(
    new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json;charset=utf-8" }),
    `civic-renewal-atlas-data-${getDownloadTimestamp()}.geojson`,
  );
  byId("download-map-data-status").textContent = `Downloaded ${features.length} visible mapped features as GeoJSON.`;
});

function updateLayerOptions(checkbox) {
  const optionsId = checkbox.getAttribute("aria-controls");
  if (!optionsId) return;
  const options = byId(optionsId);
  if (options) {
    const isWeather = checkbox.hasAttribute("data-weather-layer");
    options.hidden = !checkbox.checked || (isWeather && state.providerMode !== "api");
  }
}

byId("layers-toggle").addEventListener("click", (event) => {
  const controls = byId("layer-controls");
  controls.hidden = !controls.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!controls.hidden));
});
byId("weather-refresh").addEventListener("click", refreshWeather);
byId("public-data-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderPublicDataLinks(byId("public-data-query").value.trim());
});
byId("provider-mode").addEventListener("change", (event) => {
  state.providerMode = event.currentTarget.value === "website" ? "website" : "api";
  try {
    localStorage.setItem("civic-atlas-provider-mode", state.providerMode);
  } catch (error) {
    console.error("Provider access preference could not be saved", error);
  }
  for (const input of document.querySelectorAll(".layer-toggle input[type=checkbox]")) {
    updateLayerOptions(input);
  }
  if (state.localAgencyArea) renderAgencySearchLinks(state.localAgencyArea);
  renderPublicDataLinks(byId("public-data-query").value.trim());
  refreshWeather();
});
byId("weather-map-center").addEventListener("click", () => {
  state.weatherLocation = null;
  state.weatherStation = "";
  byId("weather-place-status").textContent = "Using the map center.";
  refreshWeather();
});
byId("weather-place-form").addEventListener("submit", searchWeatherPlace);
byId("weather-station").addEventListener("change", (event) => {
  state.weatherStation = event.currentTarget.value;
  refreshWeather();
});

function queueWeatherRefresh() {
  window.clearTimeout(queueWeatherRefresh.timeout);
  queueWeatherRefresh.timeout = window.setTimeout(refreshWeather, 400);
}

async function refreshWeather() {
  const layers = [...document.querySelectorAll("[data-weather-layer]:checked")]
    .map((input) => input.dataset.weatherLayer);
  const panel = byId("weather-panel");
  const results = byId("weather-results");
  if (!layers.length) {
    panel.hidden = true;
    results.replaceChildren();
    return;
  }
  panel.hidden = false;
  results.replaceChildren();
  const center = map.getCenter();
  const latitude = (state.weatherLocation?.latitude ?? center.lat).toFixed(4);
  const longitude = (state.weatherLocation?.longitude ?? center.lng).toFixed(4);
  byId("weather-location").textContent =
    `${state.weatherLocation?.label || `Map center ${latitude}, ${longitude}`} · retrieved on request`;
  if (state.providerMode === "website") {
    renderWeatherProviderLinks(layers, latitude, longitude);
    return;
  }
  const loading = document.createElement("p");
  loading.className = "weather-loading";
  loading.textContent = "Loading selected weather layers…";
  results.append(loading);
  try {
    const query = new URLSearchParams({
      lat: latitude,
      lon: longitude,
      layers: layers.join(","),
    });
    if (state.weatherStation && layers.includes("current")) {
      query.set("station", state.weatherStation);
    }
    const response = await fetch(`/api/weather?${query}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 429) {
      throw new Error("Please wait a moment before refreshing weather.");
    }
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Weather request returned HTTP ${response.status}`);
    }
    const data = await response.json();
    renderWeather(data, layers);
  } catch (error) {
    results.replaceChildren();
    const message = document.createElement("p");
    message.className = "weather-loading";
    message.textContent = error.message || "Weather data is unavailable right now.";
    results.append(message);
    console.error("Weather request failed", error);
  }
}

function renderWeatherProviderLinks(layers, latitude, longitude) {
  const results = byId("weather-results");
  results.replaceChildren();
  const weatherUrl = `https://www.weather.gov/${latitude},${longitude}`;
  for (const layer of layers) {
    const card = document.createElement("article");
    card.className = "weather-item";
    const heading = document.createElement("h3");
    heading.textContent = {
      current: "Current conditions",
      forecast: "Forecast",
      alerts: "Weather alerts",
    }[layer];
    const description = document.createElement("p");
    description.textContent = "Open the National Weather Service website for this location.";
    const link = document.createElement("a");
    link.href = weatherUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open NWS website ↗";
    card.append(heading, description, link);
    results.append(card);
  }
  const note = document.createElement("p");
  note.className = "weather-attribution";
  note.textContent = "Website mode opens official provider pages; the NWS website receives the selected map coordinates when opened.";
  results.append(note);
}

async function searchWeatherPlace(event) {
  event.preventDefault();
  const input = byId("weather-place-search");
  const status = byId("weather-place-status");
  const query = input.value.trim();
  if (!query) {
    status.textContent = "Enter a city, airport, or ZIP code.";
    return;
  }
  status.textContent = "Searching for weather location…";
  try {
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 429) throw new Error("Please wait a moment before searching again.");
    if (!response.ok) throw new Error(`Place search returned HTTP ${response.status}`);
    const [place] = await response.json();
    if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) {
      throw new Error("No matching place was found.");
    }
    state.weatherLocation = {
      latitude: Number(place.lat),
      longitude: Number(place.lon),
      label: place.display_name || query,
    };
    if (state.providerMode === "website") {
      map.flyTo({
        center: [state.weatherLocation.longitude, state.weatherLocation.latitude],
        zoom: Math.max(map.getZoom(), 9),
      });
    }
    state.weatherStation = "";
    status.textContent = `Weather location set to ${state.weatherLocation.label}.`;
    refreshWeather();
  } catch (error) {
    status.textContent = error.message || "Weather place search is unavailable.";
    console.error("Weather location search failed", error);
  }
}

function renderWeather(data, layers) {
  const results = byId("weather-results");
  results.replaceChildren();
  const stationPicker = byId("weather-current-options");
  const stationSelect = byId("weather-station");
  const stations = layers.includes("current") ? data.stations || [] : [];
  stationPicker.hidden = stations.length === 0 || state.providerMode !== "api" || !byId("toggle-weather-current").checked;
  stationSelect.disabled = stations.length === 0;
  if (stations.length) {
    stationSelect.replaceChildren();
    for (const station of stations) {
      const option = document.createElement("option");
      option.value = station.id;
      option.textContent = `${station.name} (${station.id})`;
      stationSelect.append(option);
    }
    const selected = data.current?.station || state.weatherStation || stations[0].id;
    stationSelect.value = selected;
    state.weatherStation = stationSelect.value;
  } else {
    state.weatherStation = "";
    stationSelect.replaceChildren(new Option("No stations available", ""));
  }
  for (const layer of layers) {
    const card = document.createElement("article");
    card.className = "weather-item";
    const heading = document.createElement("h3");
    heading.textContent = {
      current: "Current conditions",
      forecast: "Forecast",
      alerts: "Active alerts",
    }[layer];
    card.append(heading);
    if (data.errors?.[layer]) {
      appendWeatherText(card, data.errors[layer]);
      results.append(card);
      continue;
    }
    if (layer === "current") {
      const current = data.current;
      if (!current) appendWeatherText(card, "Current observations are unavailable.");
      else {
        appendWeatherText(card, current.description);
        if (current.temperature?.value !== null && current.temperature?.value !== undefined) {
          appendWeatherText(card, `Temperature: ${formatObservationTemperature(current.temperature)}`);
        }
        if (current.windSpeed?.value !== null && current.windSpeed?.value !== undefined) {
          const direction = current.windDirection?.value;
          appendWeatherText(
            card,
            `Wind: ${current.windSpeed.value} ${unitLabel(current.windSpeed.unitCode)}${direction === null || direction === undefined ? "" : ` · ${direction}°`}`,
          );
        }
        if (current.observedAt) appendWeatherText(card, `Observed ${new Date(current.observedAt).toLocaleString()}`);
        if (current.stationName) appendWeatherText(card, `Observation station: ${current.stationName}`);
        if (current.station) appendWeatherText(card, `Station ID ${current.station}`);
      }
    } else if (layer === "forecast") {
      const forecast = (data.forecast || []).slice(0, Number(byId("weather-forecast-count").value));
      if (!forecast.length) appendWeatherText(card, "No forecast periods were returned.");
      for (const period of forecast) {
        appendWeatherText(
          card,
          `${period.name}: ${period.temperature ?? "—"}°${period.temperatureUnit || ""} · ${period.shortForecast || "Forecast unavailable"} · ${period.windSpeed || ""} ${period.windDirection || ""}`,
        );
      }
    } else if (layer === "alerts") {
      const severityOrder = { Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 };
      const minimumSeverity = byId("weather-alert-severity").value;
      const minimumRank = severityOrder[minimumSeverity] || 0;
      const alerts = (data.alerts || []).filter((alert) =>
        !minimumRank || (severityOrder[alert.severity] || 0) >= minimumRank
      );
      if (!alerts.length) appendWeatherText(card, "No active NWS alerts match this severity filter.");
      for (const alert of alerts) {
        appendWeatherText(card, `${alert.event} · ${alert.severity}`);
        appendWeatherText(card, alert.headline);
        if (alert.expires) appendWeatherText(card, `Expires ${new Date(alert.expires).toLocaleString()}`);
        const url = safeHttpUrl(alert.url);
        if (url) addPopupLink(card, url, "Read alert at NWS ↗");
      }
    }
    results.append(card);
  }
  const note = document.createElement("p");
  note.className = "weather-attribution";
  note.textContent = `Source: National Weather Service · Retrieved ${new Date(data.retrievedAt).toLocaleString()}.`;
  results.append(note);
  addPopupLink(results, "https://www.weather.gov/documentation/services-web-api", "NWS API source & documentation ↗");
}

function appendWeatherText(parent, text) {
  const line = document.createElement("p");
  line.textContent = text;
  parent.append(line);
}

function unitLabel(unitCode) {
  const unit = unitCode?.split(":").at(-1);
  return {
    "km_h-1": "km/h",
    "m_s-1": "m/s",
  }[unit] || unit?.replaceAll("_", " ") || "";
}

function formatObservationTemperature(temperature) {
  const unit = temperature.unitCode || "";
  const value = temperature.value;
  if (unit.includes("degC")) {
    return `${((value * 9) / 5 + 32).toFixed(1)}°F (${value}°C)`;
  }
  if (unit.includes("degF")) return `${value}°F`;
  return `${value} ${unitLabel(unit)}`;
}

byId("locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("Location is not supported by this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      state.userLocation = [coords.longitude, coords.latitude];
      addMapLocation("My GPS location", state.userLocation, "gps");
      renderMarkers();
      showToast("Added your GPS location to this session's map.");
    },
    (error) => showToast(error.code === 1 ? "Location permission was not granted." : "Could not get your location."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
});

byId("search-button").addEventListener("click", searchPlace);
byId("place-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchPlace();
});

async function searchPlace() {
  const query = byId("place-search").value.trim();
  if (!query) return;
  byId("search-status").textContent = "Searching OpenStreetMap…";
  try {
    const response = await fetch(`/api/geocode?${new URLSearchParams({ q: query })}`, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 429) {
      byId("search-status").textContent = "Please wait a moment before searching again.";
      return;
    }
    if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
    const [result] = await response.json();
    if (!result) {
      byId("search-status").textContent = "No matching place found.";
      return;
    }
    map.flyTo({ center: [Number(result.lon), Number(result.lat)], zoom: 9 });
    byId("search-status").textContent = result.display_name;
  } catch (error) {
    byId("search-status").textContent = "Place search is unavailable right now.";
    console.error("Place search failed", error);
  }
}

byId("report-open").addEventListener("click", () => byId("report-dialog").showModal());
byId("report-open-bottom").addEventListener("click", () => byId("report-dialog").showModal());
document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

byId("report-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorNode = byId("report-error");
  errorNode.textContent = "";
  let coordinates = null;
  if (byId("report-location").checked) {
    try {
      coordinates = await getCurrentCoordinates();
    } catch {
      errorNode.textContent = "Location could not be obtained. Uncheck the location option or try again.";
      return;
    }
  }
  const kind = byId("report-kind").value;
  const category = byId("report-kind").selectedOptions[0].textContent;
  const report = {
    id: `local-${Date.now()}`,
    kind: "buildings",
    coordinates,
    name: kind === "building-lead" ? "Community building lead" : "Community field note",
    detail: `${category} · Pending local review`,
    status: "pending",
    reportKind: kind,
    createdAt: new Date().toISOString(),
  };
  state.buildings.push(report);
  try {
    saveReports();
  } catch (error) {
    state.buildings.pop();
    errorNode.textContent = "Could not save this note in browser storage.";
    console.error("Local report could not be saved", error);
    return;
  }
  byId("report-form").reset();
  byId("report-dialog").close();
  renderMarkers();
  showToast("Saved on this device for local review. It is not shared.");
  addReviewItem(report);
});

function getCurrentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation unavailable"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.longitude, coords.latitude]),
      reject,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

function addReviewItem(report) {
  const item = document.createElement("article");
  item.className = "source-row";
  item.dataset.reportId = report.id;
  const text = document.createElement("div");
  text.className = "source-info";
  const title = document.createElement("strong");
  title.textContent = report.name;
  const detail = document.createElement("span");
  const submitted = report.createdAt ? new Date(report.createdAt).toLocaleString() : "Date unavailable";
  detail.textContent = `${report.detail} · Submitted ${submitted} · Local only`;
  const reviewButton = document.createElement("button");
  reviewButton.className = "small-button";
  reviewButton.textContent = "Approve locally";
  reviewButton.type = "button";
  reviewButton.addEventListener("click", () => {
    const saved = state.buildings.find((candidate) => candidate.id === report.id);
    if (!saved) return;
    saved.status = "approved";
    saved.detail = `${report.detail.replace(" · Pending local review", "")} · Locally reviewed`;
    saveReports();
    item.remove();
    if (!byId("source-review-list").childElementCount) reviewSection.hidden = true;
    renderMarkers();
    showToast("Approved for this device’s map only.");
  });
  text.append(title, detail);
  item.append(text, reviewButton);
  reviewSection.hidden = false;
  byId("source-review-list").append(item);
}

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

const reviewSection = document.createElement("section");
reviewSection.className = "sources";
reviewSection.innerHTML = '<div class="section-heading"><div><p class="eyebrow">THIS DEVICE ONLY</p><h2>Reports for review</h2></div></div><div id="source-review-list" class="source-list"></div>';
byId("action-title").closest(".action-card").after(reviewSection);
const pendingReports = state.buildings.filter((item) => item.status === "pending");
reviewSection.hidden = !pendingReports.length;
for (const report of pendingReports) addReviewItem(report);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

fetch("./civic-renewal-atlas.zip", { method: "HEAD" })
  .then((response) => {
    if (response.ok) byId("download-bundle").hidden = false;
  })
  .catch((error) => console.error("Download bundle availability check failed", error));
