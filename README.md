# envault

Self-hosted env credential vault for our projects. Every project gets
**development / staging / production** environments; every key keeps its full
version history; every reveal, export and change lands in an audit log.

Built as a pnpm monorepo with the same stack as our other internal tools:
React 19 + Vite + TanStack Router/Query + shadcn (base-ui) on the frontend,
Express + Prisma 7 + better-auth + SQLite on the backend.

## What it does

- **Projects → environments → keys** with masked lists and per-key reveal.
- **Version history** for every value; restore creates a new version (history is
  never overwritten).
- **Bulk `.env` import** with a dry-run preview (new vs updated, invalid lines).
- **`.env` export** with an explicit download; production requires typing the
  environment slug.
- **Audit log** for reveals, exports, imports, edits, deletes, project/member
  changes — actor, IP, user agent and target, never values.
- **Team roles**: members reveal and manage secrets; admins also manage
  projects, environments and people.
- **Invite-only auth** with better-auth, admin-provisioned accounts and optional
  TOTP two-factor.
- **Reveal auto-hide** after 30 seconds and a clipboard fallback for plain-HTTP
  LAN development.

## Stack

| Layer    | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Frontend | Vite, React 19, TypeScript, TanStack Router/Query, Tailwind 4, shadcn (base-ui), Geist |
| Backend  | Express 4, TypeScript, Prisma 7 (`better-sqlite3` adapter), better-auth, Zod |
| Database | SQLite (WAL), one API process                                       |
| Deploy   | PM2 + nginx, separate SPA and API origins                            |

## Quick start (LAN)

```bash
pnpm install
hostname -I                     # copy the LAN IPv4
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
# edit both files: replace 192.168.1.50 with your LAN IP
pnpm db:migrate
pnpm create-admin --email you@example.com --name "Your Name"
pnpm dev
```

Open `http://<LAN_IP>:5173` from any device on the network. The API runs on
`:5000`; the frontend and API are intentionally different origins. See
[docs/dev-lan.md](docs/dev-lan.md) for the full LAN runbook and troubleshooting.

## Scripts

| Command                | What it does                                      |
| ---------------------- | ------------------------------------------------- |
| `pnpm dev`             | Frontend + backend together (LAN)                 |
| `pnpm dev:frontend`    | Vite only, `0.0.0.0:5173`                         |
| `pnpm dev:backend`     | API only, `0.0.0.0:5000` (tsx watch)              |
| `pnpm build`           | Backend `tsc` + frontend `tsc` and Vite build     |
| `pnpm test`            | Backend `node:test` suite                         |
| `pnpm create-admin`    | Provision an admin (no public sign-up)            |
| `pnpm db:migrate`      | Create/apply a Prisma migration in development    |
| `pnpm db:generate`     | Regenerate the Prisma client                      |
| `pnpm db:studio`       | Inspect the SQLite database                       |

## Layout

```
packages/frontend/          # SPA (Vite)
packages/backend/           # API, Prisma schema + migrations, scripts, tests
  prisma/schema.prisma
  src/{routes,lib,middleware.ts,auth.ts,db.ts,env.ts,index.ts}
  scripts/create-admin.ts
docs/                       # LAN, deployment, security
AGENTS.md                   # agent rules (LAN + shadcn policy)
.agents/skills/shadcn/      # shadcn skill
opencode.json               # shadcn MCP server
ecosystem.config.cjs        # PM2
scripts/backup-db.sh        # encrypted SQLite backup
```

## Security model (read before deploying)

Secret values are stored **as plaintext in SQLite** by explicit product
decision. The database file, its WAL/SHM sidecars and every backup are therefore
secret material. The app compensates with invite-only auth, exact-origin CORS,
CSRF origin checks, rate limits, role checks, audit logging, `no-store` on
reveal/export and a UI that keeps values out of browser storage — but anyone
with read access to the DB file or a backup has every credential.

Deploy with full-disk encryption, `0600` DB permissions, encrypted off-box
backups and restricted SSH. Details: [docs/security.md](docs/security.md).

Production deployment (PM2, nginx, TLS, backup/restore):
[docs/deployment.md](docs/deployment.md).

## Admin and member access

- **Members** can reveal, add, edit, delete, import and export secrets in every
  project and environment.
- **Admins** can additionally create/archive projects, manage environments, add
  people, change roles, reset passwords and block access.
- All mutations and reads of secret values are audited. The audit log is
  append-only from the UI; use the database for retention/cleanup.
