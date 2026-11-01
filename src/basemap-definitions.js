export const BASEMAP_DEFINITIONS = {
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
  usgsTopo: {
    label: "USGS topographic map · The National Map",
    source: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "USGS The National Map",
    },
  },
  nasaBlueMarble: {
    label: "NASA Blue Marble · NASA GIBS",
    source: {
      type: "raster",
      tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
      tileSize: 256,
      attribution: "NASA Earth Observations (NASA GIBS)",
      maxzoom: 8,
    },
  },
  noaaNautical: {
    label: "NOAA nautical charts · U.S. waters",
    source: {
      type: "raster",
      tiles: ["https://tileservice.charts.noaa.gov/tiles/50000_1/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "NOAA Office of Coast Survey",
      bounds: [-180, 15, -60, 75],
    },
  },
};