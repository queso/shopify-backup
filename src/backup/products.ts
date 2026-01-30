import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages, type ShopifyClientWrapper } from '../pagination.js';

interface ShopifyProduct {
  metafields?: unknown[];
  variants?: Array<{ metafields?: unknown[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * @deprecated Use backupProductsBulk from ./products-bulk.js instead.
 * This REST-based function is kept for reference but is no longer used.
 * The bulk operations approach provides better performance and includes metafields.
 */
export async function backupProducts(
  client: ShopifyClientWrapper,
  outputDir: string,
): Promise<{ result: BackupResult; products: ShopifyProduct[] }> {
  try {
    // Fetch all products using pagination utility
    const { items: products } = await fetchAllPages<ShopifyProduct>(client, 'products', 'products');

    // TODO: Metafield fetching via individual REST calls hits rate limits too aggressively.
    // Consider using GraphQL bulk operations for metafields in a future iteration.
    for (const product of products) {
      product.metafields = [];
      for (const variant of product.variants || []) {
        variant.metafields = [];
      }
    }
    const allProducts = products;

    await writeFile(
      join(outputDir, 'products.json'),
      JSON.stringify(allProducts, null, 2),
    );

    return { result: { success: true, count: allProducts.length }, products: allProducts };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Products backup failed:', errorMessage);
    return { result: { success: false, count: 0, error: errorMessage }, products: [] };
  }
}
