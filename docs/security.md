# Security model

envault stores environment credentials for internal projects. It is deployed on
our own server and is available only to the team.

## The one big decision: plaintext at rest

Values are stored **as plain text** in SQLite. This is intentional. It means:

- The `.db` file, its `-wal`/`-shm` sidecars, and every backup contain every
  credential in clear text.
- Anyone with read access to the DB, a backup, or a disk image has the entire
  vault. Application-layer audit logs cannot detect direct database reads.
- There is no master key to lose — but also no encryption boundary if the host is
  compromised.

The rest of this document is the compensating control set. Treat it as required,
not optional.

## Controls in the app

| Area | Control |
| --- | --- |
| Sign-in | Email/password via better-auth; **public sign-up disabled**; admins provision accounts |
| Second factor | Optional TOTP (authenticator app) with backup codes; recommended for every admin |
| Sessions | httpOnly, `SameSite=Lax` cookie; `Secure` in production; 7-day expiry; revocable |
| Cross-origin | Exact-origin CORS with credentials; `trustedOrigins`; `Origin` check on non-GET requests |
| Roles | Members reveal/manage secrets; admins manage projects, environments, members |
| Masking | Lists never return values; reveal is one key at a time |
| Export | Explicit download; production requires typing the environment slug; `no-store` |
| Audit | Actor, IP, user agent, target for reveal/export/import/mutations; values never logged |
| Rate limits | Sign-in 20/15 min/IP; global API limiter in front of nginx |
| Logging | morgan method/status only; Prisma query logging disabled (`error` only) |
| Browser | No service worker, no values in `localStorage`/`sessionStorage`/URLs; reveal hides after 30s |
| Transport | TLS at nginx; HSTS; security headers via helmet and nginx |
| SQLite | WAL, foreign keys, 5s busy timeout, one API process |

### What audit does and does not cover

Covered: every reveal, export, import, edit, delete, project/environment change
and member change made through the API.

Not covered: someone reading the SQLite file or a backup directly. Restrict file
access and encrypt disks/backups.

## Required server hardening

1. **Full-disk encryption (LUKS)** on the host. A stolen disk without LUKS is a
   full credential leak.
2. DB directory `0700`, DB and sidecars `0600`, owned by the service user only.
   PM2 runs with `umask 0o077` so new files inherit safe permissions.
3. API binds `127.0.0.1` in production; only nginx exposes 443.
4. SSH: keys only, no root password login, fail2ban or equivalent. Limit who can
   become the service user/root — they can read the DB.
5. **Encrypted backups** (`age`) stored off-box; the private key stays offline
   and separate from backups. Test restores.
6. Do not put the DB in the repo, a synced folder (Dropbox/iCloud), or an
   unencrypted object-store bucket.
7. Keep OS/packages patched.
8. Rotate `BETTER_AUTH_SECRET` if it leaks (this invalidates sessions, not data).

## Incident checklist

If the host or DB is suspected compromised:

1. Stop the API (`pm2 stop envault-api`) to prevent further access.
2. Block affected users and revoke sessions (Team → Block access).
3. Export every environment (or read the DB) and rotate all credentials at the
   provider: DB passwords, API keys, SMTP, object storage, etc.
4. Rotate `BETTER_AUTH_SECRET`; all sessions are invalidated.
5. Rebuild the host from a clean image, restore only the data you still trust,
   and keep the old disk/image for forensics.
6. Preserve `audit_event` rows; they are append-only and may identify the access
   path.

## Development vs production

- Development is plain HTTP on the LAN. Cookies are non-`Secure`, the clipboard
  uses the legacy fallback, and CORS trusts the LAN SPA origin.
- Production is HTTPS, `Secure` cookies, exact subdomain origins.
- Never copy the dev `.env` or `BETTER_AUTH_SECRET` to the server.
- `AGENTS.local.md` contains dev credentials and is gitignored.

## Known limitations (v1)

- No per-project ACLs or viewer role; every authenticated member can read every
  project.
- No reveal approval workflow for production.
- No field-level encryption.
- No automated key/credential rotation.
- Audit retention is manual (SQLite); export/archive rows before pruning.
- The UI cannot detect direct DB access.
