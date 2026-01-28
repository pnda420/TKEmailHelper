import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { PageTitleComponent } from "../../shared/page-title/page-title.component";
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceDataService, Service } from '../../shared/service-data.service';
import { ApiService, CreateContactRequestDto } from '../../api/api.service';
import { finalize } from 'rxjs';
import { ToastService } from '../../shared/toasts/toast.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { AnalyticsService } from '../../services/analytics.service';

type State = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [PageTitleComponent, CommonModule, FormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: 0, overflow: 'hidden' }),
        animate('300ms ease-out', style({ opacity: 1, height: '*' }))
      ]),
      transition(':leave', [
        style({ opacity: 1, height: '*', overflow: 'hidden' }),
        animate('200ms ease-in', style({ opacity: 0, height: 0 }))
      ])
    ])
  ]
})
export class ContactComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('nameInput') nameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('formContainer') formContainer!: ElementRef<HTMLElement>;
  @ViewChild('successCard') successCard!: ElementRef<HTMLElement>;
  @ViewChild('submitButton') submitButton!: ElementRef<HTMLElement>;

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private serviceData: ServiceDataService,
    private api: ApiService,
    private toasts: ToastService,
    private analytics: AnalyticsService
  ) { }

  state: State = 'idle';
  busy = false;
  showStickyButton = false;
  private intersectionObserver?: IntersectionObserver;

  // Selected service from query params
  selectedService: Service | null = null;

  // Character limit for message
  readonly messageMaxLength = 1000;

  model = {
    name: '',
    email: '',
    message: '',
    callback: false,
    phone: '',
    service: ''
  };

  // Computed property for character count
  get messageLength(): number {
    return this.model.message?.length || 0;
  }

  get isMessageNearLimit(): boolean {
    return this.messageLength > this.messageMaxLength * 0.8;
  }

  ngOnInit(): void {
    // Read service ID from query params
    this.route.queryParams.subscribe(params => {
      const serviceId = params['service'];
      if (serviceId) {
        const service = this.serviceData.getServiceById(serviceId);
        if (service) {
          this.selectedService = service;
          this.model.service = service.title;
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // Auto-focus name input on desktop (nicht auf Mobile wegen Keyboard)
    if (window.innerWidth > 768) {
      setTimeout(() => this.nameInput?.nativeElement?.focus(), 300);
    }

    // Intersection Observer für Sticky Button (nur Mobile)
    if (window.innerWidth <= 768 && this.submitButton) {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            // Sticky Button zeigen wenn Submit-Button nicht sichtbar ist
            this.showStickyButton = !entry.isIntersecting;
          });
        },
        { threshold: 0.1 }
      );

      this.intersectionObserver.observe(this.submitButton.nativeElement);
    }
  }

  clearSelectedService(): void {
    this.selectedService = null;
    this.model.service = '';
    this.model.message = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
  }

  submit() {
    if (this.busy || this.state === 'loading' || !this.model.name || !this.model.email || !this.model.message) {
      return;
    }

    this.busy = true;
    this.state = 'loading';

    // Service-Slug aus dem ausgewählten Service ermitteln
    const serviceSlug = this.selectedService 
      ? this.serviceData.getServiceSlug(this.selectedService.id)
      : 'allgemeine-anfrage';

    const contactRequest: CreateContactRequestDto = {
      name: this.model.name,
      email: this.model.email,
      message: this.model.message || 'Keine Nachricht angegeben',
      serviceType: serviceSlug,
      prefersCallback: this.model.callback,
      phoneNumber: this.model.callback ? this.model.phone : undefined
    };

    this.api.createContactRequest(contactRequest)
      .pipe(finalize(() => { this.busy = false; }))
      .subscribe({
        next: () => {
          this.state = 'success';
          this.toasts.success('Kontaktanfrage erfolgreich gesendet!', { duration: 5000 });
          
          // Track conversion for analytics
          this.analytics.trackConversion('contact_form', {
            service: serviceSlug,
            prefersCallback: this.model.callback
          });
          
          // Scroll to success message on mobile
          setTimeout(() => this.scrollToTop(), 100);
        },
        error: (error) => {
          console.error('Fehler beim Senden der Kontaktanfrage:', error);
          this.state = 'error';
          this.toasts.error('Fehler beim Senden der Kontaktanfrage.', { duration: 5000 });
          setTimeout(() => { this.state = 'idle'; }, 5000);
        }
      });
  }

  newMessage() {
    this.resetForm();
  }

  private resetForm() {
    this.model = {
      name: '',
      email: '',
      message: '',
      callback: false,
      phone: '',
      service: ''
    };
    this.selectedService = null;
    this.state = 'idle';
    
    // Focus auf erstes Feld nach Reset
    setTimeout(() => {
      this.nameInput?.nativeElement?.focus();
      this.scrollToTop();
    }, 100);
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    // Cleanup Intersection Observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  // Keyboard submit mit Enter (nur wenn nicht im Textarea)
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      this.submit();
    }
  }
}