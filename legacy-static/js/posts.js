/* Blog posts. Add new entries to the top of the array; newest first. */
window.POSTS = [
  {
    id: "hello-world",
    title: "Hello, world",
    date: "2026-10-17",
    tags: ["intro", "meta"],
    excerpt: "Welcome to the blog. This post is here to show how the layout looks.",
    body: `
<p>Welcome to my blog. Every post you read here is stored in <code>js/posts.js</code>, so there is no database or build step to run.</p>
<p>Use the <strong>Theme</strong> menu in the header to switch between looks. Your choice is remembered in this browser.</p>
<h2>Why multiple themes?</h2>
<p>Colors are defined as CSS variables, so each theme only has to change a handful of values. Reading in a dark room or on paper-like sepia can feel very different.</p>
<blockquote>Good design is invisible until you need it.</blockquote>
<pre><code>document.documentElement.setAttribute("data-theme", "ocean");</code></pre>
<p>That is all it takes to change the whole page.</p>
`,
  },
  {
    id: "writing-a-new-post",
    title: "How to write a new post",
    date: "2026-10-16",
    tags: ["guide"],
    excerpt: "Add an object to the POSTS array and refresh the page.",
    body: `
<p>Open <code>js/posts.js</code> and add an object with these fields:</p>
<ul>
  <li><code>id</code>: unique, used in the URL (letters, numbers and dashes)</li>
  <li><code>title</code>, <code>date</code> (YYYY-MM-DD), <code>tags</code></li>
  <li><code>excerpt</code>: short summary for the list page</li>
  <li><code>body</code>: HTML content</li>
</ul>
<p>Save the file and reload the browser. The post appears at the top of the list.</p>
`,
  },
];
