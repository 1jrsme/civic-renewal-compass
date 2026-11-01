# Civic Renewal Compass

The standalone, mobile-friendly compass and spatial tools from Civic Renewal Atlas. Open `compass.html` for the compass experience; it includes orientation and measurement tools, celestial and ISS displays, map previews, and synchronized settings when opened alongside the Atlas on the same origin.

## Run locally

Requires Node.js 18+ and npm. No dependency installation is needed.

```sh
npm test
npm start
```

Open the local URL printed by the server followed by `/compass.html` (for example, `http://localhost:3000/compass.html`). The server provides the app's public-data proxy endpoints. Some maps and live data require an internet connection. For phone testing, use an HTTPS deployment; browser geolocation, device sensors, and PWA installation are restricted to secure contexts.

This repository starts from the shared Atlas/Compass source snapshot to keep the standalone page's current modules, server endpoints, tests, and setup working. `compass.html` is the standalone entry point; extracting shared modules and API services into a smaller Compass-only codebase remains a future planning item.

## Important limitations

- Compass bearings and offline celestial/orbital calculations are approximate and are not for navigation or safety-critical use.
- Live ISS, time-zone, map, and other public data depend on third-party services and their availability and terms.
- `BroadcastChannel` synchronization is limited to applications sharing the same browser origin; separate deployments do not sync.
- Core operation does not require API keys. Review the Atlas documentation for source-specific access, coverage, and rate-limit details.

## Related projects

- [Civic Renewal Atlas](https://github.com/1jrsme/civic-renewal-atlas)
- [Civic Renewal planning](https://github.com/1jrsme/civic-renewal-planning)
