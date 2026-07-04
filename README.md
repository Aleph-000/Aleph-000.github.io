# Aleph_null's Blog

个人博客源码，支持静态作品集版本和在线互动版本。

- Static site: Hexo + hexo-theme-redefine
- Online API: FastAPI + SQLAlchemy
- Database: SQLite for local development, PostgreSQL for Docker Compose

静态站点可以部署到 GitHub Pages 或 DigitalOcean Static Site。在线功能通过浏览器脚本接入 API，API 不可用时静态内容仍可访问。

## Local Development

```bash
pnpm install
pnpm server
```

## Build

```bash
pnpm build
```

同步 DigitalOcean 静态部署目录：

```bash
pnpm run sync:static
```

完整本地 CI：

```powershell
powershell -ExecutionPolicy Bypass -File tools\ci.ps1
```

## Online API

```powershell
cd api
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Docker Compose:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

## Content

- 文章放在 `source/_posts`
- 关于页在 `source/about/index.md`
- 主题配置在 `_config.redefine.yml`

## Documentation

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/requirements-map.md`
- `docs/ci-cd.md`
