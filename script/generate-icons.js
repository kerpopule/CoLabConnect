import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const publicDir = join(rootDir, 'client', 'public');
const sourceIcon = join(rootDir, 'colab icon.png');

async function generateIcons() {
  const sizes = [
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png', size: 32 },
  ];

  // Read the source icon and get its metadata
  const image = sharp(sourceIcon);
  const metadata = await image.metadata();

  console.log(`Source image: ${metadata.width}x${metadata.height}`);

  // Source is already cropped, just resize with white background
  console.log(`Using pre-cropped source image`);

  for (const { name, size } of sizes) {
    await sharp(sourceIcon)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(join(publicDir, name));

    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('Done generating icons!');
}

generateIcons().catch(console.error);
