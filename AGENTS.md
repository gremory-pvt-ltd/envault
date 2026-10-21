# envault — repo guide for agents

`envault` is the team's internal, self-hosted env credential vault. One record per
project → environment → key, with version history, reveal/copy, `.env`
import/export, roles and a full audit trail.

This is a **pnpm monorepo** (single `pnpm-lock.yaml` at the root):

- `packages/frontend/` — Vite + React 19 + TanStack Router/Query + shadcn (base-ui)
- `packages/backend/` — Express 4 + TypeScript + Prisma 7 + better-auth, SQLite
- `docs/` — LAN development, deployment, security and backup runbooks
- `.agents/skills/shadcn/` — the shadcn skill; `opencode.json` wires the shadcn MCP

Read `packages/frontend/AGENTS.md` before UI work and `packages/backend/AGENTS.md`
before API/database work. They are not optional.

## Run it on the LAN (development)

**The services must be reachable from other machines on the LAN.** This is a
LAN-first setup: we develop and test from phones and other laptops, not just the
server itself.

1. Install from the repo root only (never inside `packages/*`):

   ```bash
   pnpm install
   ```

2. Find the machine's LAN IP:

   ```bash
   hostname -I
   ```

   Use that IPv4 address everywhere below. **Never use `localhost`, `127.0.0.1`,
   a public IP or a hostname** in `.env` URLs.

3. Create both env files from the examples:

   ```bash
   cp packages/backend/.env.example packages/backend/.env
   cp packages/frontend/.env.example packages/frontend/.env
   ```

   Backend (`packages/backend/.env`):

   ```ini
   NODE_ENV=development
   PORT=5000
   HOST=0.0.0.0
   DATABASE_URL="file:./prisma/envault.db"
   BETTER_AUTH_URL="http://<LAN_IP>:5000"
   BETTER_AUTH_SECRET="<openssl rand -hex 32>"
   FRONTEND_URL="http://<LAN_IP>:5173"
   ```

   Frontend (`packages/frontend/.env`):

   ```ini
   VITE_API_URL="http://<LAN_IP>:5000"
   ```

4. Start both services:

   ```bash
   pnpm dev
   ```

   - Frontend binds `0.0.0.0:5173` (Vite config).
   - API binds `0.0.0.0:5000` (`HOST` default).
   - Open `http://<LAN_IP>:5173` from any device on the LAN.
   - If Vite bumps to `5174` because the port is busy, update `FRONTEND_URL` in
     the backend `.env` to exactly `http://<LAN_IP>:5174` and restart the API —
     CORS and better-auth `trustedOrigins` compare the origin exactly.
   - `VITE_API_URL` must point at the API's LAN origin; restart Vite after
     changing it.

5. Provision the first admin (no public sign-up exists):

   ```bash
   pnpm create-admin --email you@example.com --name "Your Name"
   ```

   Share the printed temporary password securely. Additional members are added
   from **Team** in the UI.

6. Verify from a **second device** (not just the server): open the LAN URL, sign
   in, reveal a secret, open Audit.

### LAN troubleshooting

- **Blank/CORS error in the console** — `FRONTEND_URL` and the URL in the
  browser must match exactly, including port and `http`/`https`.
- **Cookie not staying signed in** — the API must be on the same site as the SPA
  (LAN IP + different port is fine). Use the LAN IP, not a mix of `localhost`
  and LAN IP.
- **Copy fails** — async clipboard is unavailable on plain HTTP (non-localhost);
  the UI already falls back to `execCommand("copy")`. Keep that fallback.
- **Port 5000 in use** — change `PORT`, `BETTER_AUTH_URL`, and `VITE_API_URL`
  together, then restart both.
- Log in with the credentials in `AGENTS.local.md` (gitignored). If they fail,
  ask the user; do not silently create a second admin.

## UI rules (shadcn only)

All UI must come from the **shadcn registry**. Use the shadcn skill and the
shadcn MCP before writing any component. Full rules and commands live in
[`packages/frontend/AGENTS.md`](packages/frontend/AGENTS.md). The short version:

- Load the `shadcn` skill for any component work.
- Search the registry over MCP (`search_items_in_registries` /
  `view_items_in_registries`) before creating anything.
- Add missing components with the CLI:
  `pnpm dlx shadcn@latest add <name> -c packages/frontend`.
- Never hand-write a replacement for an available registry component.
- `src/components/ui/**` is shadcn-managed: do not edit/delete without explicit
  user confirmation. Custom compositions live outside `ui/`.
- This repo uses the **base-ui** flavor (`style: base-luma`, `@base-ui/react`).
  Do not introduce Radix.
- `src/index.css` is shadcn-managed. Put app CSS in `src/theme.css`, imported
  after it in `main.tsx`.

## Backend rules (read the package guide)

- Prisma 7 with the `better-sqlite3` driver adapter; migrations are checked in.
- Secret values are stored **plaintext by product decision**. The DB file and
  its backups are therefore secret material:
  - never log values or request bodies;
  - never enable Prisma query logging;
  - never put values in audit metadata, errors, or URLs;
  - keep the DB outside the repo and out of git.
- Every reveal, export, import and mutation writes an audit event.
- All authenticated members can reveal, create, edit, import and export.
  Admins additionally manage projects, environments and people.
- Endpoints use Zod validation and the `{ data }` / `{ error }` envelope.

## Commands

```bash
pnpm dev                 # frontend + backend on the LAN
pnpm dev:frontend        # Vite only (0.0.0.0:5173)
pnpm dev:backend         # tsx watch API (0.0.0.0:5000)
pnpm build               # backend tsc + frontend tsc/vite build
pnpm test                # backend node:test suite
pnpm create-admin --email … --name …
pnpm db:migrate          # prisma migrate dev (creates a migration)
pnpm db:generate         # prisma generate
pnpm db:studio           # inspect the SQLite DB
```

## Non-negotiables

1. `pnpm install` at the root only; only `pnpm-lock.yaml` is tracked.
2. Never commit `.env`, `*.db`, `*.db-wal`, `AGENTS.local.md`, or secrets.
3. Never hand-edit `src/routeTree.gen.ts`; it is generated by the router plugin.
4. Do not use `useState` view switches or `window.location` for routing — add a
   TanStack Router route.
5. All server state goes through TanStack Query + `src/lib/api.ts`; no bare
   `fetch` in components.
6. Before finishing: `pnpm build` and `pnpm test` must pass, and the LAN URL must
   load and sign in.
