import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { trigger, transition, style, animate } from '@angular/animations';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';
import { ApiService, AiConfigEntry } from '../../../api/api.service';
import { ToastService } from '../../../shared/toasts/toast.service';

@Component({
  selector: 'app-admin-ai-config',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-ai-config.component.html',
  styleUrls: ['./admin-ai-config.component.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(12px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class AdminAiConfigComponent implements OnInit {
  loading = true;

  // Rules
  rules: string[] = [];
  newRule = '';
  savingRules = false;

  constructor(
    private api: ApiService,
    private toasts: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadConfigs();
  }

  loadConfigs(): void {
    this.loading = true;
    this.api.getAiConfig('reply_rules').subscribe({
      next: (entry) => {
        try { this.rules = JSON.parse(entry.value); } catch { this.rules = []; }
        this.loading = false;
      },
      error: () => {
        this.toasts.error('Regeln konnten nicht geladen werden');
        this.loading = false;
      }
    });
  }

  // ==================== RULES ====================

  addRule(): void {
    const rule = this.newRule.trim();
    if (!rule) return;
    this.rules.push(rule);
    this.newRule = '';
    this.saveRules();
  }

  removeRule(index: number): void {
    this.rules.splice(index, 1);
    this.saveRules();
  }

  moveRule(index: number, direction: -1 | 1): void {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.rules.length) return;
    [this.rules[index], this.rules[newIndex]] = [this.rules[newIndex], this.rules[index]];
    this.saveRules();
  }

  saveRules(): void {
    this.savingRules = true;
    this.api.updateAiConfig('reply_rules', JSON.stringify(this.rules)).subscribe({
      next: () => {
        this.savingRules = false;
        this.toasts.success('Regeln gespeichert');
      },
      error: () => {
        this.savingRules = false;
        this.toasts.error('Regeln konnten nicht gespeichert werden');
      }
    });
  }
}
