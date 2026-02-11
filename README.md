<div align="center">

# MailFlow — KI-gestützter E-Mail-Assistent

**Angular 19 • NestJS 10 • PostgreSQL 16 • OpenAI**

Intelligentes E-Mail-Management mit KI-Antwortgenerierung, IMAP IDLE Echtzeit-Sync und JTL-WaWi-Integration.

</div>

---

## Features

- **KI-Antwortgenerierung** — OpenAI-basierte automatische Antwortvorschläge mit kontextbezogenen Prompts
- **IMAP IDLE Echtzeit-Sync** — Sofortige Erkennung neuer E-Mails ohne Polling, Push-Benachrichtigungen
- **Smart Inbox** — Volltextsuche, Filter nach Status/Kategorie, sortierbare Spalten
- **Konversations-Threading** — Automatische Zuordnung von E-Mails zu Kundenhistorie
- **E-Mail-Templates** — Verwaltbare Vorlagen für häufige Antworten
- **JTL-WaWi-Anbindung** — Read-Only MSSQL-Zugriff auf Kundendaten (Bestellungen, Artikel, Rechnungen)
- **Admin-Dashboard** — Benutzerverwaltung, System-Health-Monitoring, KI-Konfiguration, AI-Usage-Tracking
- **Authentifizierung** — JWT-basiert mit Rollen (Admin/User), Rate-Limiting, Request-Logging

## Architektur

```
┌─────────────┐     ┌───────────────────┐       ┌──────────────┐
│   Angular   │───▶│     NestJS API     │────▶ │  PostgreSQL  │
│   Frontend  │◀── │   (Port 3000)      │       │   (intern)  │
│  (Nginx:80) │     │                    │────▶ │   MSSQL/WaWi│
└─────────────┘     │   IMAP IDLE ◀────│────▶  │  IMAP/SMTP   │
                    │   OpenAI Agent    │────▶  │  OpenAI API │
                    └───────────────────┘       └──────────────┘
```

| Service | Technologie | Beschreibung |
|---------|-------------|--------------|
| Frontend | Angular 19, SCSS | SPA mit glassmorphem Design |
| Backend | NestJS 10, TypeORM | REST API, AI-Agent, IMAP IDLE |
| Datenbank | PostgreSQL 16 | Users, Emails, Templates, Logs |
| WaWi | MSSQL (Read-Only) | JTL-Wawi Kunden-/Bestelldaten |
| E-Mail | IMAP + SMTP | Empfang & Versand über Nodemailer |
| KI | OpenAI GPT | Antwortgenerierung, Tool-Calling |

## Projektstruktur

```
apps/
├── backend/                NestJS API
│   └── src/
│       ├── ai-agent/       KI-Agent mit Tools & Prompts
│       ├── ai-config/      KI-Modell-/Prompt-Konfiguration
│       ├── ai-usage/       Token-Usage Tracking
│       ├── auth/           JWT Auth, Guards, Strategies
│       ├── emails/         IMAP/SMTP, IMAP IDLE, E-Mail CRUD
│       ├── email-templates/ Vorlagen-Verwaltung
│       ├── jtl-tools/      JTL-WaWi MSSQL-Abfragen
│       ├── logs/           Request-Logging, Exception-Filter
│       ├── users/          User CRUD, Admin-Funktionen
│       └── database/       TypeORM Konfiguration
└── frontend/               Angular SPA
    └── src/app/
        ├── components/     Feature-Komponenten
        │   ├── admin/      Admin-Bereich (Users, Health, Config)
        │   ├── emails/     Posteingang, Threading, Detail
        │   └── ...
        ├── services/       Auth, Toast, Confirmation
        ├── api/            API-Service, Interfaces
        └── shared/         Header, Footer, Guards
```

## Setup

### Voraussetzungen

- Node.js ≥ 18
- Docker & Docker Compose
- VPN-Zugang zum WaWi-Netzwerk (für MSSQL)

### Development

```bash
# Dependencies installieren
npm install

# PostgreSQL starten
docker compose -f docker-compose.dev.yml up -d

# Backend + Frontend parallel starten
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:3000 |

### Production

```bash
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost (Nginx) |
| Backend | http://localhost:3000 (intern) |

### Stoppen

```bash
docker compose down
```

## Umgebungsvariablen

Backend `.env` (bzw. `.env.production`):

```env
# Datenbank
DB_HOST=db
DB_PORT=5432
DB_USER=app
DB_PASSWORD=secret
DB_NAME=appdb

# JWT
JWT_SECRET=your-secret-key

# IMAP
IMAP_USER=email@example.com
IMAP_PASSWORD=app-password
IMAP_HOST=imap.example.com
IMAP_PORT=993

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=email@example.com
SMTP_PASSWORD=app-password

# MSSQL / WaWi
MSSQL_HOST=192.168.x.x
MSSQL_PORT=1433
MSSQL_USER=readonly
MSSQL_PASSWORD=secret
MSSQL_DATABASE=eazybusiness

# OpenAI
OPENAI_API_KEY=sk-...

# VPN Health-Check
VPN_CHECK_HOST=192.168.x.x
VPN_CHECK_PORT=1433
```

## API-Endpunkte (Auswahl)

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Registrierung |
| GET | `/api/emails` | E-Mails abrufen (Pagination, Filter) |
| POST | `/api/emails/send` | E-Mail senden |
| POST | `/api/ai-agent/respond` | KI-Antwort generieren |
| GET | `/api/system/status` | Verbindungsstatus |
| GET | `/api/system/health` | Detaillierter Health-Check |
| GET | `/api/users` | Benutzerliste (Admin) |
| POST | `/api/users/:id/reset-password` | Passwort zurücksetzen (Admin) |

---

<div align="center">

Made with ☕ in Westerwald

</div>