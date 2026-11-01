export const EPA_URL =
  "https://data.epa.gov/dmapservice/sems.envirofacts_site/primary_latitude_decimal_val/greaterthan/0/and/archived_ind/equals/N/1:1000/JSON";
export const EPA_SOURCE = "https://www.epa.gov/enviro/envirofacts-data-service-api";

function validCoordinates(latitude, longitude) {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    String(latitude).trim() === "" ||
    String(longitude).trim() === ""
  ) return null;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

export function normalizeEpaRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    const coordinates = validCoordinates(
      record.primary_latitude_decimal_val,
      record.primary_longitude_decimal_val,
    );
    if (!coordinates) return [];
    const id = record.site_id || record.epa_id;
    return [{
      id: `epa-${id || coordinates.join("-")}`,
      kind: "epa",
      coordinates,
      name: record.name || "EPA cleanup site",
      statusName: record.npl_status_name || "Unknown",
      detail: [
        record.street_addr_txt,
        [record.city_name, record.fk_ref_state_code, record.zip_code].filter(Boolean).join(" "),
        record.npl_status_name,
      ]
        .filter(Boolean)
        .join(" · "),
      source: EPA_SOURCE,
      sourceId: id || "",
      date: record.non_npl_status_date || record.archived_date || null,
    }];
  });
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function retrievedLabel(date = new Date()) {
  return `Retrieved ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}
