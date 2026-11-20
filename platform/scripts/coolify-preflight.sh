#!/bin/sh
# Contrôle du SERVEUR avant d'y déployer l'application. À lancer SUR LE VPS (SSH). LECTURE SEULE : aucune modification.
#   sh coolify-preflight.sh jobs.exemple.com [coolify.exemple.com]
# (copie le fichier sur le serveur, ou colle son contenu dans un fichier ; rien n'est envoyé nulle part, sauf une
#  requête pour connaître l'IP publique du serveur.)
set -u
APP_DOMAIN=${1:-}
DASH_DOMAIN=${2:-}
FAIL=0; WARN=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko()   { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; WARN=$((WARN+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

echo "Système"
[ -r /etc/os-release ] && . /etc/os-release && ok "${PRETTY_NAME:-Linux}"
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
mem_avail_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
[ "$mem_kb" -ge 1800000 ] && ok "RAM totale $((mem_kb/1024)) Mo (≥ 2 Go recommandés)" || warn "RAM totale $((mem_kb/1024)) Mo : moins que les 2 Go recommandés pour Coolify"
[ "$mem_avail_kb" -ge 700000 ] && ok "RAM disponible $((mem_avail_kb/1024)) Mo (l'application en veut ≥ 512 Mo)" || ko "RAM disponible $((mem_avail_kb/1024)) Mo : insuffisant pour ajouter l'application"
disk_kb=$(df -Pk / | awk 'NR==2 {print $4}')
[ "${disk_kb:-0}" -ge 5000000 ] && ok "disque libre $((disk_kb/1024/1024)) Go" || ko "disque libre $((${disk_kb:-0}/1024/1024)) Go : moins de 5 Go (build Docker)"
swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
[ "$swap_kb" -gt 0 ] && ok "swap présent" || warn "pas de swap : un build Docker peut échouer faute de mémoire sur un petit serveur"

echo "Docker et Coolify"
if have docker && docker info >/dev/null 2>&1; then
  ok "Docker fonctionne"
  names=$(docker ps --format '{{.Names}}' 2>/dev/null)
  echo "$names" | grep -qi '^coolify$' && ok "conteneur Coolify en marche" || warn "conteneur « coolify » non trouvé (droits insuffisants ? lance avec sudo)"
  echo "$names" | grep -qi 'proxy' && ok "proxy (Traefik/Caddy) en marche" || warn "proxy Coolify non trouvé"
else
  warn "Docker inaccessible avec cet utilisateur (essaie avec sudo)"
fi

echo "Ports en écoute"
if have ss; then
  listen=$(ss -ltn 2>/dev/null)
  for p in 80 443; do echo "$listen" | grep -q ":$p " && ok "port $p ouvert (certificats et HTTPS)" || ko "port $p non en écoute : HTTPS impossible"; done
  for p in 8000 6001 6002; do
    if echo "$listen" | grep -E ":$p " | grep -vqE '127\.0\.0\.1|\[::1\]'; then
      warn "port $p exposé publiquement : à fermer une fois le tableau de bord servi par son domaine (https)"
    fi
  done
else
  warn "commande ss absente : ports non vérifiés"
fi

echo "Sécurité du serveur"
if have sshd && sshd -T >/dev/null 2>&1; then
  sshd -T 2>/dev/null | grep -qi '^passwordauthentication no' && ok "SSH : connexion par mot de passe désactivée" || warn "SSH : mot de passe encore autorisé (clés uniquement recommandé)"
  sshd -T 2>/dev/null | grep -qi '^permitrootlogin \(no\|prohibit-password\|without-password\)' && ok "SSH : root sans mot de passe" || warn "SSH : connexion root par mot de passe possible"
else
  warn "réglages SSH non lisibles (lance avec sudo)"
fi
dpkg -s unattended-upgrades >/dev/null 2>&1 && ok "mises à jour de sécurité automatiques installées" || warn "unattended-upgrades non installé"
[ -f /data/coolify/source/.env ] && ok "/data/coolify/source/.env présent (pense à en garder une copie hors du serveur)" || warn "/data/coolify/source/.env introuvable (droits ?)"

echo "DNS"
pub_ip=$(curl -sS -m 10 https://api.ipify.org 2>/dev/null || true)
[ -n "$pub_ip" ] && ok "IP publique de ce serveur : $pub_ip" || warn "IP publique non déterminée"
check_dns() {
  d=$1; [ -n "$d" ] || return 0
  if have getent; then ip=$(getent ahostsv4 "$d" 2>/dev/null | awk 'NR==1 {print $1}'); else ip=""; fi
  if [ -z "$ip" ]; then ko "$d ne résout pas encore (enregistrement DNS de type A à créer vers ${pub_ip:-l'IP du serveur})"
  elif [ -n "$pub_ip" ] && [ "$ip" = "$pub_ip" ]; then ok "$d → $ip (correspond à ce serveur)"
  else warn "$d → $ip, différent de l'IP de ce serveur (${pub_ip:-inconnue}) : propagation en cours, proxy (Cloudflare) ou mauvais enregistrement"; fi
}
[ -n "$APP_DOMAIN" ] && check_dns "$APP_DOMAIN" || warn "aucun domaine d'application fourni (argument 1)"
[ -n "$DASH_DOMAIN" ] && check_dns "$DASH_DOMAIN"

echo
if [ "$FAIL" -eq 0 ]; then printf '\033[32mServeur prêt\033[0m (%s avertissement(s) à relire).\n' "$WARN"; exit 0; fi
printf '\033[31m%s point(s) bloquant(s)\033[0m (%s avertissement(s)).\n' "$FAIL" "$WARN"; exit 1
