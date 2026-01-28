import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConsentService } from '../../services/consent/consent.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
   constructor(public router: Router, private consentService: ConsentService) {}
   year = new Date().getFullYear();

   openCookieSettings(): void {
     this.consentService.showSettings();
   }
}
