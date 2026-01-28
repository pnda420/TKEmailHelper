/**
 * PWA Icon Generator Script
 * Generiert Placeholder-Icons für die PWA
 * 
 * Verwendung: node tools/generate-pwa-icons.mjs
 * 
 * Für echte Icons: Ersetze die generierten Dateien mit deinen
 * eigenen Icons oder nutze https://www.pwabuilder.com/imageGenerator
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '../public/assets/icons');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const BRAND_COLOR = '#C2410C';
const BG_COLOR = '#ffffff';

// Stelle sicher dass der Ordner existiert
if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
}

/**
 * Generiert ein einfaches SVG-Icon als Placeholder
 */
function generateSvgIcon(size) {
    const padding = size * 0.15;
    const innerSize = size - (padding * 2);
    const fontSize = size * 0.35;
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG_COLOR}" rx="${size * 0.15}"/>
  <rect x="${padding}" y="${padding}" width="${innerSize}" height="${innerSize}" fill="${BRAND_COLOR}" rx="${innerSize * 0.1}"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, sans-serif" font-weight="bold" font-size="${fontSize}px" fill="white">
    L&amp;B
  </text>
</svg>`;
}

/**
 * Konvertiert SVG zu PNG mit Canvas (vereinfachte Base64 Version)
 * Hinweis: Für echte PNG-Generierung würde man sharp oder canvas npm packages verwenden
 */
function generatePlaceholderPng(size) {
    // Da wir keine externen Dependencies haben, generieren wir eine Info-Datei
    const infoContent = `PWA Icon Placeholder - ${size}x${size}px

WICHTIG: Ersetze diese Datei mit einem echten PNG-Icon!

Empfohlene Tools:
- PWA Builder: https://www.pwabuilder.com/imageGenerator
- Maskable App: https://maskable.app/editor
- Real Favicon Generator: https://realfavicongenerator.net/

Icon-Anforderungen:
- Größe: ${size}x${size} Pixel
- Format: PNG mit Transparenz
- Safe Zone für Maskable: 80% des Icons sollte im inneren Kreis sein
`;
    return infoContent;
}

// Generiere SVG Icons (können direkt verwendet werden)
console.log('🎨 Generiere PWA Icons...\n');

SIZES.forEach(size => {
    const svgPath = join(ICONS_DIR, `icon-${size}x${size}.svg`);
    const svg = generateSvgIcon(size);
    writeFileSync(svgPath, svg);
    console.log(`  ✓ icon-${size}x${size}.svg`);
});

// Erstelle eine README
const readme = `# PWA Icons

Diese SVG-Icons wurden automatisch generiert und dienen als Placeholder.

## Für die Produktion:

1. Erstelle ein quadratisches Logo (mindestens 512x512px)
2. Gehe zu https://www.pwabuilder.com/imageGenerator
3. Lade dein Logo hoch
4. Lade die generierten Icons herunter
5. Ersetze die SVG-Dateien hier mit den PNG-Dateien

## Benötigte Größen:
${SIZES.map(s => `- icon-${s}x${s}.png`).join('\n')}

## Icon-Tipps:
- Verwende PNG mit Transparenz
- Halte wichtige Elemente in der "Safe Zone" (innere 80%)
- Teste mit https://maskable.app/editor

## Schnelle Alternative:
Die SVG-Icons funktionieren auch, aber PNGs sind kompatibler.
Ändere in manifest.webmanifest die Endungen von .png zu .svg.
`;

writeFileSync(join(ICONS_DIR, 'README.md'), readme);

console.log('\n✅ PWA Icons generiert!\n');
console.log('📝 Nächste Schritte:');
console.log('   1. Öffne public/assets/icons/README.md für Anweisungen');
console.log('   2. Ersetze die SVGs mit echten PNGs für beste Kompatibilität');
console.log('   3. Oder ändere manifest.webmanifest zu .svg Endungen\n');
