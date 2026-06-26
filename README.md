# Qingdao Tutor Match MVP

A runnable React + Vite + Express MVP for Qingdao tutor requests, teacher profiles, map browsing, mutual interest matching, and in-site chat.

## Local run

```bash
npm install
npm run build
npm start
```

Open:

```text
http://localhost:3001
```

## Let other people open it

`localhost` only works on your own computer. To let others open the site, deploy it to a public Node.js hosting platform. See `DEPLOYMENT.md`.

## Structure

```text
.
├─ package.json
├─ render.yaml
├─ DEPLOYMENT.md
├─ scripts/dev.js
├─ server
│  ├─ index.js
│  ├─ store.js
│  └─ data/db.json
└─ src
   ├─ App.jsx
   ├─ api.js
   ├─ components/MapView.jsx
   ├─ main.jsx
   └─ styles.css
```

## Features

- Leaflet + OpenStreetMap map centered on Qingdao. No map key required.
- Blue markers for tutor requests, green markers for teacher profiles.
- Light markers mean open, dark markers mean chatting.
- Filters by type, status, subject, area, and price.
- Parents and teachers can express interest.
- Mutual interest creates a match.
- Matched users can send local persisted chat messages.

## Data

Data is stored in `server/data/db.json` for MVP simplicity.
