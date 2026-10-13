# Vivo VMS + Boardrooms

Visitor Management System **and** internal boardroom booking, running as a
**single service** (Express serves both the API and the frontend).

- **Kiosk** (`/`) — public visitor self check-in. Visitors pick the employee
  they're here to see from a searchable list.
- **App** (`/app`) — the single logged-in app (React). Visitor management
  (dashboard, visitor log, reports, users & invites) **and** boardroom
  booking, in one role-gated interface. The old `/admin` and `/boardrooms`
  URLs redirect here.

---

## Project layout

```
vms/
├── index.js                 # Express: API + static frontend (single service)
├── db.js                    # Postgres pool (Supabase). SSL off locally via PGSSL=off
├── render.yaml              # Render Blueprint — one web service
├── create-admin.js          # One-off: create the first superadmin
├── controllers/
│   ├── visitor.controller.js    # check-in / checkout / today  (+ host_user_id)
│   ├── admin.controller.js      # login, dashboard, users, invitations
│   ├── staff.controller.js      # kiosk directory + "my visitors"
│   ├── room.controller.js       # rooms + derived live status
│   └── booking.controller.js    # bookings + conflict/grace/capacity checks
├── routes/                  # visitor / admin / staff / boardroom
├── middleware/auth.middleware.js
├── services/storage.service.js  # Supabase Storage (photos/signatures)
├── utils/logger.js
├── db/
│   ├── init.sql             # base tables (v10)
│   ├── migrate_v11.sql      # rooms, bookings, invitations, host link  ← RUN THIS
│   └── admin_seed.sql
└── public/
    ├── index.html           # kiosk (vanilla)
    ├── admin.html           # admin dashboard (vanilla)
    ├── accept-invite.html   # invited users set their password here
    └── boardrooms/          # built React app (Vite output — git-ignored)

frontend/                    # React (Vite) source for the boardrooms app
├── index.html
├── vite.config.js           # base '/boardrooms/', builds into ../public/boardrooms
└── src/
    ├── main.jsx  App.jsx  api.js  util.js  styles.css
    └── views/  Login · Rooms · BookRoom · MyVisitors · MyBookings · RoomAdmin · InviteUser
```

---

## Testing locally

You need Node 18+ and a Postgres database. Pick one database option below.

```bash
# 1. install deps and build the boardrooms app
npm install
cd frontend && npm install && npm run build && cd ..

# 2. create your .env  (see options below)
cp .env.example .env

# 3. run the migrations against your DB (init → v11 → v12 → v13)
# 4. create the first superadmin
node create-admin.js          # admin@vivofashiongroup.com / Admin@Vivo2024

# 5. start
node index.js                 # http://localhost:3000
```

Then open:
- `http://localhost:3000/` — kiosk (visitor check-in)
- `http://localhost:3000/app` — the unified app (dashboard, visitor log,
  rooms, bookings, reports, users) — log in to enter. `/admin` and
  `/boardrooms` redirect here.

**Database option A — use your Supabase (simplest).** Point `DATABASE_URL` at
your Supabase Session-mode pooler URL and leave SSL on (don't set `PGSSL`).
Run the four SQL files in the Supabase SQL Editor. Photo/signature upload also
works because Supabase Storage is configured.

**Database option B — local Postgres.** Create a DB and run the SQL with `psql`:

```bash
createdb vms
psql vms -f db/init.sql
psql vms -f db/migrate_v11.sql
psql vms -f db/migrate_v12.sql
psql vms -f db/migrate_v13.sql
```

`.env` for local Postgres:
```
DATABASE_URL=postgresql://localhost:5432/vms
PGSSL=off
JWT_SECRET=any-long-random-string
APP_URL=http://localhost:3000
```
With a local DB and no Supabase keys, everything works except visitor photo/
signature upload, which safely no-ops (check-in still succeeds).

**Try the full flow:** log in at `/admin` or `/boardrooms` → invite yourself as
`staff` (copy the invite link, set a password) → open the kiosk at `/` and check
in a visitor, picking your name as the host → back in `/boardrooms` you'll see
the visitor under *My visitors* and a *Notifications* alert → book a room and add
the visitor as an attendee.

**Frontend hot-reload (optional):** instead of rebuilding after each change, run
`node index.js` in one terminal and `cd frontend && npm run dev` in another, then
use `http://localhost:5173/boardrooms/` — API calls proxy to :3000 automatically.

---

## Frontend (React) — the boardrooms app

The `/boardrooms` app is a Vite + React project in `frontend/`. It builds into
`public/boardrooms/`, which the single service serves. It shares the login
token with `/admin`, so the same session works across both.

```bash
cd frontend
npm install
npm run dev        # local dev server with hot reload
npm run build      # outputs to ../public/boardrooms (what the backend serves)
```

The kiosk (`/`) and admin (`/admin`) pages stay vanilla HTML for now. On Render,
the build runs automatically — `render.yaml` already installs and builds the
frontend as part of the deploy.

---

## Local setup (backend)

```bash
npm install
cp .env.example .env        # fill in the values (see below)
node create-admin.js        # creates the first superadmin
npm run dev                 # nodemon on http://localhost:3000
```

`.env`:

| var           | what                                                            |
|---------------|----------------------------------------------------------------|
| DATABASE_URL  | Supabase Session-mode pooler URL                               |
| SUPABASE_URL  | Supabase project URL (for photo/signature storage)            |
| SUPABASE_KEY  | Supabase anon key                                              |
| JWT_SECRET    | long random string                                            |
| APP_URL       | public base URL (used to build invite links)                  |
| PGSSL         | set to `off` only for a local no-SSL Postgres                 |
| CORS_ORIGINS  | optional extra origins for local dev (blank in production)    |
| EMAIL_ENABLED | set to enable the email hook (visitor-waiting emails); off by default |

---

## Database migration

Run **once** in the Supabase SQL Editor, in order (skip any already applied):

1. `db/init.sql` — base tables (if not already there)
2. `db/migrate_v11.sql` — boardrooms + invitations + host linkage
3. `db/migrate_v12.sql` — recurring bookings (series + skipped occurrences)
4. `db/migrate_v13.sql` — notifications

All migrations are additive and safe to re-run.

---

## Deploy on Render (single service — Option A)

1. Push this folder to one GitHub repo.
2. In Render: **New → Blueprint**, point it at the repo (it reads `render.yaml`).
3. Set the secret env vars in the dashboard: `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_KEY`, `JWT_SECRET`, `APP_URL` (= your Render URL, e.g.
   `https://vms.onrender.com`).
4. Deploy. The kiosk is at `/`, admin at `/admin`, boardrooms at `/boardrooms`.

Because the frontend is same-origin, the pages call the API with relative
paths — there is no `API_BASE` to edit.

---

## Keep-alive (free tier)

Render's free web service sleeps after **15 minutes** idle (cold start ~60s).
Keep it warm during working hours so the kiosk is always instant:

- Service: **cron-job.org** (free, timezone-aware)
- URL: your service root `/` (lighter than `/health`, which hits the DB)
- Interval: **every 10 minutes** (must be under 15)
- Active hours: **06:00–21:00**, timezone **Africa/Nairobi**

This uses ~457 of the 750 free instance-hours/month, and the only cold start
each day is the 6am ping itself — no real person waits.

---

## Roles

| role       | can do                                                        |
|------------|---------------------------------------------------------------|
| superadmin | everything + manage rooms + invite users                      |
| manager    | admin dashboard + book rooms + see own visitors               |
| security   | kiosk / checkout operations                                   |
| staff      | log in, see own visitors, book rooms (no admin dashboard)     |
| readonly   | view only — **cannot book**                                   |

---

## API quick reference

**Public**
- `POST /api/visitors` — check in (accepts `hostUserId`)
- `GET  /api/visitors/today`
- `PATCH /api/visitors/:id/checkout`
- `GET  /api/staff/directory?q=` — employee picker for the kiosk
- `GET  /api/admin/invite?token=` / `POST /api/admin/accept-invite`

**Authenticated**
- `GET  /api/staff/my-visitors?range=today|week|month`
- `GET  /api/boardrooms/rooms`
- `GET  /api/boardrooms/rooms/:id/schedule?date=YYYY-MM-DD` — day timeline + live status
- `POST /api/boardrooms/bookings` — `{roomId,startTime,endTime,attendeeCount,visitIds,userIds,externalNames}`
- `GET  /api/boardrooms/bookings?mine=1&roomId=&range=`
- `GET  /api/boardrooms/bookings/:id`
- `PATCH /api/boardrooms/bookings/:id/cancel` · `/end-early` · `/reschedule`
- `GET  /api/boardrooms/series` — my recurring series
- `POST /api/boardrooms/series` — `{roomId,firstDate,startHm,endHm,daysOfWeek,endType,endCount,endDate,attendeeCount}`
- `PATCH /api/boardrooms/series/:id/cancel` — cancels future occurrences
- `GET  /api/boardrooms/notifications` — stored events + live starting/ending alerts
- `POST /api/boardrooms/notifications/read` — mark all read
- `GET  /api/boardrooms/reports/utilisation?range=week|month` — manager/superadmin

**Superadmin**
- `POST /api/admin/users/invite` · `POST /api/admin/users/:id/resend`
- rooms: `POST/PUT/DELETE /api/boardrooms/rooms[/:id]`
- users: `GET/POST/PUT /api/admin/users`, `POST /api/admin/users/:id/password`
