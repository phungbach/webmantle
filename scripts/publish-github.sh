#!/usr/bin/env bash
# Creates the GitHub repository and pushes the code and tags.
# Usage: scripts/publish-github.sh OWNER/NAME [private|public]
# Needs the GitHub CLI (https://cli.github.com) signed in: gh auth login
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${1:?Usage: scripts/publish-github.sh OWNER/NAME [private|public]}"
VISIBILITY="${2:-private}"

command -v gh >/dev/null || { echo "Install the GitHub CLI first (brew install gh), then run: gh auth login" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Not signed in. Run: gh auth login" >&2; exit 1; }

# Never publish a secret.
if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vq '\.env\.example$'; then
  echo "An .env file is tracked by git. Remove it from the index first (git rm --cached)." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO" "--${VISIBILITY}" --source=. --remote=origin --description "Webmantle: a blog and website CMS with installable themes (Next.js + SQLite)"
fi
git push -u origin HEAD
git push origin --tags
echo "Published: https://github.com/${REPO}"
