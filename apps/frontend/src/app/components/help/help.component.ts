import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('500ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggerIn', [
      transition(':enter', [
        query('.step-card, .feature-card, .faq-item', [
          style({ opacity: 0, transform: 'translateY(16px)' }),
          stagger(80, [
            animate('400ms cubic-bezier(.23,1,.32,1)', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class HelpComponent {
  activeSection: string = 'quickstart';
  expandedFaq: number | null = null;

  sections = [
    { id: 'quickstart', label: 'Schnellstart', icon: 'rocket_launch' },
    { id: 'inbox', label: 'Posteingang', icon: 'inbox' },
    { id: 'reply', label: 'Antworten', icon: 'reply' },
    { id: 'templates', label: 'Vorlagen', icon: 'description' },
    { id: 'profile', label: 'Profil', icon: 'person' },
    { id: 'admin', label: 'Admin', icon: 'admin_panel_settings' },
    { id: 'faq', label: 'FAQ', icon: 'help' },
    { id: 'contact', label: 'Kontakt', icon: 'support_agent' },
  ];

  scrollTo(sectionId: string): void {
    this.activeSection = sectionId;
    const el = document.getElementById('section-' + sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  toggleFaq(index: number): void {
    this.expandedFaq = this.expandedFaq === index ? null : index;
  }
}
