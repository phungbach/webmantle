# Architecture

## Stack and why

- **Next.js 15 App Router, React 19, TypeScript (strict).** Public pages are React Server Components rendered on the server, so the HTML a search engine receives already contains the content. Client JavaScript is used only for confirmation dialogs and the theme upload result.
- **SQLite with Prisma 6.** One file, `data/cms.db`, outside the public directory. Enum-like fields are strings checked with Zod because native enums depend on the Prisma version.
- **Server Actions for admin writes, Route Handlers for reads and assets.** Every action and handler checks permissions on the server.
- **Tailwind CSS for the admin only.** Public markup uses `cms-*` classes that themes style.
- **No separate backend.** One deployable application.

## Modules

| Module          | Location                                                      | Responsibility                                                                      |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Core CMS        | `src/lib/content/`                                            | Posts, pages, taxonomy queries and mutations, revisions                             |
| Theme engine    | `src/lib/themes/`                                             | Contract, ZIP extraction, validation, install, activation, settings, preview tokens |
| Theme rendering | `src/components/theme/`                                       | Core-owned components and the layout renderer                                       |
| Media           | `src/lib/media.ts`, `src/app/media/`                          | Upload checks, storage outside `public/`, serving by id                             |
| Auth            | `src/lib/auth/`                                               | Password hashing, sessions, roles, rate limiting                                    |
| SEO             | `src/lib/seo/`, `src/app/sitemap.ts`, `robots.ts`, `feed.xml` | Metadata, JSON-LD, sitemap, RSS                                                     |
| Settings        | `src/lib/settings.ts`                                         | Site-wide settings, shared by all themes                                            |
| Audit           | `src/lib/audit.ts`                                            | Administrative actions, without secrets                                             |
| Admin           | `src/app/admin/`, `src/components/admin/`                     | Dashboard and management screens                                                    |
| Backup          | `scripts/backup.ts`                                           | Consistent snapshot of database, media, themes                                      |

## The theme boundary

A theme is data, not code. The core owns everything that runs:

1. **Content and data.** Themes receive a typed view model (`ViewModel` in `src/components/theme/types.ts`) built by the core. A theme cannot run a query.
2. **Components.** The core provides a fixed registry (`COMPONENT_NAMES` in `src/lib/themes/contract.ts`). A theme chooses components and their props, validated against `COMPONENT_PROPS`.
3. **Layout.** Each template is a JSON tree of registry components. Rendering re-validates props, so a bad template cannot inject values.
4. **Appearance.** Tokens and settings become CSS custom properties after validation. The stylesheet is served from `/theme-assets/<id>/<version>/styles.css` after static checks.

Nothing from a theme is executed. `eval`, `new Function`, dynamic `import()` of theme files, and `dangerouslySetInnerHTML` with theme content are not used anywhere. The only `dangerouslySetInnerHTML` is for post and page bodies, which were sanitized on write.

## Languages

The interface is available in Vietnamese (primary, default) and English.

- **Messages.** All interface text is in `src/lib/i18n/messages.ts`. The English table is typed against the Vietnamese one, so a missing English text fails the type check.
- **Choosing a language.** A visitor's choice is stored in the `cms_locale` cookie, set by `/language?lang=vi|en`. The route only follows referrers from the same site. Without a choice, the site default applies (`defaultLanguage` in **Settings**, default Vietnamese).
- **Public site and admin** both follow the same choice. Theme components receive the language in `ctx.site.locale`, so a theme only needs to use the core components to be bilingual.
- **Content** (post and page text) is not translated automatically. Write each language as a separate post or page, or add translation fields later.
- **Dates** follow the language (`vi-VN` or `en-US`). Times are still stored and shown in UTC unless `SITE_TIMEZONE` is set.
- **Language links are plain links,** not client navigation, because the choice is stored in a cookie and the page must reload to show it.

## Rich text editor

Posts and static pages both use a Tiptap editor (`src/components/admin/editor/rich-text-editor.tsx`). Its toolbar offers bold, italic, underline, strikethrough, two heading levels, lists, quotes, inline code, code blocks, links and images. Links and images accept only `https`, `http`, `mailto` (links only), or internal paths starting with `/`.

The editor keeps HTML in a hidden field, which the server sanitizes on save with the same rules as before. Images are inserted by address (for example `/media/<id>` from the library), not uploaded from the editor.

Known gap: messages from validation and the database layer (for example "slug already in use") are still English.

## Templates

There are two kinds:

- **Core templates** (`home`, `single-post`, `archive`, `category`, `page`, `search`, `not-found`). Every theme provides them, and the core decides which one a page uses.
- **Custom templates**. A theme declares extra layouts for posts or pages (`customTemplates` in the manifest). Each post and page stores the chosen name (an empty string means the default). Rendering uses the custom layout only if the active theme still offers it, and otherwise uses the default. The choice is never lost, so switching themes back restores it.

Adding a template never requires a core change, because layouts are data and components come from the fixed registry.

## Data model

Defined in `prisma/schema.prisma`.

- `User`, `Session` (token hash only), `AuditLog`
- `Post` (`status` draft|published, `publishedAt` for scheduling, `template` for a custom layout, SEO fields, featured flag), `PostRevision`, `PostCategory`, `PostTag`
- `Page` (with `template`), `Category`, `Tag`, `Media`
- `SiteSetting` (key/value: site title, description, `activeThemeId`, `previousThemeId`)
- `Theme` (one row per theme id), `ThemeSetting` (unique per theme and key), `ThemeHistory` (append-only, not a foreign key, so it survives uninstall)

A post is publicly visible when `status = published` and `publishedAt <= now`. A future date is therefore a schedule, with no cron job.

## Theme activation

`activateTheme(id)` (in `src/lib/themes/activate.ts`) runs under an in-process lock:

1. Confirm the theme is installed.
2. Re-validate its files on disk. A theme edited after install cannot go live.
3. Load the bundle, which parses every template.
4. In one database transaction: set `activeThemeId`, store the old value as `previousThemeId`, and write a history row.
5. Resolve the active theme again through the public path. If it falls back, restore the previous pointers and report the failure.

Activation never writes to posts, pages, categories, tags, users, media, or other themes' settings. Tests check this by snapshotting that data before and after a switch.

Rollback activates `previousThemeId`, so repeating it toggles between two themes.

## Request flow for a public page

1. The route calls `getActiveRequestTheme()`: resolves the active theme (falling back to the fallback theme, `CMS_FALLBACK_THEME_ID`, default `webcore`, if it cannot be loaded), then loads that theme's settings.
2. The route queries the core for content and builds a `ViewModel`.
3. `ThemeFrame` renders the stylesheet link, the validated CSS variables, and the layout tree.

Pages are rendered per request (`force-dynamic`), so a theme switch or content change is visible immediately. Caching is a deliberate follow-up. Bundles are cached in memory and invalidated by file fingerprints.

## Why SSR and not a client-only React app

A client-only React app sends an empty HTML shell, and search engines and social-media previews see no content. Server rendering sends complete HTML with canonical links and Open Graph tags. The admin is a client-interactive area, but it is still rendered on the server, and its forms work through Server Actions.

Trade-off: each public request queries SQLite. For a single-server blog this is fast enough. Scale-out would add a cache layer (for example `unstable_cache` with tag invalidation, which `revalidatePath` calls already prepare for).

## Known gaps

- No WYSIWYG editor. Post bodies are HTML in a textarea and sanitized on save.
- No image resizing or responsive `srcset` variants. Dimensions are read from the file header and limited.
- No toast notifications or skeleton loaders. Results appear as messages after each action.
- Rate limiting for login is in memory and per process. Behind several processes, move it to shared storage.
- Public pages are not cached. They are cheap to cache once invalidation is in place.
- Theme uninstall refuses the rollback target. To remove it, activate another theme first.
