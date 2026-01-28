import { Injectable } from '@angular/core';

// ===== INTERFACES =====
export interface Service {
  id: string;
  icon: string;
  title: string;
  description: string;
  longDescription: string;
  tags: string[];
  keywords: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  subtitle: string;
  materialIcon: string;
  services: Service[];
}

export interface FilterOption {
  id: string;
  name: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceDataService {

  // ===== ALL SERVICES DATA =====
  private categories: ServiceCategory[] = [
    {
      id: 'hardware',
      name: 'Hardware',
      subtitle: 'Computer, Laptops & Geräte',
      materialIcon: 'memory',
      services: [
        {
          id: 'pc-reparatur',
          icon: '🔧',
          title: 'PC & Laptop Reparatur',
          description: 'Startet nicht, stürzt ab, wird heiß – wir finden das Problem.',
          longDescription: 'Dein Computer macht Probleme? Egal ob er nicht mehr startet, ständig abstürzt, überhitzt oder merkwürdige Geräusche macht – wir diagnostizieren das Problem und beheben es. Wir reparieren sowohl Desktop-PCs als auch Laptops aller Marken.',
          tags: ['Fehlerdiagnose', 'Komponentenaustausch'],
          keywords: 'pc reparatur computer laptop notebook reparieren kaputt defekt'
        },
        {
          id: 'hardware-upgrade',
          icon: '⚡',
          title: 'Hardware-Aufrüstung',
          description: 'Mehr RAM, größere SSD, neue Grafikkarte – schneller machen.',
          longDescription: 'Dein Rechner ist zu langsam? Oft hilft ein gezieltes Upgrade: Mehr Arbeitsspeicher für flüssiges Multitasking, eine SSD für schnelleres Booten und Laden, oder eine bessere Grafikkarte für Gaming und Videobearbeitung. Wir beraten dich, was sich lohnt.',
          tags: ['RAM', 'SSD', 'Grafikkarte'],
          keywords: 'aufrüstung upgrade ram ssd festplatte arbeitsspeicher schneller'
        },
        {
          id: 'datenrettung',
          icon: '💾',
          title: 'Datenrettung',
          description: 'Festplatte kaputt? Daten gelöscht? Wir retten was geht.',
          longDescription: 'Wichtige Dateien verschwunden oder Festplatte defekt? Wir versuchen deine Daten zu retten – von HDDs, SSDs, USB-Sticks und SD-Karten. Je früher du dich meldest, desto besser die Chancen. Keine Rettung, keine Kosten.',
          tags: ['HDD', 'SSD', 'USB-Stick'],
          keywords: 'datenrettung daten retten festplatte kaputt backup wiederherstellen recovery'
        },
        {
          id: 'pc-zusammenbau',
          icon: '🖥️',
          title: 'PC-Zusammenbau',
          description: 'Wir bauen deinen Wunsch-PC zusammen.',
          longDescription: 'Du willst einen maßgeschneiderten PC? Wir stellen die Komponenten zusammen, bauen alles sauber auf, installieren das Betriebssystem und testen alles durch. Ob Gaming-Monster, leise Workstation oder kompakter Office-PC.',
          tags: ['Gaming-PC', 'Workstation', 'Office'],
          keywords: 'zusammenbau pc bauen computer custom gaming workstation zusammenstellen'
        },
        {
          id: 'kaufberatung',
          icon: '🛒',
          title: 'Kaufberatung',
          description: 'Welcher PC oder Laptop passt zu dir? Ehrliche Beratung.',
          longDescription: 'Überfordert von der Auswahl? Wir beraten dich herstellerunabhängig und ehrlich. Kein Upselling, keine Provision – nur die Empfehlung, die zu deinem Budget und deinen Anforderungen passt.',
          tags: ['Laptop', 'PC', 'Preis-Leistung'],
          keywords: 'kaufberatung hardware beratung welcher pc laptop kaufen'
        },
        {
          id: 'geraete-einrichtung',
          icon: '📦',
          title: 'Geräte-Einrichtung',
          description: 'Neues Gerät? Wir richten alles ein.',
          longDescription: 'Neuen PC oder Laptop gekauft? Wir kümmern uns um alles: Windows einrichten, Programme installieren, Drucker verbinden, Daten vom alten Gerät übertragen. Du bekommst ein fertiges, einsatzbereites System.',
          tags: ['Windows', 'Datenumzug', 'Software'],
          keywords: 'einrichtung setup neuer pc laptop einrichten installieren konfigurieren'
        },
        {
          id: 'reinigung-wartung',
          icon: '🧹',
          title: 'Reinigung & Wartung',
          description: 'Staub raus, neue Wärmeleitpaste – leise und kühl.',
          longDescription: 'Nach ein paar Jahren sammelt sich Staub an, die Wärmeleitpaste trocknet aus – der PC wird laut und heiß. Wir reinigen alles gründlich, tragen neue Wärmeleitpaste auf und tauschen bei Bedarf Lüfter aus.',
          tags: ['Entstaubung', 'Wärmeleitpaste'],
          keywords: 'reinigung pc reinigen staub lüfter wärmeleitpaste thermal wartung'
        },
        {
          id: 'display-reparatur',
          icon: '🖼️',
          title: 'Display-Reparatur',
          description: 'Laptop-Display kaputt? Wir tauschen es aus.',
          longDescription: 'Display gesprungen, Pixelfehler oder Bildausfall? Wir tauschen Laptop-Displays aus und reparieren auch Scharniere und Displaykabel. Die meisten Reparaturen sind innerhalb weniger Tage erledigt.',
          tags: ['Displaytausch', 'Scharnier'],
          keywords: 'display bildschirm monitor reparatur kaputt austausch'
        },
        {
          id: 'drucker-scanner',
          icon: '🖨️',
          title: 'Drucker & Scanner',
          description: 'Drucker einrichten, WLAN-Druck konfigurieren.',
          longDescription: 'Drucker will nicht? Wir richten deinen Drucker ein – lokal oder im Netzwerk, per Kabel oder WLAN. Auch Scanner und Multifunktionsgeräte. Inklusive Treiber-Installation und Testdruck.',
          tags: ['WLAN-Drucker', 'Scanner'],
          keywords: 'drucker einrichtung scanner multifunktion wlan drucker installieren'
        },
        {
          id: 'smartphone-tablet',
          icon: '📱',
          title: 'Smartphone & Tablet',
          description: 'Display-Tausch, Akku-Wechsel, Datenübertragung.',
          longDescription: 'Handy-Display kaputt oder Akku schwach? Wir reparieren Smartphones und Tablets. Außerdem helfen wir beim Umzug auf ein neues Gerät – alle Daten, Kontakte und Apps sicher übertragen.',
          tags: ['Display', 'Akku', 'Daten'],
          keywords: 'smartphone handy tablet reparatur display akku tauschen'
        },
        {
          id: 'nas-speicher',
          icon: '💿',
          title: 'NAS & Speicher',
          description: 'NAS einrichten, RAID konfigurieren, Backup-Strategien.',
          longDescription: 'Eigene Cloud zuhause? Wir richten NAS-Systeme von Synology, QNAP und anderen ein. RAID-Konfiguration, Benutzer anlegen, Backup einrichten, Fernzugriff – alles aus einer Hand.',
          tags: ['Synology', 'QNAP', 'RAID'],
          keywords: 'nas netzwerkspeicher speicher server storage synology qnap'
        }
      ]
    },
    {
      id: 'software',
      name: 'Software',
      subtitle: 'Programme, Apps & Automatisierung',
      materialIcon: 'code',
      services: [
        {
          id: 'desktop-anwendungen',
          icon: '💻',
          title: 'Desktop-Anwendungen',
          description: 'Individuelle Windows-Programme nach deinen Wünschen.',
          longDescription: 'Du brauchst ein Programm, das genau das macht, was du willst? Wir entwickeln individuelle Desktop-Anwendungen für Windows – von kleinen Tools bis zu komplexen Business-Anwendungen.',
          tags: ['Windows', 'Cross-Platform'],
          keywords: 'desktop anwendung programm windows software entwickeln programmieren'
        },
        {
          id: 'mobile-apps',
          icon: '📲',
          title: 'Mobile Apps',
          description: 'Apps für iOS und Android mit Flutter.',
          longDescription: 'Eine App für dein Business? Mit Flutter entwickeln wir Apps, die auf iPhone und Android laufen – mit einer Codebasis. Schneller, günstiger und einfacher zu warten als native Entwicklung.',
          tags: ['Flutter', 'iOS', 'Android'],
          keywords: 'app mobile ios android smartphone tablet flutter'
        },
        {
          id: 'automatisierungen',
          icon: '🤖',
          title: 'Automatisierungen',
          description: 'Wiederkehrende Aufgaben automatisch erledigen lassen.',
          longDescription: 'Jeden Tag die gleichen Klicks? Wir automatisieren wiederkehrende Aufgaben mit Scripts, Bots und Workflows. Daten übertragen, Reports erstellen, E-Mails versenden – alles auf Autopilot.',
          tags: ['Scripts', 'Bots', 'Workflows'],
          keywords: 'automatisierung script skript automatisch automatisieren'
        },
        {
          id: 'api-entwicklung',
          icon: '🔌',
          title: 'API-Entwicklung',
          description: 'Systeme verbinden, Daten austauschen.',
          longDescription: 'Deine Systeme sollen miteinander reden? Wir entwickeln REST-APIs und Schnittstellen, die deine Anwendungen verbinden. Sauber dokumentiert und sicher.',
          tags: ['REST-API', 'NestJS', 'Node.js'],
          keywords: 'api schnittstelle integration rest backend'
        },
        {
          id: 'datenbanken',
          icon: '🗄️',
          title: 'Datenbanken',
          description: 'Datenbanken designen, optimieren, verwalten.',
          longDescription: 'Daten sind das Fundament. Wir designen Datenbankstrukturen, optimieren langsame Queries und migrieren bestehende Datenbanken. PostgreSQL, MySQL, MongoDB – wir kennen sie alle.',
          tags: ['PostgreSQL', 'MySQL', 'MongoDB'],
          keywords: 'datenbank sql database mysql postgresql mongodb'
        },
        {
          id: 'excel-vba',
          icon: '📊',
          title: 'Excel & VBA',
          description: 'Makros, VBA-Scripts, komplexe Formeln.',
          longDescription: 'Excel kann mehr als du denkst. Wir erstellen Makros und VBA-Scripts, die dir stundenlange Arbeit ersparen. Komplexe Formeln, automatische Reports, Datenvalidierung.',
          tags: ['Makros', 'VBA', 'Formeln'],
          keywords: 'excel makro vba access tabelle automatisieren'
        },
        {
          id: 'business-software',
          icon: '🏢',
          title: 'Business-Software',
          description: 'Lager, Kunden, Aufträge – individuelle Lösungen.',
          longDescription: 'Standardsoftware passt nicht? Wir entwickeln individuelle Lösungen für Lagerverwaltung, Kundenverwaltung, Auftragsabwicklung – genau auf deine Prozesse zugeschnitten.',
          tags: ['Warenwirtschaft', 'CRM'],
          keywords: 'erp crm system business software warenwirtschaft'
        },
        {
          id: 'daten-import-export',
          icon: '🔄',
          title: 'Daten-Import & Export',
          description: 'Daten zwischen Systemen austauschen und migrieren.',
          longDescription: 'Daten müssen von A nach B? Wir schreiben Import/Export-Routinen, konvertieren Formate und migrieren Datenbestände. CSV, XML, JSON, Excel – kein Problem.',
          tags: ['CSV', 'XML', 'JSON'],
          keywords: 'schnittstelle import export datenaustausch csv xml json'
        }
      ]
    },
    {
      id: 'web',
      name: 'Web',
      subtitle: 'Websites & Web-Apps',
      materialIcon: 'language',
      services: [
        {
          id: 'firmenwebsites',
          icon: '🌐',
          title: 'Firmenwebsites',
          description: 'Professionelle Websites für Unternehmen.',
          longDescription: 'Dein digitales Aushängeschild. Wir bauen moderne, schnelle Websites, die auf allen Geräten gut aussehen. Für Unternehmen, Handwerker, Freiberufler – individuell gestaltet, nicht von der Stange.',
          tags: ['Responsive', 'Modern', 'Schnell'],
          keywords: 'website webseite homepage firmenwebsite internetseite erstellen'
        },
        {
          id: 'landingpages',
          icon: '🎯',
          title: 'Landingpages',
          description: 'Conversion-optimierte Seiten für Kampagnen.',
          longDescription: 'Eine Seite, ein Ziel. Wir bauen Landingpages, die konvertieren – für Produktlaunches, Kampagnen oder Lead-Generierung. Klare Struktur, überzeugender Text, schnelle Ladezeit.',
          tags: ['Conversion', 'Marketing'],
          keywords: 'landingpage landing page marketing conversion'
        },
        {
          id: 'web-applikationen',
          icon: '⚡',
          title: 'Web-Applikationen',
          description: 'Komplexe Browser-Anwendungen mit Angular.',
          longDescription: 'Mehr als eine Website – eine vollwertige Anwendung im Browser. Dashboards, interne Tools, Kundenportale. Mit Angular, TypeScript und modernen Technologien.',
          tags: ['Angular', 'TypeScript', 'SPA'],
          keywords: 'web app webanwendung angular react frontend browser'
        },
        {
          id: 'online-shops',
          icon: '🛍️',
          title: 'Online-Shops',
          description: 'E-Commerce Lösungen von einfach bis komplex.',
          longDescription: 'Verkaufen im Internet? Wir bauen Online-Shops – von einfachen Shopify-Lösungen bis zu individuellen E-Commerce-Plattformen. Payment, Versand, Bestandsverwaltung inklusive.',
          tags: ['Shopify', 'WooCommerce'],
          keywords: 'online shop e-commerce webshop shopify woocommerce'
        },
        {
          id: 'buchungssysteme',
          icon: '📅',
          title: 'Buchungssysteme',
          description: 'Online-Terminbuchung und Reservierungen.',
          longDescription: 'Kunden sollen online buchen können? Wir entwickeln Buchungssysteme für Termine, Kurse, Ressourcen. Mit Kalenderansicht, automatischen Bestätigungen und Erinnerungen.',
          tags: ['Terminbuchung', 'Kalender'],
          keywords: 'buchungssystem terminbuchung kalender online buchen reservierung'
        },
        {
          id: 'wordpress-cms',
          icon: '📝',
          title: 'WordPress & CMS',
          description: 'WordPress-Seiten, Themes, Plugins.',
          longDescription: 'WordPress ist der Klassiker – und wir kennen ihn in- und auswendig. Neue Seiten aufsetzen, Themes anpassen, Plugins entwickeln, bestehende Seiten reparieren.',
          tags: ['WordPress', 'Themes', 'Blog'],
          keywords: 'wordpress cms content management blog'
        },
        {
          id: 'seo-optimierung',
          icon: '📈',
          title: 'SEO-Optimierung',
          description: 'Google-Rankings verbessern.',
          longDescription: 'Gefunden werden bei Google. Wir optimieren deine Website technisch: Ladezeit, Struktur, Meta-Tags, Schema Markup. Damit du bei relevanten Suchanfragen oben stehst.',
          tags: ['On-Page SEO', 'Core Web Vitals'],
          keywords: 'seo suchmaschine google optimierung ranking'
        },
        {
          id: 'hosting-domains',
          icon: '☁️',
          title: 'Hosting & Domains',
          description: 'Domain, Hosting, SSL, DNS – alles einrichten.',
          longDescription: 'Das technische Fundament. Wir registrieren Domains, richten Hosting ein, konfigurieren DNS und SSL-Zertifikate. Damit deine Website sicher und erreichbar ist.',
          tags: ['Domain', 'SSL', 'DNS'],
          keywords: 'hosting domain webspace server ssl'
        },
        {
          id: 'website-wartung',
          icon: '🛠️',
          title: 'Website-Wartung',
          description: 'Updates, Backups, Security-Patches.',
          longDescription: 'Eine Website braucht Pflege. Wir kümmern uns um Updates, Backups, Sicherheits-Patches und kleine Änderungen. Damit du dich um dein Business kümmern kannst.',
          tags: ['Updates', 'Backups', 'Security'],
          keywords: 'website wartung pflege update aktualisierung'
        }
      ]
    },
    {
      id: 'netzwerk',
      name: 'Netzwerk',
      subtitle: 'WLAN, Server & Cloud',
      materialIcon: 'lan',
      services: [
        {
          id: 'wlan-einrichtung',
          icon: '📶',
          title: 'WLAN-Einrichtung',
          description: 'WLAN optimieren, Reichweite verbessern, Mesh.',
          longDescription: 'WLAN zu langsam oder Funklöcher? Wir analysieren dein Netzwerk und optimieren es. Access Points platzieren, Mesh-Systeme einrichten, Kanäle optimieren.',
          tags: ['Mesh', 'Access Points', '5GHz'],
          keywords: 'wlan wifi wireless funk netzwerk einrichten langsam reichweite'
        },
        {
          id: 'netzwerk-verkabelung',
          icon: '🔗',
          title: 'Netzwerk-Verkabelung',
          description: 'LAN-Verkabelung planen und umsetzen.',
          longDescription: 'Kabel ist King. Wir planen und verlegen Netzwerkkabel, richten Switches ein und dokumentieren alles sauber. Cat6, Cat7 – für stabiles, schnelles Internet.',
          tags: ['Cat6/Cat7', 'Switches'],
          keywords: 'netzwerk lan kabel ethernet switch router verkabelung'
        },
        {
          id: 'router-firewall',
          icon: '🌐',
          title: 'Router & Firewall',
          description: 'Router, Firewall-Regeln, Port-Forwarding.',
          longDescription: 'Das Tor zum Internet. Wir konfigurieren Router und Firewalls, richten Port-Forwarding ein und sorgen für Sicherheit. FritzBox, pfSense, Ubiquiti – wir kennen sie alle.',
          tags: ['FritzBox', 'pfSense', 'VPN'],
          keywords: 'router firewall fritz fritzbox konfiguration internet'
        },
        {
          id: 'vpn-loesungen',
          icon: '🔒',
          title: 'VPN-Lösungen',
          description: 'Sichere Fernzugriffe, Homeoffice-Anbindung.',
          longDescription: 'Sicher von überall arbeiten. Wir richten VPN-Verbindungen ein – für Homeoffice, Außendienst oder Standortvernetzung. WireGuard, OpenVPN, IPSec.',
          tags: ['WireGuard', 'OpenVPN'],
          keywords: 'vpn virtual private network fernzugriff remote tunnel'
        },
        {
          id: 'server-administration',
          icon: '🖥️',
          title: 'Server-Administration',
          description: 'Windows Server und Linux einrichten und warten.',
          longDescription: 'Server sind unser Ding. Windows Server oder Linux – wir installieren, konfigurieren und warten. Updates, Monitoring, Troubleshooting.',
          tags: ['Windows Server', 'Linux', 'Debian'],
          keywords: 'server windows linux debian ubuntu einrichten administrieren'
        },
        {
          id: 'active-directory',
          icon: '👥',
          title: 'Active Directory',
          description: 'Domänen, Benutzer, Gruppen, Richtlinien.',
          longDescription: 'Zentrale Benutzerverwaltung für Unternehmen. Wir richten Active Directory ein, verwalten Benutzer und Gruppen, konfigurieren Gruppenrichtlinien.',
          tags: ['AD', 'GPO', 'Benutzer'],
          keywords: 'active directory ad domäne benutzer gruppen rechte'
        },
        {
          id: 'cloud-loesungen',
          icon: '☁️',
          title: 'Cloud-Lösungen',
          description: 'Microsoft 365, Azure, AWS einrichten.',
          longDescription: 'Ab in die Cloud. Wir richten Microsoft 365 ein, migrieren Daten zu Azure oder AWS und verwalten Cloud-Infrastruktur. Hybrid oder Full Cloud.',
          tags: ['Microsoft 365', 'Azure', 'AWS'],
          keywords: 'cloud microsoft 365 office azure aws google cloud'
        },
        {
          id: 'backup-strategien',
          icon: '💾',
          title: 'Backup-Strategien',
          description: 'Backup-Konzepte, automatische Sicherungen.',
          longDescription: 'Daten sind Gold wert. Wir entwickeln Backup-Konzepte nach der 3-2-1 Regel, richten automatische Sicherungen ein und testen die Wiederherstellung.',
          tags: ['3-2-1 Regel', 'Cloud-Backup'],
          keywords: 'backup datensicherung sicherung restore wiederherstellung'
        },
        {
          id: 'virtualisierung',
          icon: '📦',
          title: 'Virtualisierung',
          description: 'VMs, Hyper-V, Proxmox, Docker.',
          longDescription: 'Mehr aus der Hardware rausholen. Wir richten Virtualisierung ein – Hyper-V, Proxmox, VMware. Oder Container mit Docker für moderne Anwendungen.',
          tags: ['Hyper-V', 'Proxmox', 'Docker'],
          keywords: 'virtualisierung vm vmware hyper-v proxmox docker container'
        },
        {
          id: 'it-sicherheit',
          icon: '🛡️',
          title: 'IT-Sicherheit',
          description: 'Firewall, Virenschutz, Security-Audits.',
          longDescription: 'Sicherheit ist kein Zustand, sondern ein Prozess. Wir prüfen deine IT auf Schwachstellen, richten Firewalls und Virenschutz ein, implementieren 2FA.',
          tags: ['Firewall', 'Antivirus', '2FA'],
          keywords: 'sicherheit security firewall antivirus virenschutz malware'
        },
        {
          id: 'email-systeme',
          icon: '📧',
          title: 'E-Mail-Systeme',
          description: 'Exchange, IMAP/SMTP einrichten.',
          longDescription: 'E-Mail ist Kommunikation Nr. 1. Wir richten E-Mail-Server ein, migrieren Postfächer, konfigurieren Spam-Filter und sorgen für zuverlässige Zustellung.',
          tags: ['Exchange', 'IMAP', 'Spam-Filter'],
          keywords: 'e-mail mail exchange postfach mailserver imap smtp'
        },
        {
          id: 'monitoring',
          icon: '📊',
          title: 'Monitoring',
          description: 'Server und Netzwerk überwachen, Alerts.',
          longDescription: 'Probleme erkennen, bevor sie eskalieren. Wir richten Monitoring ein – für Server, Netzwerk, Dienste. Mit Dashboards und Alerts bei Problemen.',
          tags: ['Uptime', 'Alerts', 'Grafana'],
          keywords: 'monitoring überwachung netzwerk server nagios zabbix'
        }
      ]
    },
    {
      id: 'support',
      name: 'Support',
      subtitle: 'Hilfe remote oder vor Ort',
      materialIcon: 'support_agent',
      services: [
        {
          id: 'remote-support',
          icon: '🖱️',
          title: 'Remote-Support',
          description: 'Schnelle Hilfe per Fernwartung.',
          longDescription: 'Problem schildern, wir schalten uns drauf. Per TeamViewer oder AnyDesk helfen wir dir sofort – ohne Anfahrt, ohne Wartezeit. Die schnellste Lösung für die meisten Probleme.',
          tags: ['TeamViewer', 'AnyDesk'],
          keywords: 'remote support fernwartung fernzugriff teamviewer hilfe'
        },
        {
          id: 'vor-ort-service',
          icon: '🚗',
          title: 'Vor-Ort-Service',
          description: 'Wir kommen zu dir – im Westerwald und Umgebung.',
          longDescription: 'Manchmal muss man vor Ort sein. Wir kommen zu dir – im Westerwald, Altenkirchen und Umgebung. Für Hardware-Probleme, Netzwerk-Einrichtung oder wenn Remote nicht reicht.',
          tags: ['Westerwald', 'Altenkirchen'],
          keywords: 'vor ort vor-ort vorort service techniker kommen westerwald'
        },
        {
          id: 'wartungsvertraege',
          icon: '📋',
          title: 'Wartungsverträge',
          description: 'Regelmäßige Wartung, bevorzugter Support.',
          longDescription: 'Planbare IT-Kosten und bevorzugter Support. Mit einem Wartungsvertrag kümmern wir uns regelmäßig um deine Systeme und du hast einen festen Ansprechpartner.',
          tags: ['Regelmäßig', 'Priorität'],
          keywords: 'wartung wartungsvertrag regelmäßig service monatlich'
        },
        {
          id: 'schulungen',
          icon: '🎓',
          title: 'Schulungen',
          description: 'Einweisungen, IT-Grundlagen, Workshops.',
          longDescription: 'Wissen ist Macht. Wir schulen dich und dein Team – in neuer Software, IT-Grundlagen oder speziellen Themen. Einzeln oder als Workshop.',
          tags: ['Einweisung', 'Workshop'],
          keywords: 'schulung training einweisung lernen erklären workshop'
        },
        {
          id: 'software-installation',
          icon: '📀',
          title: 'Software-Installation',
          description: 'Programme installieren und konfigurieren.',
          longDescription: 'Neue Software soll aufs System? Wir installieren und konfigurieren Programme, sorgen für die richtigen Einstellungen und weisen dich ein.',
          tags: ['Installation', 'Konfiguration'],
          keywords: 'installation software installieren programm einrichten'
        },
        {
          id: 'updates-patches',
          icon: '🔄',
          title: 'Updates & Patches',
          description: 'Betriebssystem, Treiber, Security-Patches.',
          longDescription: 'Aktuell bleiben ist wichtig. Wir bringen deine Systeme auf den neuesten Stand – Windows-Updates, Treiber, Security-Patches. Kontrolliert und ohne böse Überraschungen.',
          tags: ['Windows Update', 'Treiber'],
          keywords: 'update aktualisierung windows treiber patch'
        },
        {
          id: 'virenentfernung',
          icon: '🦠',
          title: 'Virenentfernung',
          description: 'Malware, Trojaner, Adware – sauber machen.',
          longDescription: 'System verseucht? Wir entfernen Viren, Trojaner, Adware und andere Schadsoftware. Gründlich und nachhaltig – damit dein System wieder sauber läuft.',
          tags: ['Malware', 'Trojaner'],
          keywords: 'virus malware trojaner entfernen reinigen säubern infiziert'
        },
        {
          id: 'performance-optimierung',
          icon: '🚀',
          title: 'Performance-Optimierung',
          description: 'PC zu langsam? Wir machen ihn wieder flott.',
          longDescription: 'Rechner lahm? Wir finden die Ursache: Autostart aufräumen, Bloatware entfernen, Festplatte bereinigen, Dienste optimieren. Danach läuft er wieder.',
          tags: ['Autostart', 'Bereinigung'],
          keywords: 'performance langsam optimieren schneller tuning beschleunigen'
        },
        {
          id: 'it-beratung',
          icon: '💡',
          title: 'IT-Beratung',
          description: 'Welche Lösung passt? Ehrliche Beratung.',
          longDescription: 'Nicht sicher, was du brauchst? Wir beraten dich herstellerunabhängig und ehrlich. Keine versteckten Interessen – nur die Lösung, die für dich passt.',
          tags: ['Strategie', 'Neutral'],
          keywords: 'beratung consulting it-beratung strategie konzept planen'
        },
        {
          id: 'notfall-support',
          icon: '🚨',
          title: 'Notfall-Support',
          description: 'Server down? Hilfe auch außerhalb der Geschäftszeiten.',
          longDescription: 'IT-Notfall wartet nicht auf Bürozeiten. Bei dringenden Problemen helfen wir auch außerhalb der regulären Zeiten. Server down, Datenverlust, Hackerangriff – wir sind da.',
          tags: ['24/7', 'Notfall'],
          keywords: 'notfall notdienst dringend schnell sofort hilfe'
        }
      ]
    }
  ];

  // ===== FILTER OPTIONS =====
  private filters: FilterOption[] = [
    { id: 'all', name: 'Alle', icon: '' },
    { id: 'hardware', name: 'Hardware', icon: 'memory' },
    { id: 'software', name: 'Software', icon: 'code' },
    { id: 'web', name: 'Web', icon: 'language' },
    { id: 'netzwerk', name: 'Netzwerk', icon: 'lan' },
    { id: 'support', name: 'Support', icon: 'support_agent' }
  ];

  // ===== PUBLIC METHODS =====

  getCategories(): ServiceCategory[] {
    return this.categories;
  }

  getFilters(): FilterOption[] {
    return this.filters;
  }

  getServiceById(id: string): Service | undefined {
    for (const cat of this.categories) {
      const service = cat.services.find(s => s.id === id);
      if (service) return service;
    }
    return undefined;
  }

  /**
   * Gibt die Service-ID (Slug) zurück - wird direkt ans Backend gesendet
   * @param serviceId Die ID des Services aus dem Frontend
   * @returns Der Slug für das Backend (identisch mit serviceId)
   */
  getServiceSlug(serviceId: string): string {
    return serviceId || 'allgemeine-anfrage';
  }

  getCategoryByServiceId(serviceId: string): ServiceCategory | undefined {
    return this.categories.find(cat =>
      cat.services.some(s => s.id === serviceId)
    );
  }

  getAllServices(): Service[] {
    return this.categories.flatMap(cat => cat.services);
  }
}