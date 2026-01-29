import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages } from '../pagination.js';

/**
 * @deprecated Use backupProductsBulk from ./products-bulk.js instead.
 * This REST-based function is kept for reference but is no longer used.
 * The bulk operations approach provides better performance and includes metafields.
 */
export async function backupProducts(
  client: any,
  outputDir: string,
): Promise<{ result: BackupResult; products: any[] }> {
  try {
    // Fetch all products using pagination utility
    const { items: products } = await fetchAllPages(client, 'products', 'products');

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
  } catch (error: any) {
    console.warn('Products backup failed:', error.message);
    return { result: { success: false, count: 0, error: error.message }, products: [] };
  }
}
