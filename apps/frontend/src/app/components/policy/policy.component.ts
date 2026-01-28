import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PageTitleComponent } from "../../shared/page-title/page-title.component";
import { ConfigService } from '../../services/config.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

interface MyDataResponse {
  sessionId: string;
  recordCount: number;
  data: Array<{
    type: string;
    page: string;
    timestamp: Date;
    screenSize: string;
    userAgent: string;
  }>;
  info: string;
  error?: string;
}

interface DeleteResponse {
  sessionId: string;
  deleted: number;
  message: string;
  error?: string;
}

@Component({
  selector: 'app-policy',
  standalone: true,
  imports: [PageTitleComponent, CommonModule],
  templateUrl: './policy.component.html',
  styleUrl: './policy.component.scss'
})
export class PolicyComponent {
  currentYear = new Date().getFullYear();

  // DSGVO Data Management
  myData: MyDataResponse | null = null;
  dataLoading = false;
  dataError: string | null = null;
  deleteSuccess: string | null = null;
  showDataSection = false;

  private isBrowser: boolean;
  private get API_URL(): string {
    return `${this.configService.apiUrl}/analytics`;
  }

  constructor(
    private http: HttpClient,
    private confirmationService: ConfirmationService,
    private configService: ConfigService,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }


  getSessionId(): string | null {
    if (!this.isBrowser) return null;
    return sessionStorage.getItem('lub_session');
  }


  toggleDataSection(): void {
    this.showDataSection = !this.showDataSection;
    if (this.showDataSection && !this.myData) {
      this.loadMyData();
    }
  }


  loadMyData(): void {
    const sessionId = this.getSessionId();
    if (!sessionId) {
      this.dataError = 'Keine Session-ID gefunden. Analytics wurden möglicherweise nicht aktiviert.';
      return;
    }

    this.dataLoading = true;
    this.dataError = null;
    this.deleteSuccess = null;

    this.http.get<MyDataResponse>(`${this.API_URL}/my-data?sessionId=${sessionId}`)
      .subscribe({
        next: (response) => {
          this.myData = response;
          this.dataLoading = false;
        },
        error: () => {
          this.dataError = 'Fehler beim Laden der Daten.';
          this.dataLoading = false;
        }
      });
  }


  async deleteMyData(): Promise<void> {
    const sessionId = this.getSessionId();
    if (!sessionId) {
      this.dataError = 'Keine Session-ID gefunden.';
      return;
    }

    const confirmed = await this.confirmationService.confirm({
      title: 'Daten löschen',
      message: 'Möchten Sie wirklich alle Ihre Analytics-Daten löschen? Dies kann nicht rückgängig gemacht werden.',
      confirmText: 'Ja, löschen',
      cancelText: 'Abbrechen',
      type: 'danger',
      icon: 'delete_forever'
    });

    if (!confirmed) {
      return;
    }

    this.dataLoading = true;
    this.dataError = null;

    this.http.delete<DeleteResponse>(`${this.API_URL}/my-data?sessionId=${sessionId}`)
      .subscribe({
        next: (response) => {
          this.deleteSuccess = response.message;
          this.myData = null;
          this.dataLoading = false;
          // Session-ID aus Storage entfernen
          if (this.isBrowser) {
            sessionStorage.removeItem('lub_session');
          }
        },
        error: () => {
          this.dataError = 'Fehler beim Löschen der Daten.';
          this.dataLoading = false;
        }
      });
  }
}
