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

  // Crop out the black border and white corners
  // The border appears to be about 3-4% on each side
  const cropPercent = 0.04;
  const cropPx = Math.floor(metadata.width * cropPercent);

  const extractOptions = {
    left: cropPx,
    top: cropPx,
    width: metadata.width - (cropPx * 2),
    height: metadata.height - (cropPx * 2)
  };

  console.log(`Cropping: ${cropPx}px from each edge`);

  for (const { name, size } of sizes) {
    await sharp(sourceIcon)
      .extract(extractOptions)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(join(publicDir, name));

    console.log(`Generated ${name} (${size}x${size})`);
  }

  console.log('Done generating icons!');
}

generateIcons().catch(console.error);
