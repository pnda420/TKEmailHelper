import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService, EmailStats } from '../../api/api.service';
import { ToastService } from '../../shared/toasts/toast.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule]
})
export class HomeComponent implements OnInit, OnDestroy {
  emailStats: EmailStats = {
    inbox: 0,
    sent: 0,
    trash: 0,
    unread: 0
  };
  templateCount = 0;
  refreshing = false;

  private intersectionObserver: IntersectionObserver | null = null;

  constructor(
    public router: Router,
    private api: ApiService,
    private toasts: ToastService
  ) { }

  ngOnInit(): void {
    this.loadStats();
    this.initScrollAnimations();
  }

  ngOnDestroy(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
  }

  loadStats(): void {
    // Load email stats
    this.api.getEmailStats().subscribe({
      next: (stats) => {
        this.emailStats = stats;
      },
      error: () => {}
    });

    // Load templates count
    this.api.getEmailTemplates().subscribe({
      next: (templates) => {
        this.templateCount = templates.length;
      },
      error: () => {}
    });
  }

  refreshEmails(): void {
    this.refreshing = true;
    this.api.refreshEmails().subscribe({
      next: (res) => {
        this.toasts.success(`${res.stored} neue E-Mails abgerufen`);
        this.refreshing = false;
        this.loadStats();
      },
      error: (err) => {
        console.error('Fehler:', err);
        this.toasts.error('Fehler beim Abrufen der E-Mails');
        this.refreshing = false;
      }
    });
  }

  private initScrollAnimations(): void {
    const animatedSections = document.querySelectorAll('[data-animate]');
    
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    animatedSections.forEach((section) => {
      this.intersectionObserver?.observe(section);
    });
  }
}