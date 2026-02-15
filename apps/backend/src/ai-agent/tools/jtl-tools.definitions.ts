/**
 * OpenAI Function-Calling Tool-Definitionen für JTL-Wawi Datenbank-Tools.
 * Diese werden direkt an die OpenAI API als `tools` Parameter übergeben.
 */
export const JTL_TOOLS: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}> = [
  {
    type: 'function',
    function: {
      name: 'find_customer',
      description:
        'Sucht einen Kunden in JTL per Name, Firma, E-Mail oder Kundennummer. IMMER als erstes nutzen um den Kunden zu identifizieren.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Suchbegriff (Name, Firma, E-Mail oder Kundennummer)' },
        },
        required: ['search'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_customer_by_email',
      description:
        'Findet einen Kunden über seine exakte E-Mail-Adresse. Schneller als find_customer wenn die E-Mail bekannt ist.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Exakte E-Mail-Adresse des Kunden' },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_orders',
      description:
        'Zeigt die letzten Aufträge eines Kunden mit Versand- und Rechnungsstatus.',
      parameters: {
        type: 'object',
        properties: {
          kKunde: { type: 'number', description: 'Kunden-ID aus find_customer' },
          limit: { type: 'number', description: 'Anzahl Aufträge (default 10, max 50)' },
        },
        required: ['kKunde'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_details',
      description:
        'Zeigt alle Details eines Auftrags: Header + bestellte Artikel/Positionen.',
      parameters: {
        type: 'object',
        properties: {
          auftragsNr: { type: 'string', description: 'Auftragsnummer z.B. AU-12345' },
        },
        required: ['auftragsNr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_shipping',
      description:
        'Zeigt Versandstatus, Trackingnummer und Versanddienstleister eines Auftrags.',
      parameters: {
        type: 'object',
        properties: {
          auftragsNr: { type: 'string', description: 'Auftragsnummer' },
        },
        required: ['auftragsNr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_invoice',
      description:
        'Zeigt Rechnungsinfos: Rechnungsnummer, Zahlungsstatus, Zahlungsart.',
      parameters: {
        type: 'object',
        properties: {
          auftragsNr: { type: 'string', description: 'Auftragsnummer' },
        },
        required: ['auftragsNr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_tickets',
      description: 'Zeigt offene Support-Tickets eines Kunden.',
      parameters: {
        type: 'object',
        properties: {
          kKunde: { type: 'number', description: 'Kunden-ID' },
        },
        required: ['kKunde'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_full_context',
      description:
        'Lädt den kompletten Kundenkontext auf einmal: Stammdaten, Bestellstatistik, offene Tickets. Nutze dies für einen schnellen Gesamtüberblick.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'E-Mail-Adresse des Kunden' },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_product',
      description:
        'Sucht Artikel/Produkte per Name, Artikelnummer, EAN/Barcode oder Suchbegriff. Nutze dies wenn ein Kunde nach einem Produkt fragt.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Suchbegriff: Artikelname, Artikelnummer, EAN oder Schlagwort' },
        },
        required: ['search'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description:
        'Zeigt alle Details eines Artikels: Preis, Beschreibung, Gewicht, Lagerbestand, Warengruppe. Suche per Artikelnummer oder Artikel-ID.',
      parameters: {
        type: 'object',
        properties: {
          artNrOrId: { type: 'string', description: 'Artikelnummer (cArtNr) oder Artikel-ID (kArtikel)' },
        },
        required: ['artNrOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_stock',
      description:
        'Zeigt den aktuellen Lagerbestand und Verfügbarkeit eines Artikels.',
      parameters: {
        type: 'object',
        properties: {
          artNrOrId: { type: 'string', description: 'Artikelnummer oder Artikel-ID' },
        },
        required: ['artNrOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_bought_products',
      description:
        'Zeigt alle Artikel die ein Kunde in der Vergangenheit bestellt hat. Nützlich für Nachbestellungen oder Ersatzteil-Anfragen.',
      parameters: {
        type: 'object',
        properties: {
          kKunde: { type: 'number', description: 'Kunden-ID' },
          limit: { type: 'number', description: 'Max Ergebnisse (default 20)' },
        },
        required: ['kKunde'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_customer_notes',
      description: 'Zeigt alle Notizen/Bemerkungen die an einem Kunden hinterlegt sind. Enthält interne Hinweise, Warnungen und Kommentare vom Support-Team. SEHR WICHTIG für Kontext!',
      parameters: {
        type: 'object',
        properties: {
          kKunde: { type: 'number', description: 'Kunden-ID' },
        },
        required: ['kKunde'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_product_variants',
      description: 'Zeigt alle Varianten eines Artikels (z.B. Farben, Größen) mit Lagerbestand und Preis pro Variante. Nutze dies wenn ein Kunde nach einer bestimmten Variante fragt.',
      parameters: {
        type: 'object',
        properties: {
          kArtikel: { type: 'number', description: 'Artikel-ID (kArtikel) – kann Vater- oder Kindartikel sein' },
        },
        required: ['kArtikel'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_customer_returns',
      description: 'Zeigt Retouren und zugehörige Gutschriften eines Kunden. Nutze dies bei Reklamationen, Rücksendungen oder wenn der Kunde nach einer Gutschrift fragt.',
      parameters: {
        type: 'object',
        properties: {
          kKunde: { type: 'number', description: 'Kunden-ID' },
        },
        required: ['kKunde'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_order_payments',
      description: 'Zeigt alle Zahlungseingänge zu einem Auftrag: Betrag, Datum, Zahlungsart, offener Restbetrag. Nutze dies bei Fragen wie "Habe ich schon bezahlt?" oder Mahnungen.',
      parameters: {
        type: 'object',
        properties: {
          auftragsNr: { type: 'string', description: 'Auftragsnummer' },
        },
        required: ['auftragsNr'],
      },
    },
  },
];
