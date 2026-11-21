#!/bin/sh
# Active les hooks versionnés et fixe l'identité LOCALE (jamais la config globale).
#   sh platform/scripts/install-git-hooks.sh
set -e
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
# shellcheck disable=SC1091
. platform/scripts/git-hooks/identity.conf

chmod +x platform/scripts/git-hooks/pre-commit platform/scripts/git-hooks/commit-msg platform/scripts/git-hooks/pre-push
git config core.hooksPath platform/scripts/git-hooks
git config user.email "$ALLOWED_EMAIL"
git config user.name "$ALLOWED_NAME"

echo "✓ hooks actifs (core.hooksPath = platform/scripts/git-hooks)"
echo "✓ identité locale : $(git config user.name) <$(git config user.email)>"
