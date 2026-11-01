# Civic Renewal Compass

The standalone, mobile-friendly compass and spatial tools from Civic Renewal Atlas. Open `compass.html` for the compass experience; it includes orientation and measurement tools, celestial and ISS displays, map previews, and synchronized settings when opened alongside the Atlas on the same origin.

## Run locally

Requires Node.js 18+ and npm. No dependency installation is needed.

```sh
npm test
npm start
```

Open the local URL printed by the server followed by `/compass.html` (for example, `http://localhost:3000/compass.html`). For the new motion-focused prototype, open `/gyro.html` to view the gyroscope display. The map selectors include OpenTopoMap, USGS topographic tiles, NASA Blue Marble imagery, and NOAA nautical charts in addition to the existing street and satellite maps. These public services require an internet connection, have provider-specific coverage and usage policies, and may be unavailable or rate-limited. NOAA chart tiles are intended for marine areas and are not a navigation or safety-critical source. For phone testing, use an HTTPS deployment; browser geolocation, device sensors, and PWA installation are restricted to secure contexts.

This repository starts from the shared Atlas/Compass source snapshot to keep the standalone page's current modules, server endpoints, tests, and setup working. `compass.html` is the standalone entry point; extracting shared modules and API services into a smaller Compass-only codebase remains a future planning item. The `gyro.html` page extends the same spatial-tool pattern with a motion, tilt, and stability dashboard. Choose **Use compass heading** on the gyroscope page to receive heading updates from the Atlas or compass window in the same browser origin; pitch and roll remain manual or can come from device orientation.

## Important limitations

- Compass bearings and offline celestial/orbital calculations are approximate and are not for navigation or safety-critical use.
- Live ISS, time-zone, map, and other public data depend on third-party services and their availability and terms.
- `BroadcastChannel` synchronization is limited to applications sharing the same browser origin; separate deployments do not sync.
- Core operation does not require API keys. Review the Atlas documentation for source-specific access, coverage, and rate-limit details.

## Related projects

- [Civic Renewal Atlas](https://github.com/1jrsme/civic-renewal-atlas)
- [Civic Renewal planning](https://github.com/1jrsme/civic-renewal-planning)
