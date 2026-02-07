import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ConfigService } from '../../services/config.service';

interface QueryResult {
    recordset: any[];
    rowCount: number;
    duration: number;
}

interface QueryHistoryItem {
    sql: string;
    timestamp: Date;
    rowCount?: number;
    error?: string;
}

@Component({
    selector: 'app-sql-test',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './sql-test.component.html',
    styleUrl: './sql-test.component.scss',
})
export class SqlTestComponent {
    sqlInput = `SELECT TOP 5
  k.kKunde,
  k.cKundenNr,
  a.cVorname,
  a.cName,
  a.cFirma,
  a.cMail,
  a.cOrt,
  (SELECT COUNT(*) FROM Verkauf.tAuftrag o WHERE o.kKunde = k.kKunde) AS Auftraege,
  (SELECT SUM(ek.fWertBrutto) FROM Verkauf.tAuftrag o JOIN Verkauf.tAuftragEckdaten ek ON ek.kAuftrag = o.kAuftrag WHERE o.kKunde = k.kKunde) AS UmsatzBrutto
FROM dbo.tkunde k
JOIN dbo.tAdresse a ON a.kKunde = k.kKunde AND a.nStandard = 1
WHERE a.cName IS NOT NULL
ORDER BY k.dErstellt DESC;`;

    result: QueryResult | null = null;
    columns: string[] = [];
    loading = false;
    error: string | null = null;
    history: QueryHistoryItem[] = [];

    constructor(
        private http: HttpClient,
        private config: ConfigService,
    ) { }

    executeQuery(): void {
        if (!this.sqlInput.trim()) return;

        this.loading = true;
        this.error = null;
        this.result = null;
        this.columns = [];

        const apiUrl = this.config.apiUrl;

        this.http
            .post<QueryResult>(`${apiUrl}/api/sql/query`, { sql: this.sqlInput })
            .subscribe({
                next: (res) => {
                    this.result = res;
                    this.columns = res.recordset.length > 0 ? Object.keys(res.recordset[0]) : [];
                    this.loading = false;
                    this.addToHistory(this.sqlInput, res.rowCount);
                },
                error: (err) => {
                    this.error = err.error?.message || err.message || 'Unbekannter Fehler';
                    this.loading = false;
                    this.addToHistory(this.sqlInput, undefined, this.error!);
                },
            });
    }

    private addToHistory(sql: string, rowCount?: number, error?: string): void {
        this.history.unshift({ sql, timestamp: new Date(), rowCount, error });
        if (this.history.length > 10) {
            this.history.pop();
        }
    }

    loadFromHistory(item: QueryHistoryItem): void {
        this.sqlInput = item.sql;
    }

    onKeydown(event: KeyboardEvent): void {
        // Ctrl+Enter / Cmd+Enter zum Ausführen
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.executeQuery();
        }
    }

    truncate(text: string, maxLength: number = 60): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
}
