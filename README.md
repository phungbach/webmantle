# Webmantle

Webmantle is a blog and website CMS built with Next.js (App Router), React, TypeScript, Tailwind CSS, SQLite and Prisma.

The main feature is the Theme Engine. An administrator can upload a theme ZIP, validate it, preview it, activate it, and roll back, without touching posts, pages, categories, users or SEO data.

## Quick start

```sh
npm install
cp .env.example .env          # then edit ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars), PREVIEW_SECRET
npx prisma migrate deploy     # creates data/cms.db
npm run db:seed               # creates the admin, installs the bundled themes, adds a sample post
npm run dev                   # http://localhost:3000  ->  admin at /admin
```

For production see [docs/deployment.md](docs/deployment.md).

## Hosting (v1.0)

| Where                                          | Guide                                          |
| ---------------------------------------------- | ---------------------------------------------- |
| cPanel (Setup Node.js App)                     | [docs/deploy-cpanel.md](docs/deploy-cpanel.md) |
| Docker / Docker Compose                        | [docs/deploy-docker.md](docs/deploy-docker.md) |
| Making a release package, publishing to GitHub | [docs/release.md](docs/release.md)             |

`npm run release` builds a prebuilt package in `release/` (`webmantle-vX.Y.Z.zip`) that contains no `.env`, database or uploads. On a host: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, then `npm start` (or `app.js` on cPanel). With Docker: `cp .env.example .env`, edit it, `docker compose up -d --build`.

## Scripts

| Command                  | What it does                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Development server                                                                                                                            |
| `npm run build`          | Generates the Prisma client and builds for production                                                                                         |
| `npm start`              | Runs the production build                                                                                                                     |
| `npm run db:migrate`     | Applies migrations (use in production)                                                                                                        |
| `npm run db:migrate:dev` | Creates and applies a new migration (development)                                                                                             |
| `npm run db:seed`        | Idempotent setup: admin, built-in themes, sample post                                                                                         |
| `npm run db:backup`      | Consistent backup of database, media and themes                                                                                               |
| `npm run typecheck`      | TypeScript, strict mode                                                                                                                       |
| `npm run lint`           | ESLint (Next.js rules)                                                                                                                        |
| `npm test`               | Unit, integration, rendering and component tests (Vitest, React Testing Library). Route handlers are called directly, without an HTTP server. |
| `npm run test:e2e`       | Browser tests (Playwright, Chromium) on port 3201 with its own database                                                                       |
| `npm run format:check`   | Prettier check                                                                                                                                |

## Documentation

- [Architecture](docs/architecture.md): modules, data model, request flow, and why the public site is server-rendered.
- [Theme development](docs/theme-development.md): the theme contract, manifest fields, templates, components, settings, and packing.
- [Security](docs/security.md): threat model, controls, and known limitations.
- [Deployment](docs/deployment.md): Linux VPS, process manager, reverse proxy, environment variables.
- [Plugins](docs/plugins.md): how plugins work, the hook points, and how to write one.
- [Appearance](docs/appearance.md): colour sets, heading colour, seasonal effect, logo and favicon.
- [SEO](docs/seo.md): SEO fields, checks, sitemap and robots.
- [Backup and restore](docs/backup-and-restore.md): backups, restores, and recovering from a failed theme change.
- [cPanel](docs/deploy-cpanel.md), [Docker](docs/deploy-docker.md) and [releases](docs/release.md): hosting and packaging.

## Project layout

```
src/app/           routes: public pages, /admin, /login, /preview, feeds, theme assets, API
src/components/    theme components (core-owned) and admin UI
src/lib/           auth, content, media, themes engine, validation, SEO, security
themes/            built-in themes: webcore (the default and fallback theme), hien-studio, english-center
tests/fixtures/    the stock themes default (Editorial) and starter (Midnight Grid), used only by the tests
prisma/            schema, migrations, seed
scripts/           backup and e2e preparation
tests/             unit, integration, rendering and e2e tests
data/              runtime data: cms.db, themes/, media/, backups/ (never public, git-ignored)
legacy-static/     the original static prototype, kept for reference only
```

## Languages

Vietnamese is the default. Visitors and administrators can switch to English from the header or sidebar. See [docs/architecture.md](docs/architecture.md#languages).

## Status

Implemented: content management (posts, pages, categories, tags, revisions, scheduling, featured posts), media uploads with content checks, users and roles, audit log, site settings, theme engine (upload, validation, preview, activation, rollback, update with backup, uninstall protection, per-theme settings, history), public site (homepage, posts, archives, search, pages, authors, 404, RSS, sitemap, robots, Open Graph, JSON-LD), backup script, and tests.

Not implemented yet, by design or for time: a WYSIWYG editor (the body is HTML in a textarea, sanitized on save), image resizing and responsive variants, toast notifications and skeleton loaders, and distributed rate limiting. See [docs/architecture.md](docs/architecture.md#known-gaps).
