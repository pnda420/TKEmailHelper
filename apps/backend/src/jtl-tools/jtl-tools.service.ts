import { Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JtlToolsService {
  private readonly logger = new Logger(JtlToolsService.name);

  constructor(private readonly db: DatabaseService) {}

  // ==================== TOOL ROUTER ====================

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    this.logger.log(`Executing tool: ${name} with args: ${JSON.stringify(args)}`);
    switch (name) {
      case 'find_customer':
        return this.findCustomer(args.search);
      case 'find_customer_by_email':
        return this.findCustomerByEmail(args.email);
      case 'get_customer_orders':
        return this.getCustomerOrders(args.kKunde, args.limit);
      case 'get_order_details':
        return this.getOrderDetails(args.auftragsNr);
      case 'get_order_shipping':
        return this.getOrderShipping(args.auftragsNr);
      case 'get_order_invoice':
        return this.getOrderInvoice(args.auftragsNr);
      case 'get_customer_tickets':
        return this.getCustomerTickets(args.kKunde);
      case 'get_customer_full_context':
        return this.getCustomerFullContext(args.email);
      case 'search_product':
        return this.searchProduct(args.search);
      case 'get_product_details':
        return this.getProductDetails(args.artNrOrId);
      case 'get_product_stock':
        return this.getProductStock(args.artNrOrId);
      case 'get_customer_bought_products':
        return this.getCustomerBoughtProducts(args.kKunde, args.limit);
      case 'get_customer_notes':
        return this.getCustomerNotes(args.kKunde);
      case 'get_product_variants':
        return this.getProductVariants(args.kArtikel);
      case 'get_customer_returns':
        return this.getCustomerReturns(args.kKunde);
      case 'get_order_payments':
        return this.getOrderPayments(args.auftragsNr);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ==================== TOOL 1: find_customer ====================

  async findCustomer(search: string): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT TOP 20
        k.kKunde, k.cKundenNr,
        a.cVorname, a.cName, a.cFirma, a.cMail, a.cTel, a.cMobil,
        a.cStrasse, a.cPLZ, a.cOrt
      FROM dbo.tkunde k
      JOIN dbo.tAdresse a ON a.kKunde = k.kKunde AND a.nStandard = 1
      WHERE a.cName LIKE '%' + @search + '%'
         OR a.cVorname LIKE '%' + @search + '%'
         OR a.cFirma LIKE '%' + @search + '%'
         OR a.cMail LIKE '%' + @search + '%'
         OR k.cKundenNr LIKE '%' + @search + '%'`,
      { search: { type: sql.NVarChar(200), value: search } },
    );
    return result.recordset;
  }

  // ==================== TOOL 2: find_customer_by_email ====================

  async findCustomerByEmail(email: string): Promise<any | null> {
    const result = await this.db.queryWithParams(
      `SELECT TOP 1
        k.kKunde, k.cKundenNr,
        a.cVorname, a.cName, a.cFirma, a.cMail, a.cTel, a.cMobil,
        a.cStrasse, a.cPLZ, a.cOrt, a.cLand,
        k.cSperre, k.dErstellt AS KundeSeit
      FROM dbo.tkunde k
      JOIN dbo.tAdresse a ON a.kKunde = k.kKunde AND a.nStandard = 1
      WHERE a.cMail = @email`,
      { email: { type: sql.NVarChar(200), value: email } },
    );
    return result.recordset[0] || null;
  }

  // ==================== TOOL 3: get_customer_orders ====================

  async getCustomerOrders(kKunde: number, limit = 10): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT TOP (@limit)
        a.kAuftrag, a.cAuftragsNr, a.dErstellt, a.cWaehrung,
        ek.fWertBrutto,
        ek.fWertNetto,
        ek.fZahlung,
        ek.fOffenerWert,
        CASE ek.nZahlungStatus
          WHEN 0 THEN 'Offen'
          WHEN 1 THEN 'Teilbezahlt'
          WHEN 2 THEN 'Bezahlt'
          ELSE CAST(ek.nZahlungStatus AS NVARCHAR(10))
        END AS ZahlungStatus,
        CASE WHEN e.nVersandStatus = 2 THEN 'Versendet'
             WHEN e.nVersandStatus = 1 THEN 'Teilversendet'
             WHEN e.nVersandStatus = 0 THEN 'Offen'
             ELSE 'Unbekannt' END AS VersandStatus,
        CASE WHEN ek.nRechnungStatus = 1 THEN 'Berechnet'
             WHEN ek.nRechnungStatus = 0 THEN 'Nicht berechnet'
             ELSE 'Unbekannt' END AS RechnungStatus,
        e.dVersendet
      FROM Verkauf.tAuftrag a
      LEFT JOIN Verkauf.tAuftragEckdaten ek ON ek.kAuftrag = a.kAuftrag
      LEFT JOIN dbo.tLieferschein ls ON ls.kBestellung = a.kAuftrag
      LEFT JOIN dbo.tLieferscheinEckdaten e ON e.kLieferschein = ls.kLieferschein
      WHERE a.kKunde = @kKunde
      ORDER BY a.dErstellt DESC`,
      {
        kKunde: { type: sql.Int, value: kKunde },
        limit: { type: sql.Int, value: Math.min(limit, 50) },
      },
    );
    return result.recordset;
  }

  // ==================== TOOL 4: get_order_details ====================

  async getOrderDetails(auftragsNr: string): Promise<{ header: any; positions: any[] }> {
    const [headerResult, positionsResult] = await Promise.all([
      this.db.queryWithParams(
        `SELECT TOP 1
          a.kAuftrag, a.cAuftragsNr, a.kKunde, a.dErstellt, a.cWaehrung,
          ek.fWertBrutto,
          ek.fWertNetto,
          ek.fOffenerWert,
          ek.nZahlungStatus,
          ek.dBezahlt,
          ad.cVorname, ad.cName, ad.cFirma, ad.cMail
        FROM Verkauf.tAuftrag a
        LEFT JOIN Verkauf.tAuftragEckdaten ek ON ek.kAuftrag = a.kAuftrag
        JOIN dbo.tAdresse ad ON ad.kKunde = a.kKunde AND ad.nStandard = 1
        WHERE a.cAuftragsNr = @auftragsNr`,
        { auftragsNr: { type: sql.NVarChar(50), value: auftragsNr } },
      ),
      this.db.queryWithParams(
        `SELECT
          p.cArtNr, p.cName, p.fAnzahl, p.fVkNetto, p.fMwSt,
          ROUND(p.fVkNetto * p.fAnzahl * (1 + p.fMwSt / 100), 2) AS BruttoGesamt,
          p.cEinheit, p.cHinweis
        FROM Verkauf.tAuftragPosition p
        JOIN Verkauf.tAuftrag a ON a.kAuftrag = p.kAuftrag
        WHERE a.cAuftragsNr = @auftragsNr AND p.nType = 0
        ORDER BY p.nSort`,
        { auftragsNr: { type: sql.NVarChar(50), value: auftragsNr } },
      ),
    ]);

    return {
      header: headerResult.recordset[0] || null,
      positions: positionsResult.recordset,
    };
  }

  // ==================== TOOL 5: get_order_shipping ====================

  async getOrderShipping(auftragsNr: string): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        a.cAuftragsNr, ls.cLieferscheinNr,
        v.cIdentCode AS TrackingNummer,
        v.cLogistiker AS Versanddienstleister,
        v.dVersendet AS VersandDatum,
        CASE v.nStatus
          WHEN 0 THEN 'Erstellt' WHEN 1 THEN 'Versendet' WHEN 2 THEN 'Zugestellt'
          ELSE CAST(v.nStatus AS NVARCHAR(10)) END AS VersandStatus,
        e.nAnzahlPakete, e.nAnzahlVersendetePakete
      FROM Verkauf.tAuftrag a
      JOIN dbo.tLieferschein ls ON ls.kBestellung = a.kAuftrag
      LEFT JOIN dbo.tVersand v ON v.kLieferschein = ls.kLieferschein
      LEFT JOIN dbo.tLieferscheinEckdaten e ON e.kLieferschein = ls.kLieferschein
      WHERE a.cAuftragsNr = @auftragsNr
      ORDER BY v.dErstellt DESC`,
      { auftragsNr: { type: sql.NVarChar(50), value: auftragsNr } },
    );
    return result.recordset;
  }

  // ==================== TOOL 6: get_order_invoice ====================

  async getOrderInvoice(auftragsNr: string): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        a.cAuftragsNr, r.cRechnungsnr, r.dErstellt AS RechnungsDatum,
        r.cWaehrung, r.cZahlungsart, r.nZahlungszielTage,
        CASE r.nRechnungStatus
          WHEN 0 THEN 'Offen' WHEN 1 THEN 'Bezahlt' WHEN 2 THEN 'Teilbezahlt'
          ELSE CAST(r.nRechnungStatus AS NVARCHAR(10)) END AS ZahlungsStatus,
        r.nStorno AS IstStorniert
      FROM Verkauf.tAuftrag a
      JOIN Verkauf.tAuftragRechnung ar ON ar.kAuftrag = a.kAuftrag
      JOIN Rechnung.tRechnung r ON r.kRechnung = ar.kRechnung
      WHERE a.cAuftragsNr = @auftragsNr
      ORDER BY r.dErstellt DESC`,
      { auftragsNr: { type: sql.NVarChar(50), value: auftragsNr } },
    );
    return result.recordset;
  }

  // ==================== TOOL 7: get_customer_tickets ====================

  async getCustomerTickets(kKunde: number): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        t.kTicket, t.cEindeutigeId AS TicketNr, t.nPrioritaet,
        t.dAenderung AS LetzteAenderung, t.dFaelligAm, t.dLoesung,
        CASE
          WHEN t.dLoesung IS NOT NULL THEN 'Gelöst'
          WHEN t.nIstInPapierkorb = 1 THEN 'Papierkorb'
          ELSE 'Offen' END AS TicketStatus
      FROM Ticketsystem.tTicket t
      WHERE t.kKunde = @kKunde AND t.nIstInPapierkorb = 0
      ORDER BY t.dAenderung DESC`,
      { kKunde: { type: sql.Int, value: kKunde } },
    );
    return result.recordset;
  }

  // ==================== TOOL 8: get_customer_full_context ====================

  async getCustomerFullContext(email: string): Promise<any | null> {
    const result = await this.db.queryWithParams(
      `SELECT TOP 1
        k.kKunde, k.cKundenNr,
        a.cVorname, a.cName, a.cFirma, a.cMail, a.cTel, a.cMobil,
        a.cStrasse, a.cPLZ, a.cOrt,
        k.cSperre, k.dErstellt AS KundeSeit,
        (SELECT COUNT(*) FROM Verkauf.tAuftrag o WHERE o.kKunde = k.kKunde) AS AnzahlAuftraege,
        (SELECT MAX(o.dErstellt) FROM Verkauf.tAuftrag o WHERE o.kKunde = k.kKunde) AS LetzterAuftrag,
        (SELECT SUM(ek2.fWertBrutto) FROM Verkauf.tAuftrag o2 JOIN Verkauf.tAuftragEckdaten ek2 ON ek2.kAuftrag = o2.kAuftrag WHERE o2.kKunde = k.kKunde) AS GesamtUmsatz,
        (SELECT COUNT(*) FROM Ticketsystem.tTicket t WHERE t.kKunde = k.kKunde AND t.dLoesung IS NULL AND t.nIstInPapierkorb = 0) AS OffeneTickets
      FROM dbo.tkunde k
      JOIN dbo.tAdresse a ON a.kKunde = k.kKunde AND a.nStandard = 1
      WHERE a.cMail = @email`,
      { email: { type: sql.NVarChar(200), value: email } },
    );
    return result.recordset[0] || null;
  }

  // ==================== TOOL 9: search_product ====================

  async searchProduct(search: string): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT TOP 20
        ar.kArtikel, ar.cArtNr, ar.cBarcode, ar.cHAN,
        ab.cName,
        ab.cKurzBeschreibung,
        ar.fVKNetto,
        ar.fUVP,
        ar.nLagerbestand,
        ar.cAktiv,
        wg.cName AS Warengruppe,
        ar.nIstVater,
        ar.kVaterArtikel
      FROM dbo.tArtikel ar
      LEFT JOIN dbo.tArtikelBeschreibung ab ON ab.kArtikel = ar.kArtikel AND ab.kSprache = 1 AND ab.kPlattform = 1
      LEFT JOIN dbo.tWarengruppe wg ON wg.kWarengruppe = ar.kWarengruppe
      WHERE ar.nDelete = 0
        AND (
          ar.cArtNr LIKE '%' + @search + '%'
          OR ar.cBarcode LIKE '%' + @search + '%'
          OR ar.cHAN LIKE '%' + @search + '%'
          OR ab.cName LIKE '%' + @search + '%'
          OR ar.cSuchbegriffe LIKE '%' + @search + '%'
        )
      ORDER BY ar.cAktiv DESC, ab.cName`,
      { search: { type: sql.NVarChar(200), value: search } },
    );
    return result.recordset;
  }

  // ==================== TOOL 10: get_product_details ====================

  async getProductDetails(artNrOrId: string): Promise<any | null> {
    const result = await this.db.queryWithParams(
      `SELECT TOP 1
        ar.kArtikel, ar.cArtNr, ar.cBarcode, ar.cHAN,
        ab.cName,
        ab.cKurzBeschreibung,
        ar.fVKNetto,
        ar.fUVP,
        ar.fEKNetto,
        ar.fGewicht,
        ar.fArtGewicht,
        ar.cAktiv,
        ar.nLagerbestand,
        ar.nMidestbestand AS nMindestbestand,
        ar.cLagerArtikel,
        ar.nIstVater,
        ar.kVaterArtikel,
        wg.cName AS Warengruppe,
        lb.fLagerbestand AS LagerbestandDetail,
        lb.fVerfuegbar,
        lb.fZulauf,
        lb.fInAuftraegen,
        lb.fAuslieferungGesperrt
      FROM dbo.tArtikel ar
      LEFT JOIN dbo.tArtikelBeschreibung ab ON ab.kArtikel = ar.kArtikel AND ab.kSprache = 1 AND ab.kPlattform = 1
      LEFT JOIN dbo.tWarengruppe wg ON wg.kWarengruppe = ar.kWarengruppe
      LEFT JOIN dbo.tlagerbestand lb ON lb.kArtikel = ar.kArtikel
      WHERE ar.nDelete = 0
        AND (ar.cArtNr = @search OR CAST(ar.kArtikel AS NVARCHAR(20)) = @search)`,
      { search: { type: sql.NVarChar(200), value: artNrOrId } },
    );
    return result.recordset[0] || null;
  }

  // ==================== TOOL 11: get_product_stock ====================

  async getProductStock(artNrOrId: string): Promise<any | null> {
    const result = await this.db.queryWithParams(
      `SELECT
        ar.kArtikel, ar.cArtNr,
        ab.cName,
        ar.cAktiv,
        ar.nLagerbestand,
        lb.fLagerbestand,
        lb.fVerfuegbar,
        lb.fZulauf,
        lb.fInAuftraegen,
        lb.fAuslieferungGesperrt,
        CASE
          WHEN lb.fVerfuegbar > 0 THEN 'Auf Lager'
          WHEN lb.fZulauf > 0 THEN 'Zulauf erwartet'
          ELSE 'Nicht verfügbar'
        END AS VerfuegbarkeitsStatus
      FROM dbo.tArtikel ar
      LEFT JOIN dbo.tArtikelBeschreibung ab ON ab.kArtikel = ar.kArtikel AND ab.kSprache = 1 AND ab.kPlattform = 1
      LEFT JOIN dbo.tlagerbestand lb ON lb.kArtikel = ar.kArtikel
      WHERE ar.nDelete = 0
        AND (ar.cArtNr = @search OR CAST(ar.kArtikel AS NVARCHAR(20)) = @search)`,
      { search: { type: sql.NVarChar(200), value: artNrOrId } },
    );
    return result.recordset[0] || null;
  }

  // ==================== TOOL 12: get_customer_bought_products ====================

  async getCustomerBoughtProducts(kKunde: number, limit = 20): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT TOP (@limit)
        p.cArtNr,
        p.cName AS BestellterName,
        p.fAnzahl,
        p.fVkNetto,
        a.cAuftragsNr,
        a.dErstellt AS BestellDatum
      FROM Verkauf.tAuftragPosition p
      JOIN Verkauf.tAuftrag a ON a.kAuftrag = p.kAuftrag
      WHERE a.kKunde = @kKunde
        AND p.nType = 0
      ORDER BY a.dErstellt DESC`,
      {
        kKunde: { type: sql.Int, value: kKunde },
        limit: { type: sql.Int, value: Math.min(limit, 100) },
      },
    );
    return result.recordset;
  }

  // ==================== TOOL 13: get_customer_notes ====================

  async getCustomerNotes(kKunde: number): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        n.kNotiz,
        n.cNotiz,
        n.nTyp,
        n.dErstellt,
        n.kAuftrag,
        CASE n.nTyp
          WHEN 0 THEN 'Allgemein'
          WHEN 1 THEN 'Intern'
          WHEN 2 THEN 'Mahnung'
          ELSE CAST(n.nTyp AS NVARCHAR(10))
        END AS NotizTyp
      FROM Kunde.tNotiz n
      WHERE n.kKunde = @kKunde
      ORDER BY n.dErstellt DESC`,
      { kKunde: { type: sql.Int, value: kKunde } },
    );
    return result.recordset;
  }

  // ==================== TOOL 14: get_product_variants ====================

  async getProductVariants(kArtikel: number): Promise<any> {
    // Prüfe ob es ein Vaterartikel ist, sonst den Vater holen
    const artikelResult = await this.db.queryWithParams(
      `SELECT kArtikel, kVaterArtikel, nIstVater FROM dbo.tArtikel WHERE kArtikel = @kArtikel`,
      { kArtikel: { type: sql.Int, value: kArtikel } },
    );
    const artikel = artikelResult.recordset[0];
    if (!artikel) return null;

    const vaterId = artikel.nIstVater === 1 ? artikel.kArtikel : artikel.kVaterArtikel;
    if (!vaterId || vaterId === 0) {
      return { message: 'Artikel hat keine Varianten', kArtikel };
    }

    // Eigenschaften (z.B. "Farbe", "Größe")
    const eigenschaftenResult = await this.db.queryWithParams(
      `SELECT
        e.kEigenschaft,
        es.cName AS EigenschaftName,
        e.cTyp
      FROM dbo.teigenschaft e
      LEFT JOIN dbo.tEigenschaftSprache es ON es.kEigenschaft = e.kEigenschaft AND es.kSprache = 1
      WHERE e.kArtikel = @vaterId AND e.cAktiv = 'Y'
      ORDER BY e.nSort`,
      { vaterId: { type: sql.Int, value: vaterId } },
    );

    // Eigenschaftswerte (z.B. "Rot", "Blau", "XL")
    const werteResult = await this.db.queryWithParams(
      `SELECT
        ew.kEigenschaftWert,
        ew.kEigenschaft,
        ews.cName AS WertName,
        ew.fAufpreis,
        ew.fLagerbestand,
        ew.cArtNr,
        ew.cBarcode,
        ew.cAktiv
      FROM dbo.teigenschaftwert ew
      LEFT JOIN dbo.tEigenschaftWertSprache ews ON ews.kEigenschaftWert = ew.kEigenschaftWert AND ews.kSprache = 1
      JOIN dbo.teigenschaft e ON e.kEigenschaft = ew.kEigenschaft
      WHERE e.kArtikel = @vaterId AND ew.cAktiv = 'Y'
      ORDER BY e.nSort, ew.nSort`,
      { vaterId: { type: sql.Int, value: vaterId } },
    );

    // Kindartikel (die eigentlichen Varianten-Kombinationen)
    const kinderResult = await this.db.queryWithParams(
      `SELECT
        ar.kArtikel, ar.cArtNr, ar.cBarcode,
        ab.cName,
        ar.fVKNetto,
        ar.nLagerbestand,
        ar.cAktiv,
        lb.fVerfuegbar
      FROM dbo.tArtikel ar
      LEFT JOIN dbo.tArtikelBeschreibung ab ON ab.kArtikel = ar.kArtikel AND ab.kSprache = 1 AND ab.kPlattform = 1
      LEFT JOIN dbo.tlagerbestand lb ON lb.kArtikel = ar.kArtikel
      WHERE ar.kVaterArtikel = @vaterId AND ar.nDelete = 0
      ORDER BY ar.cArtNr`,
      { vaterId: { type: sql.Int, value: vaterId } },
    );

    return {
      vaterArtikel: vaterId,
      eigenschaften: eigenschaftenResult.recordset,
      werte: werteResult.recordset,
      varianten: kinderResult.recordset,
    };
  }

  // ==================== TOOL 15: get_customer_returns ====================

  async getCustomerReturns(kKunde: number): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        r.kRMRetoure,
        r.cRetoureNr,
        r.dErstellt,
        r.cKommentarExtern,
        r.cKommentarIntern,
        r.fKorrekturBetrag,
        r.cKorrekturBetragKommentar,
        r.nVersandkostenErstatten,
        -- Gutschrift-Info
        g.cGutschriftNr,
        g.fPreis AS GutschriftBetrag,
        g.cWaehrung AS GutschriftWaehrung,
        g.cStatus AS GutschriftStatus,
        -- Positionen als Subquery
        (SELECT COUNT(*) FROM dbo.tRMRetourePos rp WHERE rp.kRMRetoure = r.kRMRetoure) AS AnzahlPositionen
      FROM dbo.tRMRetoure r
      LEFT JOIN dbo.tgutschrift g ON g.kGutschrift = r.kGutschrift
      WHERE r.kKunde = @kKunde
      ORDER BY r.dErstellt DESC`,
      { kKunde: { type: sql.Int, value: kKunde } },
    );
    return result.recordset;
  }

  // ==================== TOOL 16: get_order_payments ====================

  async getOrderPayments(auftragsNr: string): Promise<any[]> {
    const result = await this.db.queryWithParams(
      `SELECT
        z.kZahlung,
        z.cName AS Zahlungsart,
        z.fBetrag,
        z.dDatum,
        z.cHinweis,
        z.nAnzahlung,
        z.cExternalTransactionId,
        CASE z.nZahlungstyp
          WHEN 0 THEN 'Normal'
          WHEN 1 THEN 'Anzahlung'
          WHEN 2 THEN 'Restzahlung'
          ELSE CAST(z.nZahlungstyp AS NVARCHAR(10))
        END AS Zahlungstyp,
        -- Auftragsdaten
        a.cAuftragsNr,
        ek.fWertBrutto,
        ek.fOffenerWert
      FROM dbo.tZahlung z
      JOIN Verkauf.tAuftrag a ON a.kAuftrag = z.kBestellung
      LEFT JOIN Verkauf.tAuftragEckdaten ek ON ek.kAuftrag = a.kAuftrag
      WHERE a.cAuftragsNr = @auftragsNr
      ORDER BY z.dDatum DESC`,
      { auftragsNr: { type: sql.NVarChar(50), value: auftragsNr } },
    );
    return result.recordset;
  }
}
