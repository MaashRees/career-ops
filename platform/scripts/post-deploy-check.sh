#!/bin/sh
# Contrôle de l'application DÉPLOYÉE (lecture seule : uniquement des requêtes HTTP).
#   sh platform/scripts/post-deploy-check.sh https://jobs.exemple.com
# Code de sortie 0 = tout est conforme ; 1 = au moins un contrôle en échec.
set -u
URL=${1:-}
[ -n "$URL" ] || { echo "Usage : sh $0 https://ton-domaine"; exit 2; }
URL=${URL%/}
FAIL=0; WARN=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko()   { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }

code()    { curl -sS -o /dev/null -m 20 -w '%{http_code}' "$@" 2>/dev/null || echo "000"; }
headers() { curl -sSI -m 20 "$@" 2>/dev/null | tr -d '\r'; }

echo "Contrôle de $URL"

echo "Disponibilité"
body=$(curl -sS -m 20 "$URL/api/health" 2>/dev/null || true)
case "$body" in *'"ok":true'*) ok "/api/health répond {\"ok\":true}" ;; *) ko "/api/health ne répond pas correctement (reçu : ${body:-rien})" ;; esac

echo "Accès protégé"
c=$(code "$URL/")
case "$c" in 301|302|303|307|308) ok "/ redirige vers la connexion ($c)" ;; 503) ko "/ renvoie 503 — $(curl -sS -m 15 "$URL/login" 2>/dev/null | head -c 300)";; *) ko "/ renvoie $c (attendu : redirection vers /login)" ;; esac
c=$(code "$URL/login"); [ "$c" = "200" ] && ok "/login accessible (200)" || ko "/login renvoie $c"
c=$(code "$URL/api/runs/00000000-0000-0000-0000-000000000000"); [ "$c" = "401" ] && ok "API sans connexion → 401" || ko "API sans connexion renvoie $c (attendu 401)"
c=$(code "$URL/admin"); case "$c" in 301|302|303|307|308) ok "/admin non accessible sans connexion ($c)" ;; *) ko "/admin renvoie $c sans connexion" ;; esac
c=$(code -X POST "$URL/auth/signout"); [ "$c" = "403" ] && ok "déconnexion sans origine → 403 (protection CSRF)" || ko "déconnexion sans origine renvoie $c (attendu 403)"

echo "En-têtes de sécurité"
h=$(headers "$URL/login")
has() { printf '%s\n' "$h" | grep -qi "^$1:" ; }
has content-security-policy && ok "Content-Security-Policy" || ko "Content-Security-Policy absente"
printf '%s\n' "$h" | grep -qi "frame-ancestors 'none'" && ok "anti-framing (frame-ancestors 'none')" || ko "frame-ancestors 'none' absent de la CSP"
printf '%s\n' "$h" | grep -qi "^x-content-type-options: *nosniff" && ok "X-Content-Type-Options: nosniff" || ko "X-Content-Type-Options absent"
has referrer-policy && ok "Referrer-Policy" || ko "Referrer-Policy absent"
case "$URL" in
  https://*) has strict-transport-security && ok "Strict-Transport-Security (HSTS)" || ko "HSTS absent" ;;
  *) warn "URL en http : HSTS non vérifiable (utilise https en production)" ;;
esac
printf '%s\n' "$h" | grep -qi "^x-powered-by" && ko "X-Powered-By exposé" || ok "pas d'en-tête X-Powered-By"

echo "HTTPS"
case "$URL" in
  https://*)
    c=$(code "$URL/api/health"); [ "$c" = "200" ] && ok "certificat valide (la requête https aboutit sans -k)" || ko "requête https en échec ($c) : certificat invalide ou non émis ?"
    httpurl="http://${URL#https://}"
    loc=$(curl -sSI -m 15 "$httpurl/" 2>/dev/null | tr -d '\r' | grep -i '^location:' | head -1)
    case "$loc" in *https://*) ok "http redirige vers https" ;; *) warn "http ne redirige pas vers https (ou port 80 fermé) : active « Redirect HTTP to HTTPS » côté proxy" ;; esac ;;
  *) ko "L'URL n'est pas en https : à corriger avant toute mise en service" ;;
esac

echo
if [ "$FAIL" -eq 0 ]; then printf '\033[32mTout est conforme\033[0m (%s avertissement(s)).\n' "$WARN"; exit 0; fi
printf '\033[31m%s contrôle(s) en échec\033[0m (%s avertissement(s)).\n' "$FAIL" "$WARN"; exit 1
