export const COMMUNITY_PROGRAMS = {
  federal: {
    label: "Federal",
    resources: [
      { name: "USA.gov benefit finder", description: "Find federal benefit and assistance programs.", url: "https://www.usa.gov/benefit-finder", domain: "usa.gov" },
      { name: "Veterans Affairs", description: "Explore VA benefits, health care, and services.", url: "https://www.va.gov/", domain: "va.gov" },
      { name: "FEMA disaster assistance", description: "Check disaster assistance and recovery programs.", url: "https://www.disasterassistance.gov/", domain: "disasterassistance.gov" },
      { name: "HUD housing resources", description: "Find housing assistance and HUD programs.", url: "https://www.hud.gov/topics/rental_assistance", domain: "hud.gov" },
      { name: "USDA food and nutrition programs", description: "Explore food assistance and nutrition programs.", url: "https://www.fns.usda.gov/programs", domain: "fns.usda.gov" },
      { name: "Federal jobs and training", description: "Search federal employment, apprenticeships, and workforce resources.", url: "https://www.careeronestop.org/", domain: "careeronestop.org" },
    ],
  },
  state: {
    label: "State · Florida",
    resources: [
      { name: "MyFlorida", description: "Florida state government services and agencies.", url: "https://www.myflorida.com/", domain: "myflorida.com" },
      { name: "Florida ACCESS", description: "Florida public assistance applications and account services.", url: "https://myaccess.myflfamilies.com/", domain: "myflfamilies.com" },
      { name: "FloridaCommerce", description: "Employment, workforce, and economic opportunity programs.", url: "https://www.floridajobs.org/", domain: "floridajobs.org" },
      { name: "Florida Department of Environmental Protection", description: "State environmental programs, parks, and cleanup resources.", url: "https://floridadep.gov/", domain: "floridadep.gov" },
    ],
  },
  county: {
    label: "County · Leon County",
    resources: [
      { name: "Leon County government", description: "County services, community assistance, health, housing, and public works.", url: "https://www.leoncountyfl.gov/", domain: "leoncountyfl.gov" },
      { name: "Leon County public library", description: "Library locations, programs, and community resources.", url: "https://www.leoncountyfl.gov/Library", domain: "leoncountyfl.gov" },
    ],
  },
  city: {
    label: "City · Tallahassee",
    resources: [
      { name: "City of Tallahassee", description: "City services, utilities, public works, parks, and community programs.", url: "https://www.talgov.com/", domain: "talgov.com" },
      { name: "Tallahassee community services", description: "Search city programs, neighborhood services, and assistance.", url: "https://www.talgov.com/Departments", domain: "talgov.com" },
    ],
  },
  other: {
    label: "Other · tribal, regional, and community",
    resources: [
      { name: "211 community services", description: "Find local referrals for housing, food, health, and social services; availability varies.", url: "https://www.211.org/", domain: "211.org" },
      { name: "Tribal and Native services", description: "Find official tribal, regional, and federal Indian Affairs resources.", url: "https://www.bia.gov/", domain: "bia.gov" },
      { name: "Community organizations", description: "Search for local nonprofit and regional assistance programs.", url: "https://www.usa.gov/agency-index", domain: "usa.gov" },
    ],
  },
};

export function buildCommunityProgramSearchUrl(resource, area, topic = "") {
  const searchTerms = [topic.trim(), area.trim(), "program assistance services"].filter(Boolean).join(" ");
  const query = `site:${resource.domain} ${searchTerms}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
