/* Renders the post list and single posts using hash routing (#/ and #/post/<id>). */
(function () {
  const app = document.getElementById("app");
  const posts = window.POSTS || [];

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function tagsHtml(tags) {
    if (!tags || !tags.length) return "";
    return `<ul class="tags">${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
  }

  function renderList() {
    document.title = "My Blog";
    if (!posts.length) {
      app.innerHTML = `<p class="empty">No posts yet.</p>`;
      return;
    }
    const items = posts
      .map(
        (p) => `
        <li class="post-card">
          <h2><a href="#/post/${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a></h2>
          <p class="meta">${formatDate(p.date)}</p>
          <p class="excerpt">${escapeHtml(p.excerpt || "")}</p>
          ${tagsHtml(p.tags)}
          <a class="read-more" href="#/post/${encodeURIComponent(p.id)}">Read more &rarr;</a>
        </li>`
      )
      .join("");
    app.innerHTML = `<ul class="post-list">${items}</ul>`;
  }

  function renderPost(id) {
    const post = posts.find((p) => p.id === id);
    if (!post) {
      document.title = "Not found · My Blog";
      app.innerHTML = `
        <a class="back-link" href="#/">&larr; Back to all posts</a>
        <h1>Post not found</h1>
        <p class="not-found">There is no post called “${escapeHtml(id)}”.</p>`;
      return;
    }
    document.title = post.title + " · My Blog";
    app.innerHTML = `
      <a class="back-link" href="#/">&larr; Back to all posts</a>
      <article>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="meta">${formatDate(post.date)}</p>
        ${tagsHtml(post.tags)}
        <div class="post-body">${post.body}</div>
      </article>`;
    window.scrollTo(0, 0);
  }

  function route() {
    const hash = window.location.hash || "#/";
    const match = hash.match(/^#\/post\/(.+)$/);
    if (match) {
      renderPost(decodeURIComponent(match[1]));
    } else {
      renderList();
    }
  }

  window.addEventListener("hashchange", route);
  document.getElementById("year").textContent = new Date().getFullYear();
  route();
})();
