import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from '../services/config.service';
import { User, UserRole } from '../services/auth.service';


// ==================== INTERFACES ====================

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  wantsNewsletter?: boolean;
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

export interface NewsletterSubscribeDto {
  email: string;
  name?: string;
}

export interface UpdateUserDto {
  name?: string;
  wantsNewsletter?: boolean;
  role?: UserRole;
  // AI Context Signature fields (for AI to know who the user is)
  signatureName?: string | null;
  signaturePosition?: string | null;
  signatureCompany?: string | null;
  signaturePhone?: string | null;
  signatureWebsite?: string | null;
  // Real HTML Email Signature (like Outlook)
  emailSignature?: string | null;
}

export interface UserStats {
  totalUsers: number;
  newsletterSubscribers: number;
  subscriberRate: number;
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

export interface NewsletterSubscriber {
  id: string;
  email: string;
  isActive: boolean;
  subscribedAt: Date;
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
  allowNewsletter: boolean;
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
  allowNewsletter?: boolean;
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
  allowNewsletter?: boolean;
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

export interface GeneratedEmailResponse {
  subject: string;
  body: string;
}

export interface SendReplyDto {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

export interface SendReplyResponse {
  success: boolean;
  messageId?: string;
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

  /**
   * User-Statistiken abrufen
   */
  getUserStats(): Observable<UserStats> {
    return this.http.get<UserStats>(`${this.apiUrl}/users/stats`, {
      headers: this.getHeaders()
    });
  }

  // ==================== NEWSLETTER ENDPOINTS ====================

  /**
   * Newsletter abonnieren
   */
  subscribeNewsletterUser(dto: NewsletterSubscribeDto): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/users/newsletter/subscribe`,
      dto,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Newsletter abmelden
   */
  unsubscribeNewsletterUser(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/users/newsletter/unsubscribe`,
      { email },
      { headers: this.getHeaders() }
    );
  }

  /**
   * Alle Newsletter-Abonnenten abrufen (Admin)
   */
  getNewsletterUserSubscribers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users/newsletter/subscribers`, {
      headers: this.getHeaders()
    });
  }

  // ==================== CONTACT REQUEST ENDPOINTS ====================

  /**
   * Kontaktanfrage senden (öffentlich)
   */
  createContactRequest(dto: CreateContactRequestDto): Observable<ContactRequest> {
    return this.http.post<ContactRequest>(`${this.apiUrl}/contact-requests`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Alle Kontaktanfragen abrufen (Admin)
   */
  getAllContactRequests(): Observable<ContactRequest[]> {
    return this.http.get<ContactRequest[]>(`${this.apiUrl}/contact-requests`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Unbearbeitete Kontaktanfragen abrufen (Admin)
   */
  getUnprocessedContactRequests(): Observable<ContactRequest[]> {
    return this.http.get<ContactRequest[]>(
      `${this.apiUrl}/contact-requests/unprocessed`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Einzelne Kontaktanfrage abrufen
   */
  getContactRequest(id: string): Observable<ContactRequest> {
    return this.http.get<ContactRequest>(`${this.apiUrl}/contact-requests/${id}`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Kontaktanfrage aktualisieren (Admin)
   */
  updateContactRequest(
    id: string,
    dto: UpdateContactRequestDto
  ): Observable<ContactRequest> {
    return this.http.patch<ContactRequest>(
      `${this.apiUrl}/contact-requests/${id}`,
      dto,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Kontaktanfrage als bearbeitet markieren (Admin)
   */
  markContactRequestAsProcessed(id: string): Observable<ContactRequest> {
    return this.http.patch<ContactRequest>(
      `${this.apiUrl}/contact-requests/${id}/process`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /**
   * Kontaktanfrage löschen (Admin)
   */
  deleteContactRequest(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/contact-requests/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ==================== BOOKING SLOTS ENDPOINTS ====================

  /**
   * Verfügbare Slots abrufen (öffentlich)
   */
  getAvailableBookingSlots(fromDate?: string): Observable<BookingSlot[]> {
    let params = new HttpParams();
    if (fromDate) {
      params = params.set('fromDate', fromDate);
    }
    return this.http.get<BookingSlot[]>(`${this.apiUrl}/bookings/slots/available`, { params });
  }

  /**
   * Slots für ein bestimmtes Datum abrufen (öffentlich)
   */
  getBookingSlotsByDate(date: string): Observable<BookingSlot[]> {
    return this.http.get<BookingSlot[]>(`${this.apiUrl}/bookings/slots/date/${date}`);
  }

  /**
   * Alle Slots abrufen (Admin)
   */
  getAllBookingSlots(): Observable<BookingSlot[]> {
    return this.http.get<BookingSlot[]>(`${this.apiUrl}/bookings/slots`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Einzelnen Slot erstellen (Admin)
   */
  createBookingSlot(dto: CreateBookingSlotDto): Observable<BookingSlot> {
    return this.http.post<BookingSlot>(`${this.apiUrl}/bookings/slots`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Mehrere Slots auf einmal erstellen (Admin)
   */
  createMultipleBookingSlots(slots: CreateBookingSlotDto[]): Observable<BookingSlot[]> {
    return this.http.post<BookingSlot[]>(
      `${this.apiUrl}/bookings/slots/bulk`,
      { slots },
      { headers: this.getHeaders() }
    );
  }

  /**
   * Slot aktualisieren (Admin)
   */
  updateBookingSlot(id: string, dto: UpdateBookingSlotDto): Observable<BookingSlot> {
    return this.http.patch<BookingSlot>(`${this.apiUrl}/bookings/slots/${id}`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Slot löschen (Admin)
   */
  deleteBookingSlot(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/bookings/slots/${id}`, {
      headers: this.getHeaders()
    });
  }

  // ==================== BOOKINGS ENDPOINTS ====================

  /**
   * Booking erstellen (öffentlich)
   */
  createBooking(dto: CreateBookingDto): Observable<Booking> {
    return this.http.post<Booking>(`${this.apiUrl}/bookings`, dto);
  }

  /**
   * Alle Bookings abrufen (Admin)
   */
  getAllBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${this.apiUrl}/bookings`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Einzelne Booking abrufen (Admin)
   */
  getBooking(id: string): Observable<Booking> {
    return this.http.get<Booking>(`${this.apiUrl}/bookings/${id}`, {
      headers: this.getHeaders()
    });
  }

  /**
   * Booking aktualisieren (Admin)
   */
  updateBooking(id: string, dto: UpdateBookingDto): Observable<Booking> {
    return this.http.patch<Booking>(`${this.apiUrl}/bookings/${id}`, dto, {
      headers: this.getHeaders()
    });
  }

  /**
   * Booking stornieren (Admin)
   */
  cancelBooking(id: string): Observable<Booking> {
    return this.http.patch<Booking>(`${this.apiUrl}/bookings/${id}/cancel`, {}, {
      headers: this.getHeaders()
    });
  }

  /**
   * Booking löschen (Admin)
   */
  deleteBooking(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/bookings/${id}`, {
      headers: this.getHeaders()
    });
  }


  // ==================== NEWSLETTER ENDPOINTS ====================

  /**
   * Newsletter abonnieren (öffentlich)
   */
  subscribeNewsletter(email: string): Observable<{ success: boolean; message: string; email: string }> {
    return this.http.post<{ success: boolean; message: string; email: string }>(
      `${this.apiUrl}/newsletter/subscribe`,
      { email }
    );
  }

  /**
   * Newsletter abmelden (öffentlich)
   */
  unsubscribeNewsletter(email: string): Observable<{ success: boolean; message: string }> {
    const params = new HttpParams().set('email', email);
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/newsletter/unsubscribe`,
      { params }
    );
  }

  /**
   * Alle Newsletter-Abonnenten abrufen (Admin)
   */
  getNewsletterSubscribers(): Observable<{ total: number; active: number; inactive: number; subscribers: NewsletterSubscriber[] }> {
    return this.http.get<{ total: number; active: number; inactive: number; subscribers: NewsletterSubscriber[] }>(
      `${this.apiUrl}/newsletter/subscribers`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Newsletter Statistiken (Admin)
   */
  getNewsletterStats(): Observable<{ total: number; active: number; inactive: number }> {
    return this.http.get<{ total: number; active: number; inactive: number }>(
      `${this.apiUrl}/newsletter/stats`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Subscriber Status umschalten (Admin)
   */
  toggleNewsletterSubscriber(id: string): Observable<{ success: boolean; message: string; subscriber: NewsletterSubscriber }> {
    return this.http.patch<{ success: boolean; message: string; subscriber: NewsletterSubscriber }>(
      `${this.apiUrl}/newsletter/subscribers/${id}/toggle`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /**
   * Subscriber löschen (Admin)
   */
  deleteNewsletterSubscriber(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/newsletter/subscribers/${id}`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Registrierte User mit Newsletter abrufen (Admin)
   */
  getUserNewsletterSubscribers(): Observable<User[]> {
    return this.http.get<User[]>(
      `${this.apiUrl}/users/newsletter/subscribers`,
      { headers: this.getHeaders() }
    );
  }

  getPublicSettings(): Observable<PublicSettings> {
  return this.http.get<PublicSettings>(`${this.apiUrl}/settings/public`);
}

/**
 * Maintenance Password prüfen
 */
checkMaintenancePassword(password: string): Observable<{ valid: boolean }> {
  return this.http.post<{ valid: boolean }>(
    `${this.apiUrl}/settings/check-maintenance-password`,
    { password }
  );
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
 * Alle E-Mails abrufen (mit Pagination)
 */
getEmails(limit = 50, offset = 0): Observable<EmailListResponse> {
  const params = new HttpParams()
    .set('limit', limit.toString())
    .set('offset', offset.toString());
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
}