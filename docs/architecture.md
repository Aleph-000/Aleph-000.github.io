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

The frontend is still served as static files. A small browser script connects article pages to the API. If the API is unavailable, the page remains readable.

## Shared Content Model

Markdown posts remain the canonical source for public articles. The API reads post metadata from `source/_posts/` and stores interactive state in the database.

```text
source/_posts/*.md       canonical article source
Hexo                     static rendering
do-static/               static deployment artifact
api/                     online interaction API
database                 users, comments, likes, favorites, analytics
```

## Deployment Shapes

Recommended production layout:

```text
GitHub Pages or DigitalOcean Static Site
  serves do-static/

API host or VPS
  runs FastAPI container
  connects to PostgreSQL
```

For one-machine deployment, use Docker Compose:

```text
docker compose up --build
```

The static site should be served by a CDN or static hosting platform. The API should be protected with HTTPS and a strong `SECRET_KEY`.
