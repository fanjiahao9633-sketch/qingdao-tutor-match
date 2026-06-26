# Public Deployment Guide

This project is ready to deploy as a single Node.js web service.

## How it runs

- `npm run build` builds the React frontend into `dist/`.
- `npm start` starts Express.
- Express serves both the API and the built frontend.

## Generic deployment settings

Use these settings on Render, Railway, or any Node.js hosting platform:

```text
Build Command: npm install && npm run build
Start Command: npm start
Port: use the platform-provided PORT environment variable
```

After deployment, the platform will give you a public URL. Other people can open that URL directly.

## Recommended flow

1. Push this project to GitHub.
2. Create a new Node.js Web Service on Render/Railway.
3. Connect the GitHub repository.
4. Use the build and start commands above.
5. Share the generated public URL.

## Important data note

The MVP stores data in `server/data/db.json`. This is fine for local demos, but many free hosting platforms reset local files after redeploys or restarts. For real public use, move data to PostgreSQL, SQLite with persistent disk, Supabase, Neon, or Railway PostgreSQL.

## Temporary sharing option

For a short demo, you can also expose local port `3001` using a tunneling tool. This is only suitable for temporary demos, not real user data.
