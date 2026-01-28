import { Component, Inject, OnInit, HostListener } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from "./shared/header/header.component";
import { FooterComponent } from "./shared/footer/footer.component";
import { SeoService } from './shared/seo.service';
import { CommonModule, DOCUMENT } from '@angular/common';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ToastContainerComponent } from "./shared/toasts/toast-container.component";
import { ToastService } from './shared/toasts/toast.service';
import { ConfirmationComponent } from "./shared/confirmation/confirmation.component";
import { ConfirmationService } from './shared/confirmation/confirmation.service';
import { ApiService } from './api/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    CommonModule,
    FormsModule,
    ToastContainerComponent,
    ConfirmationComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'WebsiteBaseV2';
  isUnderConstruction = false;
  maintenanceMessage = 'Die Seite wird gerade gewartet. Bitte versuchen Sie es später erneut.';

  // Neue Properties für Scroll-Handling
  isScrolled: boolean = false;
  showScrollTop: boolean = false;

  // Admin-Route Check - Footer ausblenden
  isAdminRoute: boolean = false;

  defaultConfig = {
    title: 'Bestätigung',
    message: 'Möchtest du fortfahren?',
    type: 'info' as const
  };

  // WICHTIG: Erst nach defaultConfig deklarieren!
  get confirmationState$() {
    return this.confirmationService.state$;
  }

  constructor(
    public router: Router,
    private route: ActivatedRoute,
    private seo: SeoService,
    @Inject(DOCUMENT) private doc: Document,
    private toasts: ToastService,
    private confirmationService: ConfirmationService,
    private api: ApiService,
  ) { }

  ngOnInit(): void {
    // Access Control für Under Construction Mode
    this.route.queryParams.subscribe(params => {
      const access = params['pw'];
      if (access) {
        // Prüfe Passwort gegen Backend
        this.checkMaintenancePassword(access);
      }
    });

    // SEO-Update bei Navigation
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        const deepest = this.getDeepest(this.route);
        const routeTitle: any = deepest.snapshot.routeConfig && (deepest.snapshot.routeConfig as any).title;
        const description = deepest.snapshot.data && deepest.snapshot.data['description'];
        const title = typeof routeTitle === 'string' ? routeTitle : 'LeonardsMedia';
        const url = this.doc.location.href;

        this.seo.update({ title, description, url });

        // Admin-Route Check für Footer
        this.isAdminRoute = event.urlAfterRedirects.startsWith('/admin');

        // Scroll to top bei Route-Change (nicht bei Admin)
        if (!this.isAdminRoute) {
          window.scrollTo(0, 0);
        }
      });

    // Initial Admin-Route Check
    this.isAdminRoute = this.router.url.startsWith('/admin');

  }

  private checkMaintenancePassword(password: string): void {
    this.api.checkMaintenancePassword(password).subscribe({
      next: (response) => {
        if (response.valid) {
          this.isUnderConstruction = false;
          this.router.navigate([], { 
            queryParams: { pw: null }, 
            queryParamsHandling: 'merge' 
          });
          sessionStorage.setItem('maintenanceBypass', 'true');
          this.toasts.success('Zugang gewährt');
        } else {
          this.toasts.error('Ungültiges Passwort');
        }
      },
      error: (error) => {
        console.error('Fehler bei Passwort-Prüfung:', error);
        this.toasts.error('Fehler bei der Überprüfung');
      }
    });
  }

  onConfirmed(): void {
    this.confirmationService.handleConfirm();
  }

  onCancelled(): void {
    this.confirmationService.handleCancel();
  }

  // Listen to scroll events
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

    // Header scrolled state
    this.isScrolled = scrollPosition > 50;

    // Show scroll-to-top button
    this.showScrollTop = scrollPosition > 300;
  }

  // Scroll to top smoothly
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  // Helper: Tiefste Route finden (für SEO)
  private getDeepest(route: ActivatedRoute): ActivatedRoute {
    let current = route;
    while (current.firstChild) current = current.firstChild;
    return current;
  }
}