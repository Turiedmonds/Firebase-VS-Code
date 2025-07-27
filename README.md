# SHEAR iQ Tally Processor

A simple Progressive Web App (PWA) for recording shearing tallies. The app tracks runs, sheds staff hours and sheep type totals and lets you export the results.

## Setup

1. Clone this repository.
2. Serve the files in the `public/` folder with any static web server. For example:
   - `npx serve public`
   - `python3 -m http.server public`
   The service worker requires the app to be served over `http://` or `https://` for full functionality.

Open **tally.html** in your browser to use the app. You must sign in through Firebase Authentication before you can access it.

## Running Offline

The first time you load the app while online, its files are cached by the service worker. After that you can open it offline from the same device.

## Build

There is no build step. All files live inside the `public/` folder, so just serve that directory as described above.

## Firestore Structure

Each contractor document has a `users` subcollection used to manage worker
accounts. Documents in `contractors/{contractorId}/users` contain:

- `email` – the worker's login email
- `name` – their display name
- `role` – permissions like `admin`, `shed_hand` or `presser`

After sign‑in the app confirms the current email exists in that subcollection
and signs out if it does not.

## PWA Features

- **Installable**: Supported browsers will offer an install prompt.
- **Offline support**: `service-worker.js` caches the core files so the app runs without internet once loaded.
- **Home screen icon**: Provided via `manifest.json` with `icon-192.png`.

## Features

- Save and load sessions, including a backup and a **Return to Today's Session** option.
- View-only mode protected by a contractor PIN.
- Edit tallies manually and configure runs in a modal window.
- Accurate hours worked with breaks for both **8‑** and **9‑hour** days.
- Sheep type totals with times shown as `xh ym`.
- Shed staff tracking.
- Dark mode design with SHEΔR iQ branding.

## Export Options

Click **Export Data** to choose an output format:

- **CSV** – includes shearers, sheep type totals, shed staff and other metadata. Times are formatted as `xh ym`.
- **Excel** – creates a formatted `.xlsx` file with the same details as the CSV (requires browser support for `xlsx.full.min.js`).
