# LAN development

envault is developed and tested on the LAN, not on `localhost`. The SPA and API
are **different origins** (different ports in development, different subdomains
in production), so the origin configuration must be exact.

## 1. Install

Install once from the repo root:

```bash
pnpm install
```

Do not run `pnpm install` inside `packages/*`.

## 2. Configure

Copy the examples and replace `<LAN_IP>` with the machine's IPv4 from
`hostname -I`:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

`packages/backend/.env`:

```ini
NODE_ENV=development
PORT=5000
HOST=0.0.0.0
DATABASE_URL="file:./prisma/envault.db"
BETTER_AUTH_URL="http://<LAN_IP>:5000"
BETTER_AUTH_SECRET="<openssl rand -hex 32>"
FRONTEND_URL="http://<LAN_IP>:5173"
```

`packages/frontend/.env`:

```ini
VITE_API_URL="http://<LAN_IP>:5000"
```

Never use `localhost`, `127.0.0.1`, a public IP or a hostname in these values.
The browser, CORS allow-list, better-auth `trustedOrigins` and cookie origin all
need to agree.

## 3. Migrate and create the first admin

```bash
pnpm db:migrate
pnpm create-admin --email you@example.com --name "Your Name"
```

The command prints a one-time temporary password. Members are added from
**Team** in the UI afterwards (admins only).

## 4. Run

```bash
pnpm dev
```

- SPA: `http://<LAN_IP>:5173` (binds `0.0.0.0`)
- API: `http://<LAN_IP>:5000` (binds `0.0.0.0`)
- Health: `http://<LAN_IP>:5000/health`

Open the SPA from a second device (phone/laptop) and sign in. If it works there,
the LAN setup is correct.

### Vite bumps the port

If `5173` is busy, Vite prints `5174`. Update `FRONTEND_URL` in
`packages/backend/.env` to that exact URL and restart the API (tsx watch does not
re-read env files). CORS and trusted origins compare the string exactly.

### API port changes

Change all three together and restart both services:

- `PORT` in the backend `.env`
- `BETTER_AUTH_URL` in the backend `.env`
- `VITE_API_URL` in the frontend `.env`

## 5. Verify

1. Sign in on a second device.
2. Create a project — Development/Staging/Production appear automatically.
3. Add a key, reveal it, copy it.
4. Edit it (creates v2), open History and restore v1.
5. Import a small `.env`, export it, and confirm the download filename.
6. Open **Audit** and confirm the reveal/export rows.
7. Optional: enable TOTP 2FA in Settings, sign out and back in.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser CORS error | `FRONTEND_URL` must match the browser origin exactly, including port and scheme. |
| Login succeeds then bounces to `/login` | Cookies are being dropped. Use one host consistently (LAN IP for both SPA and API); check that `BETTER_AUTH_URL` uses the API's LAN origin. |
| `401` on every API call | You are signed out or the session cookie belongs to another origin. Sign in at the LAN URL. |
| Copy does nothing | Plain HTTP outside localhost has no async clipboard. The UI falls back to `execCommand`; if that is blocked, reveal and copy manually. |
| API refuses POST with `forbidden_origin` | The `Origin` header is not `FRONTEND_URL`. Restart the API after fixing `.env`. |
| `EADDRINUSE` on 5000 | Change `PORT`/`BETTER_AUTH_URL`/`VITE_API_URL` together. |
| Database is locked | SQLite allows one writer. Keep one API instance during development; do not run `pnpm dev:backend` twice. |

## Local credentials

The dev admin and any test members live in `AGENTS.local.md` (gitignored, never
committed). The SQLite DB is at `packages/backend/prisma/envault.db` and is also
gitignored. To start over, stop the API and delete the DB + `-wal`/`-shm` files,
then `pnpm db:migrate` and `pnpm create-admin` again.
