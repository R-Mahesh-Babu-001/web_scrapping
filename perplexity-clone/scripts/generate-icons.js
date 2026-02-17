/**
 * Generate PWA icons for wick_city
 * Run: node scripts/generate-icons.js
 * Requires: sharp (installed in server/node_modules)
 */

const path = require('path');

// Use sharp from server's node_modules
const sharp = require(path.join(__dirname, '..', 'server', 'node_modules', 'sharp'));
const fs = require('fs');

const ICON_DIR = path.join(__dirname, '..', 'client', 'public', 'icons');
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// Create a simple wick_city logo as SVG
function createSVG(size) {
  const fontSize = Math.round(size * 0.28);
  const subFontSize = Math.round(size * 0.1);
  const padding = Math.round(size * 0.1);
  const cornerRadius = Math.round(size * 0.15);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#20b2aa"/>
      <stop offset="100%" style="stop-color:#48d1cc"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#bg)"/>
  <circle cx="${size * 0.5}" cy="${size * 0.42}" r="${size * 0.22}" fill="none" stroke="url(#accent)" stroke-width="${size * 0.04}"/>
  <line x1="${size * 0.64}" y1="${size * 0.56}" x2="${size * 0.78}" y2="${size * 0.70}" stroke="url(#accent)" stroke-width="${size * 0.05}" stroke-linecap="round"/>
  <text x="${size * 0.5}" y="${size * 0.88}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${subFontSize}" font-weight="700" fill="#20b2aa">wick_city</text>
</svg>`;
}

async function generateIcons() {
  // Ensure output dir
  if (!fs.existsSync(ICON_DIR)) {
    fs.mkdirSync(ICON_DIR, { recursive: true });
  }

  console.log('Generating PWA icons...');

  for (const size of SIZES) {
    const svg = createSVG(size);
    const outPath = path.join(ICON_DIR, `icon-${size}x${size}.png`);

    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outPath);

    console.log(`  Created: icon-${size}x${size}.png`);
  }

  // Also generate a favicon (32x32)
  const faviconSvg = createSVG(32);
  const faviconPath = path.join(__dirname, '..', 'client', 'public', 'favicon.ico');
  await sharp(Buffer.from(faviconSvg))
    .resize(32, 32)
    .png()
    .toFile(faviconPath.replace('.ico', '.png'));
  console.log('  Created: favicon.png');

  console.log('Done! Icons generated in client/public/icons/');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
