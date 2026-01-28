import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AppConfig {
  apiUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private config: AppConfig | null = null;

  constructor(private http: HttpClient) {}

  async loadConfig(): Promise<void> {
    try {
      this.config = await firstValueFrom(
        this.http.get<AppConfig>('/config.json')
      );
      console.log('Config loaded:', this.config);
    } catch (error) {
      console.error('Failed to load config, using fallback:', error);
      // Fallback-Werte falls config.json nicht geladen werden kann
      this.config = {
        apiUrl: 'http://localhost:3000'
      };
    }
  }

  get apiUrl(): string {
    return this.config?.apiUrl ?? 'http://localhost:3000';
  }

  getConfig(): AppConfig | null {
    return this.config;
  }
}
