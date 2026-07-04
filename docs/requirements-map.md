# Requirements Map

This file maps `.agent/requirements.md` to the current implementation.

## Main Line 1

| Requirement | Implementation |
| --- | --- |
| Upload/store blog posts | Markdown posts in `source/_posts/`; online owner API at `POST /admin/posts` |
| Personal introduction, photo, interests, experience | Hexo pages under `source/about/` and `source/projects/` |
| Comment area | Online API `GET/POST /posts/{slug}/comments`; article UI injected by `source/js/online-features.js` |
| Domain access | GitHub Pages and DigitalOcean Static Site can serve `do-static/` |

## Main Line 2

| Requirement | Implementation |
| --- | --- |
| CI/CD | Local CI script `tools/ci.ps1`; DigitalOcean static app auto-deploys from GitHub push; workflow template in `docs/github-actions-static.yml.example` |
| Container package | `api/Dockerfile` and `docker-compose.yml` |
| Backend + database migration | FastAPI + PostgreSQL via Docker Compose; SQLite default for local development |
| Login auth | `POST /auth/register`, `POST /auth/login`, signed bearer token |
| Comments | `GET/POST /posts/{slug}/comments` |
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
