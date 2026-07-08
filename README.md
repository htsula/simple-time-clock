# Time Clock

A simple employee time-clock app. Employees enter their ID on the home page and clock in/out on a full-screen page designed for phones. An admin panel — unlocked by the admin's employee ID — manages employees.

- **Frontend:** Vite + React + TypeScript (`/`, `/clock`, `/admin`)
- **Backend:** Vercel serverless functions in [api/](api/), or a standalone Node server ([server.mjs](server.mjs)) for self-hosting
- **Database:** Neon Postgres (schema in [db/schema.sql](db/schema.sql)) when deployed on Vercel, or embedded persistent [PGlite](https://pglite.dev/) when self-hosted (Docker or `npm start`)

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Enter an employee ID; submits to `/clock?employee=<id>` |
| `/clock` | Full-screen clock in/out button; green when clocked in, red when clocked out. Redirects home if the ID is missing, unknown, or inactive |
| `/admin` | Log in with the admin's employee ID, then employee management (add, deactivate, activate, permanently delete) |

## API

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /api/status?employee=<id>` | — | `{ name, status: "IN"\|"OUT", time }`; 404 for unknown/inactive IDs |
| `POST /api/clock` `{ employeeId, action }` | — | Clocks in/out using the server clock; 409 if the action doesn't match the current state |
| `POST /api/admin/login` `{ employeeId }` | — | Returns a session token (valid until logout). Accepts only the admin's employee ID; while the database has no admin yet, any ID logs in (bootstrap) |
| `POST /api/admin/logout` | Bearer | Invalidates the token |
| `GET /api/admin/employees` | Bearer | List all employees |
| `POST /api/admin/employees` `{ name, id? }` | Bearer | Add an employee; generates a random unused 8-digit ID when `id` is omitted. The first employee added becomes the admin |
| `PATCH /api/admin/employees/:id` `{ active }` | Bearer | Activate/deactivate |
| `DELETE /api/admin/employees/:id` | Bearer | Permanently delete the employee and all their shifts. The admin cannot be deleted |

## Deploying to Vercel

1. Push this repo to GitHub and import it into Vercel (the Vite preset is auto-detected).
2. In the project's **Storage** tab, create/attach a **Neon** Postgres database — this injects `DATABASE_URL` into the project.
3. Deploy, then apply the schema once (see below).
4. Open `/admin` — while the database is empty, any ID logs you in. Add yourself first: you become the admin, and from then on only your employee ID opens the admin panel.

## Self-hosting with Docker

No Vercel account and no external database needed — the container runs the app with an embedded, persistent Postgres ([PGlite](https://pglite.dev/)) and applies [db/schema.sql](db/schema.sql) automatically on startup.

```sh
docker build -t time-clock .
docker run -d --name time-clock -p 3000:3000 -v time-clock-data:/data --restart unless-stopped time-clock
```

Then open http://localhost:3000.

> [!WARNING]
> On first run the database is empty, so `/admin` is in **bootstrap mode**: any employee ID logs in until the first employee is added. That first employee becomes the permanent admin. If the server is reachable by anyone else, open `/admin` and add yourself immediately after starting the container.

- **Data:** stored in the named volume `time-clock-data`, mounted at `/data` (configurable via the `PGLITE_DATA_DIR` env var). Back up the volume to back up all data.
- **Updating:** `git pull`, then `docker build -t time-clock .` again, then `docker rm -f time-clock` and re-run the `docker run` command above — data survives because it lives in the volume, not the container.
- **Changing the port:** the app listens on `3000` inside the container (overridable via `PORT`); map it to a different host port with e.g. `-p 8080:3000`.
- **Exposing it beyond your local network:** put it behind a reverse proxy (Caddy, nginx, Traefik, etc.) with HTTPS. The admin session is a bearer token, so it should not travel over plain HTTP outside a trusted network.

### Without Docker

`npm start` runs the same standalone server (`node server.mjs`) directly, without a container. Requires Node 24+ and a production build first:

```sh
npm install
npm run build
npm start   # serves on :3000, data in ./data
```

Data defaults to `./data` (configurable via `PGLITE_DATA_DIR`); the port defaults to `3000` (configurable via `PORT`).

## Local development

### Without a Vercel account (in-memory database)

Runs the real `api/` handlers against an in-memory Postgres ([PGlite](https://pglite.dev/)). Data resets when the API process restarts (so each restart returns to the empty-database bootstrap state where any ID logs into `/admin`).

```sh
npm install
npm run dev:api   # API on :3000
npm run dev       # Vite on :5173, proxies /api to :3000 (separate terminal)
```

### Against the real Vercel project + Neon database

```sh
npm i -g vercel
vercel link                    # link to the Vercel project
vercel env pull .env.local     # pulls DATABASE_URL
npm run db:setup               # applies db/schema.sql (idempotent)
vercel dev                     # runs Vite + the /api functions together
```
