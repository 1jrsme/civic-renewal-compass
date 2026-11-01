const CSV_COLUMNS = [
  "name",
  "kind",
  "longitude",
  "latitude",
  "status",
  "detail",
  "source",
  "source_id",
  "reference",
];

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const isNumber = typeof value === "number" && Number.isFinite(value);
  const safeText = !isNumber && /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function createMapCsv(features) {
  const rows = features.map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const properties = feature.properties || {};
    return [
      properties.name,
      properties.kind,
      longitude,
      latitude,
      properties.statusName,
      properties.detail,
      properties.source,
      properties.sourceId,
      properties.reference,
    ].map(csvCell).join(",");
  });
  return [CSV_COLUMNS.join(","), ...rows, ""].join("\r\n");
}
