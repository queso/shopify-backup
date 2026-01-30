import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages, type ShopifyClientWrapper } from '../pagination.js';

/**
 * @deprecated Use backupOrdersBulk from ./orders-bulk.js instead.
 * This REST-based function is kept for reference but is no longer used.
 * The bulk operations approach provides better performance and includes metafields.
 */
export async function backupOrders(
  client: ShopifyClientWrapper,
  outputDir: string,
): Promise<BackupResult> {
  try {
    // Fetch all orders using pagination utility
    const { items: allOrders } = await fetchAllPages<Record<string, unknown>>(
      client,
      'orders',
      'orders',
      { extraQuery: { status: 'any' } },
    );

    // TODO: Metafield fetching skipped due to rate limits — use GraphQL bulk ops
    for (const order of allOrders) {
      order.metafields = [];
    }

    await writeFile(
      join(outputDir, 'orders.json'),
      JSON.stringify(allOrders, null, 2),
    );

    return { success: true, count: allOrders.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Orders backup failed:', errorMessage);
    return { success: false, count: 0, error: errorMessage };
  }
}
