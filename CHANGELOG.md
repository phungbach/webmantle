# Changelog

## 1.0.0 (2026-10-24)

First release of Webmantle, a blog and website CMS built on Next.js 15, React 19, TypeScript and SQLite (Prisma).

- Content: posts, pages, categories, tags, media library, revision history, scheduled publishing, a rich-text editor.
- Themes: upload, validate, preview, activate and roll back themes (themes are data, never code). Three themes are included: Webmantle (default), Hiên Studio and an English-center theme.
- Page designer: edit text, images, links and heading levels on a live preview, then publish. Works on phones.
- Languages: Vietnamese and English for the admin and the public site.
- SEO: titles, descriptions, share images, sitemap, robots, RSS, JSON-LD.
- Roles: administrator, editor, author, and a read-only demo role. An optional `/demo` link signs visitors in to the demo account (`DEMO_PUBLIC_LOGIN=true`).
- Operations: activity log, view statistics, backup and restore scripts, plugin hooks.
- Hosting: prebuilt release package, Docker image, and a cPanel (Node.js app) startup file. See `docs/deploy-cpanel.md` and `docs/deploy-docker.md`.
