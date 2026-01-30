/**
 * Order bulk backup using Shopify GraphQL Bulk Operations
 *
 * This module orchestrates the complete bulk operation flow for backing up
 * all orders from a Shopify store:
 *
 * 1. Submit bulk operation with order query
 * 2. Poll for completion (handles RUNNING, COMPLETED, FAILED states)
 * 3. Download and parse JSONL results
 * 4. Write orders.json to output directory
 *
 * Falls back to REST API if GraphQL bulk operations fail with ACCESS_DENIED
 * (required for Shopify Basic plans without Protected Customer Data access).
 *
 * @module backup/orders-bulk
 * @see https://shopify.dev/api/admin-graphql/2025-01/objects/BulkOperation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GraphQLClient } from '../graphql/client.js';
import type { BackupResult } from '../types.js';
import type { BulkOrderNode } from '../types/graphql.js';
import { submitBulkOperation, ORDER_BULK_QUERY } from '../graphql/bulk-operations.js';
import { pollBulkOperation } from '../graphql/polling.js';
import { downloadBulkOperationResults } from '../graphql/download.js';
import { reconstructBulkData, type BulkOperationRecord } from '../graphql/jsonl.js';
import { fetchAllPages, type ShopifyClientWrapper } from '../pagination.js';

/**
 * Backup all orders using Shopify bulk operations with REST API fallback.
 *
 * This function orchestrates the complete bulk operation workflow:
 * - Submits a bulk operation query for all orders
 * - Polls until the operation completes (or fails/times out)
 * - Downloads the JSONL results and parses them
 * - Writes the orders to a JSON file in the output directory
 *
 * If GraphQL bulk operations fail with ACCESS_DENIED (common on Basic plans
 * without Protected Customer Data access), automatically falls back to REST API.
 *
 * The bulk operation approach is preferred for large stores as it:
 * - Handles pagination automatically
 * - Is not subject to the same rate limits as standard queries
 * - Can export millions of records efficiently
 *
 * @param graphqlClient - GraphQL client with request method for API calls
 * @param outputDir - Directory where orders.json will be written
 * @param restClient - Optional REST client for fallback (required if fallback is needed)
 * @returns BackupResult indicating success/failure, count of orders, and any error message
 *
 * @example
 * ```typescript
 * const graphqlClient = createGraphQLClient(config);
 * const restClient = createShopifyClient(config);
 * const result = await backupOrdersBulk(graphqlClient, '/backups/2024-01-15', restClient);
 *
 * if (result.success) {
 *   console.log(`Backed up ${result.count} orders`);
 * } else {
 *   console.error(`Backup failed: ${result.error}`);
 * }
 * ```
 */
export async function backupOrdersBulk(
  graphqlClient: Pick<GraphQLClient, 'request'>,
  outputDir: string,
  restClient?: ShopifyClientWrapper
): Promise<BackupResult> {
  try {
    // Step 1: Submit bulk operation with order query
    const operationId = await submitBulkOperation(graphqlClient, ORDER_BULK_QUERY);

    // Step 2: Poll for completion
    const completedOperation = await pollBulkOperation(graphqlClient, operationId, {});

    // Step 3: Download results and reconstruct nested hierarchy
    // Shopify returns flat JSONL with __parentId references - we need to reconstruct
    // the hierarchy (e.g., order -> lineItems, transactions, fulfillments)
    let orders: BulkOrderNode[] = [];

    if (completedOperation.url) {
      const flatData = await downloadBulkOperationResults<BulkOperationRecord>(completedOperation.url);
      orders = reconstructBulkData<BulkOrderNode>(flatData, 'Order');
    }

    // Step 4: Write orders.json to output directory
    const outputPath = path.join(outputDir, 'orders.json');
    await fs.writeFile(outputPath, JSON.stringify(orders, null, 2), 'utf-8');

    return {
      success: true,
      count: orders.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if this is an ACCESS_DENIED error - fall back to REST API
    if (errorMessage.includes('ACCESS_DENIED') && restClient) {
      console.log('[orders] GraphQL bulk operation denied, falling back to REST API');
      return backupOrdersRest(restClient, outputDir);
    }

    return {
      success: false,
      count: 0,
      error: errorMessage,
    };
  }
}

/**
 * Backup orders using REST API (fallback for plans without Protected Customer Data access)
 */
async function backupOrdersRest(
  client: ShopifyClientWrapper,
  outputDir: string
): Promise<BackupResult> {
  try {
    const { items: allOrders } = await fetchAllPages<Record<string, unknown>>(
      client,
      'orders',
      'orders',
      { extraQuery: { status: 'any' } }
    );

    // REST API doesn't include metafields efficiently - initialize as empty
    for (const order of allOrders) {
      order.metafields = [];
    }

    await fs.writeFile(
      path.join(outputDir, 'orders.json'),
      JSON.stringify(allOrders, null, 2),
    );

    return { success: true, count: allOrders.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, count: 0, error: errorMessage };
  }
}
