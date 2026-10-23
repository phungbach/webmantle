# Making a release

## The packages

`npm run release` checks the code (typecheck and tests), builds the site and writes these files to `release/`:

| File                          | Use                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webmantle-vX.Y.Z.zip`        | **Prebuilt** package for hosting. It contains the built site, the source needed to start it, the docs, `app.js` (cPanel), the `Dockerfile` and `docker-compose.yml`. No `.env`, database or uploads. |
| `webmantle-vX.Y.Z-source.zip` | The source as committed to git (made when run in a git repository).                                                                                                                                  |
| `*.sha256`                    | Checksums.                                                                                                                                                                                           |

The prebuilt package is portable: it does not contain `node_modules`, so `npm ci` on the host installs the native parts (the Prisma engine and `sharp`) for the host's own system.

The script stops if it finds an `.env`, a database or a key file inside the package.

Run it on a clean checkout. It needs `node` 20.9+, `npm`, `rsync` and `zip` (macOS and Linux have them; on Windows use WSL or Git Bash).

## Cutting a version

1. Update `CHANGELOG.md` and the `version` in `package.json` (and `package-lock.json`).
2. `npm run release` and try the prebuilt zip on a spare folder: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, `npm start`.
3. Commit, then tag and push:

```bash
git tag -a v1.0.0 -m "Webmantle 1.0.0"
git push origin main --tags
```

With the included GitHub workflow (`.github/workflows/release.yml`), pushing a `v*` tag builds the packages on GitHub and attaches them to a GitHub Release.

## Publishing the repository

The repository must never contain `.env`; `.gitignore` already excludes `.env`, `.env.*` (except `.env.example`), the whole `data/` folder, `node_modules` and `release/`.

```bash
git init -b main              # once
git add .
git status                    # check that no .env or data/ file is listed
git commit -m "Webmantle 1.0.0"
git remote add origin https://github.com/YOUR-ACCOUNT/webmantle.git
git push -u origin main --tags
```

or, with the GitHub CLI: `scripts/publish-github.sh YOUR-ACCOUNT/webmantle private`.
