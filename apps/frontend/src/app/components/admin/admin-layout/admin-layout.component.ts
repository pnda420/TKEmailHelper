import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet, ChildrenOutletContexts } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { trigger, transition, style, animate, query, group } from '@angular/animations';

interface NavRoute {
  path: string;
  label: string;
  icon: string;
}

// Page transition animations
const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    style({ position: 'relative' }),
    query(':enter, :leave', [
      style({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%'
      })
    ], { optional: true }),
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(15px)' })
    ], { optional: true }),
    group([
      query(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-10px)' }))
      ], { optional: true }),
      query(':enter', [
        animate('300ms 100ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ], { optional: true })
    ])
  ])
]);

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.scss'],
  animations: [routeAnimations]
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  sidebarOpen = false;
  isMobile = false;
  private sub?: Subscription;
  private mq?: MediaQueryList;
  private mqListener = (e: MediaQueryListEvent) => {
    this.isMobile = e.matches;
    if (!this.isMobile) {
      this.sidebarOpen = false;
      this.unlockScroll();
    }
  };

  routes: NavRoute[] = [
    { path: 'admin', label: 'Dashboard', icon: 'dashboard' },
    { path: 'admin/analytics', label: 'Analytics', icon: 'bar_chart' },
    { path: 'admin/requests', label: 'Anfragen', icon: 'mail' },
    { path: 'admin/booking', label: 'Buchungen', icon: 'calendar_today' },
    { path: 'admin/newsletter', label: 'Newsletter', icon: 'newspaper' },
    { path: 'admin/faq', label: 'FAQ', icon: 'quiz' },
    { path: 'admin/services', label: 'Services', icon: 'build' },
    { path: 'admin/users', label: 'User', icon: 'group' },
    { path: 'admin/invoices', label: 'Rechnungen', icon: 'receipt_long' },
    { path: 'admin/settings', label: 'Settings', icon: 'settings' },
  ];

  // Mobile bottom nav - show only 4 most important + more button
  mobileNavRoutes: NavRoute[] = [
    { path: 'admin', label: 'Home', icon: 'dashboard' },
    { path: 'admin/requests', label: 'Anfragen', icon: 'mail' },
    { path: 'admin/booking', label: 'Termine', icon: 'calendar_today' },
    { path: 'admin/analytics', label: 'Stats', icon: 'bar_chart' },
  ];

  constructor(private router: Router, private contexts: ChildrenOutletContexts) {}

  ngOnInit() {
    this.mq = window.matchMedia('(max-width: 1024px)');
    this.isMobile = this.mq.matches;
    this.mq.addEventListener?.('change', this.mqListener);

    // Close sidebar on route change (mobile)
    this.sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (this.isMobile) {
        this.closeSidebar();
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.mq?.removeEventListener?.('change', this.mqListener);
    this.unlockScroll();
  }

  prepareRoute() {
    return this.router.url;
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    this.sidebarOpen ? this.lockScroll() : this.unlockScroll();
  }

  closeSidebar() {
    this.sidebarOpen = false;
    this.unlockScroll();
  }

  private lockScroll() {
    document.body.style.overflow = 'hidden';
  }

  private unlockScroll() {
    document.body.style.overflow = '';
  }

  normalize(path: string): string {
    return '/' + path.replace(/^\//, '');
  }

  getCurrentRouteLabel(): string {
    const currentPath = this.router.url.split('?')[0];
    const route = this.routes.find(r => this.normalize(r.path) === currentPath);
    return route ? route.label : 'Admin';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.sidebarOpen) {
      this.closeSidebar();
    }
  }
}
