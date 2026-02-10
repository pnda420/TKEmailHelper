#!/usr/bin/env bash
###############################################################################
#  setup-server.sh  –  Frischer Linux-Server → Docker-Dev-Server (einmalig)
#  Getestet für: Ubuntu 22.04 / 24.04, Debian 12
#  Aufruf:  chmod +x setup-server.sh && sudo ./setup-server.sh
###############################################################################
set -euo pipefail

# ── Farben ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✔]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✖]${NC} $*"; exit 1; }

# ── Root-Check ───────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Bitte mit sudo ausführen: sudo ./setup-server.sh"

# ── 1. System-Updates ────────────────────────────────────────────────────────
info "System-Update …"
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Basis-Tools ───────────────────────────────────────────────────────────
info "Basis-Tools installieren (git, curl, htop, ufw) …"
apt-get install -y -qq \
  git curl wget htop ufw ca-certificates gnupg lsb-release

# ── 3. Docker installieren (offizielle Methode) ─────────────────────────────
if command -v docker &>/dev/null; then
  warn "Docker ist bereits installiert – überspringe."
else
  info "Docker installieren …"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
    $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  info "Docker installiert: $(docker --version)"
fi

# ── 4. Aktuellen Benutzer zur docker-Gruppe hinzufügen ──────────────────────
REAL_USER="${SUDO_USER:-$USER}"
if id -nG "$REAL_USER" | grep -qw docker; then
  warn "$REAL_USER ist bereits in der docker-Gruppe."
else
  usermod -aG docker "$REAL_USER"
  info "$REAL_USER zur docker-Gruppe hinzugefügt (Neulogin nötig!)."
fi

# ── 5. Docker beim Boot starten ─────────────────────────────────────────────
systemctl enable docker --now
info "Docker-Dienst aktiv und beim Boot gestartet."

# ── 6. Firewall (optional – für lokalen Server minimal) ─────────────────────
info "Firewall konfigurieren …"
ufw allow OpenSSH          # SSH nicht aussperren!
ufw allow 1111/tcp         # Frontend + API (Nginx reverse proxy)
ufw allow 15432/tcp        # Postgres (nur wenn du extern zugreifen willst)
ufw --force enable
info "UFW aktiv. Offene Ports: SSH, 1111, 15432"

# ── 7. Projekt-Verzeichnis vorbereiten ───────────────────────────────────────
PROJECT_DIR="/opt/tkemail"
if [[ ! -d "$PROJECT_DIR" ]]; then
  mkdir -p "$PROJECT_DIR"
  chown "$REAL_USER":"$REAL_USER" "$PROJECT_DIR"
  info "Projektordner angelegt: $PROJECT_DIR"
  echo ""
  warn "Nächster Schritt: Repository klonen!"
  echo "  cd $PROJECT_DIR"
  echo "  git clone <DEIN-REPO-URL> ."
else
  warn "$PROJECT_DIR existiert bereits."
fi

# ── 8. Deploy-Script ausführbar machen (falls schon vorhanden) ───────────────
DEPLOY_SCRIPT="$PROJECT_DIR/deploy.sh"
[[ -f "$DEPLOY_SCRIPT" ]] && chmod +x "$DEPLOY_SCRIPT" && info "deploy.sh ist ausführbar."

# ── Fertig ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo -e "${GREEN}  Server-Setup abgeschlossen!${NC}"
echo "================================================================"
echo ""
echo "  Nächste Schritte:"
echo "  1. Neu einloggen (damit docker-Gruppe greift)"
echo "  2. cd $PROJECT_DIR && git clone <REPO-URL> ."
echo "  3. apps/backend/.env.production anlegen"
echo "  4. ./deploy.sh          ← baut & startet alles"
echo ""
echo "  Danach zum Updaten einfach:"
echo "    cd $PROJECT_DIR && ./deploy.sh"
echo ""
