# Time Clock

A simple employee time-clock app. Employees enter their ID and clock in/out on a full-screen page designed for phones. An admin panel manages employees.

## Getting started

### Docker (recommended)

Runs fully self-contained with an embedded, persistent Postgres ([PGlite](https://pglite.dev/)) — no external database needed.

```sh
git clone https://github.com/htsula/simple-time-clock.git && cd simple-time-clock
docker compose up -d --build
```

Open http://localhost:3000. Data persists in the `time-clock-data` volume and survives updates; schema migrations apply automatically on start. To update, `git pull` and re-run the compose command.

### Without Docker

Requires Node 24+.

```sh
npm install
npm run build
npm start
```

Open http://localhost:3000. Data persists in `./data`; schema migrations apply automatically on start.

### Vercel

1. Push this repo to GitHub and import it into Vercel (the Vite preset is auto-detected).
2. In the project's **Storage** tab, create/attach a **Neon** Postgres database — this injects `DATABASE_URL`.
3. Deploy, then apply the database migrations:

```sh
npm i -g vercel
vercel link
vercel env pull .env.local
npm run db:setup
```

Re-run `npm run db:setup` after pulling an update that adds a migration. It applies only the migrations not yet run and is safe to run repeatedly. (Self-hosted deployments do this automatically on start.)

### Database migrations

Schema changes live in `db/migrations/NNN_name.sql` and run once each, in filename order, tracked in a `schema_migrations` table. To change the schema, add the next numbered file (e.g. `002_add_column.sql`) — never edit an already-released migration. Write each migration to be idempotent (`IF NOT EXISTS` / `IF EXISTS` / guards) so a re-run is a no-op.

## Usage

1. Go to `/admin` and add yourself as the first employee. Do this right away — until the first employee exists, **any** ID opens the admin panel, and the first employee added becomes the permanent admin.
2. Add your other employees. If you already have an ID system for them, use those IDs; if not, leave the ID blank for a randomly generated one.

### Employees

1. Go to the home page and enter your ID.
2. While on the clock page, save that page to your phone's home screen for easy access.
3. Clock in/out from that home screen shortcut.

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
| `GET /api/admin/shifts?employee=&from=&to=` | Bearer | List shifts (newest first) with employee names. All filters optional; `from`/`to` filter by clock-in time, `from` inclusive and `to` exclusive |
| `PATCH /api/admin/shifts/:id` `{ clockIn?, clockOut? }` | Bearer | Edit a shift's times; `clockOut: null` reopens the shift. 409 if the employee already has an open shift |
| `DELETE /api/admin/shifts/:id` | Bearer | Permanently delete the shift |
| `GET /api/admin/reports?from=&to=` | Bearer | Totals and per-employee shift counts and worked seconds for shifts starting in the range; open shifts count their elapsed time so far |
