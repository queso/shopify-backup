import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages, type ShopifyClientWrapper } from '../pagination.js';

interface CustomerData {
  metafields?: unknown[];
  [key: string]: unknown;
}

export async function backupCustomers(
  client: ShopifyClientWrapper,
  outputDir: string,
): Promise<BackupResult> {
  try {
    // Fetch all customers using pagination utility
    const { items: allCustomers } = await fetchAllPages<CustomerData>(client, 'customers', 'customers');

    // TODO: Metafield fetching skipped due to rate limits — use GraphQL bulk ops
    for (const customer of allCustomers) {
      customer.metafields = [];
    }

    await fs.writeFile(
      path.join(outputDir, 'customers.json'),
      JSON.stringify(allCustomers, null, 2),
    );

    return { success: true, count: allCustomers.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Customers backup failed:', errorMessage);
    return { success: false, count: 0, error: errorMessage };
  }
}
