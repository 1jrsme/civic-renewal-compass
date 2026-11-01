export const REFERENCE_LOCATION_CATEGORIES = [
  { id: "airport", label: "Airport" },
  { id: "bus", label: "Bus terminal" },
  { id: "train", label: "Train station" },
  { id: "port", label: "Port" },
  { id: "public-works", label: "Public works" },
];

export const REFERENCE_LOCATIONS = [
  { id: "airport-atl", kind: "airport", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta, GA", coordinates: [-84.4277, 33.6407] },
  { id: "airport-bos", kind: "airport", name: "Boston Logan International Airport", city: "Boston, MA", coordinates: [-71.0096, 42.3656] },
  { id: "airport-ord", kind: "airport", name: "O'Hare International Airport", city: "Chicago, IL", coordinates: [-87.9073, 41.9742] },
  { id: "airport-dfw", kind: "airport", name: "Dallas Fort Worth International Airport", city: "Dallas-Fort Worth, TX", coordinates: [-97.0403, 32.8998] },
  { id: "airport-den", kind: "airport", name: "Denver International Airport", city: "Denver, CO", coordinates: [-104.6737, 39.8561] },
  { id: "airport-lax", kind: "airport", name: "Los Angeles International Airport", city: "Los Angeles, CA", coordinates: [-118.4085, 33.9416] },
  { id: "airport-mia", kind: "airport", name: "Miami International Airport", city: "Miami, FL", coordinates: [-80.2870, 25.7959] },
  { id: "airport-sea", kind: "airport", name: "Seattle-Tacoma International Airport", city: "Seattle, WA", coordinates: [-122.3088, 47.4502] },
  { id: "airport-dca", kind: "airport", name: "Ronald Reagan Washington National Airport", city: "Arlington, VA", coordinates: [-77.0402, 38.8512] },
  { id: "airport-jfk", kind: "airport", name: "John F. Kennedy International Airport", city: "Queens, NY", coordinates: [-73.7781, 40.6413] },
  { id: "airport-tlh", kind: "airport", name: "Tallahassee International Airport", city: "Tallahassee, FL", coordinates: [-84.3503, 30.3965] },
  { id: "bus-nyc", kind: "bus", name: "Port Authority Bus Terminal", city: "New York, NY", coordinates: [-73.9903, 40.7565] },
  { id: "bus-boston", kind: "bus", name: "South Station Bus Terminal", city: "Boston, MA", coordinates: [-71.0552, 42.3521] },
  { id: "bus-dc", kind: "bus", name: "Union Station Bus Deck", city: "Washington, DC", coordinates: [-77.0061, 38.8977] },
  { id: "bus-la", kind: "bus", name: "Union Station Patsaouras Bus Plaza", city: "Los Angeles, CA", coordinates: [-118.2365, 34.0562] },
  { id: "bus-sf", kind: "bus", name: "Salesforce Transit Center", city: "San Francisco, CA", coordinates: [-122.3969, 37.7897] },
  { id: "bus-chicago", kind: "bus", name: "Chicago Intercity Bus Station", city: "Chicago, IL", coordinates: [-87.6440, 41.8740] },
  { id: "train-nyc", kind: "train", name: "Moynihan Train Hall / Penn Station", city: "New York, NY", coordinates: [-73.9935, 40.7506] },
  { id: "train-boston", kind: "train", name: "South Station", city: "Boston, MA", coordinates: [-71.0552, 42.3522] },
  { id: "train-dc", kind: "train", name: "Union Station", city: "Washington, DC", coordinates: [-77.0064, 38.8977] },
  { id: "train-chicago", kind: "train", name: "Union Station", city: "Chicago, IL", coordinates: [-87.6405, 41.8786] },
  { id: "train-la", kind: "train", name: "Union Station", city: "Los Angeles, CA", coordinates: [-118.2365, 34.0562] },
  { id: "train-seattle", kind: "train", name: "King Street Station", city: "Seattle, WA", coordinates: [-122.3295, 47.5985] },
  { id: "train-portland", kind: "train", name: "Union Station", city: "Portland, OR", coordinates: [-122.6765, 45.5280] },
  { id: "train-philadelphia", kind: "train", name: "30th Street Station", city: "Philadelphia, PA", coordinates: [-75.1820, 39.9557] },
  { id: "port-los-angeles", kind: "port", name: "Port of Los Angeles", city: "San Pedro, CA", coordinates: [-118.2640, 33.7361] },
  { id: "port-long-beach", kind: "port", name: "Port of Long Beach", city: "Long Beach, CA", coordinates: [-118.2165, 33.7545] },
  { id: "port-new-york", kind: "port", name: "Port Newark", city: "Newark, NJ", coordinates: [-74.1502, 40.6840] },
  { id: "port-houston", kind: "port", name: "Port Houston - Barbours Cut Terminal", city: "La Porte, TX", coordinates: [-95.0120, 29.6200] },
  { id: "port-miami", kind: "port", name: "PortMiami", city: "Miami, FL", coordinates: [-80.1770, 25.7780] },
  { id: "port-savannah", kind: "port", name: "Port of Savannah - Garden City Terminal", city: "Savannah, GA", coordinates: [-81.1470, 32.1410] },
  { id: "port-baltimore", kind: "port", name: "Port of Baltimore - Seagirt Marine Terminal", city: "Baltimore, MD", coordinates: [-76.5780, 39.2630] },
  { id: "works-la", kind: "public-works", name: "Los Angeles Public Works headquarters", city: "Los Angeles, CA", coordinates: [-118.2570, 34.0400] },
  { id: "works-sf", kind: "public-works", name: "San Francisco Public Works", city: "San Francisco, CA", coordinates: [-122.4180, 37.7750] },
  { id: "works-boston", kind: "public-works", name: "Boston Public Works Department", city: "Boston, MA", coordinates: [-71.0580, 42.3600] },
  { id: "works-chicago", kind: "public-works", name: "Chicago Department of Streets and Sanitation", city: "Chicago, IL", coordinates: [-87.6320, 41.8830] },
  { id: "works-dc", kind: "public-works", name: "DC Department of Public Works", city: "Washington, DC", coordinates: [-77.0320, 38.9170] },
  { id: "works-seattle", kind: "public-works", name: "Seattle Public Utilities", city: "Seattle, WA", coordinates: [-122.3321, 47.6062] },
  { id: "works-houston", kind: "public-works", name: "Houston Public Works", city: "Houston, TX", coordinates: [-95.3650, 29.7600] },
];

export const STARTING_LOCATIONS = [
  {
    id: "tallahassee-city",
    group: "local",
    name: "Tallahassee city",
    search: "Tallahassee, Florida",
    coordinates: [-84.2807, 30.4383],
    zoom: 10,
  },
  {
    id: "leon-county",
    group: "local",
    name: "Leon County",
    search: "Leon County, Florida",
    coordinates: [-84.28, 30.49],
    zoom: 9,
  },
  {
    id: "tallahassee-airport",
    group: "local",
    name: "Tallahassee International Airport",
    search: "Tallahassee International Airport, Florida",
    coordinates: [-84.3503, 30.3965],
    zoom: 13,
  },
  ...REFERENCE_LOCATIONS
    .filter((location) => location.kind === "airport" && location.id !== "airport-tlh")
    .map((location) => ({
      id: location.id,
      group: "airport",
      name: location.name,
      search: `${location.name}, ${location.city}`,
      coordinates: location.coordinates,
      zoom: 11,
    })),
];

export function getStartingLocation(id) {
  return STARTING_LOCATIONS.find((location) => location.id === id) || STARTING_LOCATIONS[0];
}

export function referenceMapUrl(location) {
  const [longitude, latitude] = location.coordinates;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
}
