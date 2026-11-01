import {
  REFERENCE_LOCATIONS,
  REFERENCE_LOCATION_CATEGORIES,
  referenceMapUrl,
} from "./reference-locations.js";

const byId = (id) => document.getElementById(id);
const searchInput = byId("reference-search");
const categoryInput = byId("reference-category");
const locationSelect = byId("reference-location-select");
const details = byId("reference-location-details");
const status = byId("reference-count");
let matchingLocations = [];

function renderReferenceLocations() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const category = categoryInput.value;
  const previousSelection = locationSelect.value;
  matchingLocations = REFERENCE_LOCATIONS.filter((location) => {
    const matchesCategory = !category || location.kind === category;
    const searchable = `${location.name} ${location.city} ${location.kind}`.toLocaleLowerCase();
    return matchesCategory && (!query || searchable.includes(query));
  });

  locationSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = matchingLocations.length
    ? "Choose a facility…"
    : "No matching facilities";
  locationSelect.append(placeholder);
  for (const location of matchingLocations) {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = `${location.name} — ${categoryLabel(location.kind)} · ${location.city}`;
    locationSelect.append(option);
  }
  locationSelect.value = matchingLocations.some((location) => location.id === previousSelection)
    ? previousSelection
    : "";
  status.textContent = `${matchingLocations.length} of ${REFERENCE_LOCATIONS.length} points · bundled offline`;
  showSelectedLocation();
}

function showSelectedLocation() {
  const location = matchingLocations.find((item) => item.id === locationSelect.value);
  details.hidden = !location;
  if (!location) return;
  byId("reference-location-name").textContent = location.name;
  byId("reference-location-place").textContent = `${categoryLabel(location.kind)} · ${location.city}`;
  byId("reference-location-coordinates").textContent =
    `${location.coordinates[1].toFixed(5)}, ${location.coordinates[0].toFixed(5)}`;
  byId("reference-map-link").href = referenceMapUrl(location);
}

function categoryLabel(kind) {
  return REFERENCE_LOCATION_CATEGORIES.find((category) => category.id === kind)?.label || kind;
}

byId("reference-search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  locationSelect.focus();
});
searchInput.addEventListener("input", renderReferenceLocations);
categoryInput.addEventListener("change", renderReferenceLocations);
locationSelect.addEventListener("change", showSelectedLocation);
byId("reference-center-button").addEventListener("click", () => {
  const location = matchingLocations.find((item) => item.id === locationSelect.value);
  if (location) {
    document.dispatchEvent(new CustomEvent("atlas:show-reference-location", { detail: location }));
  }
});
renderReferenceLocations();
