# SHEAR iQ Tally Processor

A simple Progressive Web App (PWA) used to record shearing tallies. It allows you to track shearer runs, shed staff hours and sheep type totals. Data can be exported as CSV or Excel.

## Setup

1. Clone this repository.
2. Serve the files using any static web server. Examples:
   - `npx serve` (Node.js)
   - `python3 -m http.server`
   The service worker requires the app to be served via `http://` or `https://` for full functionality.

## Running Offline

When the app is first opened while online, it caches its files using a service worker. After that initial visit the app can be loaded while offline from the same device.

## Build

There is no build step. All files are already in `index.html`, `main.js` and related assets. Simply serve these files as described above.

## PWA Features

- **Installable**: Browsers that support PWAs will offer an install prompt.
- **Offline support**: `service-worker.js` caches the core files so the app runs without internet once loaded.
- **Home screen icon**: Provided via `manifest.json` with `icon-192.png`.

## Export Options

Click **Export Data** to choose an output format:

**CSV** – generates a summary CSV with station details, sheep type totals per shearer and shed staff hours.
- **Excel** – generates a formatted `.xlsx` summary (requires browser support for `xlsx.full.min.js`).

<!-- Trigger deploy -->
