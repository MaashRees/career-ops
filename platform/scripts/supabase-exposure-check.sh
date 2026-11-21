#!/bin/sh
# Vérifie, DEPUIS L'EXTÉRIEUR (clé publique uniquement, lecture seule), ce que l'API automatique de Supabase expose.
#   sh platform/scripts/supabase-exposure-check.sh https://xxxx.supabase.co <clé publishable ou anon> [schéma]
# La clé « publishable » / « anon » est publique par conception : ce n'est PAS la clé service_role (ne la donne jamais ici).
# Attendu après le script 0003 : « public » n'expose rien de l'application ; « jobhunter » est exposé mais fermé aux anonymes.
set -u
URL=${1:-}; KEY=${2:-}; SCHEMA=${3:-jobhunter}
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "Usage : sh $0 https://xxxx.supabase.co <clé publishable/anon> [schéma]"; exit 2; }
URL=${URL%/}
FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko()   { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
code() { curl -sS -o /dev/null -m 20 -w '%{http_code}' -H "apikey: $KEY" "$@" 2>/dev/null || echo "000"; }
TABLES='profiles|user_settings|applications|reports|documents|runs'

echo "Schéma par défaut de l'API (public)"
root=$(curl -sS -m 20 -H "apikey: $KEY" "$URL/rest/v1/" 2>/dev/null || true)
if [ -z "$root" ]; then ko "l'API ne répond pas (URL ou clé incorrecte ?)"; else
  if printf '%s' "$root" | grep -Eq "\"/($TABLES)\""; then ko "public expose encore des tables de l'application : exécute 0003 et retire « public » des schémas exposés"; else ok "aucune table de l'application dans le schéma public exposé"; fi
fi
for t in applications user_settings runs; do
  c=$(code "$URL/rest/v1/$t?select=*&limit=1")
  case "$c" in 200) ko "GET /$t (schéma public) renvoie 200 : la table est lisible dans public !" ;; *) ok "GET /$t sans schéma → $c (non lisible)" ;; esac
done

echo "Schéma dédié ($SCHEMA), visiteur anonyme"
for t in applications user_settings runs profiles; do
  c=$(code -H "Accept-Profile: $SCHEMA" "$URL/rest/v1/$t?select=*&limit=1")
  case "$c" in
    200) ko "GET /$t ($SCHEMA) renvoie 200 à un anonyme : les données seraient lisibles !" ;;
    406) ko "GET /$t → 406 : le schéma « $SCHEMA » n'est PAS exposé (l'application ne marchera pas) — Settings → API → Exposed schemas" ;;
    401|403) ok "GET /$t ($SCHEMA) → $c (exposé mais fermé aux anonymes)" ;;
    *) ok "GET /$t ($SCHEMA) → $c (non lisible)" ;;
  esac
done
# On envoie les 7 paramètres attendus : avec un corps incomplet, l'API répond « 404 fonction introuvable » même si la
# fonction serait appelable, ce qui rendrait le contrôle sans valeur. L'utilisateur fourni n'existe pas : si, par erreur,
# l'appel passait, il échouerait sur la clé étrangère (aucune ligne créée).
RPC='{"p_user_id":"00000000-0000-0000-0000-000000000000","p_kind":"evaluate","p_input":{},"p_application_id":null,"p_user_limit":0,"p_global_limit":0,"p_max_concurrent":1}'
c=$(code -X POST -H "Content-Type: application/json" -H "Content-Profile: $SCHEMA" -d "$RPC" "$URL/rest/v1/rpc/start_run")
case "$c" in
  200|204|409|400) ko "start_run semble appelable par un anonyme ($c) : la fonction est exécutée (échec sur la clé étrangère) !" ;;
  401|403) ok "start_run non appelable par un anonyme ($c)" ;;
  404) warn "start_run → 404 : contrôle non concluant (fonction introuvable pour ce rôle). Fais foi : verify/0003 « start_run NON appelable par anon / authenticated »" ;;
  *) ok "start_run non appelable par un anonyme ($c)" ;;
esac
c=$(code -X POST -H "Content-Type: application/json" -H "Content-Profile: $SCHEMA" -d '{"user_id":"00000000-0000-0000-0000-000000000000","kind":"evaluate"}' "$URL/rest/v1/runs")
case "$c" in 200|201|204) ko "un anonyme peut écrire dans runs ($c) !" ;; *) ok "écriture anonyme dans runs refusée ($c)" ;; esac

echo
if [ "$FAIL" -eq 0 ]; then printf '\033[32mExposition conforme.\033[0m\n'; exit 0; fi
printf '\033[31m%s contrôle(s) en échec.\033[0m\n' "$FAIL"; exit 1
