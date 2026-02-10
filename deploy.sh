#!/usr/bin/env bash
###############################################################################
#  deploy.sh  –  Pull, Build, Restart – ein einziger Befehl
#
#  Aufruf:
#    ./deploy.sh           ← Pull + Rebuild alles
#    ./deploy.sh --no-pull ← Nur Rebuild (ohne git pull)
#    ./deploy.sh --down    ← Alles stoppen
#    ./deploy.sh --logs    ← Logs anzeigen (follow)
#    ./deploy.sh --status  ← Status aller Container
###############################################################################
set -euo pipefail
cd "$(dirname "$0")"   # Immer ins Projektverzeichnis wechseln

# ── Farben ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✔]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✖]${NC} $*"; exit 1; }
step()  { echo -e "\n${CYAN}── $* ──${NC}"; }

COMPOSE="docker compose"

# ── Flags parsen ─────────────────────────────────────────────────────────────
NO_PULL=false
case "${1:-}" in
  --no-pull) NO_PULL=true ;;
  --down)
    step "Container stoppen"
    $COMPOSE down
    info "Alles gestoppt."
    exit 0 ;;
  --logs)
    $COMPOSE logs -f --tail=100
    exit 0 ;;
  --status)
    $COMPOSE ps -a
    exit 0 ;;
  --help|-h)
    echo "Usage: ./deploy.sh [--no-pull|--down|--logs|--status|--help]"
    exit 0 ;;
esac

# ── Pre-Flight Checks ───────────────────────────────────────────────────────
command -v docker &>/dev/null || error "Docker nicht gefunden. Erst setup-server.sh ausführen!"
docker info &>/dev/null 2>&1  || error "Docker-Daemon läuft nicht oder keine Rechte (docker-Gruppe?)."

if [[ ! -f "apps/backend/.env.production" ]]; then
  error "apps/backend/.env.production fehlt! Bitte anlegen."
fi

# ── 1. Git Pull ──────────────────────────────────────────────────────────────
if [[ "$NO_PULL" == false ]]; then
  step "Git Pull"
  git pull --ff-only || {
    warn "Fast-forward nicht möglich. Versuche rebase …"
    git pull --rebase
  }
  info "Code ist aktuell."
else
  warn "Git Pull übersprungen (--no-pull)."
fi

# ── 2. Build & Start ────────────────────────────────────────────────────────
step "Docker Images bauen"
$COMPOSE build --parallel
info "Build abgeschlossen."

step "Container starten"
$COMPOSE up -d --remove-orphans
info "Container laufen."

# ── 3. Alte Images aufräumen ─────────────────────────────────────────────────
step "Alte ungenutzte Images aufräumen"
docker image prune -f
info "Aufgeräumt."

# ── 4. Status ────────────────────────────────────────────────────────────────
step "Status"
$COMPOSE ps

echo ""
echo "================================================================"
echo -e "${GREEN}  Deployment erfolgreich!${NC}"
echo "================================================================"
echo ""
echo "  Frontend:  http://$(hostname -I | awk '{print $1}'):1111"
echo "  Backend:   http://$(hostname -I | awk '{print $1}'):13000"
echo "  Postgres:  $(hostname -I | awk '{print $1}'):15432"
echo ""
echo "  Nützliche Befehle:"
echo "    ./deploy.sh --logs     Logs verfolgen"
echo "    ./deploy.sh --status   Container-Status"
echo "    ./deploy.sh --down     Alles stoppen"
echo ""
