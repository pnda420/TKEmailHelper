import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'identicon', standalone: true, pure: true })
export class IdenticonPipe implements PipeTransform {

  private static readonly PALETTES: [string, string][] = [
    ['#e0e7ff', '#6366f1'],
    ['#ede9fe', '#8b5cf6'],
    ['#fce7f3', '#ec4899'],
    ['#fee2e2', '#ef4444'],
    ['#ffedd5', '#f97316'],
    ['#fef9c3', '#ca8a04'],
    ['#dcfce7', '#22c55e'],
    ['#ccfbf1', '#14b8a6'],
    ['#cffafe', '#0891b2'],
    ['#dbeafe', '#3b82f6'],
    ['#f3e8ff', '#a855f7'],
    ['#fae8ff', '#d946ef'],
    ['#e0f2fe', '#0284c7'],
    ['#fef3c7', '#d97706'],
    ['#d1fae5', '#059669'],
    ['#ffe4e6', '#e11d48'],
  ];

  private static cache = new Map<string, string>();

  transform(email: string | undefined | null, customBg?: string, customFg?: string): string {
    if (!email) return 'none';

    const cacheKey = `${email}__${customBg ?? ''}__${customFg ?? ''}`;
    const cached = IdenticonPipe.cache.get(cacheKey);
    if (cached) return cached;

    const result = this.generate(email.toLowerCase().trim(), customBg, customFg);
    IdenticonPipe.cache.set(cacheKey, result);
    return result;
  }

  private generate(email: string, customBg?: string, customFg?: string): string {
    const hash = this.simpleHash(email);

    const palette = IdenticonPipe.PALETTES[Math.abs(hash) % IdenticonPipe.PALETTES.length];
    const bg = customBg ?? palette[0];
    const fg = customFg ?? palette[1];

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

  private simpleHash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

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