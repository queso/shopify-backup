import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImageDownloadResult } from './types.js';

const MAX_RETRIES = 3;

/**
 * Product with images - supports both REST and GraphQL formats
 */
interface ProductWithImages {
  id: number | string;
  legacyResourceId?: string;  // GraphQL numeric ID
  images?: Array<{
    src?: string;  // REST format
    url?: string;  // GraphQL format
    position?: number;  // REST has position, GraphQL doesn't
  }> | null;
}

function getExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || '.jpg';
}

export async function downloadProductImages(
  products: ProductWithImages[],
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

    // Use legacyResourceId (numeric) for GraphQL, fall back to id for REST
    const productId = product.legacyResourceId || String(product.id);
    const productDir = path.join(outputDir, 'images', productId);
    fs.mkdirSync(productDir, { recursive: true });

    for (let i = 0; i < product.images.length; i++) {
      const image = product.images[i];
      // Support both GraphQL (url) and REST (src) formats, prefer url
      const imageUrl = image.url || image.src;
      if (!imageUrl) continue;

      const ext = getExtension(imageUrl);
      // Use position if available (REST), otherwise use array index (GraphQL)
      const position = image.position ?? i + 1;
      const filename = `${position}${ext}`;
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
        } catch (error: unknown) {
          if (attempt === MAX_RETRIES - 1) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to download ${imageUrl} after ${MAX_RETRIES} attempts: ${errorMessage}`);
            result.failed++;
            result.failedUrls.push(imageUrl);
          }
        }
      }
    }
  }

  return result;
}
