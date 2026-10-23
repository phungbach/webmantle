# Plugins

A plugin adds behaviour to the CMS without changing the core. Examples: rewrite links when a post is saved, add items to the admin sidebar, add addresses to the sitemap.

## Trust model

Plugins are **code written by a developer and committed to the repository**. They run with full server access, like the rest of the application. Nothing is uploaded or executed from the browser. The admin can only turn plugins on or off and change their settings. This is deliberate: a ZIP upload from an admin account could run arbitrary code on the server.

Install a plugin only after reading its code.

## Layout

```
plugins/
  index.ts              the list of plugins (PLUGINS)
  external-links/
    index.ts            one plugin: definePlugin({...})
  admin-links/
  sitemap-extras/
src/lib/plugins/
  types.ts              the API: hook points and their payloads
  define.ts             definePlugin()
  runtime.ts            loads plugins, runs hooks, enables and disables
  settings.ts           stores each plugin's settings
```

## Writing a plugin

```ts
// plugins/hello-links/index.ts
import { definePlugin } from "@/lib/plugins/define";

export default definePlugin({
  id: "hello-links", // lowercase letters, digits, dashes; unique
  name: "Hello links",
  version: "1.0.0", // major.minor.patch
  description: "Shows what this plugin does.",
  author: "Your name",
  minimumCmsVersion: "1.0.0", // not loaded on an older CMS
  settings: [
    // optional; shown in Admin → Plugins
    { key: "prefix", label: "Prefix", type: "text", default: "", maxLength: 40 },
    { key: "newTab", label: "Open in a new tab", type: "boolean", default: false },
  ],
  activate(api) {
    api.addFilter("post.beforeSave", async (input, env) => {
      const { prefix } = await env.settings();
      input.excerpt = `${prefix} ${input.excerpt}`.trim();
      return input;
    });
  },
});
```

Then register it in `plugins/index.ts`:

```ts
import helloLinks from "./hello-links";
export const PLUGINS: PluginDefinition[] = [externalLinks, adminLinks, sitemapExtras, helloLinks];
```

Restart the server, open **Admin → Plugins**, and turn the plugin on.

Setting types are the same as theme settings: `text`, `boolean`, `select` and `color`. A text setting longer than 120 characters is shown as a text area.

## Hook points

| Name              | Kind   | Value                                     | When                                                                            |
| ----------------- | ------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `post.beforeSave` | filter | the post data (`PostInput`)               | after validation, before sanitizing and saving. The result is validated again.  |
| `post.detail`     | filter | the post shown on its page (`PostDetail`) | before a published post is rendered. `bodyHtml` is sanitized again afterwards.  |
| `sitemap.entries` | filter | sitemap entries                           | when `/sitemap.xml` is built. Entries need absolute `url` values.               |
| `admin.nav`       | filter | `{ href, label }[]`                       | when the admin sidebar is drawn. Only `/…` paths and `http(s)` links are shown. |
| `post.saved`      | action | `{ id, slug, status }`                    | after a post has been saved.                                                    |

A filter returns the value it was given, changed or not. Filters run in priority order (lower number first, default 10), then in the order they were registered.

## Rules for handlers

- **Keep `activate` fast.** It runs once when the server starts. Do the work inside handlers.
- **Use `env.settings()`** to read the plugin's own settings. Settings of other plugins cannot be read.
- **Do not trust input you did not produce.** A post body changed by a plugin is sanitized again before it is stored or shown. Keep the same rules in your code.
- **Do not use the database directly.** The API does not give a database client on purpose. If a plugin needs data, add a hook point or a helper to the core.
- **Errors are isolated.** A handler that throws is logged, its message is shown on the Plugins page, and the rest of the request goes on as if the handler had not run.

## Turning plugins on and off

- Only plugins that loaded correctly can be turned on. A plugin with a bad definition, a duplicate id, or a `minimumCmsVersion` above the CMS version shows its reason on the page.
- Turning a plugin off stops its hooks immediately. Its settings are kept.
- Removing a plugin from `plugins/index.ts` leaves its row in the database, marked as not loaded. Its settings are kept in case it is added back.

## Built-in plugins

| Plugin           | Hook              | What it does                                                                                               |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `external-links` | `post.beforeSave` | Adds `rel="nofollow noopener noreferrer"` to links that leave the site. Optional: opens them in a new tab. |
| `admin-links`    | `admin.nav`       | Adds links to the admin sidebar. Each line in the setting is `Label \| address`.                           |
| `sitemap-extras` | `sitemap.entries` | Adds listed paths (for example `/lien-he`) to the sitemap.                                                 |

## Testing a plugin

Tests use `resetPluginRuntimeForTests([yourPlugin])` to load only the plugin under test. See `tests/integration/plugins.test.ts` for examples: a plugin that throws, a plugin that returns invalid data, and a plugin with settings.

## Limits

- Plugin state is kept in memory per process, like the login rate limit. With several server processes, turn a plugin on or off in each process (or restart them).
- Plugin names and descriptions are written by the developer. They are shown as written, in whatever language the developer used.
- There is no plugin marketplace and no automatic update. Updating a plugin means changing its code and restarting the server.
