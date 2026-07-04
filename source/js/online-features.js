(function () {
  const articlePath = /^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/;
  const onlinePath = /^\/online\/?$/;
  const archivePath = /^\/archives(?:\/.*)?\/?$/;
  const tagsPath = /^\/tags\/?$/;
  const categoriesPath = /^\/categories\/?$/;
  const authPath = /^\/(login|register)\/?$/;
  const adminPath = /^\/admin\/?$/;
  const accountPath = /^\/account\/?$/;
  const siteTitle = "Aleph_null's Blog";
  let publicPostsPromise;

  function forceDocumentTitle() {
    document.title = siteTitle;
  }

  function defaultApiBase() {
    const host = window.location.hostname;
    if ((host === "localhost" || host === "127.0.0.1") && window.location.port === "4000") {
      return "http://127.0.0.1:8000";
    }
    if (host === "aleph-000.github.io") {
      return "https://aleph-null.cc/api";
    }
    return "/api";
  }

  const apiBase = String(
    window.ALEPH_API_BASE ||
      localStorage.getItem("ALEPH_API_BASE") ||
      defaultApiBase()
  ).replace(/\/$/, "");

  function api(path) {
    return `${apiBase}${path}`;
  }

  function token() {
    return localStorage.getItem("ALEPH_TOKEN") || "";
  }

  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem("ALEPH_USER") || "null");
    } catch (_) {
      return null;
    }
  }

  function authHeaders() {
    const value = token();
    return value ? { Authorization: `Bearer ${value}` } : {};
  }

  async function request(path, options) {
    const response = await fetch(api(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(options && options.headers ? options.headers : {}),
      },
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body && body.detail) detail = String(body.detail);
      } catch (_) {
        // Keep the status code when the server does not return JSON.
      }
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function uploadImage(file) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(api("/admin/uploads"), {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function listPublicPosts() {
    if (!publicPostsPromise) publicPostsPromise = request("/posts");
    return publicPostsPromise;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const managedImagesStart = "<!-- ALEPH_IMAGES_START -->";
  const managedImagesEnd = "<!-- ALEPH_IMAGES_END -->";
  const managedImagesPattern =
    /<!-- ALEPH_IMAGES_START -->([\s\S]*?)<!-- ALEPH_IMAGES_END -->/;

  function stripManagedImageBlock(markdown) {
    return String(markdown || "").replace(managedImagesPattern, "").trim();
  }

  function extractManagedImages(markdown) {
    const match = String(markdown || "").match(managedImagesPattern);
    if (!match) return [];
    return match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((line) => line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))
      .filter(Boolean)
      .map((match) => ({ alt: match[1], url: match[2] }));
  }

  function withManagedImages(markdown, images) {
    const body = stripManagedImageBlock(markdown);
    const rows = images
      .filter((image) => image.url)
      .map((image) => `![${image.alt || "图片"}](${image.url})`);
    if (!rows.length) return body;
    return `${body}\n\n${managedImagesStart}\n${rows.join("\n")}\n${managedImagesEnd}`;
  }

  function renderInline(text) {
    return escapeHtml(text)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a class="link" target="_blank" rel="noopener" href="$2">$1</a>'
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function renderImageBlock(text) {
    const images = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/))
      .filter(Boolean);
    if (!images.length) return "";
    return `<div class="aleph-image-grid">${images
      .map(
        (match) => `
          <figure>
            <img src="${escapeHtml(match[2])}" alt="${escapeHtml(match[1] || "文章图片")}" loading="lazy">
            ${match[1] ? `<figcaption>${escapeHtml(match[1])}</figcaption>` : ""}
          </figure>
        `
      )
      .join("")}</div>`;
  }

  function normalizeMarkdown(markdown) {
    return String(markdown || "")
      .replace(/\*\*\s+([^*\n]+?)\s+\*\*/g, "**$1**")
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, body) => {
        const fixedBody = body.replace(/(^|[^\\])\\\s*$/gm, "$1\\\\");
        return `$$${fixedBody}$$`;
      });
  }

  function protectMathBlocks(markdown) {
    const mathBlocks = [];
    const text = normalizeMarkdown(markdown).replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      const token = `@@ALEPH_MATH_BLOCK_${mathBlocks.length}@@`;
      mathBlocks.push(match);
      return `\n\n${token}\n\n`;
    });
    return { text, mathBlocks };
  }

  function restoreMathBlocks(html, mathBlocks) {
    return html.replace(/(?:<p>)?@@ALEPH_MATH_BLOCK_(\d+)@@(?:<\/p>)?/g, (_, index) => {
      const block = mathBlocks[Number(index)] || "";
      return `<div class="aleph-math-block">${escapeHtml(block)}</div>`;
    });
  }

  function renderMarkdown(markdown) {
    const protectedMarkdown = protectMathBlocks(markdown);
    if (window.marked && window.marked.parse) {
      window.marked.setOptions({
        breaks: true,
        gfm: true,
        mangle: false,
        headerIds: false,
      });
      return restoreMathBlocks(
        window.marked.parse(protectedMarkdown.text),
        protectedMarkdown.mathBlocks
      );
    }
    const html = protectedMarkdown.text
      .split(/\n{2,}/)
      .map((block) => {
        const text = block.trim();
        if (!text) return "";
        if (text === managedImagesStart || text === managedImagesEnd) return "";
        if (/^!\[[^\]]*\]\(https?:\/\/[^)\s]+\)$/m.test(text)) {
          return renderImageBlock(text);
        }
        if (/^###\s+/.test(text)) return `<h3>${renderInline(text.replace(/^###\s+/, ""))}</h3>`;
        if (/^##\s+/.test(text)) return `<h2>${renderInline(text.replace(/^##\s+/, ""))}</h2>`;
        if (/^#\s+/.test(text)) return `<h1>${renderInline(text.replace(/^#\s+/, ""))}</h1>`;
        if (/^[-*]\s+/m.test(text)) {
          const items = text
            .split("\n")
            .filter((line) => /^[-*]\s+/.test(line.trim()))
            .map((line) => `<li>${renderInline(line.trim().replace(/^[-*]\s+/, ""))}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        const inline = renderInline(text).replace(/\n/g, "<br>");
        return `<p>${inline}</p>`;
      })
      .join("");
    return restoreMathBlocks(html, protectedMarkdown.mathBlocks);
  }

  function ensureMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      return Promise.resolve(window.MathJax);
    }
    if (window.__ALEPH_MATHJAX_PROMISE) return window.__ALEPH_MATHJAX_PROMISE;
    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"], ["\\(", "\\)"]],
        displayMath: [["$$", "$$"], ["\\[", "\\]"]],
      },
      svg: { fontCache: "global" },
    };
    window.__ALEPH_MATHJAX_PROMISE = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
      script.async = true;
      script.onload = () => resolve(window.MathJax);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return window.__ALEPH_MATHJAX_PROMISE;
  }

  function typesetMath(root) {
    ensureMathJax()
      .then((mathjax) => mathjax.typesetPromise && mathjax.typesetPromise([root]))
      .catch(() => {});
  }

  function plainTextFromMarkdown(markdown, limit = 220) {
    const lines = stripManagedImageBlock(markdown)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#>*_`~\-]+/g, " ")
      .replace(/<[^>]+>/g, " ")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  function nextUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function authLink(mode) {
    const next = encodeURIComponent(nextUrl());
    return `/${mode}/?next=${next}`;
  }

  function logout() {
    localStorage.removeItem("ALEPH_TOKEN");
    localStorage.removeItem("ALEPH_USER");
  }

  function storeSession(result) {
    localStorage.setItem("ALEPH_TOKEN", result.access_token);
    localStorage.setItem("ALEPH_USER", JSON.stringify(result.user));
  }

  function staticArticleSlug() {
    const match = window.location.pathname.match(articlePath);
    return match ? match[1] : null;
  }

  function onlineArticleSlug() {
    if (!onlinePath.test(window.location.pathname)) return null;
    return new URLSearchParams(window.location.search).get("slug");
  }

  function currentPostSlug() {
    return staticArticleSlug() || onlineArticleSlug();
  }

  function staticPostUrl(post) {
    const date = String(post.date || "").slice(0, 10).replace(/-/g, "/");
    return date ? `/${date}/${post.slug}/` : `/archives/`;
  }

  function postUrl(post) {
    return post.source === "online"
      ? `/online/?slug=${encodeURIComponent(post.slug)}`
      : staticPostUrl(post);
  }

  function formatPostDate(value) {
    return String(value || "").slice(0, 10) || "在线文章";
  }

  function previewText(post) {
    return String(post.excerpt || post.preview || "").trim();
  }

  function postCategory(post) {
    return String((post && post.category) || "未分类").trim() || "未分类";
  }

  function postTags(post) {
    const raw = post && post.tags;
    if (Array.isArray(raw)) {
      return raw.map((tag) => String(tag || "").trim()).filter(Boolean);
    }
    return String(raw || "")
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function addCount(map, key) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  }

  function collectTaxonomy(posts) {
    const categories = new Map();
    const tags = new Map();
    posts.forEach((post) => {
      addCount(categories, postCategory(post));
      postTags(post).forEach((tag) => addCount(tags, tag));
    });
    const sortTerms = (map) =>
      Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return {
      categories: sortTerms(categories),
      tags: sortTerms(tags),
    };
  }

  function taxonomyUrl(type, term) {
    return `/${type}/?${type === "tags" ? "tag" : "category"}=${encodeURIComponent(term)}`;
  }

  function renderTags(post) {
    const tags = postTags(post);
    if (!tags.length) return "";
    return `<div class="aleph-tags">${tags
      .map(
        (tag) =>
          `<a class="aleph-tag" href="${taxonomyUrl("tags", tag)}">#${escapeHtml(tag)}</a>`
      )
      .join("")}</div>`;
  }

  async function hydratePostPreview(post) {
    if (previewText(post) || post.source !== "online") return post;
    try {
      const detail = await request(`/posts/${post.slug}`);
      return {
        ...post,
        preview: plainTextFromMarkdown(detail.body),
      };
    } catch (_) {
      return post;
    }
  }

  async function hydratePostPreviews(posts) {
    return Promise.all(posts.map(hydratePostPreview));
  }

  function archiveSectionsHtml(posts, emptyText) {
    const groups = posts.reduce((acc, post) => {
      const year = String(post.date || "").slice(0, 4) || "未注明年份";
      if (!acc[year]) acc[year] = [];
      acc[year].push(post);
      return acc;
    }, {});
    const years = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return years.length
      ? years
          .map(
            (year) => `
              <section class="archive-item mb-spacing-unit last:mb-0">
                <div class="archive-item-header flex flex-row items-center mb-2">
                  <span class="archive-year font-semibold text-3xl mr-2">${escapeHtml(year)}</span>
                  <span class="archive-year-post-count text-xs md:text-sm font-bold rounded-small bg-third-background-color py-[2px] px-[10px] border border-border-color">${groups[year].length}</span>
                </div>
                <ul class="article-list pl-0 md:pl-8 text-lg leading-[1.5]">
                  ${groups[year]
                    .map(
                      (post) => `
                        <li class="article-item space-y-2 px-6 pt-10 pb-2 text-xl relative border-l-2 border-border-color" date-is="${escapeHtml(formatPostDate(post).slice(5) || "online")}">
                          <a href="${postUrl(post)}" class="block w-fit">
                            <span class="article-title my-0.5 text-2xl">${escapeHtml(post.title)}</span>
                          </a>
                          <div class="aleph-post-taxonomy">
                            <a class="aleph-category" href="${taxonomyUrl("categories", postCategory(post))}">${escapeHtml(postCategory(post))}</a>
                            ${renderTags(post)}
                          </div>
                          <p class="text-sm opacity-75">${escapeHtml(previewText(post))}</p>
                        </li>
                      `
                    )
                    .join("")}
                </ul>
              </section>
            `
          )
          .join("")
      : `<p class="aleph-online__status">${escapeHtml(emptyText || "暂无文章。")}</p>`;
  }

  function setShellTitleVisible(root, visible) {
    const container = root.closest(".page-template-content");
    const heading = container && container.querySelector(":scope > h1");
    if (heading) heading.hidden = !visible;
  }

  function applySiteStats(posts) {
    const count = posts.length;
    const taxonomy = collectTaxonomy(posts);
    document.querySelectorAll(".statistics a.item").forEach((item) => {
      const href = item.getAttribute("href") || "";
      const number = item.querySelector(".number");
      if (number && href.includes("/archives")) number.textContent = String(count);
      if (number && href.includes("/tags")) number.textContent = String(taxonomy.tags.length);
      if (number && href.includes("/categories")) {
        number.textContent = String(taxonomy.categories.length);
      }
    });
    document.querySelectorAll(".post-count").forEach((node) => {
      node.innerHTML = `<span>共撰写了 ${count} 篇文章</span>`;
    });
  }

  async function initSiteStats() {
    try {
      applySiteStats(await listPublicPosts());
    } catch (_) {}
  }

  function renderSearchResults(result, posts, query) {
    if (!result) return;
    if (!query) {
      result.innerHTML = "";
      return;
    }
    if (!posts.length) {
      result.innerHTML = '<div id="no-result">没有找到相关文章。</div>';
      return;
    }
    result.innerHTML = `
      <ul class="search-result-list">
        ${posts
          .map(
            (post) => `
              <li>
                <a class="search-result-title" href="${postUrl(post)}">${escapeHtml(post.title)}</a>
                <p class="search-result">${escapeHtml(previewText(post) || post.excerpt || "")}</p>
              </li>
            `
          )
          .join("")}
      </ul>
    `;
  }

  function initOnlineSearch() {
    if (window.__ALEPH_SEARCH_BOUND) return;
    window.__ALEPH_SEARCH_BOUND = true;
    let timer = 0;
    document.addEventListener(
      "input",
      (event) => {
        const input = event.target.closest(".search-input");
        if (!input) return;
        const query = input.value.trim();
        window.clearTimeout(timer);
        timer = window.setTimeout(async () => {
          const result = document.querySelector("#search-result");
          try {
            const posts = query
              ? await hydratePostPreviews(await request(`/search?q=${encodeURIComponent(query)}`))
              : [];
            renderSearchResults(result, posts, query);
          } catch (_) {
            if (result) result.innerHTML = '<div id="no-result">搜索暂不可用。</div>';
          }
        }, 120);
      },
      true
    );
  }

  function renderHomeArticle(post) {
    const preview = previewText(post);
    return `
      <li class="home-article-item">
        <div class="flex flex-col gap-5 px-7 pb-7 pt-7">
          <h3 class="home-article-title">
            <a href="${postUrl(post)}">${escapeHtml(post.title)}</a>
          </h3>
          <div class="home-article-content markdown-body">
            ${escapeHtml(preview)}
          </div>
          <div class="home-article-meta-info-container">
            <div class="home-article-meta-info">
              <span><i class="fa-solid fa-calendars"></i>&nbsp;
                <span class="home-article-date">${formatPostDate(post.date)}</span>
              </span>
              <span class="home-article-category">
                <i class="fa-solid fa-folders"></i>&nbsp;
                <ul><li><a href="${taxonomyUrl("categories", postCategory(post))}">${escapeHtml(postCategory(post))}</a>&nbsp;</li></ul>
              </span>
            </div>
            <a href="${postUrl(post)}">阅读全文<span class="seo-reader-text">${escapeHtml(post.title)}</span>&nbsp;<i class="fa-solid fa-angle-right"></i></a>
          </div>
          ${renderTags(post)}
        </div>
      </li>
    `;
  }

  function renderHomeStatus(title, text) {
    return `
      <li class="home-article-item aleph-home-status">
        <div class="flex flex-col gap-5 px-7 pb-7 pt-7">
          <h3 class="home-article-title">${title}</h3>
          <div class="home-article-content markdown-body">${text}</div>
        </div>
      </li>
    `;
  }

  async function initHomePosts() {
    const isHome =
      window.location.pathname === "/" || window.location.pathname === "/index.html";
    if (!isHome) return;
    const list = document.querySelector(".home-article-list");
    if (!list || list.dataset.onlineHomeMounted) return;
    list.dataset.onlineHomeMounted = "true";
    list.classList.add("aleph-home-online-mounted");
    list.innerHTML = renderHomeStatus("正在读取文章列表", "文章由后台在线管理。");
    try {
      const posts = await hydratePostPreviews(await listPublicPosts());
      list.innerHTML = posts.length
        ? posts.map(renderHomeArticle).join("")
        : renderHomeStatus("暂无文章", "管理员可以在后台发布新文章。");
    } catch (_) {
      list.innerHTML = renderHomeStatus("文章暂不可用", "请稍后刷新。");
    }
  }

  function setStatus(root, text) {
    const node = root.querySelector("[data-online-status]");
    if (node) node.textContent = text;
  }

  function renderAuthStatus(root) {
    const auth = root.querySelector("[data-online-auth]");
    if (!auth) return;
    const user = currentUser();
    if (user) {
      auth.innerHTML = `
        <span class="aleph-online__user">${escapeHtml(user.display_name || user.username)}</span>
        <button type="button" data-action="logout"><i class="fa-regular fa-right-from-bracket"></i> 退出</button>
      `;
      return;
    }
    auth.innerHTML = `
      <span class="aleph-online__user">访客模式</span>
    `;
  }

  function renderComments(root, comments) {
    const list = root.querySelector("[data-online-comments]");
    if (!list) return;
    if (!comments.length) {
      list.innerHTML = '<p class="aleph-online__empty">暂无评论</p>';
      return;
    }
    const user = currentUser();
    list.innerHTML = comments
      .map((comment) => {
        const canDelete =
          user && (user.is_owner || user.id === (comment.user && comment.user.id));
        return `
          <div class="aleph-online__comment">
            <div class="aleph-online__comment-meta">
              <strong>${escapeHtml(comment.user.display_name)}</strong>
              <time>${new Date(comment.created_at).toLocaleString()}</time>
            </div>
            <div class="aleph-online__comment-body">${escapeHtml(comment.body)}</div>
            ${
              canDelete
                ? `<button type="button" data-action="delete-comment" data-comment-id="${comment.id}"><i class="fa-regular fa-trash-can"></i> 删除</button>`
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function renderInteractions(root, state) {
    const like = root.querySelector('[data-action="like"]');
    const favorite = root.querySelector('[data-action="favorite"]');
    if (like) {
      like.innerHTML = `<i class="fa-regular fa-heart"></i> 点赞 ${state.likes}`;
      like.dataset.active = String(state.liked);
    }
    if (favorite) {
      favorite.innerHTML = `<i class="fa-regular fa-bookmark"></i> 收藏 ${state.favorites}`;
      favorite.dataset.active = String(state.favorited);
    }
  }

  function renderComposer(root) {
    const composer = root.querySelector("[data-online-composer]");
    if (!composer) return;
    if (currentUser()) {
      composer.innerHTML = `
        <textarea data-comment-body placeholder="写下评论"></textarea>
        <button type="button" data-action="comment"><i class="fa-regular fa-paper-plane"></i> 发布评论</button>
      `;
      return;
    }
    composer.innerHTML = `
      <p class="aleph-online__empty">登录后可以发布评论、点赞和收藏。</p>
    `;
  }

  async function refreshInteraction(root, slug) {
    const [interactions, comments] = await Promise.all([
      request(`/posts/${slug}/interactions`),
      request(`/posts/${slug}/comments`),
    ]);
    renderInteractions(root, interactions);
    renderComments(root, comments);
    renderAuthStatus(root);
    renderComposer(root);
    setStatus(root, "在线互动已连接");
  }

  function mountArticleInteractions(slug, target) {
    if (!slug || !target || target.querySelector(".aleph-online")) return;
    const root = document.createElement("section");
    root.className = "aleph-online";
    root.innerHTML = `
      <div class="aleph-online__bar">
        <h2 class="aleph-online__title">评论</h2>
        <div class="aleph-online__actions">
          <button type="button" data-action="like"><i class="fa-regular fa-heart"></i> 点赞 0</button>
          <button type="button" data-action="favorite"><i class="fa-regular fa-bookmark"></i> 收藏 0</button>
        </div>
      </div>
      <p class="aleph-online__status" data-online-status>正在连接在线互动</p>
      <div class="aleph-online__auth" data-online-auth></div>
      <div class="aleph-online__comments" data-online-comments></div>
      <div class="aleph-online__composer" data-online-composer></div>
    `;
    target.appendChild(root);
    renderAuthStatus(root);
    renderComposer(root);

    root.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      try {
        if (action === "logout") {
          logout();
          await refreshInteraction(root, slug);
          return;
        }
        if (!currentUser() && ["like", "favorite", "comment"].includes(action)) {
          window.location.href = authLink("login");
          return;
        }
        if (action === "like" || action === "favorite") {
          const active = button.dataset.active === "true";
          const method = active ? "DELETE" : "POST";
          const state = await request(`/posts/${slug}/${action}`, { method });
          renderInteractions(root, state);
          return;
        }
        if (action === "comment") {
          const textarea = root.querySelector("[data-comment-body]");
          const body = textarea.value.trim();
          if (!body) return;
          await request(`/posts/${slug}/comments`, {
            method: "POST",
            body: JSON.stringify({ body }),
          });
          textarea.value = "";
          await refreshInteraction(root, slug);
          return;
        }
        if (action === "delete-comment") {
          await request(`/posts/${slug}/comments/${button.dataset.commentId}`, {
            method: "DELETE",
          });
          await refreshInteraction(root, slug);
        }
      } catch (_) {
        setStatus(root, "在线互动暂不可用");
      }
    });

    refreshInteraction(root, slug).catch(() => {
      setStatus(root, "在线互动暂不可用");
    });
  }

  function initStaticArticle() {
    const slug = staticArticleSlug();
    if (!slug) return;
    const target =
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body") ||
      document.querySelector("article");
    mountArticleInteractions(slug, target);
  }

  function renderAuthPage(mode, root) {
    const isRegister = mode === "register";
    root.innerHTML = `
      <section class="aleph-console aleph-auth">
        <div class="aleph-console__header">
          <h1>${isRegister ? "注册账号" : "登录账号"}</h1>
          <p data-auth-status>${isRegister ? "创建账号后可以评论、点赞和收藏。" : "登录后继续刚才的操作。"}</p>
        </div>
        <form class="aleph-form" data-auth-form>
          <label>
            <span>用户名</span>
            <input name="username" autocomplete="username" required minlength="2" maxlength="80">
          </label>
          ${
            isRegister
              ? `<label>
                  <span>显示名</span>
                  <input name="display_name" autocomplete="nickname" maxlength="120">
                </label>`
              : ""
          }
          <label>
            <span>密码</span>
            <input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required minlength="8" maxlength="120">
          </label>
          ${
            isRegister
              ? `<label>
                  <span>Owner Key</span>
                  <input name="owner_key" type="password" autocomplete="off" maxlength="120">
                </label>`
              : ""
          }
          <div class="aleph-console__actions">
            <button type="submit"><i class="fa-regular fa-${isRegister ? "user-plus" : "right-to-bracket"}"></i> ${isRegister ? "注册" : "登录"}</button>
            <a class="aleph-online__link" href="/${isRegister ? "login" : "register"}/">${isRegister ? "已有账号，去登录" : "没有账号，去注册"}</a>
          </div>
        </form>
      </section>
    `;

    root.querySelector("[data-auth-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        username: String(form.get("username") || "").trim(),
        password: String(form.get("password") || ""),
      };
      if (isRegister) {
        const displayName = String(form.get("display_name") || "").trim();
        const ownerKey = String(form.get("owner_key") || "");
        if (displayName) payload.display_name = displayName;
        if (ownerKey) payload.owner_key = ownerKey;
      }
      const status = root.querySelector("[data-auth-status]");
      try {
        const result = await request(`/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        storeSession(result);
        status.textContent = "已登录，正在跳转。";
        const next = new URLSearchParams(window.location.search).get("next") || "/account/";
        window.location.href = next.startsWith("/") ? next : "/";
      } catch (error) {
        status.textContent = error.status === 409 ? "用户名已存在。" : "登录或注册失败，请检查输入。";
      }
    });
  }

  function initAuthPage() {
    const match = window.location.pathname.match(authPath);
    if (!match) return;
    const target =
      document.querySelector("[data-auth-app]") ||
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body") ||
      document.querySelector("article");
    if (!target || target.dataset.authMounted) return;
    target.dataset.authMounted = "true";
    renderAuthPage(match[1], target);
  }

  function renderOnlineList(root, posts) {
    root.innerHTML = `
      <section class="aleph-console">
        <div class="aleph-console__header">
          <h1>文章</h1>
          <p>这里显示后台发布的文章。</p>
        </div>
        <div class="aleph-online-list">
          ${posts
            .map((post) => {
              return `
                <article class="aleph-online-list__item">
                  <a href="${postUrl(post)}">${escapeHtml(post.title)}</a>
                  <span>${escapeHtml(postCategory(post))}</span>
                  ${renderTags(post)}
                  <p>${escapeHtml(previewText(post))}</p>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  function renderArchiveList(root, posts) {
    root.classList.add("aleph-archive-mounted");
    root.innerHTML = archiveSectionsHtml(posts, "暂无文章。");
  }

  async function initArchivePage() {
    if (!archivePath.test(window.location.pathname)) return;
    const root = document.querySelector(".archive-list-container");
    if (!root || root.dataset.alephArchiveMounted) return;
    root.dataset.alephArchiveMounted = "true";
    root.classList.add("aleph-archive-mounted");
    root.innerHTML = '<p class="aleph-online__status">正在读取线上归档</p>';
    try {
      renderArchiveList(root, await hydratePostPreviews(await listPublicPosts()));
    } catch (_) {
      root.innerHTML = '<p class="aleph-online__status">归档暂不可用。</p>';
    }
  }

  function renderTagCloud(terms, selected) {
    return `
      <div class="tagcloud-content">
        <ul class="tag-list" data-show-value="true">
          ${terms
            .map(
              (term) => `
                <li>
                  <a data-weight="${term.count}" class="${term.name === selected ? "aleph-taxonomy-active" : ""}" href="${taxonomyUrl("tags", term.name)}">
                    <i class="fa-solid fa-hashtag"></i>${escapeHtml(term.name)}
                  </a>
                </li>
              `
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  function renderCategoryList(terms, selected) {
    return `
      <div class="category-list-content">
        <ul class="all-category-list">
          ${terms
            .map(
              (term) => `
                <li class="all-category-list-item ${term.name === selected ? "aleph-taxonomy-active" : ""}">
                  <a class="all-category-list-link" href="${taxonomyUrl("categories", term.name)}">${escapeHtml(term.name)}</a>
                  <span class="all-category-list-count">${term.count}</span>
                </li>
              `
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  function renderTaxonomyPage(root, posts, type) {
    const isTags = type === "tags";
    const queryKey = isTags ? "tag" : "category";
    const selected = new URLSearchParams(window.location.search).get(queryKey) || "";
    const taxonomy = collectTaxonomy(posts);
    const terms = isTags ? taxonomy.tags : taxonomy.categories;
    const filtered = selected
      ? posts.filter((post) =>
          isTags ? postTags(post).includes(selected) : postCategory(post) === selected
        )
      : posts;
    const title = selected ? `${isTags ? "标签" : "分类"}：${selected}` : isTags ? "Tags" : "Categories";
    const termList = isTags ? renderTagCloud(terms, selected) : renderCategoryList(terms, selected);
    root.innerHTML = `
      <h1 class="page-title-header">${escapeHtml(title)}</h1>
      ${termList}
      ${
        selected
          ? `<div class="archive-list-container aleph-archive-mounted aleph-taxonomy-archive">
              ${archiveSectionsHtml(filtered, "这个条目下暂时没有文章。")}
            </div>`
          : ""
      }
    `;
  }

  async function initTaxonomyPage() {
    const type = tagsPath.test(window.location.pathname)
      ? "tags"
      : categoriesPath.test(window.location.pathname)
        ? "categories"
        : "";
    if (!type) return;
    const root =
      document.querySelector(".page-template-container") ||
      document.querySelector(".page-template-content") ||
      document.querySelector(".category-list-content") ||
      document.querySelector(".main-content");
    if (!root || root.dataset.alephTaxonomyMounted) return;
    root.dataset.alephTaxonomyMounted = "true";
    root.innerHTML = '<p class="aleph-online__status">正在读取线上标签分类</p>';
    try {
      renderTaxonomyPage(root, await hydratePostPreviews(await listPublicPosts()), type);
    } catch (_) {
      root.innerHTML = '<p class="aleph-online__status">标签分类暂不可用。</p>';
    }
  }

  async function renderOnlinePost(root, slug) {
    const post = await request(`/posts/${slug}`);
    forceDocumentTitle();
    root.innerHTML = `
      <article class="aleph-console aleph-online-post">
        <div class="aleph-console__header">
          <h1>${escapeHtml(post.title)}</h1>
          <p>${escapeHtml(post.excerpt || post.date || "")}</p>
          <div class="aleph-post-taxonomy">
            <a class="aleph-category" href="${taxonomyUrl("categories", postCategory(post))}">
              <i class="fa-regular fa-folder"></i> ${escapeHtml(postCategory(post))}
            </a>
            ${renderTags(post)}
          </div>
        </div>
        <div class="aleph-online-post__body markdown-body">${renderMarkdown(post.body)}</div>
      </article>
    `;
    typesetMath(root);
    mountArticleInteractions(slug, root.querySelector(".aleph-online-post"));
  }

  async function initOnlinePage() {
    if (!onlinePath.test(window.location.pathname)) return;
    const root =
      document.querySelector("[data-online-posts]") ||
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body");
    if (!root || root.dataset.onlineMounted) return;
    root.dataset.onlineMounted = "true";
    setShellTitleVisible(root, !onlineArticleSlug());
    const slug = onlineArticleSlug();
    root.innerHTML = '<p class="aleph-online__status">正在加载在线文章</p>';
    try {
      if (slug) {
        await renderOnlinePost(root, slug);
      } else {
        const posts = await hydratePostPreviews(await listPublicPosts());
        renderOnlineList(root, posts);
      }
    } catch (_) {
      root.innerHTML = '<p class="aleph-online__status">在线文章暂不可用。</p>';
    }
  }

  function renderAccountDock() {
    const existing = document.querySelector(".aleph-account-dock");
    if (existing) existing.remove();
    const user = currentUser();
    const link = document.createElement("a");
    link.className = "aleph-account-dock";
    link.href = user ? "/account/" : authLink("login");
    link.title = user ? "账户与收藏" : "登录";
    link.setAttribute("aria-label", link.title);
    link.innerHTML = user
      ? `<i class="fa-regular fa-circle-user"></i><span>${escapeHtml(user.display_name || user.username)}</span>`
      : '<i class="fa-regular fa-right-to-bracket"></i><span>登录</span>';
    document.body.appendChild(link);
  }

  function renderAccount(root, favorites) {
    const user = currentUser();
    const hasFavorites = favorites && favorites.length > 0;
    root.innerHTML = `
      <section class="aleph-console aleph-account">
        <div class="aleph-console__header">
          <h1>账户</h1>
          <p>${escapeHtml(user.display_name || user.username)}</p>
        </div>
        <div class="aleph-console__actions">
          ${user.is_owner ? '<a class="aleph-online__link" href="/admin/"><i class="fa-regular fa-pen-to-square"></i> 管理后台</a>' : ""}
          <button type="button" data-account-action="logout"><i class="fa-regular fa-right-from-bracket"></i> 退出登录</button>
        </div>
        <section class="aleph-account__section">
          <h2>我的收藏</h2>
          ${
            hasFavorites
              ? `<div class="aleph-online-list">${favorites
                  .map(
                    (post) => `
                      <article class="aleph-online-list__item">
                        <a href="${postUrl(post)}">${escapeHtml(post.title)}</a>
                        <span>${escapeHtml(post.source)}</span>
                        <p>${escapeHtml(post.excerpt || "")}</p>
                      </article>
                    `
                  )
                  .join("")}</div>`
              : '<p class="aleph-online__empty">还没有收藏文章。打开任意文章，在评论区上方点击“收藏”即可加入这里。</p>'
          }
        </section>
      </section>
    `;
  }

  async function initAccountPage() {
    if (!accountPath.test(window.location.pathname)) return;
    const root =
      document.querySelector("[data-account-app]") ||
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body");
    if (!root || root.dataset.accountMounted) return;
    root.dataset.accountMounted = "true";
    const user = currentUser();
    if (!user) {
      root.innerHTML = `
        <section class="aleph-console aleph-account">
          <div class="aleph-console__header">
            <h1>账户</h1>
            <p>登录后可以评论、点赞、收藏文章，并在这里查看收藏列表。</p>
          </div>
          <div class="aleph-console__actions">
            <a class="aleph-online__link" href="${authLink("login")}"><i class="fa-regular fa-right-to-bracket"></i> 登录</a>
            <a class="aleph-online__link" href="${authLink("register")}"><i class="fa-regular fa-user-plus"></i> 注册</a>
          </div>
        </section>
      `;
      return;
    }
    root.innerHTML = '<p class="aleph-online__status">正在加载账户信息</p>';
    try {
      const me = await request("/auth/me");
      localStorage.setItem("ALEPH_USER", JSON.stringify(me));
      const favorites = await request("/me/favorites");
      renderAccount(root, favorites);
    } catch (_) {
      logout();
      root.innerHTML = `
        <section class="aleph-console aleph-account">
          <div class="aleph-console__header">
            <h1>账户</h1>
            <p>登录状态已过期，请重新登录。</p>
          </div>
          <a class="aleph-online__link" href="${authLink("login")}">登录</a>
        </section>
      `;
    }

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-account-action]");
      if (!target) return;
      if (target.dataset.accountAction === "logout") {
        logout();
        window.location.href = "/";
      }
    });
  }

  function imageRow(image) {
    return `
      <div class="aleph-image-row" data-image-row>
        <input name="image_alt" placeholder="图片说明" value="${escapeHtml(image.alt || "")}">
        <input name="image_url" placeholder="图片 URL，例如 https://..." value="${escapeHtml(image.url || "")}">
        <button type="button" data-admin-action="image-up" title="上移"><i class="fa-regular fa-arrow-up"></i></button>
        <button type="button" data-admin-action="image-down" title="下移"><i class="fa-regular fa-arrow-down"></i></button>
        <button type="button" data-admin-action="image-remove" title="删除"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    `;
  }

  function renderImageRows(form, images) {
    const list = form.querySelector("[data-image-list]");
    if (!list) return;
    const rows = images && images.length ? images : [{ alt: "", url: "" }];
    list.innerHTML = rows.map(imageRow).join("");
  }

  function collectManagedImages(form) {
    return Array.from(form.querySelectorAll("[data-image-row]"))
      .map((row) => ({
        alt: row.querySelector('[name="image_alt"]').value.trim(),
        url: row.querySelector('[name="image_url"]').value.trim(),
      }))
      .filter((image) => image.url);
  }

  function parseTagsInput(value) {
    return String(value || "")
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function defaultSortOrder(posts) {
    if (!posts.length) return 10;
    return Math.max(...posts.map((post) => Number(post.sort_order || 0))) + 10;
  }

  function setMarkdownMode(form, mode) {
    const textarea = form.elements.body;
    const preview = form.querySelector("[data-md-preview]");
    const editButton = form.querySelector('[data-admin-action="markdown-edit"]');
    const previewButton = form.querySelector('[data-admin-action="markdown-preview"]');
    if (!textarea || !preview) return;
    const isPreview = mode === "preview";
    textarea.hidden = isPreview;
    preview.hidden = !isPreview;
    if (isPreview) {
      preview.innerHTML = renderMarkdown(textarea.value);
      typesetMath(preview);
    }
    if (editButton) editButton.dataset.active = String(!isPreview);
    if (previewButton) previewButton.dataset.active = String(isPreview);
  }

  function renderAdmin(root, state) {
    const posts = state.posts || [];
    const comments = state.comments || [];
    const analytics = state.analytics || {};
    root.__adminState = state;
    root.innerHTML = `
      <section class="aleph-console" data-admin-root>
        <div class="aleph-console__header">
          <p data-admin-status>已登录管理员：${escapeHtml(currentUser().display_name || currentUser().username)}</p>
        </div>
        <div class="aleph-stats">
          <div><strong>${analytics.total_page_views || 0}</strong><span>访问</span></div>
          <div><strong>${analytics.total_users || 0}</strong><span>用户</span></div>
          <div><strong>${analytics.total_comments || 0}</strong><span>评论</span></div>
          <div><strong>${analytics.total_likes || 0}</strong><span>点赞</span></div>
          <div><strong>${analytics.total_favorites || 0}</strong><span>收藏</span></div>
        </div>
        <form class="aleph-form" data-admin-form>
          <input type="hidden" name="editing_slug">
          <label>
            <span>文章地址</span>
            <input name="slug" required minlength="2" maxlength="160" pattern="[a-z0-9][a-z0-9\\-]*" placeholder="weather">
          </label>
          <label>
            <span>标题</span>
            <input name="title" required maxlength="220">
          </label>
          <label>
            <span>摘要</span>
            <input name="excerpt" maxlength="500">
          </label>
          <label>
            <span>分类</span>
            <input name="category" maxlength="120" placeholder="随笔">
          </label>
          <label>
            <span>标签</span>
            <input name="tags" maxlength="500" placeholder="杭州, 生活, 数学">
          </label>
          <label class="aleph-form__check">
            <input name="published" type="checkbox" checked>
            <span>发布</span>
          </label>
          <label>
            <span>排序</span>
            <input name="sort_order" type="number" step="1" value="${defaultSortOrder(posts)}">
          </label>
          <section class="aleph-md-editor">
            <div class="aleph-md-editor__header">
              <strong>正文 Markdown</strong>
              <div class="aleph-console__actions">
                <button type="button" data-admin-action="markdown-edit" data-active="true">编辑</button>
                <button type="button" data-admin-action="markdown-preview">预览</button>
              </div>
            </div>
            <textarea name="body" required placeholder="在这里写 Markdown，支持标题、列表、链接、图片、代码块和 LaTeX。"></textarea>
            <div class="aleph-md-editor__preview markdown-body" data-md-preview hidden></div>
          </section>
          <section class="aleph-image-manager">
            <div class="aleph-image-manager__header">
              <strong>末尾图片</strong>
              <div class="aleph-console__actions">
                <button type="button" data-admin-action="image-upload"><i class="fa-regular fa-upload"></i> 上传本地图片</button>
                <button type="button" data-admin-action="image-add"><i class="fa-regular fa-image"></i> 添加图片 URL</button>
              </div>
              <input type="file" data-image-file accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>
            </div>
            <div class="aleph-image-manager__list" data-image-list>
              ${imageRow({})}
            </div>
          </section>
          <div class="aleph-console__actions">
            <button type="submit" data-admin-submit><i class="fa-regular fa-floppy-disk"></i> 保存文章</button>
            <button type="button" data-admin-action="clear"><i class="fa-regular fa-file"></i> 新建</button>
          </div>
        </form>
        <div class="aleph-admin-grid">
          <section>
            <h2>文章列表</h2>
            <div class="aleph-admin-list" data-admin-posts>
              ${posts
                .map(
                  (post) => `
                    <article class="aleph-admin-list__item" data-post-slug="${escapeHtml(post.slug)}">
                      <div>
                        <strong>${escapeHtml(post.title)}</strong>
                        <p>${escapeHtml(post.slug)} · ${escapeHtml(postCategory(post))} · ${postTags(post).map(escapeHtml).join(", ")} · 排序 ${Number(post.sort_order || 0)} · ${post.published ? "已发布" : "草稿"}</p>
                      </div>
                      <div class="aleph-console__actions">
                        <button type="button" data-admin-action="move-up" data-slug="${escapeHtml(post.slug)}"><i class="fa-regular fa-arrow-up"></i> 上移</button>
                        <button type="button" data-admin-action="move-down" data-slug="${escapeHtml(post.slug)}"><i class="fa-regular fa-arrow-down"></i> 下移</button>
                        <button type="button" data-admin-action="edit" data-slug="${escapeHtml(post.slug)}"><i class="fa-regular fa-pen-to-square"></i> 编辑</button>
                        <button type="button" data-admin-action="delete-post" data-slug="${escapeHtml(post.slug)}"><i class="fa-regular fa-trash-can"></i> 删除</button>
                      </div>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
          <section>
            <h2>最新评论</h2>
            <div class="aleph-admin-list" data-admin-comments>
              ${comments
                .map(
                  (comment) => `
                    <article class="aleph-admin-list__item">
                      <div>
                        <strong>${escapeHtml(comment.user.display_name)}</strong>
                        <p>${escapeHtml(comment.post_slug)} · ${escapeHtml(comment.body)}</p>
                      </div>
                      <button type="button" data-admin-action="delete-comment" data-comment-id="${comment.id}"><i class="fa-regular fa-trash-can"></i> 删除</button>
                    </article>
                  `
                )
                .join("")}
            </div>
          </section>
        </div>
      </section>
    `;
  }

  async function loadAdminState() {
    const [posts, comments, analytics] = await Promise.all([
      request("/admin/posts"),
      request("/admin/comments"),
      request("/analytics/summary"),
    ]);
    return { posts, comments, analytics };
  }

  function fillAdminForm(root, post) {
    const form = root.querySelector("[data-admin-form]");
    form.elements.editing_slug.value = post.slug;
    form.elements.slug.value = post.slug;
    form.elements.title.value = post.title;
    form.elements.excerpt.value = post.excerpt || "";
    form.elements.category.value = postCategory(post);
    form.elements.tags.value = postTags(post).join(", ");
    form.elements.body.value = stripManagedImageBlock(post.body);
    form.elements.published.checked = Boolean(post.published);
    form.elements.sort_order.value = Number(post.sort_order || 0);
    renderImageRows(form, extractManagedImages(post.body));
    setMarkdownMode(form, "edit");
    root.querySelector("[data-admin-submit]").textContent = "更新文章";
  }

  function clearAdminForm(root) {
    const form = root.querySelector("[data-admin-form]");
    form.reset();
    form.elements.editing_slug.value = "";
    form.elements.published.checked = true;
    form.elements.category.value = "";
    form.elements.tags.value = "";
    form.elements.sort_order.value = defaultSortOrder(root.__adminState?.posts || []);
    renderImageRows(form, []);
    setMarkdownMode(form, "edit");
    root.querySelector("[data-admin-submit]").innerHTML = '<i class="fa-regular fa-floppy-disk"></i> 保存文章';
  }

  async function movePost(root, slug, direction) {
    const posts = [...(root.__adminState?.posts || [])];
    const index = posts.findIndex((post) => post.slug === slug);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= posts.length) return;
    const normalized = posts.map((post, idx) => ({
      ...post,
      sort_order: (idx + 1) * 10,
    }));
    const current = normalized[index];
    const next = normalized[nextIndex];
    const currentOrder = current.sort_order;
    current.sort_order = next.sort_order;
    next.sort_order = currentOrder;
    await Promise.all([
      request(`/admin/posts/${current.slug}`, {
        method: "PUT",
        body: JSON.stringify({ sort_order: current.sort_order }),
      }),
      request(`/admin/posts/${next.slug}`, {
        method: "PUT",
        body: JSON.stringify({ sort_order: next.sort_order }),
      }),
    ]);
  }

  async function initAdminPage() {
    if (!adminPath.test(window.location.pathname)) return;
    const root =
      document.querySelector("[data-admin-app]") ||
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body");
    if (!root || root.dataset.adminMounted) return;
    root.dataset.adminMounted = "true";
    setShellTitleVisible(root, true);
    root.innerHTML = '<p class="aleph-online__status">正在加载管理控制台</p>';
    try {
      const me = await request("/auth/me");
      localStorage.setItem("ALEPH_USER", JSON.stringify(me));
      if (!me.is_owner) {
        root.innerHTML = `
          <section class="aleph-console">
            <p>当前账号没有管理员权限。</p>
          </section>
        `;
        return;
      }
      renderAdmin(root, await loadAdminState());
    } catch (error) {
      root.innerHTML = `
        <section class="aleph-console">
          <p>请先登录 owner 账号。</p>
          <a class="aleph-online__link" href="${authLink("login")}">登录</a>
        </section>
      `;
      return;
    }

    root.addEventListener("submit", async (event) => {
      if (!event.target.matches("[data-admin-form]")) return;
      event.preventDefault();
      const form = event.target;
      const payload = {
        slug: form.elements.slug.value.trim(),
        title: form.elements.title.value.trim(),
        excerpt: form.elements.excerpt.value.trim(),
        category: form.elements.category.value.trim(),
        tags: parseTagsInput(form.elements.tags.value),
        body: withManagedImages(
          form.elements.body.value.trim(),
          collectManagedImages(form)
        ),
        published: form.elements.published.checked,
        sort_order: Number(form.elements.sort_order.value || 0),
      };
      const editingSlug = form.elements.editing_slug.value;
      const status = root.querySelector("[data-admin-status]");
      try {
        await request(editingSlug ? `/admin/posts/${editingSlug}` : "/admin/posts", {
          method: editingSlug ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
        publicPostsPromise = null;
        status.textContent = "文章已保存。";
        renderAdmin(root, await loadAdminState());
      } catch (error) {
        status.textContent = error.status === 409 ? "文章地址已存在。" : "保存失败。";
      }
    });

    root.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-admin-action]");
      if (!target) return;
      const action = target.dataset.adminAction;
      const status = root.querySelector("[data-admin-status]");
      try {
        if (action === "clear") {
          clearAdminForm(root);
          return;
        }
        if (action === "markdown-edit" || action === "markdown-preview") {
          const form = root.querySelector("[data-admin-form]");
          setMarkdownMode(form, action === "markdown-preview" ? "preview" : "edit");
          return;
        }
        if (action === "image-add") {
          const form = root.querySelector("[data-admin-form]");
          form.querySelector("[data-image-list]").insertAdjacentHTML("beforeend", imageRow({}));
          return;
        }
        if (action === "image-upload") {
          const form = root.querySelector("[data-admin-form]");
          form.querySelector("[data-image-file]")?.click();
          return;
        }
        if (action === "image-remove") {
          const row = target.closest("[data-image-row]");
          if (row) row.remove();
          return;
        }
        if (action === "image-up" || action === "image-down") {
          const row = target.closest("[data-image-row]");
          const sibling =
            action === "image-up" ? row?.previousElementSibling : row?.nextElementSibling;
          if (row && sibling) {
            row.parentElement.insertBefore(
              action === "image-up" ? row : sibling,
              action === "image-up" ? sibling : row
            );
          }
          return;
        }
        if (action === "move-up" || action === "move-down") {
          await movePost(root, target.dataset.slug, action === "move-up" ? "up" : "down");
          publicPostsPromise = null;
          renderAdmin(root, await loadAdminState());
          return;
        }
        if (action === "edit") {
          fillAdminForm(root, await request(`/admin/posts/${target.dataset.slug}`));
          return;
        }
        if (action === "delete-post") {
          if (!window.confirm("删除这篇在线文章？")) return;
          await request(`/admin/posts/${target.dataset.slug}`, { method: "DELETE" });
          publicPostsPromise = null;
          renderAdmin(root, await loadAdminState());
          return;
        }
        if (action === "delete-comment") {
          await request(`/admin/comments/${target.dataset.commentId}`, { method: "DELETE" });
          renderAdmin(root, await loadAdminState());
        }
      } catch (_) {
        status.textContent = "操作失败。";
      }
    });

    root.addEventListener("change", async (event) => {
      const input = event.target.closest("[data-image-file]");
      if (!input || !input.files || !input.files.length) return;
      const form = root.querySelector("[data-admin-form]");
      const list = form.querySelector("[data-image-list]");
      const status = root.querySelector("[data-admin-status]");
      try {
        status.textContent = "正在上传图片...";
        for (const file of Array.from(input.files)) {
          const result = await uploadImage(file);
          list.insertAdjacentHTML(
            "beforeend",
            imageRow({ alt: file.name.replace(/\.[^.]+$/, ""), url: result.url })
          );
        }
        input.value = "";
        status.textContent = "图片已上传。";
      } catch (_) {
        status.textContent = "图片上传失败。请确认文件是 jpg/png/gif/webp 且小于 8MB。";
      }
    });
  }

  function onlineClientId() {
    const key = "ALEPH_ONLINE_CLIENT_ID";
    let value = localStorage.getItem(key);
    if (!value) {
      value =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, value);
    }
    return value;
  }

  function renderOnlineReaderDock(count) {
    let dock = document.querySelector(".aleph-reader-dock");
    if (!dock) {
      dock = document.createElement("div");
      dock.className = "aleph-reader-dock";
      dock.setAttribute("aria-live", "polite");
      document.body.appendChild(dock);
    }
    dock.hidden = false;
    dock.innerHTML = `<i class="fa-regular fa-eye"></i><span>在线 ${Number(count || 0)} 人</span>`;
  }

  async function pingOnlineReaders() {
    const result = await request("/online/ping", {
      method: "POST",
      body: JSON.stringify({
        client_id: onlineClientId(),
        path: nextUrl().slice(0, 300),
        post_slug: currentPostSlug(),
      }),
    });
    renderOnlineReaderDock(result.online_readers);
  }

  function initOnlineReaders() {
    if (!window.__ALEPH_ONLINE_READER_TIMER) {
      pingOnlineReaders().catch(() => {
        const dock = document.querySelector(".aleph-reader-dock");
        if (dock) dock.hidden = true;
      });
      window.__ALEPH_ONLINE_READER_TIMER = window.setInterval(() => {
        pingOnlineReaders().catch(() => {});
      }, 30000);
      return;
    }
    pingOnlineReaders().catch(() => {});
  }

  async function sendPageView() {
    try {
      await request("/analytics/pageview", {
        method: "POST",
        body: JSON.stringify({
          path: window.location.pathname,
          post_slug: currentPostSlug(),
        }),
      });
    } catch (_) {
      // Static mode should never be blocked by analytics.
    }
  }

  function init() {
    forceDocumentTitle();
    initSiteStats();
    initOnlineSearch();
    initHomePosts();
    initArchivePage();
    initTaxonomyPage();
    initStaticArticle();
    initAuthPage();
    initOnlinePage();
    initAccountPage();
    initAdminPage();
    renderAccountDock();
    initOnlineReaders();
    sendPageView();
    window.setTimeout(forceDocumentTitle, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  document.addEventListener("swup:contentReplaced", init);
})();
