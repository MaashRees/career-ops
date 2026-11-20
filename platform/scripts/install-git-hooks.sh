#!/bin/sh
# Active les hooks versionnés et fixe l'identité LOCALE (jamais la config globale).
#   sh platform/scripts/install-git-hooks.sh ["Nom à afficher"]
set -e
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
# shellcheck disable=SC1091
. platform/scripts/git-hooks/identity.conf

chmod +x platform/scripts/git-hooks/pre-commit platform/scripts/git-hooks/commit-msg platform/scripts/git-hooks/pre-push
git config core.hooksPath platform/scripts/git-hooks
git config user.email "$ALLOWED_EMAIL"
if [ -n "$1" ]; then git config user.name "$1"; fi
[ -n "$(git config user.name)" ] || git config user.name "${ALLOWED_EMAIL%@*}"

echo "✓ hooks actifs (core.hooksPath = platform/scripts/git-hooks)"
echo "✓ identité locale : $(git config user.name) <$(git config user.email)>"
