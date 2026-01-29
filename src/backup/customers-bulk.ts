/**
 * Customer bulk backup using Shopify GraphQL Bulk Operations
 *
 * This module orchestrates the complete bulk operation flow for backing up
 * all customers from a Shopify store:
 *
 * 1. Submit bulk operation with customer query
 * 2. Poll for completion (handles RUNNING, COMPLETED, FAILED states)
 * 3. Download and parse JSONL results
 * 4. Write customers.json to output directory
 *
 * @module backup/customers-bulk
 * @see https://shopify.dev/api/admin-graphql/2025-01/objects/BulkOperation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GraphQLClient } from '../graphql/client.js';
import type { BackupResult } from '../types.js';
import type { BulkCustomerNode } from '../types/graphql.js';
import { submitBulkOperation, CUSTOMER_BULK_QUERY } from '../graphql/bulk-operations.js';
import { pollBulkOperation } from '../graphql/polling.js';
import { downloadBulkOperationResults } from '../graphql/download.js';

/**
 * Backup all customers using Shopify bulk operations.
 *
 * This function orchestrates the complete bulk operation workflow:
 * - Submits a bulk operation query for all customers
 * - Polls until the operation completes (or fails/times out)
 * - Downloads the JSONL results and parses them
 * - Writes the customers to a JSON file in the output directory
 *
 * The bulk operation approach is preferred for large stores as it:
 * - Handles pagination automatically
 * - Is not subject to the same rate limits as standard queries
 * - Can export millions of records efficiently
 *
 * @param client - GraphQL client with request method for API calls
 * @param outputDir - Directory where customers.json will be written
 * @returns BackupResult indicating success/failure, count of customers, and any error message
 *
 * @example
 * ```typescript
 * const client = createGraphQLClient(shop, accessToken);
 * const result = await backupCustomersBulk(client, '/backups/2024-01-15');
 *
 * if (result.success) {
 *   console.log(`Backed up ${result.count} customers`);
 * } else {
 *   console.error(`Backup failed: ${result.error}`);
 * }
 * ```
 */
export async function backupCustomersBulk(
  client: Pick<GraphQLClient, 'request'>,
  outputDir: string
): Promise<BackupResult> {
  try {
    // Step 1: Submit bulk operation with customer query
    const operationId = await submitBulkOperation(client, CUSTOMER_BULK_QUERY);

    // Step 2: Poll for completion
    const completedOperation = await pollBulkOperation(client, operationId, {});

    // Step 3: Download results (handle null URL for empty results)
    // When a store has no customers, the completed operation has url: null
    let customers: BulkCustomerNode[] = [];

    if (completedOperation.url) {
      customers = await downloadBulkOperationResults<BulkCustomerNode>(completedOperation.url);
    }

    // Step 4: Write customers.json to output directory
    const outputPath = path.join(outputDir, 'customers.json');
    await fs.writeFile(outputPath, JSON.stringify(customers, null, 2), 'utf-8');

    return {
      success: true,
      count: customers.length,
    };
  } catch (error) {
    // Handle all errors and return failure result
    // This includes: submission failures, polling timeouts, download errors, and file write errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      count: 0,
      error: errorMessage,
    };
  }
}
