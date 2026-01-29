import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImageDownloadResult } from './types.js';

const MAX_RETRIES = 3;

function getExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || '.jpg';
}

export async function downloadProductImages(
  products: any[],
  outputDir: string,
): Promise<ImageDownloadResult> {
  const result: ImageDownloadResult = {
    success: true,
    downloaded: 0,
    failed: 0,
    failedUrls: [],
  };

  for (const product of products) {
    if (!product.images || product.images.length === 0) continue;

    const productDir = path.join(outputDir, 'images', String(product.id));
    fs.mkdirSync(productDir, { recursive: true });

    for (const image of product.images) {
      // Support both GraphQL (url) and REST (src) formats, prefer url
      const imageUrl = image.url || image.src;
      if (!imageUrl) continue;

      const ext = getExtension(imageUrl);
      const filename = `${image.position}${ext}`;
      const filePath = path.join(productDir, filename);

      // Skip if already exists (idempotent)
      if (fs.existsSync(filePath)) {
        result.downloaded += 0; // Don't count existing files as new downloads
        continue;
      }

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(filePath, buffer);
          result.downloaded++;
          break;
        } catch (error: any) {
          if (attempt === MAX_RETRIES - 1) {
            console.warn(`Failed to download ${imageUrl} after ${MAX_RETRIES} attempts: ${error.message}`);
            result.failed++;
            result.failedUrls.push(imageUrl);
          }
        }
      }
    }
  }

  return result;
}
