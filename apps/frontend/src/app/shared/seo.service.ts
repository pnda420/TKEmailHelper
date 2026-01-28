import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoOptions {
  title?: string;
  description?: string;
  robots?: string; // e.g. "index,follow"
  url?: string; // canonical and og:url
  image?: string; // absolute or relative
  type?: string; // og:type
  structuredData?: object | object[]; // JSON-LD
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly siteName = 'LeonardsMedia';
  private readonly defaultDescription =
    'IT-Dienstleistungen, Webentwicklung und SEO aus einer Hand. LeonardsMedia – pragmatisch, transparent und zuverlässig.';
  private readonly defaultImage = '/assets/LM_Logos/Logo1.png';

  constructor(
    private title: Title,
    private meta: Meta,
    @Inject(DOCUMENT) private doc: Document
  ) {}

  update(options: SeoOptions = {}): void {
    const origin = this.getOrigin();
    const url = options.url || this.doc.location.href;
    const image = this.toAbsoluteUrl(options.image || this.defaultImage, origin);
    const title = options.title || this.siteName;
    const description = options.description || this.defaultDescription;
    const robots = options.robots || 'index,follow';
    const type = options.type || 'website';

    // Title
    this.title.setTitle(title);

    // Basic
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: robots });
    this.meta.updateTag({ name: 'theme-color', content: '#0d6efd' });

    // Canonical
    this.setCanonical(url);

    // Open Graph
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ property: 'og:site_name', content: this.siteName });
    this.meta.updateTag({ property: 'og:locale', content: 'de_DE' });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:url', content: url });

    // Twitter
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    // JSON-LD
    if (options.structuredData) {
      this.setJsonLd(options.structuredData);
    } else {
      // Set default Organization JSON-LD
      this.setJsonLd([
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: this.siteName,
          url: origin,
          logo: this.toAbsoluteUrl(this.defaultImage, origin),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: this.siteName,
          url: origin,
        },
      ]);
    }
  }

  setCanonical(url: string): void {
    const head = this.doc.head || this.doc.getElementsByTagName('head')[0];
    const linkRel = 'canonical';
    let link: HTMLLinkElement | null = head.querySelector(`link[rel="${linkRel}"]`);
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', linkRel);
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  setJsonLd(data: object | object[]): void {
    const head = this.doc.head || this.doc.getElementsByTagName('head')[0];
    const id = 'structured-data';
    let script = this.doc.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script');
      script.type = 'application/ld+json';
      script.id = id;
      head.appendChild(script);
    }
    script.text = JSON.stringify(data);
  }

  private getOrigin(): string {
    try {
      // In browser
      return (this.doc.defaultView?.location?.origin || this.doc.location.origin);
    } catch {
      return '';
    }
  }

  private toAbsoluteUrl(url: string, origin: string): string {
    if (!url) return origin;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `${this.doc.location.protocol}${url}`;
    // Ensure leading slash
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${origin}${path}`;
  }
}
