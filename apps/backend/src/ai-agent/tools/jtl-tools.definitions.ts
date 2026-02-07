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
];
