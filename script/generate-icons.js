import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'client', 'public');

// Create a simple clean icon SVG with connected people symbol on teal background
const createIconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <!-- Teal background -->
  <rect width="${size}" height="${size}" fill="#14b8a6"/>

  <!-- Simplified connected people symbol in white - centered -->
  <g transform="translate(${size/2}, ${size * 0.45})">
    <!-- Top circle -->
    <circle cx="0" cy="${-size * 0.16}" r="${size * 0.065}" fill="white"/>

    <!-- Top arc -->
    <path d="M${-size * 0.1},${-size * 0.1}
             Q${-size * 0.14},${-size * 0.02} ${-size * 0.08},${size * 0.06}
             Q${-size * 0.02},${size * 0.12} ${size * 0.08},${size * 0.06}
             Q${size * 0.14},${-size * 0.02} ${size * 0.1},${-size * 0.1}"
          fill="none" stroke="white" stroke-width="${size * 0.045}" stroke-linecap="round"/>

    <!-- Left circle -->
    <circle cx="${-size * 0.14}" cy="${size * 0.08}" r="${size * 0.065}" fill="white"/>

    <!-- Left arc -->
    <path d="M${-size * 0.18},${size * 0.02}
             Q${-size * 0.08},${size * 0.02} ${-size * 0.02},${size * 0.1}
             Q${size * 0.02},${size * 0.18} ${-size * 0.02},${size * 0.22}
             Q${-size * 0.08},${size * 0.28} ${-size * 0.14},${size * 0.22}"
          fill="none" stroke="white" stroke-width="${size * 0.045}" stroke-linecap="round"/>

    <!-- Right circle -->
    <circle cx="${size * 0.14}" cy="${size * 0.08}" r="${size * 0.065}" fill="white"/>

    <!-- Right arc -->
    <path d="M${size * 0.18},${size * 0.02}
             Q${size * 0.08},${size * 0.02} ${size * 0.02},${size * 0.1}
             Q${-size * 0.02},${size * 0.18} ${size * 0.02},${size * 0.22}
             Q${size * 0.08},${size * 0.28} ${size * 0.14},${size * 0.22}"
          fill="none" stroke="white" stroke-width="${size * 0.045}" stroke-linecap="round"/>
  </g>
</svg>`;

// Simpler version - just three connected circles
const createSimpleIconSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <!-- Teal background -->
  <rect width="${size}" height="${size}" fill="#14b8a6"/>

  <!-- Three connected circles representing community -->
  <g transform="translate(${size/2}, ${size/2})" fill="white">
    <!-- Top circle -->
    <circle cx="0" cy="${-size * 0.15}" r="${size * 0.12}"/>

    <!-- Bottom left circle -->
    <circle cx="${-size * 0.13}" cy="${size * 0.1}" r="${size * 0.12}"/>

    <!-- Bottom right circle -->
    <circle cx="${size * 0.13}" cy="${size * 0.1}" r="${size * 0.12}"/>

    <!-- Connecting lines (thicker) -->
    <line x1="0" y1="${-size * 0.03}" x2="${-size * 0.08}" y2="${size * 0.02}" stroke="white" stroke-width="${size * 0.06}"/>
    <line x1="0" y1="${-size * 0.03}" x2="${size * 0.08}" y2="${size * 0.02}" stroke="white" stroke-width="${size * 0.06}"/>
    <line x1="${-size * 0.05}" y1="${size * 0.1}" x2="${size * 0.05}" y2="${size * 0.1}" stroke="white" stroke-width="${size * 0.06}"/>
  </g>
</svg>`;

async function generateIcons() {
  const sizes = [
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png', size: 32 },
  ];

  for (const { name, size } of sizes) {
    const svg = createSimpleIconSvg(size);
    const svgBuffer = Buffer.from(svg);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(join(publicDir, name));

    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('Done generating icons!');
}

generateIcons().catch(console.error);
