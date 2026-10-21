# Production deployment (PM2 + nginx)

Target: one Linux box (Ubuntu/Debian), Node 22+, nginx, PM2, SQLite. The SPA and
API are **separate origins**:

- `https://vault.example.com` → static frontend build
- `https://api.vault.example.com` → nginx → `127.0.0.1:5000`

Both hostnames should be subdomains of the same registrable domain so the
better-auth cookie stays same-site (`SameSite=Lax`). If they are not, the cookie
must become `SameSite=None; Secure` in `src/auth.ts`, and Safari ITP may still
break sign-in. Prefer subdomains.

## 1. Prerequisites

```bash
# Node 22 and pnpm
corepack enable
corepack prepare pnpm@12.6.0 --activate

# Packages
apt install nginx sqlite3 age certbot python3-certbot-nginx
npm i -g pm2

# Service user + directories
useradd --system --create-home --home-dir /opt/envault envault
install -d -o envault -g envault -m 700 /var/lib/envault /var/backups/envault
install -d -o envault -g envault -m 750 /var/log/envault
install -d -o root    -g envault -m 750 /etc/envault
```

`better-sqlite3` may need build tools if no prebuilt binary exists:

```bash
apt install python3 make g++
```

## 2. Layout

```
/opt/envault                 # git checkout + node_modules + dist
/etc/envault/envault.env     # 0600, root:envault
/var/lib/envault/envault.db  # 0600, envault:envault (+ -wal, -shm)
/var/backups/envault/        # age-encrypted .db.age files
/var/log/envault/            # PM2 logs
```

The DB must live **outside** the repo and outside any cloud-synced directory.

## 3. Environment

`/etc/envault/envault.env` (root:envault, 0600):

```ini
NODE_ENV=production
PORT=5000
HOST=127.0.0.1
DATABASE_URL="file:/var/lib/envault/envault.db"
BETTER_AUTH_URL="https://api.vault.example.com"
BETTER_AUTH_SECRET="<openssl rand -hex 32>"
FRONTEND_URL="https://vault.example.com"
```

- `HOST=127.0.0.1` keeps the API off the public interface; only nginx reaches it.
- The DB is plaintext by design, so file permissions and disk encryption are the
  protection (see [security.md](security.md)).
- Never reuse `BETTER_AUTH_SECRET` from development.

## 4. Build and migrate

```bash
sudo -u envault git clone git@github.com:gremory-pvt-ltd/envault.git /opt/envault
cd /opt/envault
sudo -u envault pnpm install --frozen-lockfile
sudo -u envault pnpm build

# Load env and apply migrations BEFORE starting/reloading the API
set -a; . /etc/envault/envault.env; set +a
sudo -u envault env $(grep -v '^#' /etc/envault/envault.env | xargs) \
  pnpm --filter ev-backend exec prisma migrate deploy
```

`prisma migrate deploy` is the only migration command in production. Never run
`prisma migrate dev` or `db push` there.

## 5. PM2

```bash
cd /opt/envault
sudo -u envault pm2 start ecosystem.config.cjs
sudo -u envault pm2 save
pm2 startup systemd -u envault --hp /opt/envault
```

`ecosystem.config.cjs` runs **one** fork-mode instance. SQLite is single-writer;
do not use cluster mode or multiple instances.

Check:

```bash
curl http://127.0.0.1:5000/health
sudo -u envault pm2 logs envault-api --lines 50
```

## 6. nginx

`/etc/nginx/sites-available/envault`:

```nginx
# SPA
server {
    listen 443 ssl http2;
    server_name vault.example.com;

    root /opt/envault/packages/frontend/dist;
    index index.html;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Frame-Options DENY always;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}

# API
server {
    listen 443 ssl http2;
    server_name api.vault.example.com;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Enable and get certificates:

```bash
ln -s /etc/nginx/sites-available/envault /etc/nginx/sites-enabled/envault
nginx -t && systemctl reload nginx
certbot --nginx -d vault.example.com -d api.vault.example.com
```

Verify:

- `https://api.vault.example.com/health` → `{"ok":true}`
- `https://vault.example.com` loads the SPA
- Sign in works; the cookie is `Secure; HttpOnly; SameSite=Lax` on the API host.

If the SPA port or API hostname changes, update `FRONTEND_URL` /
`BETTER_AUTH_URL` and restart PM2 — CORS and trusted origins are exact strings.

## 7. Backups

The DB is secret material: encrypt every backup with `age` and keep the identity
key offline, separate from the backups.

```bash
# One-time keypair (keep the private key OFF this server, e.g. in a password manager)
age-keygen -o envault-backup.key

# Cron (envault user), daily 03:15
15 3 * * * ENVAULT_AGE_RECIPIENT=age1... /opt/envault/scripts/backup-db.sh >> /var/log/envault/backup.log 2>&1
```

The script uses SQLite's online `.backup`, runs `PRAGMA integrity_check`,
encrypts the result, and prunes files older than 30 days. Copy the `.db.age`
files off-box (rclone/rsync) and test a restore quarterly.

### Restore drill

```bash
sudo -u envault pm2 stop envault-api
cd /var/lib/envault
mv envault.db envault.db.pre-restore
rm -f envault.db-wal envault.db-shm
age -d -i /root/envault-backup.key -o envault.db /var/backups/envault/envault-YYYY-MM-DD.db.age
chmod 600 envault.db
chown envault:envault envault.db
sudo -u envault pm2 start envault-api
curl http://127.0.0.1:5000/health
```

Then sign in and verify one project/secret exists.

## 8. Upgrades

```bash
cd /opt/envault
sudo -u envault git pull
sudo -u envault pnpm install --frozen-lockfile
sudo -u envault pnpm build

# backup first, then migrate
sudo -u envault /opt/envault/scripts/backup-db.sh
set -a; . /etc/envault/envault.env; set +a
sudo -u envault env $(grep -v '^#' /etc/envault/envault.env | xargs) \
  pnpm --filter ev-backend exec prisma migrate deploy

sudo -u envault pm2 reload envault-api
```

## 9. Smoke test after deploy

1. `GET /health` returns ok.
2. Sign in from a different network/device.
3. Reveal a secret; confirm an audit row.
4. Export a development `.env`; confirm the filename downloads.
5. Enable/disable 2FA on a test account (or skip if not needed).
6. `pm2 logs` has no secret values.
