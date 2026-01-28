import { Component } from '@angular/core';
import { PageTitleComponent } from "../../shared/page-title/page-title.component";
import { Router } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {

  constructor(public router: Router) {}

  navigateToContact() {
    this.router.navigate(['/contact']);
  }
}
