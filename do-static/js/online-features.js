(function () {
  const articlePath = /^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/?$/;
  const match = window.location.pathname.match(articlePath);
  function defaultApiBase() {
    const host = window.location.hostname;
    if ((host === "localhost" || host === "127.0.0.1") && window.location.port === "4000") {
      return "http://127.0.0.1:8000";
    }
    return "";
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

  function user() {
    try {
      return JSON.parse(localStorage.getItem("ALEPH_USER") || "null");
    } catch (_) {
      return null;
    }
  }

  function headers() {
    const value = token();
    return value ? { Authorization: `Bearer ${value}` } : {};
  }

  async function request(path, options) {
    const response = await fetch(api(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...headers(),
        ...(options && options.headers ? options.headers : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  function postSlug() {
    return match ? match[1] : null;
  }

  function mountTarget() {
    return (
      document.querySelector(".article-content") ||
      document.querySelector(".markdown-body") ||
      document.querySelector("article")
    );
  }

  function setStatus(root, text) {
    const node = root.querySelector("[data-online-status]");
    if (node) node.textContent = text;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderAuth(root) {
    const current = user();
    const auth = root.querySelector("[data-online-auth]");
    if (!auth) return;
    if (current) {
      auth.innerHTML = `
        <span>${escapeHtml(current.display_name || current.username)}</span>
        <button type="button" data-action="logout">退出</button>
      `;
      return;
    }
    auth.innerHTML = `
      <input type="text" autocomplete="username" placeholder="用户名" data-auth-username>
      <input type="password" autocomplete="current-password" placeholder="密码" data-auth-password>
      <button type="button" data-action="login">登录</button>
      <button type="button" data-action="register">注册</button>
    `;
  }

  function renderComments(root, comments) {
    const list = root.querySelector("[data-online-comments]");
    if (!list) return;
    if (!comments.length) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = comments
      .map(
        (comment) => `
          <div class="aleph-online__comment">
            <div class="aleph-online__comment-meta">
              <strong>${escapeHtml(comment.user.display_name)}</strong>
              <time>${new Date(comment.created_at).toLocaleString()}</time>
            </div>
            <div class="aleph-online__comment-body">${escapeHtml(comment.body)}</div>
          </div>
        `
      )
      .join("");
  }

  function renderInteractions(root, state) {
    const like = root.querySelector('[data-action="like"]');
    const favorite = root.querySelector('[data-action="favorite"]');
    if (like) {
      like.textContent = `Like ${state.likes}`;
      like.dataset.active = String(state.liked);
    }
    if (favorite) {
      favorite.textContent = `Favorite ${state.favorites}`;
      favorite.dataset.active = String(state.favorited);
    }
  }

  async function refresh(root, slug) {
    const [interactions, comments] = await Promise.all([
      request(`/posts/${slug}/interactions`),
      request(`/posts/${slug}/comments`),
    ]);
    renderInteractions(root, interactions);
    renderComments(root, comments);
    setStatus(root, "在线互动已连接");
  }

  async function authAction(root, action) {
    const username = root.querySelector("[data-auth-username]")?.value.trim();
    const password = root.querySelector("[data-auth-password]")?.value;
    if (!username || !password) {
      setStatus(root, "请输入用户名和密码");
      return;
    }
    const result = await request(`/auth/${action}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem("ALEPH_TOKEN", result.access_token);
    localStorage.setItem("ALEPH_USER", JSON.stringify(result.user));
    renderAuth(root);
  }

  async function initArticle() {
    const slug = postSlug();
    const target = mountTarget();
    if (!slug || !target || document.querySelector(".aleph-online")) return;

    const root = document.createElement("section");
    root.className = "aleph-online";
    root.innerHTML = `
      <div class="aleph-online__bar">
        <h2 class="aleph-online__title">Discussion</h2>
        <div class="aleph-online__actions">
          <button type="button" data-action="like">Like 0</button>
          <button type="button" data-action="favorite">Favorite 0</button>
        </div>
      </div>
      <p class="aleph-online__status" data-online-status>正在连接在线互动</p>
      <div class="aleph-online__auth" data-online-auth></div>
      <div class="aleph-online__comments" data-online-comments></div>
      <div class="aleph-online__composer">
        <textarea data-comment-body placeholder="写下评论"></textarea>
        <button type="button" data-action="comment">发布评论</button>
      </div>
    `;
    target.appendChild(root);
    renderAuth(root);

    root.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      try {
        if (action === "logout") {
          localStorage.removeItem("ALEPH_TOKEN");
          localStorage.removeItem("ALEPH_USER");
          renderAuth(root);
          await refresh(root, slug);
        }
        if (action === "login" || action === "register") {
          await authAction(root, action);
          await refresh(root, slug);
        }
        if (action === "like" || action === "favorite") {
          const active = button.dataset.active === "true";
          const method = active ? "DELETE" : "POST";
          const state = await request(`/posts/${slug}/${action}`, { method });
          renderInteractions(root, state);
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
          await refresh(root, slug);
        }
      } catch (_) {
        setStatus(root, "在线互动暂不可用");
      }
    });

    try {
      await refresh(root, slug);
    } catch (_) {
      setStatus(root, "在线互动暂不可用");
    }
  }

  async function sendPageView() {
    try {
      await request("/analytics/pageview", {
        method: "POST",
        body: JSON.stringify({
          path: window.location.pathname,
          post_slug: postSlug(),
        }),
      });
    } catch (_) {
      // Static mode should never be blocked by analytics.
    }
  }

  function init() {
    initArticle();
    sendPageView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
