import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages } from '../pagination.js';

export async function backupOrders(
  client: any,
  outputDir: string,
): Promise<BackupResult> {
  try {
    // Fetch all orders using pagination utility
    const { items: allOrders } = await fetchAllPages(
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
  } catch (error: any) {
    console.warn('Orders backup failed:', error.message);
    return { success: false, count: 0, error: error.message };
  }
}
