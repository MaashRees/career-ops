#!/bin/sh
# Fonctions communes aux hooks. Source : . "$(dirname "$0")/_lib.sh"
HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$HOOK_DIR/identity.conf"

die() {
  printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2
  [ -n "$2" ] && printf '  %s\n' "$2" >&2
  printf '  (Règle du dépôt : voir .claude/CLAUDE.md. Ne pas contourner avec --no-verify.)\n\n' >&2
  exit 1
}

is_protected() {
  for b in $PROTECTED_BRANCHES; do
    [ "$1" = "$b" ] && return 0
  done
  return 1
}

# Adresse e-mail d'une identité "Nom <email> timestamp tz".
ident_email() {
  printf '%s' "$1" | sed -n 's/.*<\([^>]*\)>.*/\1/p'
}

# Nom d'une identité "Nom <email> timestamp tz".
ident_name() {
  printf '%s' "$1" | sed -n 's/^\(.*\) <[^>]*>.*/\1/p'
}
