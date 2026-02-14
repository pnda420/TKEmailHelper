import { Pipe, PipeTransform } from '@angular/core';

/**
 * Generates a GitHub-style 5×5 symmetric identicon SVG from an email address.
 * Usage: [style.background-image]="email | identicon"
 * Returns: url(data:image/svg+xml,...) for use as CSS background-image
 *
 * No initials overlay — the identicon alone is the avatar.
 * Colors are derived from the email hash for uniqueness.
 */
@Pipe({ name: 'identicon', standalone: true, pure: true })
export class IdenticonPipe implements PipeTransform {

  /**
   * Curated HSL hue anchors — skips muddy ranges, keeps things vibrant.
   * Saturation and lightness are tuned per-pair for a modern pastel look.
   */
  private static readonly PALETTES: [string, string][] = [
    ['#e0e7ff', '#6366f1'], // indigo
    ['#ede9fe', '#8b5cf6'], // violet
    ['#fce7f3', '#ec4899'], // pink
    ['#fee2e2', '#ef4444'], // red
    ['#ffedd5', '#f97316'], // orange
    ['#fef9c3', '#ca8a04'], // amber
    ['#dcfce7', '#22c55e'], // green
    ['#ccfbf1', '#14b8a6'], // teal
    ['#cffafe', '#0891b2'], // cyan
    ['#dbeafe', '#3b82f6'], // blue
    ['#f3e8ff', '#a855f7'], // purple
    ['#fae8ff', '#d946ef'], // fuchsia
    ['#e0f2fe', '#0284c7'], // sky
    ['#fef3c7', '#d97706'], // warm-amber
    ['#d1fae5', '#059669'], // emerald
    ['#ffe4e6', '#e11d48'], // rose
  ];

  private static cache = new Map<string, string>();

  transform(email: string | undefined | null): string {
    if (!email) return 'none';

    const cached = IdenticonPipe.cache.get(email);
    if (cached) return cached;

    const result = this.generate(email.toLowerCase().trim());
    IdenticonPipe.cache.set(email, result);
    return result;
  }

  private generate(email: string): string {
    const hash = this.simpleHash(email);

    // Pick palette from hash
    const palette = IdenticonPipe.PALETTES[Math.abs(hash) % IdenticonPipe.PALETTES.length];
    const bg = palette[0]; // soft pastel background
    const fg = palette[1]; // vibrant foreground cells

    // 5×5 symmetric pattern — need 15 bits for left half + center column
    const bits = this.getBits(hash);

    const cellSize = 8;
    const gap = 2;
    const padding = 16;
    const gridSpan = 5 * cellSize + 4 * gap;
    const totalSize = gridSpan + padding * 2;
    const r = totalSize / 2;

    let rects = '';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (bits[row * 3 + col]) {
          const x = padding + col * (cellSize + gap);
          const y = padding + row * (cellSize + gap);
          rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fg}"/>`;

          // Mirror right side (skip center column 2)
          if (col < 2) {
            const mirrorX = padding + (4 - col) * (cellSize + gap);
            rects += `<rect x="${mirrorX}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fg}"/>`;
          }
        }
      }
    }

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">`,
      `<circle cx="${r}" cy="${r}" r="${r}" fill="${bg}"/>`,
      rects,
      `</svg>`,
    ].join('');

    const encoded = encodeURIComponent(svg)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');

    return `url("data:image/svg+xml,${encoded}")`;
  }

  /** djb2 hash — fast, deterministic, good distribution. */
  private simpleHash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /** Extract 15 boolean bits from the hash for the 5×3 half-grid. */
  private getBits(hash: number): boolean[] {
    const bits: boolean[] = [];
    let h = Math.abs(hash);
    for (let i = 0; i < 15; i++) {
      bits.push((h & 1) === 1);
      h = h >>> 1;
      if (h === 0) h = Math.abs(this.simpleHash(hash.toString() + i));
    }
    return bits;
  }
}
