import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupResult } from '../types.js';
import { fetchAllPages } from '../pagination.js';

export async function backupCustomers(
  client: any,
  outputDir: string,
): Promise<BackupResult> {
  try {
    // Fetch all customers using pagination utility
    const { items: allCustomers } = await fetchAllPages(client, 'customers', 'customers');

    // TODO: Metafield fetching skipped due to rate limits — use GraphQL bulk ops
    for (const customer of allCustomers) {
      customer.metafields = [];
    }

    await fs.writeFile(
      path.join(outputDir, 'customers.json'),
      JSON.stringify(allCustomers, null, 2),
    );

    return { success: true, count: allCustomers.length };
  } catch (error: any) {
    console.warn('Customers backup failed:', error.message);
    return { success: false, count: 0, error: error.message };
  }
}
