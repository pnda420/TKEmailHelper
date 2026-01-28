import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConsentService } from '../../services/consent/consent.service';
import { CONSENT_CATEGORIES, ConsentCategoryInfo } from '../../services/consent/consent.model';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './cookie-banner.component.html',
  styleUrls: ['./cookie-banner.component.scss']
})
export class CookieBannerComponent implements OnInit, OnDestroy {
  showBanner = false;
  showDetails = false;
  isClosing = false;
  categories = CONSENT_CATEGORIES;
  
  // Für individuelle Auswahl
  functionalEnabled = false;
  analyticsEnabled = false;

  private subscription?: Subscription;

  constructor(public consentService: ConsentService) {}

  ngOnInit(): void {
    this.subscription = this.consentService.showBanner$.subscribe(show => {
      if (show) {
        this.isClosing = false;
        this.showBanner = true;
        // Aktuelle Werte laden falls vorhanden
        const consent = this.consentService.consent;
        this.functionalEnabled = consent.functional;
        this.analyticsEnabled = consent.analytics;
      } else {
        // Wenn Banner geschlossen wird, Animation abspielen
        if (this.showBanner) {
          this.closeBannerWithAnimation();
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private closeBannerWithAnimation(): void {
    this.isClosing = true;
    setTimeout(() => {
      this.showBanner = false;
      this.isClosing = false;
    }, 300); // Match animation duration
  }

  acceptAll(): void {
    this.isClosing = true;
    setTimeout(() => {
      this.consentService.acceptAll();
      this.showBanner = false;
      this.isClosing = false;
    }, 300);
  }

  rejectAll(): void {
    this.isClosing = true;
    setTimeout(() => {
      this.consentService.acceptNecessaryOnly();
      this.showBanner = false;
      this.isClosing = false;
    }, 300);
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }

  saveCustom(): void {
    this.isClosing = true;
    setTimeout(() => {
      this.consentService.saveCustomConsent(
        this.functionalEnabled,
        this.analyticsEnabled
      );
      this.showBanner = false;
      this.isClosing = false;
    }, 300);
  }

  toggleCategory(category: string): void {
    if (category === 'functional') {
      this.functionalEnabled = !this.functionalEnabled;
    } else if (category === 'analytics') {
      this.analyticsEnabled = !this.analyticsEnabled;
    }
  }

  isCategoryEnabled(category: ConsentCategoryInfo): boolean {
    if (category.id === 'necessary') return true;
    if (category.id === 'functional') return this.functionalEnabled;
    if (category.id === 'analytics') return this.analyticsEnabled;
    return false;
  }
}
