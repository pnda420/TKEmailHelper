import { Component, OnDestroy, OnInit, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {

  constructor(public router: Router) { }

  private mouseX = 0;
  private mouseY = 0;
  private currentX = 0;
  private currentY = 0;
  private animationFrame: number | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  ngOnInit(): void {
    // Maus-Tracking starten
    this.initMouseTracking();
  }

  ngAfterViewInit(): void {
    // Scroll-Animationen initialisieren
    this.initScrollAnimations();
  }

  ngOnDestroy(): void {
    // Cleanup
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    document.removeEventListener('mousemove', this.handleMouseMove);
    
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
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

  private initMouseTracking(): void {
    const heroSection = document.querySelector('.hero') as HTMLElement;
    if (!heroSection) return;

    // Maus-Position tracken
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));

    // Smooth animation loop
    this.animate();
  }

  private handleMouseMove = (e: MouseEvent): void => {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  };

  private animate = (): void => {
    // Smooth lerp für flüssige Bewegung
    const ease = 0.1;
    this.currentX += (this.mouseX - this.currentX) * ease;
    this.currentY += (this.mouseY - this.currentY) * ease;

    // Lava-Blob positionieren
    const heroSection = document.querySelector('.hero') as HTMLElement;
    if (heroSection) {
      heroSection.style.setProperty('--mouse-x', `${this.currentX}px`);
      heroSection.style.setProperty('--mouse-y', `${this.currentY}px`);
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  };


  routeTo(path: string) {
    this.router.navigate([path]);
  }

}