import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';
import { ApiService, Faq } from '../../api/api.service';

type FaqItem = { id: string; q: string; a: string[]; list?: string[] };

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule, PageTitleComponent],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss'
})
export class FaqComponent implements OnInit {
  constructor(
    public router: Router,
    private api: ApiService
  ) { }

  q = '';
  expandAll = false;
  loading = true;
  error = false;
  isEmpty = false;

  // FAQs aus der Datenbank
  faqs: FaqItem[] = [];

  ngOnInit(): void {
    this.loadFaqs();
  }

  private loadFaqs(): void {
    this.loading = true;
    this.error = false;
    this.isEmpty = false;

    this.api.getPublishedFaqs().subscribe({
      next: (data) => {
        // API-Daten zu FaqItem-Format mappen
        this.faqs = data.map(faq => ({
          id: faq.slug,
          q: faq.question,
          a: faq.answers,
          list: faq.listItems ?? undefined
        }));
        
        this.isEmpty = this.faqs.length === 0;
        this.loading = false;
      },
      error: (err) => {
        console.error('Fehler beim Laden der FAQs:', err);
        this.loading = false;
        this.error = true;
      }
    });
  }

  get filtered(): FaqItem[] {
    const q = this.q.trim().toLowerCase();
    if (!q) return this.faqs;
    return this.faqs.filter(f =>
      f.q.toLowerCase().includes(q) ||
      f.a.join(' ').toLowerCase().includes(q) ||
      (f.list?.join(' ').toLowerCase().includes(q) ?? false)
    );
  }

  setAll(open: boolean) { this.expandAll = open; }

  trackById(_: number, f: FaqItem) { return f.id; }
}
