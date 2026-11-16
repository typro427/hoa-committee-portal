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
| **Import from Zoom** | Chairs and secretaries can fill in minutes from the Zoom AI Companion summary (PDF export, pasted text, or a .txt/.vtt file). Each summary topic is mapped to a minutes section (small talk is skipped automatically), every "Next steps" bullet becomes an action item assigned to the matching committee member, and members named in the notes are pre-marked present. Everything is reviewed on one screen before it's added, and nothing is published automatically. The original Zoom file can be saved to the meeting's documents. |
| **Documents** | A private library for each committee, organized in folders, stored on a Render persistent disk (or optionally S3-compatible storage) and served only after a permission check. File type and size are validated. Removing a document is a soft delete that admins can restore. |
| **Tasks** | Assign to individual members; due dates, priorities and statuses. Large status buttons for phones. Completion date, person and notes are recorded. Tasks link back to their meeting, and unfinished tasks carry forward onto later minutes. |
| **Admin** | Dashboard stats, committees, members, PIN management (generate, reset, revoke, bulk generate, printable PIN slips), meetings, minutes, documents, tasks, reports (PDF and CSV), audit log and settings. |
| **Audit log** | Logins, PIN changes, membership changes, minutes workflow, uploads/downloads, task changes and more, with actor and time. |

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn-style UI components, Lucide icons, Prisma 6 with PostgreSQL, Zod, `@node-rs/argon2`, AWS S3 SDK and `pdf-lib`.

### Writing minutes from Zoom

1. **Meeting Minutes → Write minutes.** Pick the meeting, or record it right there (date, title, time).
2. Choose **Import Zoom**, then upload the Zoom notes PDF or paste the summary text.
3. Review: choose a section for each topic (or *Don't include*), untick any next steps you don't want as tasks, set assignees and due dates, and confirm who was present.
4. **Add to minutes.** Edit the wording if needed, then **Approve & Publish** (chair) or **Submit for chair review** (secretary).

You can also start from a meeting's page (**Start from Zoom notes**) or from a draft (**Import from Zoom notes**). Importing adds to existing text; it never overwrites it.

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

In local development, uploads are saved to `./uploads`. On Render, set `UPLOAD_DIR` to a folder on a persistent disk (the Blueprint does this for you).

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (on Render, use the database's **Internal** URL). |
| `SESSION_SECRET` | Protects member session tokens. Generate it with `openssl rand -hex 32`. |
| `ADMIN_AUTH_SECRET` | Protects administrator session tokens. Generate it the same way. |
| `PIN_HASH_SECRET` | Key for PIN lookups. **Never change it after PINs are issued**, because every PIN would stop working. |
| `UPLOAD_DIR` | Folder for uploaded documents. On Render this is `/var/data/uploads` on the attached persistent disk. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | Optional. S3-compatible storage (Cloudflare R2, AWS S3 and so on). If set, it is used instead of `UPLOAD_DIR`. |
| `S3_FORCE_PATH_STYLE` | Set to `true` for MinIO and similar providers. |
| `APP_URL` | Public URL, for example `https://committees.yourhoa.org`. It's printed on PIN slips. |
| `NODE_ENV` | `production` on Render. |
| `SETUP_TOKEN` | Optional one-time token that unlocks `/admin/setup` while no administrator exists. |
| `ORG_NAME`, `ORG_TIMEZONE` | Used by `db:seed` the first time only. Change them later in Admin → Settings. |

Never commit `.env` or production secrets. `.gitignore` already excludes them.

---

## Deploy to Render

1. **Push this folder to a GitHub repository.**
2. **Deploy the Blueprint.** In Render, go to **New → Blueprint**, pick the repo, and Render reads `render.yaml`. It creates:
   - the PostgreSQL database `hoa-portal-db`
   - the web service `hoa-committee-portal`, with generated secrets, health check `/api/health`, and the migration step
   - a 1 GB **persistent disk** mounted at `/var/data`, where uploaded documents are kept (`UPLOAD_DIR=/var/data/uploads`)
3. **Fill in the prompted value:** `APP_URL`. Optionally change `ORG_NAME`.
4. **Deploy.** Each deploy runs:
   - Build: `npm ci --include=dev && npm run build`
   - **Pre-deploy (runs once per deploy, before traffic switches):** `npx prisma migrate deploy && npm run db:seed`
   - Start: `npm start`

   Migrations are a controlled deploy step. They never run at app startup, so multiple instances can't race. (Render pre-deploy commands need a paid instance type such as Starter. On the free plan, run `npx prisma migrate deploy` from the Shell tab before each deploy that changes the schema.)
5. **Create the first administrator.** Choose either option:
   - Open `https://<your-app>/admin/setup` and enter the `SETUP_TOKEN` value from the service's **Environment** tab. Then delete `SETUP_TOKEN`.
   - Or, in the Render **Shell**, run `npm run admin:create -- --email you@yourhoa.org --name "Your Name"`.
6. **Configure:** Admin → Settings (HOA name, logo URL, time zone, session timeout). Then go to Committees and rename them if needed.
7. **Add members:** Admin → Members. Assign each member to a committee and role (one chair per committee, which the database enforces).
8. **Generate PINs:** Admin → PIN Management → **Generate PINs**. Print the PIN slips or send each PIN privately. PINs are shown **only once**.
9. **Test access:** sign in with a member PIN on a phone and confirm you only see that committee.

### About the persistent disk

- Render keeps the disk's files across deploys and restarts, and takes a daily snapshot.
- A disk needs a paid instance (Starter or higher). It's attached to one instance, so the service can't scale to multiple instances, and each deploy has a few seconds of downtime while the new version takes over the disk.
- The disk size can be increased in the dashboard later, but never decreased.
- To move to S3-compatible storage later, add the `S3_*` variables. New uploads go to S3; existing files on the disk need to be copied into the bucket using the same paths (the `storage_key` column).

### Custom domain and HTTPS

Add your domain under the web service's **Settings → Custom Domains**. Render provides TLS automatically. HTTPS is required in production because session cookies are `Secure`, and HSTS is sent.

### Going live: remove sample data

If you loaded demo data:

```bash
npm run db:clear-sample -- --confirm
```

This deletes all members, meetings, minutes, tasks, documents, sessions and audit history. It keeps the organization, committees and administrators. Files already uploaded stay on disk; delete `/var/data/uploads` from the Render Shell if you want them gone too.

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
4. Documents live on the persistent disk, which a database restore doesn't touch. Render snapshots disks daily; restore one under the web service's **Disks** tab. For an extra copy, download them from the Render Shell (for example `tar czf /tmp/uploads.tgz -C /var/data uploads`, then copy the file off with `scp` or the Render CLI).
5. Check `/api/health` and sign in as an admin and as a member.

---

## Security notes

- PINs are stored as Argon2id hashes, plus an HMAC-SHA256 lookup keyed by `PIN_HASH_SECRET`. A PIN is displayed only at the moment it's generated. Resetting a PIN makes the old one stop working immediately and signs out that member's sessions.
- Sessions are random 256-bit tokens. Only a keyed hash is stored in the `sessions` table. Cookies are HTTP-only, `Secure` in production, and `SameSite=Lax`. Sessions have a sliding inactivity timeout (Admin → Settings) and a 7-day absolute cap.
- Deactivating a member, removing them from all committees, or archiving a committee takes effect on their very next request.
- Login throttling: 5 failures per IP in 15 minutes triggers a lockout. There is also a system-wide brake on PIN guessing. Attempts are stored in Postgres, so limits hold across instances.
- All mutations are Next.js Server Actions, which are POST-only with built-in Origin checks for CSRF protection. Every action re-checks authorization on the server. Zod validates input. Prisma parameterizes all queries. React escapes all output. CSV exports guard against formula injection.
- Uploads are checked against a file type allow-list (SVG and HTML are excluded) with a magic-byte check and a 25 MB limit. Files are never publicly reachable; every download goes through a permission check.
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
