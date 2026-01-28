import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-auth-required',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auth-required.component.html',
  styleUrl: './auth-required.component.scss'
})
export class AuthRequiredComponent {
  @Input() title: string = 'Anmeldung erforderlich';
  @Input() message: string = 'Um diese Funktion zu nutzen, musst du angemeldet sein.';
  @Input() returnUrl: string = '/';
  @Input() showBackButton: boolean = false;

  fullReturnUrl: string = '/';

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    const urlTree = this.router.parseUrl(this.router.url);
    const path = urlTree.root.children['primary']?.segments.map(s => s.path).join('/') || this.returnUrl;
    const queryParams = urlTree.queryParams;

    if (Object.keys(queryParams).length > 0) {
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
      this.fullReturnUrl = `/${path}?${queryString}`;
    } else {
      this.fullReturnUrl = `/${path}`;
    }
  }

  goBack(): void {
    window.history.back();
  }
}