# Time Clock

A simple employee time-clock app. Employees enter their ID on the home page and clock in/out on a full-screen page designed for phones. An admin panel — unlocked by the admin's employee ID — manages employees.

- **Frontend:** Vite + React + TypeScript (`/`, `/clock`, `/admin`)
- **Backend:** Vercel serverless functions in [api/](api/)
- **Database:** Neon Postgres (schema in [db/schema.sql](db/schema.sql))

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
