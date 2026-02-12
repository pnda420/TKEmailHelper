import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, map, Observable, of, tap } from 'rxjs';
import { Router } from '@angular/router';
import { ConfigService } from './config.service';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isVerified?: boolean;
  isProfileComplete?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  // AI context fields (for GPT to know who you are)
  signatureName?: string | null;
  signaturePosition?: string | null;
  signatureCompany?: string | null;
  signaturePhone?: string | null;
  signatureWebsite?: string | null;
  // Real email signature (HTML, like Outlook)
  emailSignature?: string | null;
}

export interface UserSignature {
  name?: string;
  position?: string;
  company?: string;
  phone?: string;
  website?: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private get API_URL(): string {
    return this.configService.apiUrl;
  }

  constructor(
    private http: HttpClient,
    private router: Router,
    private configService: ConfigService
  ) {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    const token = localStorage.getItem('access_token');
    const userJson = localStorage.getItem('current_user');

    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        this.currentUserSubject.next(user);
      } catch (e) {
        this.logout();
      }
    }
  }

  verifyAdminStatus(): Observable<boolean> {
    if (!this.getToken()) {
      return of(false);
    }

    // Prüfe ob wir gecachte User-Daten haben
    const cachedUser = this.currentUserSubject.getValue();

    return this.http.get<User>(`${this.API_URL}/auth/me`).pipe(
      map(user => {
        localStorage.setItem('current_user', JSON.stringify(user));
        this.currentUserSubject.next(user);
        return user.role === UserRole.ADMIN;
      }),
      catchError((error) => {
        console.error('Admin-Validierung fehlgeschlagen:', error);
        
        // Bei 401: Token ungültig → ausloggen
        if (error.status === 401) {
          this.logout();
          return of(false);
        }
        
        // Bei 429 (Rate Limit): Verwende gecachte User-Daten falls vorhanden
        if (error.status === 429 && cachedUser) {
          return of(cachedUser.role === UserRole.ADMIN);
        }
        
        return of(false);
      })
    );
  }

  register(email: string, name: string, password: string, masterPassword: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/register`, {
      email,
      name,
      password,
      masterPassword
    }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/login`, {
      email,
      password
    }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !!this.getCurrentUser();
  }

  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === UserRole.ADMIN;
  }

  private handleAuthResponse(response: LoginResponse) {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('current_user', JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  updateCurrentUser(user: User) {
    localStorage.setItem('current_user', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }

  verifyMasterPassword(masterPassword: string): Observable<{ valid: boolean; message?: string }> {
    return this.http.post<{ valid: boolean; message?: string }>(`${this.API_URL}/auth/verify-master-password`, {
      masterPassword
    });
  }

  needsSetup(): boolean {
    const user = this.getCurrentUser();
    return !!user && !user.isProfileComplete;
  }
}