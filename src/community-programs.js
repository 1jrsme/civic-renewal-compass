import {
  COMMUNITY_PROGRAMS,
  buildCommunityProgramSearchUrl,
} from "./program-directory.js";

const byId = (id) => document.getElementById(id);
const form = byId("community-program-form");
const levelSelect = byId("program-level");
const areaInput = byId("program-area");
const topicInput = byId("program-topic");
const results = byId("community-program-results");
const resultCount = byId("program-result-count");
const federalProgramPicker = byId("federal-program-picker");
const federalProgramOptions = byId("federal-program-options");
const selectedFederalPrograms = new Set(
  COMMUNITY_PROGRAMS.federal.resources.map((resource) => resource.domain),
);

function renderFederalProgramOptions() {
  federalProgramOptions.replaceChildren();
  for (const resource of COMMUNITY_PROGRAMS.federal.resources) {
    const label = document.createElement("label");
    label.className = "federal-program-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = resource.domain;
    checkbox.checked = selectedFederalPrograms.has(resource.domain);
    checkbox.setAttribute("aria-label", resource.name);
    const name = document.createElement("span");
    name.textContent = resource.name;
    label.append(checkbox, name);
    federalProgramOptions.append(label);
  }
}

function renderCommunityPrograms() {
  const level = COMMUNITY_PROGRAMS[levelSelect.value];
  if (!level) {
    throw new Error(`Unknown community program level: ${levelSelect.value}`);
  }
  const area = areaInput.value.trim();
  const topic = topicInput.value.trim();
  results.replaceChildren();

  const isFederal = levelSelect.value === "federal";
  federalProgramPicker.hidden = !isFederal;
  const visibleResources = isFederal
    ? level.resources.filter((resource) => selectedFederalPrograms.has(resource.domain))
    : level.resources;
  byId("federal-program-selection-count").textContent =
    `${selectedFederalPrograms.size} selected`;

  for (const resource of visibleResources) {
    const item = document.createElement("article");
    item.className = "community-program-item";
    const title = document.createElement("strong");
    title.textContent = resource.name;
    const description = document.createElement("p");
    description.textContent = resource.description;
    const links = document.createElement("div");
    links.className = "community-program-links";

    const officialLink = document.createElement("a");
    officialLink.href = resource.url;
    officialLink.target = "_blank";
    officialLink.rel = "noreferrer";
    officialLink.textContent = "Open official starting point ↗";

    const searchLink = document.createElement("a");
    searchLink.href = buildCommunityProgramSearchUrl(resource, area, topic);
    searchLink.target = "_blank";
    searchLink.rel = "noreferrer";
    searchLink.textContent = "Search this site for programs ↗";

    links.append(officialLink, searchLink);
    item.append(title, description, links);
    results.append(item);
  }
  if (visibleResources.length === 0) {
    const empty = document.createElement("p");
    empty.className = "community-program-empty";
    empty.textContent = "No federal programs selected. Open the list above and check the programs you want to see.";
    results.append(empty);
  }
  resultCount.textContent = `${visibleResources.length} ${level.label} starting points`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderCommunityPrograms();
});
levelSelect.addEventListener("change", renderCommunityPrograms);
areaInput.addEventListener("input", renderCommunityPrograms);
topicInput.addEventListener("input", renderCommunityPrograms);
federalProgramOptions.addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  if (!checkbox) return;
  if (checkbox.checked) selectedFederalPrograms.add(checkbox.value);
  else selectedFederalPrograms.delete(checkbox.value);
  renderCommunityPrograms();
});
byId("federal-program-select-all").addEventListener("click", () => {
  for (const resource of COMMUNITY_PROGRAMS.federal.resources) {
    selectedFederalPrograms.add(resource.domain);
  }
  renderFederalProgramOptions();
  renderCommunityPrograms();
});
byId("federal-program-clear").addEventListener("click", () => {
  selectedFederalPrograms.clear();
  renderFederalProgramOptions();
  renderCommunityPrograms();
});
renderFederalProgramOptions();
renderCommunityPrograms();
