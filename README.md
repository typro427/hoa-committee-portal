# HOA Committee Portal

*Organized Committees. Better Decisions.*

A private, mobile-first workspace for HOA committees. Each member signs in with their own 8-digit PIN and goes straight to their committee's meetings, minutes, documents and tasks. Administrators manage everything from a separate, password-protected admin area.

The initial setup creates three committees: **Safety and Security Committee**, **Special Events Committee** and **Architectural Review Board**. They are ordinary data, so you can rename, archive or add committees from **Admin → Committees** without touching code.

---

## Features

| Area | What it does |
|---|---|
| **PIN sign-in** | Individual 8-digit PINs (never stored in plain text: Argon2id hash plus a keyed HMAC lookup), rate limiting, temporary lockouts, HTTP-only session cookies, configurable inactivity timeout. Members on more than one committee pick a committee after signing in. |
| **Roles** | Administrator, Chair, Secretary and Member, enforced on the server for every page, action and download. Members can't reach another committee's records by changing URLs or API calls (they get a 404). |
| **Meetings** | Create, edit, cancel or postpone meetings. Monthly calendar and upcoming/past lists. |
| **Agenda builder** | Standard 10-section agenda, add/edit/remove/reorder items, attach supporting documents, printable PDF. |
| **Minutes** | Structured editor (attendance, all record sections, motions and votes, action items, adjournment). Workflow: Draft → Submitted → Approved → Published, with *Return for corrections*. Drafts are visible only to leadership and admins. Published minutes can only be amended with a reason, and every change creates a permanent revision that admins can view. Professional PDF export. |
| **Documents** | A private library for each committee, organized in folders, stored in S3-compatible storage with short-lived signed download links. File type and size are validated. Removing a document is a soft delete that admins can restore. |
| **Tasks** | Assign to individual members; due dates, priorities and statuses. Large status buttons for phones. Completion date, person and notes are recorded. Tasks link back to their meeting, and unfinished tasks carry forward onto later minutes. |
| **Admin** | Dashboard stats, committees, members, PIN management (generate, reset, revoke, bulk generate, printable PIN slips), meetings, minutes, documents, tasks, reports (PDF and CSV), audit log and settings. |
| **Audit log** | Logins, PIN changes, membership changes, minutes workflow, uploads/downloads, task changes and more, with actor and time. |

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn-style UI components, Lucide icons, Prisma 6 with PostgreSQL, Zod, `@node-rs/argon2`, AWS S3 SDK and `pdf-lib`.

---

## Run locally

Requirements: Node 20.11+ (22 recommended) and PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then edit .env (see below)
npx prisma migrate deploy       # create tables
ORG_NAME="Willow Creek HOA" npm run db:seed     # organization and starting committees
npm run admin:create -- --email you@example.com --name "Your Name"
npm run db:seed:sample          # OPTIONAL demo members, meetings and minutes (prints their PINs)
npm run dev                     # http://localhost:3000
```

- Member sign-in: `http://localhost:3000/login`
- Admin sign-in: `http://localhost:3000/admin/login`

In local development, uploads are saved to `./uploads` when S3 isn't configured. That fallback never runs on Render.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (on Render, use the database's **Internal** URL). |
| `SESSION_SECRET` | Protects member session tokens. Generate it with `openssl rand -hex 32`. |
| `ADMIN_AUTH_SECRET` | Protects administrator session tokens. Generate it the same way. |
| `PIN_HASH_SECRET` | Key for PIN lookups. **Never change it after PINs are issued**, because every PIN would stop working. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | S3-compatible storage for documents (Cloudflare R2, AWS S3, Backblaze B2, Wasabi and so on). |
| `S3_FORCE_PATH_STYLE` | Set to `true` for MinIO and similar providers. |
| `APP_URL` | Public URL, for example `https://committees.yourhoa.org`. It's printed on PIN slips. |
| `NODE_ENV` | `production` on Render. |
| `SETUP_TOKEN` | Optional one-time token that unlocks `/admin/setup` while no administrator exists. |
| `ORG_NAME`, `ORG_TIMEZONE` | Used by `db:seed` the first time only. Change them later in Admin → Settings. |

Never commit `.env` or production secrets. `.gitignore` already excludes them.

---

## Deploy to Render

1. **Push this folder to a GitHub repository.**
2. **Create object storage.** Cloudflare R2 is inexpensive and S3-compatible. Create a **private** bucket and an API token with read/write access to it. Note the endpoint (`https://<account>.r2.cloudflarestorage.com`), bucket name, access key and secret.
3. **Deploy the Blueprint.** In Render, go to **New → Blueprint**, pick the repo, and Render reads `render.yaml`. It creates:
   - the PostgreSQL database `hoa-portal-db`
   - the web service `hoa-committee-portal`, with generated secrets, health check `/api/health`, and the migration step
4. **Fill in the prompted values:** `APP_URL` and the four `S3_*` values. Optionally change `ORG_NAME`.
5. **Deploy.** Each deploy runs:
   - Build: `npm ci --include=dev && npm run build`
   - **Pre-deploy (runs once per deploy, before traffic switches):** `npx prisma migrate deploy && npm run db:seed`
   - Start: `npm start`

   Migrations are a controlled deploy step. They never run at app startup, so multiple instances can't race. (Render pre-deploy commands need a paid instance type such as Starter. On the free plan, run `npx prisma migrate deploy` from the Shell tab before each deploy that changes the schema.)
6. **Create the first administrator.** Choose either option:
   - Open `https://<your-app>/admin/setup` and enter the `SETUP_TOKEN` value from the service's **Environment** tab. Then delete `SETUP_TOKEN`.
   - Or, in the Render **Shell**, run `npm run admin:create -- --email you@yourhoa.org --name "Your Name"`.
7. **Configure:** Admin → Settings (HOA name, logo URL, time zone, session timeout). Then go to Committees and rename them if needed.
8. **Add members:** Admin → Members. Assign each member to a committee and role (one chair per committee, which the database enforces).
9. **Generate PINs:** Admin → PIN Management → **Generate PINs**. Print the PIN slips or send each PIN privately. PINs are shown **only once**.
10. **Test access:** sign in with a member PIN on a phone and confirm you only see that committee.

### Custom domain and HTTPS

Add your domain under the web service's **Settings → Custom Domains**. Render provides TLS automatically. HTTPS is required in production because session cookies are `Secure`, and HSTS is sent.

### Going live: remove sample data

If you loaded demo data:

```bash
npm run db:clear-sample -- --confirm
```

This deletes all members, meetings, minutes, tasks, documents, sessions and audit history. It keeps the organization, committees and administrators. Files already uploaded to the bucket are not deleted, so remove them in the storage console if needed.

---

## Backups and recovery

**Database.** Render's paid PostgreSQL plans include automated daily backups and point-in-time recovery (retention depends on plan). Check them in the Render dashboard under **hoa-portal-db → Recovery**.

Make an extra manual backup any time (run it from your computer or the Render shell, using the **External** URL):

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > hoa-portal-$(date +%F).dump
```

Restore into a new or empty database:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$NEW_DATABASE_URL" hoa-portal-YYYY-MM-DD.dump
```

**Recovery steps**

1. In Render, restore the database to a point in time (this creates a new database), or create a new database and `pg_restore` a dump into it.
2. Point the web service's `DATABASE_URL` at the restored database and redeploy.
3. Keep `PIN_HASH_SECRET` the same, or every member will need a new PIN.
4. Documents live in object storage, which isn't affected by a database restore. Turn on bucket versioning or replication with your storage provider for file backups.
5. Check `/api/health` and sign in as an admin and as a member.

---

## Security notes

- PINs are stored as Argon2id hashes, plus an HMAC-SHA256 lookup keyed by `PIN_HASH_SECRET`. A PIN is displayed only at the moment it's generated. Resetting a PIN makes the old one stop working immediately and signs out that member's sessions.
- Sessions are random 256-bit tokens. Only a keyed hash is stored in the `sessions` table. Cookies are HTTP-only, `Secure` in production, and `SameSite=Lax`. Sessions have a sliding inactivity timeout (Admin → Settings) and a 7-day absolute cap.
- Deactivating a member, removing them from all committees, or archiving a committee takes effect on their very next request.
- Login throttling: 5 failures per IP in 15 minutes triggers a lockout. There is also a system-wide brake on PIN guessing. Attempts are stored in Postgres, so limits hold across instances.
- All mutations are Next.js Server Actions, which are POST-only with built-in Origin checks for CSRF protection. Every action re-checks authorization on the server. Zod validates input. Prisma parameterizes all queries. React escapes all output. CSV exports guard against formula injection.
- Uploads are checked against a file type allow-list (SVG and HTML are excluded) with a magic-byte check and a 25 MB limit. Files are stored privately and served through 5-minute signed URLs after a permission check.
- Historical records (meetings, minutes, revisions, tasks, audit logs) are never hard-deleted. Members are deactivated, committees archived and documents soft-removed.

---

## Project layout

```
prisma/
  schema.prisma            database schema
  migrations/              SQL migrations (prisma migrate deploy)
  seed.ts                  organization and starting committees (production-safe, idempotent)
  seed-sample.ts           demo data (development only)
scripts/
  create-admin.ts          create or reset an administrator
  clear-sample-data.ts     wipe demo data before go-live
src/
  app/login                member PIN sign-in
  app/portal/(app)/...     member portal pages
  app/admin/(protected)/   administrator pages
  app/api/...              health, downloads, PDFs, report exports
  lib/                     db, sessions, crypto, permissions, storage, PDF, audit
  server/                  server actions, data loaders, reports, PDF builders
  views/                   page bodies shared by the member and admin portals
  components/              UI components
```

### Useful commands

```bash
npm run dev               # development server
npm run build && npm start
npm run typecheck
npm run db:migrate        # prisma migrate deploy
npm run db:migrate:dev    # create a new migration after editing schema.prisma
```
