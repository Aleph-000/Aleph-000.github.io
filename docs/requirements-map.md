# Requirements Map

This file maps `.agent/requirements.md` to the current implementation.

## Main Line 1

| Requirement | Implementation |
| --- | --- |
| Upload/store blog posts | Markdown posts in `source/_posts/`; owner-only online CRUD at `/admin/` backed by `POST/GET/PUT/DELETE /admin/posts` |
| Personal introduction, photo, interests, experience | Hexo pages under `source/about/` and `source/projects/` |
| Comment area | Online API `GET/POST/DELETE /posts/{slug}/comments`; article UI injected by `source/js/online-features.js` |
| Domain access | GitHub Pages static site remains available; Aliyun ECS serves the online version at `https://aleph-null.cc/` with HTTPS. |

## Main Line 2

| Requirement | Implementation |
| --- | --- |
| CI/CD | Local CI script `tools/ci.ps1`; GitHub Actions CI in `.github/workflows/ci.yml`; manual Aliyun deployment workflow in `.github/workflows/deploy-aliyun.yml` |
| Container package | `api/Dockerfile`, `docker-compose.yml`, `docker-compose.aliyun.yml`, and `deploy/nginx/default.conf` |
| Backend + database migration | FastAPI + PostgreSQL via Docker Compose on Aliyun ECS; SQLite default for local development |
| Login auth | Independent `/login/` and `/register/` pages, `POST /auth/register`, `POST /auth/login`, signed bearer token |
| Admin management | Owner-only `/admin/` console, online post CRUD, recent comment deletion, analytics summary |
| Comments | `GET/POST /posts/{slug}/comments`, user/owner deletion |
| Likes | `POST/DELETE /posts/{slug}/like` |
| Favorites | `POST/DELETE /posts/{slug}/favorite`, `GET /me/favorites` |

## Branch Features Started

| Feature | Implementation |
| --- | --- |
| Keyword search | Hexo `search.xml`; API endpoint `GET /search?q=` |
| Data analytics | `POST /analytics/pageview`, owner-only `GET /analytics/summary` |
| CDN/static hosting | Static output in `do-static/`, suitable for CDN-backed static hosting |

## Not Implemented Yet

- Semantic search
- User recommendation
- Full MCP interface
- AI daily digest automation
- Ranked mini game
- Digital avatar

These are intentionally left as future modules so the current project remains stable and demonstrable.
