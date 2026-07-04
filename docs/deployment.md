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

Edit `.env` and set a strong `SECRET_KEY`, then run:

```powershell
docker compose up --build
```

This starts:

- FastAPI API on `http://localhost:8000`
- PostgreSQL on `localhost:5432`

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
