# Deployment Guide

## Static Build

Build the Hexo site:

```powershell
pnpm clean
pnpm build
```

Sync the generated site to both the DigitalOcean static directory and the repository root used by GitHub Pages:

```powershell
pnpm run sync:static
```

Then commit and push. DigitalOcean Static Site deploys from `/do-static`; GitHub Pages can serve the generated files from the repository root.

## Online API Local Run

Create a virtual environment, install dependencies, and start FastAPI:

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

The API will default to SQLite at `api/data/blog.db`.

## Docker Compose

Copy environment defaults:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set a strong `SECRET_KEY`. For a public deployment, also set `OWNER_SETUP_KEY` before the first owner registration so nobody can claim the owner account without that key. Then run:

```powershell
docker compose up --build
```

This starts:

- FastAPI API on `http://localhost:8000`
- PostgreSQL on `localhost:5432`

The first registration with username matching `OWNER_USERNAME` becomes the owner account. If `OWNER_SETUP_KEY` is set, the same value must be entered on `/register/`.

## Frontend API Base

The browser integration script uses:

1. `window.ALEPH_API_BASE`, if defined
2. `localStorage.ALEPH_API_BASE`, if set
3. same-origin `/api`

For local testing against `http://localhost:8000`:

```javascript
localStorage.setItem("ALEPH_API_BASE", "http://localhost:8000");
```

Then refresh an article page.

The admin console is available at `/admin/` after logging in as the owner account.

## Aliyun ECS Deployment

The online version currently runs on Aliyun ECS with Docker Compose:

- Public site: `https://aleph-null.cc/`
- API health check: `https://aleph-null.cc/api/health`
- Static frontend: `public/`
- Reverse proxy: `deploy/caddy/Caddyfile`
- Services: `web` (Caddy), `api` (FastAPI), `db` (PostgreSQL)

Production deployment uses:

```bash
docker compose -f docker-compose.aliyun.yml up -d --build
```

Environment variables are stored in `/opt/aleph-blog/.env` on the server. Do
not commit production secrets. The initial owner registration key is stored
locally under `.agent/`.

To publish a new local build to the current server, rebuild Hexo, package the
runtime files, upload them to `/opt/aleph-blog`, and restart Compose. Keep
`.agent/`, `.git/`, `node_modules/`, and local database files out of the
deployment package.

Remaining production polish:

- Add `www.aleph-null.cc` DNS if the `www` hostname should be supported.
- Database backups are handled by `deploy/backup-postgres.sh` on the server; keep a restore plan before relying on the site as durable production data.
- Use `.github/workflows/deploy-aliyun.yml` for manual CI/CD deployment after GitHub repository secrets are configured.

## Database Backups

The Aliyun server can create compressed PostgreSQL dumps with:

```bash
cd /opt/aleph-blog
chmod +x deploy/backup-postgres.sh
deploy/backup-postgres.sh
```

The script writes backups to `/opt/aleph-blog/backups` and removes dumps older
than 14 days by default. The current server is configured to run this script
daily through cron.

## DigitalOcean App Platform

The repository includes a reusable deployment script for the existing DigitalOcean app:

```powershell
$env:SECRET_KEY = "<long-random-secret>"
$env:OWNER_SETUP_KEY = "<owner-registration-key>"
powershell -ExecutionPolicy Bypass -File tools\deploy-digitalocean-app.ps1 -ProposeOnly
```

`-ProposeOnly` validates the App Platform spec and estimates cost without changing cloud resources.

After confirming the cost, deploy the online version:

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy-digitalocean-app.ps1
```

This updates the app to serve:

- Static frontend from `/do-static`
- FastAPI backend under `/api`
- PostgreSQL database referenced by `DATABASE_URL`

The current minimal App Platform proposal is about `$5/month` for the API service. The database is configured as a development database in the app spec; upgrade it to a production database if the site becomes long-term public infrastructure.
