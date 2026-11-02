# Vivo VMS + Boardrooms

Visitor Management System **and** internal boardroom booking, running as a
**single service** (Express serves both the API and the frontend).

- **Kiosk** (`/`) — public visitor self check-in. Visitors pick the employee
  they're here to see from a searchable list.
- **App** (`/app`) — the single logged-in app (React). Visitor management
  (dashboard, visitor log, reports, users & invites) **and** boardroom
  booking, in one role-gated interface. The old `/admin` and `/boardrooms`
  URLs redirect here.

Hosting: **Render** (web service, Frankfurt) + **Supabase** (Postgres +
Storage, eu-central-1).

---

## Project layout

```
vms/
├── index.js                 # Express: API + static frontend (single service)
├── db.js                    # Postgres pool (Supabase). SSL off locally via PGSSL=off
├── render.yaml              # Render Blueprint — one web service
├── create-admin.js          # Create / reset a superadmin from the command line
├── controllers/
│   ├── visitor.controller.js    # check-in / checkout / today  (+ host_user_id)
│   ├── admin.controller.js      # login, dashboard, users, invitations
│   ├── staff.controller.js      # kiosk directory + "my visitors"
│   ├── room.controller.js       # rooms + derived live status
│   ├── booking.controller.js    # bookings + conflict/grace/capacity checks
│   ├── series.controller.js     # recurring bookings
│   ├── notification.controller.js
│   └── report.controller.js
├── routes/                  # visitor / admin / staff / boardroom
├── middleware/auth.middleware.js
├── services/                # storage (Supabase Storage), notify, recurrence
├── utils/logger.js
├── db/
│   ├── init.sql             # base tables
│   ├── migrate_v11.sql      # rooms, bookings, invitations, host link
│   ├── migrate_v12.sql      # recurring bookings
│   ├── migrate_v13.sql      # notifications
│   └── migrate_v14.sql      # Supabase RLS lockdown + storage bucket
└── public/
    ├── index.html           # kiosk (vanilla)
    ├── accept-invite.html   # invited users set their password here
    └── app/                 # built React app (Vite output — git-ignored)

frontend/                    # React (Vite) source for /app
├── index.html
├── vite.config.js           # base '/app/', builds into ../public/app
└── src/
    ├── main.jsx  App.jsx  api.js  util.js  styles.css
    └── views/
```

---

## Testing locally

You need Node 20+ and a Postgres database. Pick one database option below.

```bash
# 1. install deps and build the app
npm install
cd frontend && npm install && npm run build && cd ..

# 2. create your .env  (see options below)
cp .env.example .env

# 3. run the migrations against your DB (see "Database migration")
# 4. create the first superadmin
node create-admin.js you@vivofashiongroup.com "A-Strong-Password"

# 5. start
node index.js                 # http://localhost:3000
```

Then open:
- `http://localhost:3000/` — kiosk (visitor check-in)
- `http://localhost:3000/app` — the unified app (dashboard, visitor log,
  rooms, bookings, reports, users) — log in to enter.

**Database option A — use your Supabase (simplest).** Point `DATABASE_URL` at
your Supabase Session-mode pooler URL and leave SSL on (don't set `PGSSL`).
Run the SQL files in the Supabase SQL Editor.

**Database option B — local Postgres.** Create a DB and run the SQL with `psql`
(skip `migrate_v14.sql` — it is Supabase-specific):

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

**Try the full flow:** log in at `/app` → invite yourself as `staff` (copy the
invite link, set a password) → open the kiosk at `/` and check in a visitor,
picking your name as the host → back in `/app` you'll see the visitor under
*My visitors* and a *Notifications* alert → book a room and add the visitor as
an attendee.

**Frontend hot-reload (optional):** run `node index.js` in one terminal and
`cd frontend && npm run dev` in another, then use `http://localhost:5173/app/`
— API calls proxy to :3000 automatically.

---

## Environment variables

| var           | what                                                            |
|---------------|----------------------------------------------------------------|
| DATABASE_URL  | Supabase **Session-mode** pooler URL                          |
| SUPABASE_URL  | Supabase project URL (for photo/signature storage)            |
| SUPABASE_KEY  | Supabase **service_role** key — server-only, never in frontend |
| JWT_SECRET    | long random string                                            |
| APP_URL       | public base URL (used to build invite links)                  |
| KIOSK_KEY     | kiosk passcode for the visitor list + checkout (blank = open, local only) |
| TZ            | timezone for "today" / visit times; default `Africa/Nairobi`   |
| PGSSL         | set to `off` only for a local no-SSL Postgres                 |
| CORS_ORIGINS  | optional extra origins for local dev (blank in production)    |
| EMAIL_ENABLED | set to enable the email hook (visitor-waiting emails); off by default |

---

## Database migration

Run **once** in the Supabase SQL Editor, in order (all are safe to re-run):

1. `db/init.sql` — base tables
2. `db/migrate_v11.sql` — boardrooms + invitations + host linkage
3. `db/migrate_v12.sql` — recurring bookings (series + skipped occurrences)
4. `db/migrate_v13.sql` — notifications
5. `db/migrate_v14.sql` — enables RLS on every table (blocks Supabase's public
   REST API; the server is unaffected) and creates the `visitor-files` bucket.
   Re-run it whenever you add a table.

---

## Deploy

### 1. Supabase
1. Create a project in region **Central EU (Frankfurt)**.
2. SQL Editor → run the five migrations above, in order.
3. Settings → Database → **Connection pooling → Session mode** → copy the URI
   (this is `DATABASE_URL`; put your DB password in it).
4. Settings → API → copy the **Project URL** (`SUPABASE_URL`) and the
   **service_role** key (`SUPABASE_KEY`).
5. On your PC, put `DATABASE_URL` in `.env` and run
   `node create-admin.js you@vivofashiongroup.com "A-Strong-Password"`.

### 2. Render
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`:
   free plan, Frankfurt, builds the React app, health check `/health`).
3. Fill in the secrets it asks for: `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_KEY`, `JWT_SECRET`, `KIOSK_KEY`, `APP_URL` (your Render URL,
   e.g. `https://vms.onrender.com` — you can set it after the first deploy).
   The kiosk tablet asks for `KIOSK_KEY` once, the first time someone opens
   the visitor log or checkout, then remembers it.
4. Open `https://<your-service>.onrender.com/health` → expect
   `"database": "connected"`. Kiosk is at `/`, app at `/app`.

Because the frontend is same-origin, the pages call the API with relative
paths — there is no `API_BASE` to edit.

---

## Keep-alive (free tiers)

Render's free web service sleeps after **15 minutes** idle (cold start ~60s),
and a free Supabase project **pauses after 7 days with no DB activity**.
Use **cron-job.org** (free, timezone-aware) with two jobs:

| job | URL | schedule |
|-----|-----|----------|
| keep Render warm | `/` (no DB hit) | every 10 min, 06:00–21:00 Africa/Nairobi |
| keep Supabase awake | `/health` (runs `SELECT 1`) | once a day, every day |

The first job uses ~457 of the 750 free instance-hours/month.

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
- `GET  /api/visitors/today` — needs `X-Kiosk-Key` header or a login token
- `PATCH /api/visitors/:id/checkout` — needs `X-Kiosk-Key` header or a login token
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
