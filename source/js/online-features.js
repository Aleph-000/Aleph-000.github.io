(function () {
  const articlePath = /^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/;
  const onlinePath = /^\/online\/?$/;
  const authPath = /^\/(login|register)\/?$/;
  const adminPath = /^\/admin\/?$/;
  const accountPath = /^\/account\/?$/;

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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(markdown) {
    const escaped = escapeHtml(markdown);
    return escaped
      .split(/\n{2,}/)
      .map((block) => {
        const text = block.trim();
        if (!text) return "";
        if (/^###\s+/.test(text)) return `<h3>${text.replace(/^###\s+/, "")}</h3>`;
        if (/^##\s+/.test(text)) return `<h2>${text.replace(/^##\s+/, "")}</h2>`;
        if (/^#\s+/.test(text)) return `<h1>${text.replace(/^#\s+/, "")}</h1>`;
        if (/^[-*]\s+/m.test(text)) {
          const items = text
            .split("\n")
            .filter((line) => /^[-*]\s+/.test(line.trim()))
            .map((line) => `<li>${line.trim().replace(/^[-*]\s+/, "")}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        const inline = text
          .replace(
            /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
            '<a class="link" target="_blank" rel="noopener" href="$2">$1</a>'
          )
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\n/g, "<br>");
        return `<p>${inline}</p>`;
      })
      .join("");
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

  function renderHomeArticle(post) {
    return `
      <li class="home-article-item">
        <div class="flex flex-col gap-5 px-7 pb-7 pt-7">
          <h3 class="home-article-title">
            <a href="${postUrl(post)}">${escapeHtml(post.title)}</a>
          </h3>
          <div class="home-article-content markdown-body">
            ${escapeHtml(post.excerpt || "").slice(0, 260)}
          </div>
          <div class="home-article-meta-info-container">
            <div class="home-article-meta-info">
              <span><i class="fa-solid fa-calendars"></i>&nbsp;
                <span class="home-article-date">${formatPostDate(post.date)}</span>
              </span>
              <span class="home-article-category">
                <i class="fa-solid fa-folders"></i>&nbsp;
                <ul><li><a href="/online/">在线</a>&nbsp;</li></ul>
              </span>
            </div>
            <a href="${postUrl(post)}">阅读全文<span class="seo-reader-text">${escapeHtml(post.title)}</span>&nbsp;<i class="fa-solid fa-angle-right"></i></a>
          </div>
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
    try {
      const posts = await request("/posts");
      list.innerHTML = posts.length
        ? posts.map(renderHomeArticle).join("")
        : '<li class="home-article-item"><div class="flex flex-col gap-5 px-7 pb-7 pt-7"><h3 class="home-article-title">暂无文章</h3><div class="home-article-content markdown-body">管理员可以在后台发布新文章。</div></div></li>';
    } catch (_) {
      list.innerHTML = '<li class="home-article-item"><div class="flex flex-col gap-5 px-7 pb-7 pt-7"><h3 class="home-article-title">文章暂不可用</h3><div class="home-article-content markdown-body">请稍后刷新。</div></div></li>';
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
          <h1>动态文章</h1>
          <p>这里显示后台发布的在线文章。</p>
        </div>
        <div class="aleph-online-list">
          ${posts
            .map((post) => {
              return `
                <article class="aleph-online-list__item">
                  <a href="${postUrl(post)}">${escapeHtml(post.title)}</a>
                  <span>${escapeHtml(post.source)}</span>
                  <p>${escapeHtml(post.excerpt)}</p>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  async function renderOnlinePost(root, slug) {
    const post = await request(`/posts/${slug}`);
    document.title = `${post.title} | Aleph_null's Blog`;
    root.innerHTML = `
      <article class="aleph-console aleph-online-post">
        <div class="aleph-console__header">
          <a class="aleph-online__link" href="/online/">动态文章</a>
          <h1>${escapeHtml(post.title)}</h1>
          <p>${escapeHtml(post.excerpt || post.date || "")}</p>
        </div>
        <div class="aleph-online-post__body markdown-body">${renderMarkdown(post.body)}</div>
      </article>
    `;
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
    const slug = onlineArticleSlug();
    root.innerHTML = '<p class="aleph-online__status">正在加载在线文章</p>';
    try {
      if (slug) {
        await renderOnlinePost(root, slug);
      } else {
        const posts = await request("/posts");
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

  function renderAdmin(root, state) {
    const posts = state.posts || [];
    const comments = state.comments || [];
    const analytics = state.analytics || {};
    root.innerHTML = `
      <section class="aleph-console" data-admin-root>
        <div class="aleph-console__header">
          <h1>管理后台</h1>
          <p data-admin-status>已登录 owner：${escapeHtml(currentUser().display_name || currentUser().username)}</p>
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
            <span>Slug</span>
            <input name="slug" required minlength="2" maxlength="160" pattern="[a-z0-9][a-z0-9\\-]*">
          </label>
          <label>
            <span>Title</span>
            <input name="title" required maxlength="220">
          </label>
          <label>
            <span>Excerpt</span>
            <input name="excerpt" maxlength="500">
          </label>
          <label class="aleph-form__check">
            <input name="published" type="checkbox" checked>
            <span>Published</span>
          </label>
          <label>
            <span>Body</span>
            <textarea name="body" required></textarea>
          </label>
          <div class="aleph-console__actions">
            <button type="submit" data-admin-submit><i class="fa-regular fa-floppy-disk"></i> 保存文章</button>
            <button type="button" data-admin-action="clear"><i class="fa-regular fa-file"></i> 新建</button>
          </div>
        </form>
        <div class="aleph-admin-grid">
          <section>
            <h2>动态文章</h2>
            <div class="aleph-admin-list" data-admin-posts>
              ${posts
                .map(
                  (post) => `
                    <article class="aleph-admin-list__item" data-post-slug="${escapeHtml(post.slug)}">
                      <div>
                        <strong>${escapeHtml(post.title)}</strong>
                        <p>${escapeHtml(post.slug)} · ${post.published ? "published" : "draft"}</p>
                      </div>
                      <div class="aleph-console__actions">
                        ${
                          post.published
                            ? `<a class="aleph-online__link" href="/online/?slug=${encodeURIComponent(post.slug)}">查看</a>`
                            : ""
                        }
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
    form.elements.body.value = post.body;
    form.elements.published.checked = Boolean(post.published);
    root.querySelector("[data-admin-submit]").textContent = "更新文章";
  }

  function clearAdminForm(root) {
    const form = root.querySelector("[data-admin-form]");
    form.reset();
    form.elements.editing_slug.value = "";
    form.elements.published.checked = true;
    root.querySelector("[data-admin-submit]").innerHTML = '<i class="fa-regular fa-floppy-disk"></i> 保存文章';
  }

  async function initAdminPage() {
    if (!adminPath.test(window.location.pathname)) return;
    const root =
      document.querySelector("[data-admin-app]") ||
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body");
    if (!root || root.dataset.adminMounted) return;
    root.dataset.adminMounted = "true";
    root.innerHTML = '<p class="aleph-online__status">正在加载管理控制台</p>';
    try {
      const me = await request("/auth/me");
      localStorage.setItem("ALEPH_USER", JSON.stringify(me));
      if (!me.is_owner) {
        root.innerHTML = `
          <section class="aleph-console">
            <h1>管理后台</h1>
            <p>当前账号没有管理员权限。</p>
          </section>
        `;
        return;
      }
      renderAdmin(root, await loadAdminState());
    } catch (error) {
      root.innerHTML = `
        <section class="aleph-console">
          <h1>管理后台</h1>
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
        body: form.elements.body.value.trim(),
        published: form.elements.published.checked,
      };
      const editingSlug = form.elements.editing_slug.value;
      const status = root.querySelector("[data-admin-status]");
      try {
        await request(editingSlug ? `/admin/posts/${editingSlug}` : "/admin/posts", {
          method: editingSlug ? "PUT" : "POST",
          body: JSON.stringify(payload),
        });
        status.textContent = "文章已保存。";
        renderAdmin(root, await loadAdminState());
      } catch (error) {
        status.textContent = error.status === 409 ? "Slug 已存在。" : "保存失败。";
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
        if (action === "edit") {
          fillAdminForm(root, await request(`/admin/posts/${target.dataset.slug}`));
          return;
        }
        if (action === "delete-post") {
          if (!window.confirm("删除这篇在线文章？")) return;
          await request(`/admin/posts/${target.dataset.slug}`, { method: "DELETE" });
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
    initHomePosts();
    initStaticArticle();
    initAuthPage();
    initOnlinePage();
    initAccountPage();
    initAdminPage();
    renderAccountDock();
    sendPageView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  document.addEventListener("swup:contentReplaced", init);
})();
