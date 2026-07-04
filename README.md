# Aleph-000's Blog

个人博客源码，使用 Hexo 和 hexo-theme-redefine 构建。

线上站点发布在 `https://aleph-000.github.io/`。当前仓库采用根目录静态发布：`index.html`、`css/`、`js/` 等文件由 Hexo 生成后提交到 `main` 分支根目录，GitHub Pages 可以直接读取。

## Local Development

```bash
pnpm install
pnpm server
```

## Build

```bash
pnpm build
```

重新生成静态站点后，把 `public/` 目录里的内容同步到仓库根目录再提交。

## Content

- 文章放在 `source/_posts`
- 关于页在 `source/about/index.md`
- 主题配置在 `_config.redefine.yml`

当前内容是可替换的初始版本。补充真实个人信息后，可以继续完善首页、关于页和项目文章。
