# Aleph_null Blog Architecture

This project is designed to produce both a static portfolio blog and an online interactive version from the same repository.

## Static Version

The static site is built with Hexo and `hexo-theme-redefine`.

- Source content: `source/`
- Blog posts: `source/_posts/`
- Build output: `public/`
- DigitalOcean static deploy source: `do-static/`
- GitHub Pages static source: repository root generated files

The static version can run without a backend. It keeps the site available even if the online API is offline.

## Online Version

The online version adds a FastAPI backend for interactive data:

- Account registration and login
- Post comments
- Likes
- Favorites
- Keyword search
- Basic page-view analytics
- Owner-only online post management

The frontend is still served as static files. A small browser script connects article pages to the API. If the API is unavailable, the page remains readable.

## Shared Content Model

Markdown posts remain the canonical source for static public articles. The API reads post metadata from `source/_posts/` and stores interactive state in the database. Online posts created from `/admin/` live in the database and are displayed through `/online/`.

```text
source/_posts/*.md       canonical article source
Hexo                     static rendering
do-static/               static deployment artifact
api/                     online interaction and admin API
database                 users, online posts, comments, likes, favorites, analytics
```

## Web Entry Points

- `/login/` and `/register/`: standalone authentication pages.
- `/online/`: API-backed article list and online article reader.
- `/admin/`: owner-only console for creating, editing, unpublishing, deleting online posts, and moderating recent comments.
- Static article pages: Markdown content plus online comment, like, and favorite widgets.

## Deployment Shapes

Recommended production layout:

```text
GitHub Pages
  serves generated root static files

DigitalOcean App Platform
  serves do-static/
  routes /api/* to FastAPI
  provides PostgreSQL to the API

FastAPI
  also supports /api/* paths for same-origin routing
```

For one-machine deployment, use Docker Compose:

```text
docker compose up --build
```

The static site should be served by a CDN or static hosting platform. The API should be protected with HTTPS and a strong `SECRET_KEY`.

`source/js/online-features.js` chooses the API base in this order:

1. `window.ALEPH_API_BASE`
2. `localStorage.ALEPH_API_BASE`
3. `http://127.0.0.1:8000` for local Hexo on port 4000
4. DigitalOcean `/api` endpoint for GitHub Pages
5. same-origin `/api` for DigitalOcean App Platform
