# Find Radar redesign

This build replaces the old Lost & Found UI with a full-screen radar workspace and fixes the map runtime setup.

Highlights:
- MapLibre uses named exports (compatible with MapLibre GL 6.x + Turbopack).
- Dark CARTO/OpenStreetMap raster basemap with roads, places and street labels.
- Critical MapLibre layout CSS is bundled in globals.css as a fallback, so the canvas still lays out if the CDN stylesheet is delayed.
- World view, fit-signals, geolocation, report markers, pin placement, report drawer and match scoring.
- LocalStorage persistence for user-created reports.
- Responsive desktop/mobile layout.

Run:
```
npm install
npm run build
npm run dev
```
