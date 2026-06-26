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
鈹溾攢 package.json
鈹溾攢 render.yaml
鈹溾攢 DEPLOYMENT.md
鈹溾攢 scripts/dev.js
鈹溾攢 server
鈹? 鈹溾攢 index.js
鈹? 鈹溾攢 store.js
鈹? 鈹斺攢 data/db.json
鈹斺攢 src
   鈹溾攢 App.jsx
   鈹溾攢 api.js
   鈹溾攢 components/MapView.jsx
   鈹溾攢 main.jsx
   鈹斺攢 styles.css
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

## Real multi-user mode

The backend now supports PostgreSQL through `DATABASE_URL`. Deploy the full-stack app to Render/Railway and set `DATABASE_URL` to make data shared across users. Without `DATABASE_URL`, local development uses `server/data/db.json`.