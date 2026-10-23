#!/usr/bin/env bash
# Builds the release packages in ./release (run: npm run release).
#
#   webmantle-vX.Y.Z.zip          prebuilt package: upload it to a host (cPanel, VPS, Docker build context),
#                                 run `npm ci`, apply migrations, start. No `next build` on the server.
#   webmantle-vX.Y.Z-source.zip   the source as committed to git (only when run inside a git repository).
#   *.sha256                      checksums.
#
# Neither package contains .env, the database, uploads or backups.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
NAME="webmantle-v${VERSION}"
OUT="release"
STAGE="${OUT}/${NAME}"

# A production build must not see local settings. The values below only let the build run; the real
# values are read when the site starts.
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-file:/tmp/webmantle-build.db}"
export SITE_URL="${SITE_URL:-http://localhost:3000}"
export PREVIEW_SECRET="${PREVIEW_SECRET:-build-only-placeholder-value-not-used-at-runtime-0123456789}"

echo "==> Checking the code (typecheck, tests)"
npm run typecheck
npm test

echo "==> Building"
rm -rf .next
npm run build

echo "==> Assembling ${STAGE}"
rm -rf "${OUT}"
mkdir -p "${STAGE}/data"
touch "${STAGE}/data/.gitkeep"

# The build output, without the build cache.
rsync -a --exclude 'cache' .next "${STAGE}/"

for item in public prisma src plugins themes theme-template scripts docs brand; do
  [ -e "$item" ] && rsync -a --exclude '*.db' --exclude '*.db-journal' --exclude '.DS_Store' "$item" "${STAGE}/"
done

for file in package.json package-lock.json next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs \
  app.js Dockerfile docker-compose.yml .dockerignore .env.example .gitignore README.md CHANGELOG.md; do
  [ -e "$file" ] && cp "$file" "${STAGE}/"
done

cat > "${STAGE}/BUILD-INFO.txt" <<INFO
Webmantle v${VERSION}
Built:   $(date -u +"%Y-%m-%d %H:%M:%SZ")
Node:    $(node -v)
Commit:  $(git rev-parse --short HEAD 2>/dev/null || echo "n/a")

Start here: docs/deploy-cpanel.md (cPanel) or docs/deploy-docker.md (Docker). In short:
  1. Copy .env.example to .env and fill it in (never share or commit .env).
  2. npm ci
  3. npx prisma migrate deploy
  4. npm run db:seed
  5. npm start        (cPanel: set the startup file to app.js)
INFO

# Safety net: refuse to ship anything that looks like a secret or local data.
if find "${STAGE}" \( -name '.env' -o -name '.env.local' -o -name '.env.production' -o -name '*.db' -o -name '.secret.key' \) | grep -q .; then
  echo "Refusing to package: found an env file, database or key in ${STAGE}" >&2
  exit 1
fi

echo "==> Zipping"
( cd "${OUT}" && zip -qr "${NAME}.zip" "${NAME}" )
rm -rf "${STAGE}"

if git rev-parse --git-dir >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then
  git archive --format=zip --prefix="${NAME}-source/" -o "${OUT}/${NAME}-source.zip" HEAD
fi

( cd "${OUT}" && for f in *.zip; do shasum -a 256 "$f" > "${f}.sha256"; done )

echo
echo "Done. Packages:"
ls -lh "${OUT}"/*.zip
