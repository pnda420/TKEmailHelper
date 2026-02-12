import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from '../services/config.service';
import { User, UserRole } from '../services/auth.service';


// ==================== INTERFACES ====================

export interface AiConfigEntry {
  id: string;
  key: string;
  label: string;
  description: string;
  value: string;
  type: 'rules' | 'prompt';
  updatedAt: string;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  user: User;
  token?: string; // Später wenn JWT implementiert ist
}


export interface UpdateUserDto {
  name?: string;
  email?: string;
  password?: string;
  isVerified?: boolean;
  role?: UserRole;
  // AI Context Signature fields (for AI to know who the user is)
  signatureName?: string | null;
  signaturePosition?: string | null;
  signatureCompany?: string | null;
  signaturePhone?: string | null;
  signatureWebsite?: string | null;
  // Real HTML Email Signature (like Outlook)
  emailSignature?: string | null;
  // Profile setup completion flag
  isProfileComplete?: boolean;
}

export interface UserStats {
  totalUsers: number;
}

// Contact Requests
export interface ContactRequest {
  id: string;
  name: string;
  email: string;
  serviceType: string; // Slug aus dem Services-Katalog
  message: string;
  prefersCallback: boolean;
  phoneNumber?: string;
  isProcessed: boolean;
  notes?: string;
  userId?: string;
  createdAt: Date;
}

export interface CreateContactRequestDto {
  name: string;
  email: string;
  serviceType: string; // Slug aus dem Services-Katalog
  message: string;
  prefersCallback?: boolean;
  phoneNumber?: string;
  userId?: string;
}

export interface UpdateContactRequestDto {
  isProcessed?: boolean;
  notes?: string;
}

export interface BookingSlot {
  id: string;
  date: string; // YYYY-MM-DD
  timeFrom: string; // HH:MM
  timeTo: string; // HH:MM
  isAvailable: boolean;
  maxBookings: number;
  currentBookings: number;
  createdAt: Date;
  updatedAt: Date;
  googleEventId?: string;
  meetLink?: string;
}

export interface CreateBookingSlotDto {
  date: string;
  timeFrom: string;
  timeTo: string;
  maxBookings?: number;
  isAvailable?: boolean;
}

export interface UpdateBookingSlotDto {
  date?: string;
  timeFrom?: string;
  timeTo?: string;
  isAvailable?: boolean;
  maxBookings?: number;
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export interface Booking {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  slotId: string;
  slot?: BookingSlot;
  status: BookingStatus;
  adminNotes: string | null;
  createdAt: Date;
}

export interface CreateBookingDto {
  name: string;
  email: string;
  phone?: string;
  message?: string;
  slotId: string;
}

export interface UpdateBookingDto {
  status?: BookingStatus;
  adminNotes?: string;
}

// Hilfs-Interface für das Frontend
export interface DayWithSlots {
  date: string;
  dayName: string;
  dayNumber: number;
  available: boolean;
  slots: BookingSlot[];
  isPast: boolean;
}


// ==================== FAQ INTERFACES ====================

export interface Faq {
  id: string;
  slug: string;
  question: string;
  answers: string[];
  listItems: string[] | null;
  sortOrder: number;
  isPublished: boolean;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFaqDto {
  slug: string;
  question: string;
  answers: string[];
  listItems?: string[];
  sortOrder?: number;
  isPublished?: boolean;
  category?: string;
}

export interface UpdateFaqDto {
  slug?: string;
  question?: string;
  answers?: string[];
  listItems?: string[];
  sortOrder?: number;
  isPublished?: boolean;
  category?: string;
}

export interface BulkImportFaqDto {
  faqs: CreateFaqDto[];
  overwriteExisting?: boolean;
}

export interface ImportFaqResultDto {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ==================== SETTINGS INTERFACES ====================

export interface Settings {
  id: string;
  isUnderConstruction: boolean;
  maintenanceMessage?: string;
  maintenancePassword?: string;
  allowRegistration: boolean;
  siteTitle?: string;
  siteDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSettingsDto {
  isUnderConstruction?: boolean;
  maintenanceMessage?: string;
  maintenancePassword?: string;
  allowRegistration?: boolean;
  siteTitle?: string;
  siteDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface PublicSettings {
  isUnderConstruction: boolean;
  maintenanceMessage?: string;
  siteTitle?: string;
  siteDescription?: string;
  allowRegistration?: boolean;
}

// ==================== SERVICES CATALOG INTERFACES ====================

export interface ServiceItem {
  id: string;
  slug: string;
  icon: string;
  title: string;
  description: string;
  longDescription: string;
  tags: string[];
  keywords: string;
  sortOrder: number;
  isPublished: boolean;
  categoryId: string;
  category?: ServiceCategory;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  materialIcon: string;
  sortOrder: number;
  isPublished: boolean;
  services: ServiceItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceCategoryDto {
  slug: string;
  name: string;
  subtitle: string;
  materialIcon: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface UpdateServiceCategoryDto {
  slug?: string;
  name?: string;
  subtitle?: string;
  materialIcon?: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface CreateServiceDto {
  slug: string;
  icon: string;
  title: string;
  description: string;
  longDescription: string;
  tags: string[];
  keywords: string;
  categoryId: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface UpdateServiceDto {
  slug?: string;
  icon?: string;
  title?: string;
  description?: string;
  longDescription?: string;
  tags?: string[];
  keywords?: string;
  categoryId?: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export interface ImportServiceItemDto {
  slug: string;
  icon: string;
  title: string;
  description: string;
  longDescription: string;
  tags: string[];
  keywords: string;
  sortOrder?: number;
}

export interface ImportCategoryDto {
  slug: string;
  name: string;
  subtitle: string;
  materialIcon: string;
  sortOrder?: number;
  services: ImportServiceItemDto[];
}

export interface BulkImportServicesCatalogDto {
  categories: ImportCategoryDto[];
  overwriteExisting?: boolean;
}

export interface ImportServicesCatalogResultDto {
  success: boolean;
  categoriesCreated: number;
  categoriesUpdated: number;
  servicesCreated: number;
  servicesUpdated: number;
  errors: string[];
}

// ==================== EMAIL INTERFACES ====================

export type EmailStatus = 'inbox' | 'sent' | 'trash';

export interface Email {
  id: string;
  messageId: string;
  inReplyTo: string | null;
  references: string | null;
  threadId: string | null;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  textBody: string | null;
  htmlBody: string | null;
  preview: string | null;
  receivedAt: Date;
  isRead: boolean;
  hasAttachments: boolean;
  attachments: { filename: string; contentType: string; size: number }[] | null;
  status: EmailStatus;
  repliedAt: Date | null;
  replySentSubject: string | null;
  replySentBody: string | null;
  // AI Analysis fields
  aiSummary: string | null;
  aiTags: string[] | null;
  recommendedTemplateId: string | null;
  recommendedTemplateReason: string | null;
  aiProcessedAt: Date | null;
  aiProcessing: boolean;
  cleanedBody: string | null;
  // Pre-computed Agent Analysis
  agentAnalysis: string | null;
  agentKeyFacts: { icon: string; label: string; value: string }[] | null;
  suggestedReply: string | null;
  suggestedReplySubject: string | null;
  customerPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailListResponse {
  emails: Email[];
  total: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface RefreshEmailsResponse {
  message: string;
  fetched: number;
  stored: number;
}

export interface EmailStats {
  inbox: number;
  sent: number;
  trash: number;
  unread: number;
}

// ==================== EMAIL TEMPLATE INTERFACES ====================

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
  usageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateDto {
  name: string;
  subject?: string;
  body: string;
  category?: string;
}

export interface UpdateTemplateDto {
  name?: string;
  subject?: string;
  body?: string;
  category?: string;
  isActive?: boolean;
}

export interface GenerateEmailDto {
  originalEmail: {
    subject: string;
    from: string;
    body: string;
  };
  instructions?: string;
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  templateId?: string;
}

export interface ReviseEmailDto {
  originalEmail: {
    subject: string;
    from: string;
    body: string;
  };
  originalReply: string;
  editedReply: string;
  revisionInstructions: string;
  tone?: 'professional' | 'friendly' | 'formal' | 'casual';
  currentSubject?: string;
}

export interface GeneratedEmailResponse {
  subject: string;
  body: string;
}

export interface SendReplyDto {
  to: string;
  subject: string;
  body: string;
  emailId?: string;
  inReplyTo?: string;
  references?: string;
  originalFrom?: string;
  originalDate?: string;
  originalHtmlBody?: string;
  originalTextBody?: string;
}

export interface SendReplyResponse {
  success: boolean;
  messageId?: string;
}

// ==================== LOG INTERFACES ====================

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface AppLog {
  id: number;
  level: LogLevel;
  message: string;
  stack: string | null;
  method: string | null;
  url: string | null;
  statusCode: number | null;
  userId: string | null;
  userEmail: string | null;
  requestBody: string | null;
  ip: string | null;
  userAgent: string | null;
  source: string | null;
  duration: number | null;
  extra: string | null;
  createdAt: string;
}

export interface LogQueryParams {
  page?: number;
  limit?: number;
  level?: string;
  search?: string;
  userId?: string;
  from?: string;
  to?: string;
  source?: string;
}

export interface LogsResponse {
  data: AppLog[];
  total: number;
  page: number;
  limit: number;
}

export interface LogStats {
  totalErrors: number;
  totalWarnings: number;
  totalInfo: number;
  recentErrorRate: number;
  topSources: { source: string; count: number }[];
  topUsers: { userId: string; userEmail: string; count: number }[];
}

export interface PurgeResponse {
  deleted: number;
  message: string;
}

// ==================== AI USAGE INTERFACES ====================

export interface AiUsageEntry {
  id: number;
  feature: string;
  model: string;
  userId: string | null;
  userEmail: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  context: string | null;
  createdAt: string;
}

export interface AiUsageQueryParams {
  page?: number;
  limit?: number;
  feature?: string;
  userId?: string;
  model?: string;
  from?: string;
  to?: string;
}

export interface AiUsageResponse {
  data: AiUsageEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface AiUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  totalErrors: number;
  costByModel: { model: string; cost: number; requests: number; tokens: number }[];
  costByFeature: { feature: string; cost: number; requests: number; tokens: number }[];
  costByUser: { userId: string; userEmail: string; cost: number; requests: number }[];
  dailyCost: { date: string; cost: number; requests: number }[];
}

export interface AiBalance {
  available: number | null;
  used: number | null;
  error?: string;
}

export interface SystemHealthService {
  connected: boolean;
  latency?: number;
  host?: string;
  port?: number;
  database?: string;
  error?: string;
  account?: string;
  imapHost?: string;
  smtpHost?: string;
  reconnectAttempts?: number;
  poolSize?: number;
  lastHealthPing?: string | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  totalLatency: number;
  services: {
    vpn: SystemHealthService;
    postgres: SystemHealthService;
    mssql: SystemHealthService;
    mail: { account: string; imapHost: string; smtpHost: string };
    imapIdle: { connected: boolean; folder: string; reconnectAttempts: number };
  };
  system: {
    uptime: number;
    uptimeFormatted: string;
    nodeVersion: string;
    env: string;
    platform: string;
    arch: string;
    cpuPercent: number;
    cpuCores: number;
    cpuModel: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number; external: number };
    os: {
      totalMemMb: number;
      freeMemMb: number;
      usedMemMb: number;
      uptime: number;
      uptimeFormatted: string;
      hostname: string;
    };
  };
  history: HealthHistoryEntry[];
}

export interface HealthHistoryEntry {
  timestamp: string;
  vpnLatency: number;
  pgLatency: number;
  mssqlLatency: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  cpuPercent: number;
  totalLatency: number;
  vpnOk: boolean;
  pgOk: boolean;
  mssqlOk: boolean;
  imapOk: boolean;
}

export interface SystemStatus {
  vpn: boolean;
  vpnLatency: number;
  postgres: boolean;
  mssql: boolean;
  imap: boolean;
  timestamp: string;
}


// ==================== SERVICE ====================

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private get apiUrl(): string {
    return this.configService.apiUrl;
  }

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) { }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    // Später: JWT Token aus LocalStorage holen und hinzufügen
    // const token = localStorage.getItem('auth_token');
    // if (token) {
    //   headers = headers.set('Authorization', `Bearer ${token}`);
    // }

    return headers;
  }

  // ==================== USER ENDPOINTS ====================

  /**
   * User registrieren
   */
  register(dto: CreateUserDto): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/register`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * User login
   */
  login(dto: LoginDto): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/users/login`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Alle User abrufen (Admin)
   */
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Einzelnen User abrufen
   */
  getUser(id: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${id}`, {
      headers: this.getHeaders()
    });
  }

  /**
   * User aktualisieren (Admin only)
   */
  updateUser(id: string, dto: UpdateUserDto): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/${id}`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Eigenes Profil aktualisieren (kein Admin erforderlich)
   */
  updateMe(dto: UpdateUserDto): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/users/me`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * User löschen
   */
  deleteUser(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${id}`, {
      headers: this.getHeaders()
    });
  }

  adminResetPassword(id: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/users/${id}/reset-password`, { newPassword }, {
      headers: this.getHeaders()
    });
  }

  adminCreateUser(dto: CreateUserDto): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/admin/create`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * User-Statistiken abrufen
   */
  getUserStats(): Observable<UserStats> {
    return this.http.get<UserStats>(`${this.apiUrl}/users/stats`, {
      headers: this.getHeaders()
    });
  }

/**
 * Alle Settings abrufen (Admin)
 */
getSettings(): Observable<Settings> {
  return this.http.get<Settings>(`${this.apiUrl}/settings`, {
    headers: this.getHeaders()
  });
}

/**
 * Settings aktualisieren (Admin)
 */
updateSettings(dto: UpdateSettingsDto): Observable<Settings> {
  return this.http.patch<Settings>(`${this.apiUrl}/settings`, dto, {
    headers: this.getHeaders()
  });
}

// ==================== AI CONFIG ENDPOINTS ====================

getAiConfigs(): Observable<AiConfigEntry[]> {
  return this.http.get<AiConfigEntry[]>(`${this.apiUrl}/ai-config`, {
    headers: this.getHeaders()
  });
}

getAiConfig(key: string): Observable<AiConfigEntry> {
  return this.http.get<AiConfigEntry>(`${this.apiUrl}/ai-config/${key}`, {
    headers: this.getHeaders()
  });
}

updateAiConfig(key: string, value: string): Observable<AiConfigEntry> {
  return this.http.patch<AiConfigEntry>(`${this.apiUrl}/ai-config/${key}`, { value }, {
    headers: this.getHeaders()
  });
}

// ==================== FAQ ENDPOINTS ====================

/**
 * Alle veröffentlichten FAQs abrufen (öffentlich)
 */
getPublishedFaqs(): Observable<Faq[]> {
  return this.http.get<Faq[]>(`${this.apiUrl}/faq`);
}

/**
 * FAQ per Slug abrufen (öffentlich)
 */
getFaqBySlug(slug: string): Observable<Faq> {
  return this.http.get<Faq>(`${this.apiUrl}/faq/slug/${slug}`);
}

/**
 * Alle FAQs abrufen inkl. unpublished (Admin)
 */
getAllFaqs(): Observable<Faq[]> {
  return this.http.get<Faq[]>(`${this.apiUrl}/faq/admin/all`, {
    headers: this.getHeaders()
  });
}

/**
 * FAQ per ID abrufen (Admin)
 */
getFaqById(id: string): Observable<Faq> {
  return this.http.get<Faq>(`${this.apiUrl}/faq/admin/${id}`, {
    headers: this.getHeaders()
  });
}

/**
 * Neues FAQ erstellen (Admin)
 */
createFaq(dto: CreateFaqDto): Observable<Faq> {
  return this.http.post<Faq>(`${this.apiUrl}/faq/admin`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * FAQ aktualisieren (Admin)
 */
updateFaq(id: string, dto: UpdateFaqDto): Observable<Faq> {
  return this.http.patch<Faq>(`${this.apiUrl}/faq/admin/${id}`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * FAQ löschen (Admin)
 */
deleteFaq(id: string): Observable<void> {
  return this.http.delete<void>(`${this.apiUrl}/faq/admin/${id}`, {
    headers: this.getHeaders()
  });
}

/**
 * FAQ publish status togglen (Admin)
 */
toggleFaqPublish(id: string): Observable<Faq> {
  return this.http.patch<Faq>(`${this.apiUrl}/faq/admin/${id}/toggle-publish`, {}, {
    headers: this.getHeaders()
  });
}

/**
 * FAQ Sortierung aktualisieren (Admin)
 */
updateFaqSortOrder(items: { id: string; sortOrder: number }[]): Observable<{ success: boolean }> {
  return this.http.patch<{ success: boolean }>(`${this.apiUrl}/faq/admin/sort-order`, items, {
    headers: this.getHeaders()
  });
}

/**
 * FAQs aus JSON importieren (Admin)
 */
importFaqs(dto: BulkImportFaqDto): Observable<ImportFaqResultDto> {
  return this.http.post<ImportFaqResultDto>(`${this.apiUrl}/faq/admin/import`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * Alle FAQs als JSON exportieren (Admin)
 */
exportFaqs(): Observable<Faq[]> {
  return this.http.get<Faq[]>(`${this.apiUrl}/faq/admin/export`, {
    headers: this.getHeaders()
  });
}

// ==================== EMAIL ENDPOINTS ====================

/**
 * Alle E-Mails abrufen (mit Pagination, Suche & Filter)
 */
getEmails(limit = 50, offset = 0, search?: string, tag?: string, read?: boolean): Observable<EmailListResponse> {
  let params = new HttpParams()
    .set('limit', limit.toString())
    .set('offset', offset.toString());
  if (search && search.trim()) params = params.set('search', search.trim());
  if (tag && tag.trim()) params = params.set('tag', tag.trim());
  if (read !== undefined) params = params.set('read', String(read));
  return this.http.get<EmailListResponse>(`${this.apiUrl}/emails`, {
    headers: this.getHeaders(),
    params
  });
}

/**
 * Einzelne E-Mail abrufen
 */
getEmailById(id: string): Observable<Email> {
  return this.http.get<Email>(`${this.apiUrl}/emails/${id}`, {
    headers: this.getHeaders()
  });
}

/**
 * Anzahl ungelesener E-Mails
 */
getUnreadEmailCount(): Observable<UnreadCountResponse> {
  return this.http.get<UnreadCountResponse>(`${this.apiUrl}/emails/unread-count`, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mails vom Server aktualisieren (IMAP fetch)
 */
refreshEmails(): Observable<RefreshEmailsResponse> {
  return this.http.post<RefreshEmailsResponse>(`${this.apiUrl}/emails/refresh`, {}, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail als gelesen markieren
 */
markEmailAsRead(id: string): Observable<Email> {
  return this.http.post<Email>(`${this.apiUrl}/emails/${id}/read`, {}, {
    headers: this.getHeaders()
  });
}

/**
 * Gesendete E-Mails abrufen
 */
getSentEmails(limit = 50, offset = 0): Observable<EmailListResponse> {
  const params = new HttpParams()
    .set('limit', limit.toString())
    .set('offset', offset.toString());
  return this.http.get<EmailListResponse>(`${this.apiUrl}/emails/sent`, {
    headers: this.getHeaders(),
    params
  });
}

/**
 * Papierkorb-E-Mails abrufen
 */
getTrashedEmails(limit = 50, offset = 0): Observable<EmailListResponse> {
  const params = new HttpParams()
    .set('limit', limit.toString())
    .set('offset', offset.toString());
  return this.http.get<EmailListResponse>(`${this.apiUrl}/emails/trash`, {
    headers: this.getHeaders(),
    params
  });
}

/**
 * E-Mail-Statistiken abrufen
 */
getEmailStats(): Observable<EmailStats> {
  return this.http.get<EmailStats>(`${this.apiUrl}/emails/stats`, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail als gesendet markieren (nach Antwort)
 */
markEmailAsSent(id: string, subject: string, body: string): Observable<Email> {
  return this.http.post<Email>(`${this.apiUrl}/emails/${id}/sent`, { subject, body }, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail in Papierkorb verschieben
 */
moveEmailToTrash(id: string): Observable<Email> {
  return this.http.post<Email>(`${this.apiUrl}/emails/${id}/trash`, {}, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail aus Papierkorb wiederherstellen
 */
restoreEmailFromTrash(id: string): Observable<Email> {
  return this.http.post<Email>(`${this.apiUrl}/emails/${id}/restore`, {}, {
    headers: this.getHeaders()
  });
}

// ==================== AI PROCESSING ENDPOINTS ====================

/**
 * AI Status - Get processing progress
 */
getAiStatus(): Observable<{ total: number; processed: number; processing: number; pending: number; isProcessing: boolean; bgTotal: number; bgProcessed: number; bgFailed: number; bgMode: string | null }> {
  return this.http.get<any>(
    `${this.apiUrl}/emails/ai/status`,
    { headers: this.getHeaders() }
  );
}

/**
 * Lightweight polling endpoint for background processing status
 */
getProcessingStatus(): Observable<{ isProcessing: boolean; total: number; processed: number; failed: number; mode: string | null; startedAt: string | null }> {
  return this.http.get<any>(
    `${this.apiUrl}/emails/ai/processing-status`,
    { headers: this.getHeaders() }
  );
}

/**
 * Start background processing for unprocessed emails
 */
processAllEmailsWithAi(): Observable<any> {
  return this.http.post<any>(
    `${this.apiUrl}/emails/ai/process`,
    {},
    { headers: this.getHeaders() }
  );
}

/**
 * Force recalculate AI for ALL inbox emails (resets and reprocesses in background)
 */
recalculateAllEmailsWithAi(): Observable<any> {
  return this.http.post<{ started: boolean; total: number }>(
    `${this.apiUrl}/emails/ai/recalculate`,
    {},
    { headers: this.getHeaders() }
  );
}

/**
 * Process a single email with AI
 */
processEmailWithAi(id: string): Observable<Email> {
  return this.http.post<Email>(
    `${this.apiUrl}/emails/${id}/ai/process`,
    {},
    { headers: this.getHeaders() }
  );
}

/**
 * Reprocess a single email with AI (background, returns immediately — use SSE for progress)
 */
reprocessEmailWithAi(id: string): Observable<any> {
  return this.http.post<any>(
    `${this.apiUrl}/emails/${id}/ai/reprocess`,
    {},
    { headers: this.getHeaders() }
  );
}

// ==================== THREADING & REAL-TIME ENDPOINTS ====================

/**
 * Get all emails in the same thread (conversation view)
 */
getEmailThread(emailId: string): Observable<{ thread: Email[] }> {
  return this.http.get<{ thread: Email[] }>(
    `${this.apiUrl}/emails/thread/${emailId}`,
    { headers: this.getHeaders() }
  );
}

/**
 * Get email history for a specific sender (customer history)
 */
getCustomerHistory(fromAddress: string, limit = 20): Observable<{ history: Email[] }> {
  const params = new HttpParams().set('limit', limit.toString());
  return this.http.get<{ history: Email[] }>(
    `${this.apiUrl}/emails/customer-history/${encodeURIComponent(fromAddress)}`,
    { headers: this.getHeaders(), params }
  );
}

/**
 * Get all unique AI tags used across inbox emails
 */
getAvailableTags(): Observable<{ tags: string[] }> {
  return this.http.get<{ tags: string[] }>(
    `${this.apiUrl}/emails/tags`,
    { headers: this.getHeaders() }
  );
}

/**
 * Get IMAP IDLE watcher status
 */
getIdleStatus(): Observable<{ connected: boolean; folder: string; reconnectAttempts: number }> {
  return this.http.get<{ connected: boolean; folder: string; reconnectAttempts: number }>(
    `${this.apiUrl}/emails/idle-status`,
    { headers: this.getHeaders() }
  );
}

// ==================== EMAIL TEMPLATE ENDPOINTS ====================

/**
 * Alle Templates abrufen
 */
getEmailTemplates(): Observable<EmailTemplate[]> {
  return this.http.get<EmailTemplate[]>(`${this.apiUrl}/email-templates`, {
    headers: this.getHeaders()
  });
}

/**
 * Einzelnes Template abrufen
 */
getEmailTemplateById(id: string): Observable<EmailTemplate> {
  return this.http.get<EmailTemplate>(`${this.apiUrl}/email-templates/${id}`, {
    headers: this.getHeaders()
  });
}

/**
 * Neues Template erstellen
 */
createEmailTemplate(dto: CreateTemplateDto): Observable<EmailTemplate> {
  return this.http.post<EmailTemplate>(`${this.apiUrl}/email-templates`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * Template aktualisieren
 */
updateEmailTemplate(id: string, dto: UpdateTemplateDto): Observable<EmailTemplate> {
  return this.http.put<EmailTemplate>(`${this.apiUrl}/email-templates/${id}`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * Template löschen
 */
deleteEmailTemplate(id: string): Observable<{ success: boolean }> {
  return this.http.delete<{ success: boolean }>(`${this.apiUrl}/email-templates/${id}`, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail mit GPT generieren
 */
generateEmailWithGPT(dto: GenerateEmailDto): Observable<GeneratedEmailResponse> {
  return this.http.post<GeneratedEmailResponse>(`${this.apiUrl}/email-templates/generate`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail überarbeiten mit GPT (Revision)
 */
reviseEmailWithGPT(dto: ReviseEmailDto): Observable<GeneratedEmailResponse> {
  return this.http.post<GeneratedEmailResponse>(`${this.apiUrl}/email-templates/revise`, dto, {
    headers: this.getHeaders()
  });
}

/**
 * KI-Zusammenfassung einer E-Mail mit Tags
 */
getEmailSummary(subject: string, body: string): Observable<{ summary: string; tags: string[] }> {
  return this.http.post<{ summary: string; tags: string[] }>(`${this.apiUrl}/email-templates/summarize`, { subject, body }, {
    headers: this.getHeaders()
  });
}

/**
 * KI-Template-Empfehlung für eine E-Mail
 */
getAITemplateRecommendation(subject: string, body: string): Observable<{
  templateId: string | null;
  templateName: string | null;
  reason: string;
  confidence: number;
}> {
  return this.http.post<{
    templateId: string | null;
    templateName: string | null;
    reason: string;
    confidence: number;
  }>(`${this.apiUrl}/email-templates/recommend`, { subject, body }, {
    headers: this.getHeaders()
  });
}

/**
 * E-Mail senden
 */
sendEmailReply(dto: SendReplyDto): Observable<SendReplyResponse> {
  return this.http.post<SendReplyResponse>(`${this.apiUrl}/email-templates/send`, dto, {
    headers: this.getHeaders()
  });
}

// ==================== LOG ENDPOINTS (Admin) ====================

/**
 * Alle Logs abrufen mit Filtern und Pagination
 */
getLogs(params: LogQueryParams = {}): Observable<LogsResponse> {
  let httpParams = new HttpParams();
  if (params.page) httpParams = httpParams.set('page', params.page.toString());
  if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
  if (params.level) httpParams = httpParams.set('level', params.level);
  if (params.search) httpParams = httpParams.set('search', params.search);
  if (params.userId) httpParams = httpParams.set('userId', params.userId);
  if (params.from) httpParams = httpParams.set('from', params.from);
  if (params.to) httpParams = httpParams.set('to', params.to);
  if (params.source) httpParams = httpParams.set('source', params.source);
  return this.http.get<LogsResponse>(`${this.apiUrl}/api/logs`, {
    headers: this.getHeaders(),
    params: httpParams,
  });
}

/**
 * Log-Statistiken für Dashboard
 */
getLogStats(hours = 24): Observable<LogStats> {
  return this.http.get<LogStats>(`${this.apiUrl}/api/logs/stats`, {
    headers: this.getHeaders(),
    params: new HttpParams().set('hours', hours.toString()),
  });
}

/**
 * Einzelnen Log-Eintrag abrufen
 */
getLogDetail(id: number): Observable<AppLog> {
  return this.http.get<AppLog>(`${this.apiUrl}/api/logs/${id}`, {
    headers: this.getHeaders(),
  });
}

/**
 * Alte Logs löschen
 */
purgeLogs(days = 90): Observable<PurgeResponse> {
  return this.http.delete<PurgeResponse>(`${this.apiUrl}/api/logs/purge`, {
    headers: this.getHeaders(),
    params: new HttpParams().set('days', days.toString()),
  });
}

// ==================== AI USAGE ENDPOINTS (Admin) ====================

/**
 * AI Usage Einträge abrufen mit Filtern und Pagination
 */
getAiUsage(params: AiUsageQueryParams = {}): Observable<AiUsageResponse> {
  let httpParams = new HttpParams();
  if (params.page) httpParams = httpParams.set('page', params.page.toString());
  if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
  if (params.feature) httpParams = httpParams.set('feature', params.feature);
  if (params.userId) httpParams = httpParams.set('userId', params.userId);
  if (params.model) httpParams = httpParams.set('model', params.model);
  if (params.from) httpParams = httpParams.set('from', params.from);
  if (params.to) httpParams = httpParams.set('to', params.to);
  return this.http.get<AiUsageResponse>(`${this.apiUrl}/api/ai-usage`, {
    headers: this.getHeaders(),
    params: httpParams,
  });
}

/**
 * AI Usage Statistiken
 */
getAiUsageStats(days = 30): Observable<AiUsageStats> {
  return this.http.get<AiUsageStats>(`${this.apiUrl}/api/ai-usage/stats`, {
    headers: this.getHeaders(),
    params: new HttpParams().set('days', days.toString()),
  });
}

/**
 * OpenAI Balance / Kosten
 */
getAiBalance(): Observable<AiBalance> {
  return this.http.get<AiBalance>(`${this.apiUrl}/api/ai-usage/balance`, {
    headers: this.getHeaders(),
  });
}

// ==================== SYSTEM HEALTH ====================

/**
 * System Health Status (Admin only)
 */
getSystemHealth(): Observable<SystemHealth> {
  return this.http.get<SystemHealth>(`${this.apiUrl}/api/system/health`, {
    headers: this.getHeaders(),
  });
}

/**
 * Lightweight connection status (all logged-in users)
 */
getSystemStatus(): Observable<SystemStatus> {
  return this.http.get<SystemStatus>(`${this.apiUrl}/api/system/status`, {
    headers: this.getHeaders(),
  });
}

// ==================== EMAIL DATABASE MANAGEMENT (Admin) ====================

/**
 * Alle E-Mails aus der Datenbank löschen
 */
clearAllEmails(): Observable<{ message: string; deleted: number }> {
  return this.http.delete<{ message: string; deleted: number }>(`${this.apiUrl}/emails/db/all`, {
    headers: this.getHeaders(),
  });
}

/**
 * Inbox E-Mails löschen
 */
clearInboxEmails(): Observable<{ message: string; deleted: number }> {
  return this.http.delete<{ message: string; deleted: number }>(`${this.apiUrl}/emails/db/inbox`, {
    headers: this.getHeaders(),
  });
}

/**
 * Gesendete E-Mails löschen
 */
clearSentEmails(): Observable<{ message: string; deleted: number }> {
  return this.http.delete<{ message: string; deleted: number }>(`${this.apiUrl}/emails/db/sent`, {
    headers: this.getHeaders(),
  });
}

/**
 * Papierkorb E-Mails löschen
 */
clearTrashEmails(): Observable<{ message: string; deleted: number }> {
  return this.http.delete<{ message: string; deleted: number }>(`${this.apiUrl}/emails/db/trash`, {
    headers: this.getHeaders(),
  });
}

/**
 * AI-Daten zurücksetzen (E-Mails bleiben erhalten)
 */
clearAiData(): Observable<{ message: string; updated: number }> {
  return this.http.delete<{ message: string; updated: number }>(`${this.apiUrl}/emails/db/ai-data`, {
    headers: this.getHeaders(),
  });
}
}