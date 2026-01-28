import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BookingSlot, DayWithSlots, ApiService, CreateBookingDto } from '../../api/api.service';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ==================== KONFIGURATION ====================

  /**
   * Mindestvorlaufzeit in Stunden
   * Slots müssen mindestens X Stunden in der Zukunft liegen
   */
  private readonly MIN_HOURS_ADVANCE = 2;

  private readonly MAX_WEEKS = 8; // Maximal 8 Wochen in die Zukunft
  private readonly DAYS_PER_WEEK = 7; // Immer 7 Tage pro Woche anzeigen

  // ==================== STATE ====================

  selectedDate: string = '';
  selectedSlot: BookingSlot | null = null;
  currentWeekIndex: number = 0;
  currentMonthLabel: string = '';
  totalWeeksInMonth: number = 0;
  currentWeekOfMonth: number = 1;
  isLoading: boolean = false;
  isSubmitting: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  // Success State
  bookingSuccessful: boolean = false;
  bookedSlotDate: string = '';
  bookedSlotTime: string = '';

  availableSlots: BookingSlot[] = [];
  weeks: DayWithSlots[][] = [];
  allSlots: BookingSlot[] = [];

  // Form Data
  bookingData = {
    name: '',
    email: '',
    phone: '',
    message: ''
  };

  constructor(
    private apiService: ApiService,
    public router: Router
  ) { }

  ngOnInit(): void {
    this.loadAvailableSlots();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  formatDate(dateStr: string): string {
    const date = this.parseLocalDate(dateStr); // statt new Date(dateStr)
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
  }

  formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date.toLocaleString('de-DE', { hour: 'numeric', minute: 'numeric', hour12: false }) || time;
  }

  // ==================== DATA LOADING ====================

  loadAvailableSlots(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const today = this.toLocalYMD(new Date());

    this.apiService.getAvailableBookingSlots(today)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (slots) => {
          // Slots filtern: nur zukünftige mit Mindestvorlauf
          const filteredSlots = this.filterValidSlots(slots);
          this.allSlots = filteredSlots;

          // Wochen erzeugen
          this.generateWeeksFromSlots(filteredSlots);

          // Neu: nur zur ersten verfügbaren Woche springen (ohne Auswahl)
          this.jumpToFirstAvailableWeek();

          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading slots:', error);
          this.errorMessage = 'Slots konnten nicht geladen werden. Bitte versuche es später erneut.';
          this.isLoading = false;
        }
      });
  }

  /**
   * Filtert Slots nach folgenden Kriterien:
   * - Slot liegt in der Zukunft
   * - Slot liegt mindestens MIN_HOURS_ADVANCE Stunden in der Zukunft
   */
  private filterValidSlots(slots: BookingSlot[]): BookingSlot[] {
    const now = new Date();
    const minDateTime = new Date(now.getTime() + this.MIN_HOURS_ADVANCE * 60 * 60 * 1000);

    return slots.filter(slot => {
      const slotDateTime = this.getSlotDateTime(slot.date, slot.timeFrom);
      return slotDateTime >= minDateTime;
    });
  }

  /** Erstellt ein Date-Objekt aus Datum und Uhrzeit */
  private getSlotDateTime(date: string, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const base = this.parseLocalDate(date);
    base.setHours(hours, minutes, 0, 0);
    return base;
  }

  generateWeeksFromSlots(slots: BookingSlot[]): void {
    // Slots nach Datum gruppieren
    const slotsByDate = new Map<string, BookingSlot[]>();

    slots.forEach(slot => {
      if (!slotsByDate.has(slot.date)) {
        slotsByDate.set(slot.date, []);
      }
      slotsByDate.get(slot.date)!.push(slot);
    });

    // Startdatum: Heute
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    // Immer am Anfang der Woche starten (Montag)
    const dow = (startDate.getDay() + 6) % 7;
    startDate.setDate(startDate.getDate() - dow);
    startDate.setHours(0, 0, 0, 0);

    this.weeks = [];

    // Wochen generieren
    for (let weekIndex = 0; weekIndex < this.MAX_WEEKS; weekIndex++) {
      const week: DayWithSlots[] = [];

      for (let dayIndex = 0; dayIndex < this.DAYS_PER_WEEK; dayIndex++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);

        const dateStr = this.toLocalYMD(currentDate);
        const daySlots = slotsByDate.get(dateStr) || [];

        // Nur validierte Slots für diesen Tag
        const validDaySlots = this.filterValidSlots(daySlots);

        week.push({
          date: dateStr,
          dayName: this.getDayName(currentDate.getDay()),
          dayNumber: currentDate.getDate(),
          available: validDaySlots.length > 0,
          slots: validDaySlots,
          isPast: currentDate < new Date()
        });
      }

      this.weeks.push(week);
    }
  }

  getDayName(dayNumber: number): string {
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return days[dayNumber];
  }

  get currentWeek(): DayWithSlots[] {
    return this.weeks[this.currentWeekIndex] || [];
  }

  updateWeekLabels(): void {
    if (this.currentWeek.length === 0) return;

    const firstDay = new Date(this.currentWeek[0].date + 'T12:00:00');
    const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    // Aktuellen Monat bestimmen
    this.currentMonthLabel = months[firstDay.getMonth()];

    // Welche Woche des Monats?
    const firstDayOfMonth = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
    const weekOfMonth = Math.ceil((firstDay.getDate() + firstDayOfMonth.getDay()) / 7);
    this.currentWeekOfMonth = weekOfMonth;

    // Wie viele Wochen hat dieser Monat insgesamt?
    const lastDayOfMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
    const weeksInMonth = Math.ceil((lastDayOfMonth.getDate() + firstDayOfMonth.getDay()) / 7);
    this.totalWeeksInMonth = weeksInMonth;
  }

  get weekNavigationLabel(): string {
    if (!this.currentMonthLabel) return '';
    return `${this.currentMonthLabel} Woche ${this.currentWeekOfMonth}/${this.totalWeeksInMonth}`;
  }

  // ==================== NAVIGATION ====================

  previousWeek(): void {
    if (this.currentWeekIndex > 0) {
      this.currentWeekIndex--;
      this.updateWeekLabels();
      this.clearSelection();
    }
  }

  nextWeek(): void {
    if (this.currentWeekIndex < this.weeks.length - 1) {
      this.currentWeekIndex++;
      this.updateWeekLabels();
      this.clearSelection();
    }
  }

  clearSelection(): void {
    this.selectedDate = '';
    this.selectedSlot = null;
    this.availableSlots = [];
  }

  // ==================== SELECTION ====================

  selectDate(date: string): void {
    this.selectedDate = date;
    this.selectedSlot = null;

    // Slots für diesen Tag laden und nochmal validieren
    const day = this.currentWeek.find(d => d.date === date);
    const daySlots = day?.slots || [];

    // Slots nochmal filtern (falls Zeit mittlerweile abgelaufen)
    this.availableSlots = this.filterValidSlots(daySlots);
  }

  selectSlot(slot: BookingSlot): void {
    // Vor dem Auswählen nochmal prüfen ob Slot noch gültig ist
    const slotDateTime = this.getSlotDateTime(slot.date, slot.timeFrom);
    const now = new Date();
    const minDateTime = new Date(now.getTime() + this.MIN_HOURS_ADVANCE * 60 * 60 * 1000);

    if (slotDateTime < minDateTime) {
      this.errorMessage = 'Dieser Slot ist leider nicht mehr verfügbar. Bitte lade die Seite neu.';
      this.loadAvailableSlots();
      return;
    }

    this.selectedSlot = slot;
  }

  // ==================== NEU: Nur auf erste verfügbare Woche springen (keine Auto-Selektion) ====================

  /** Setzt den Week-Index auf die erste Woche mit mindestens einem verfügbaren Tag. */
  private jumpToFirstAvailableWeek(): void {
    if (!this.weeks || this.weeks.length === 0) {
      this.currentWeekIndex = 0;
      this.clearSelection();
      this.updateWeekLabels();
      return;
    }

    const weekIndex = this.weeks.findIndex(week => week.some(d => d.available));
    if (weekIndex === -1) {
      // Gar nichts verfügbar
      this.currentWeekIndex = 0;
      this.clearSelection();
      this.updateWeekLabels();
      return;
    }

    // Auf die gefundene Woche springen
    this.currentWeekIndex = weekIndex;
    this.clearSelection(); // sicherstellen, dass nichts vorselektiert ist
    this.updateWeekLabels();
  }

  // ==================== PARSE/FORMAT HELPERS ====================

  /** "2025-10-16" -> Date (lokal, 00:00) */
  private parseLocalDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m - 1), d, 0, 0, 0, 0);
  }

  /** Date -> "YYYY-MM-DD" (lokal) */
  private toLocalYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getFormattedDate(): string {
    const dateStr = this.selectedSlot?.date || this.selectedDate;
    if (!dateStr) return '';
    const date = this.parseLocalDate(dateStr);
    const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return `${days[date.getDay()]}, ${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
  }

  getFormattedTime(): string {
    if (!this.selectedSlot) return '';
    return `${this.formatTime(this.selectedSlot.timeFrom)} - ${this.formatTime(this.selectedSlot.timeTo)}`;
  }

  // ==================== BOOKING SUBMIT ====================

  bookAnotherSlot(): void {
    this.bookingSuccessful = false;
    this.bookedSlotDate = '';
    this.bookedSlotTime = '';
    this.loadAvailableSlots();
  }

  backToHome(): void {
    this.router.navigate(['/']);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  submitBooking(): void {
    if (!this.selectedSlot || !this.bookingData.name || !this.bookingData.email) {
      return;
    }

    if (!this.selectedSlot || !this.bookingData.name || !this.bookingData.email) return;

    // Sanity: Datum & Zeiten müssen aus selectedSlot kommen
    const dateStr = this.selectedSlot.date;
    const fromStr = this.selectedSlot.timeFrom;
    const toStr = this.selectedSlot.timeTo;

    // Wenn etwas leer/komisch ist -> abbrechen
    if (!dateStr || !fromStr || !toStr) {
      this.errorMessage = 'Unerwarteter Fehler: Slot-Daten unvollständig. Bitte Seite neu laden.';
      return;
    }

    // Optional streng: prüfen, ob UI-Strings zum Slot passen
    const uiDate = this.selectedDate; // (nur zu Diagnose)
    if (uiDate && uiDate !== dateStr) {
      this.errorMessage = 'Interner Abgleich fehlgeschlagen (Datum). Bitte Tag neu auswählen.';
      return;
    }

    // Finale Validierung vor dem Absenden
    const slotDateTime = this.getSlotDateTime(this.selectedSlot.date, this.selectedSlot.timeFrom);
    const now = new Date();
    const minDateTime = new Date(now.getTime() + this.MIN_HOURS_ADVANCE * 60 * 60 * 1000);

    if (slotDateTime < minDateTime) {
      this.errorMessage = `Dieser Slot liegt weniger als ${this.MIN_HOURS_ADVANCE} Stunden in der Zukunft. Bitte wähle einen anderen Termin.`;
      this.loadAvailableSlots();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const bookingDto: CreateBookingDto = {
      name: this.bookingData.name.trim(),
      email: this.bookingData.email.trim(),
      phone: this.bookingData.phone?.trim() || undefined,
      message: this.bookingData.message?.trim() || undefined,
      slotId: this.selectedSlot.id
    };

    this.apiService.createBooking(bookingDto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (booking) => {
          // Success Screen anzeigen
          this.bookingSuccessful = true;
          this.bookedSlotDate = this.getFormattedDate();
          this.bookedSlotTime = this.getFormattedTime();
          this.isSubmitting = false;
          this.scrollToTop();

          // Form zurücksetzen (aber Success Screen bleibt)
          this.resetForm();
        },
        error: (error) => {
          console.error('Booking error:', error);
          this.isSubmitting = false;

          if (error.status === 409) {
            this.errorMessage = 'Dieser Slot ist leider nicht mehr verfügbar. Bitte wähle einen anderen Termin.';
          } else if (error.status === 404) {
            this.errorMessage = 'Dieser Slot wurde nicht gefunden. Bitte lade die Seite neu.';
          } else if (error.status === 400) {
            this.errorMessage = 'Ungültige Buchungsdaten. Bitte überprüfe deine Eingaben.';
          } else {
            this.errorMessage = 'Buchung fehlgeschlagen. Bitte versuche es erneut oder kontaktiere uns direkt.';
          }

          // Slots neu laden um aktuelle Verfügbarkeit zu zeigen
          this.loadAvailableSlots();
        }
      });
  }

  resetForm(): void {
    this.selectedDate = '';
    this.selectedSlot = null;
    this.availableSlots = [];
    this.bookingData = {
      name: '',
      email: '',
      phone: '',
      message: ''
    };
  }

  // ==================== HELFER ====================

  getSlotsCountForDay(day: DayWithSlots): number {
    return day.slots.length;
  }

  isFormValid(): boolean {
    return !!(
      this.selectedSlot &&
      this.bookingData.name?.trim() &&
      this.bookingData.email?.trim() &&
      this.isValidEmail(this.bookingData.email)
    );
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
