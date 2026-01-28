import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-admin-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-header.component.html',
  styleUrls: ['./admin-header.component.scss']
})
export class AdminHeaderComponent implements OnInit, OnDestroy {
  open = false;
  isMobile = false;
  private sub?: Subscription;
  private mq?: MediaQueryList;
  private mqListener = (e: MediaQueryListEvent) => {
    this.isMobile = e.matches;
    if (!this.isMobile) this.close(); // falls von mobile -> desktop
  };

  constructor(private router: Router) { }

  routes = [
    {
      path: 'admin/requests',
      label: 'Anfragen',
      icon: 'mail'
    },
    {
      path: 'admin/booking',
      label: 'Buchungen',
      icon: 'calendar_today'
    },
    {
      path: 'admin/newsletter',
      label: 'Newsletter',
      icon: 'newspaper'
    },
    {
      path: 'admin/faq',
      label: 'FAQ',
      icon: 'quiz'
    },
    {
      path: 'admin/services',
      label: 'Services',
      icon: 'build'
    },
    {
      path: 'admin/users',
      label: 'User',
      icon: 'group'
    },
    {
      path: 'admin/invoices',
      label: 'Rechnungen',
      icon: 'receipt_long'
    },
    {
      path: 'admin/settings',
      label: 'Einstellungen',
      icon: 'settings'
    },
  ];

  getCurrentRouteLabel() {
    const currentPath = this.router.url.split('?')[0];
    const route = this.routes.find(r => this.normalize(r.path) === this.normalize(currentPath));
    return route ? route.label : 'Admin Bereich';
  }

  ngOnInit() {
    // Media Query initial + listener
    this.mq = window.matchMedia('(max-width: 899px)');
    this.isMobile = this.mq.matches;
    this.mq.addEventListener?.('change', this.mqListener);

    // Close on route change
    this.sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.close();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.mq?.removeEventListener?.('change', this.mqListener);
    this.unlockScroll();
  }

  toggle() {
    this.open = !this.open;
    this.open ? this.lockScroll() : this.unlockScroll();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.unlockScroll();
  }

  onNavClick() {
    // Mobile: Linkklick schließt Menü (Desktop egal)
    if (this.isMobile) this.close();
  }

  normalize(path: string) {
    // immer absolut machen, damit NG04002 durch relative Segmente nicht passiert
    return path.startsWith('/') ? path : '/' + path;
  }

  // ESC schließt
  @HostListener('document:keydown.escape', ['$event'])
  onEsc(e: Event) {
    if (this.open) {
      e.preventDefault();
      this.close();
    }
  }

  // Body Scroll Lock (ohne Lib)
  private lockScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }
  private unlockScroll() {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }

  routeTo(path: string) {
    this.router.navigateByUrl(this.normalize(path));
  }
}
