/**
 * Collection bulk backup using Shopify GraphQL Bulk Operations
 *
 * This module orchestrates the complete bulk operation flow for backing up
 * all collections from a Shopify store:
 *
 * 1. Submit bulk operation with collection query
 * 2. Poll for completion (handles RUNNING, COMPLETED, FAILED states)
 * 3. Download and parse JSONL results
 * 4. Write collections.json to output directory
 *
 * Handles both smart collections (with ruleSet) and manual collections.
 *
 * @module backup/collections-bulk
 * @see https://shopify.dev/api/admin-graphql/2025-01/objects/BulkOperation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GraphQLClient } from '../graphql/client.js';
import type { BackupResult } from '../types.js';
import type { BulkCollectionNode } from '../types/graphql.js';
import { submitBulkOperation, COLLECTION_BULK_QUERY } from '../graphql/bulk-operations.js';
import { pollBulkOperation } from '../graphql/polling.js';
import { downloadBulkOperationResults } from '../graphql/download.js';
import { reconstructBulkData, type BulkOperationRecord } from '../graphql/jsonl.js';

/**
 * Backup all collections using Shopify bulk operations.
 *
 * This function orchestrates the complete bulk operation workflow:
 * - Submits a bulk operation query for all collections
 * - Polls until the operation completes (or fails/times out)
 * - Downloads the JSONL results and parses them
 * - Writes the collections to a JSON file in the output directory
 *
 * Both smart collections (with ruleSet defining automatic product inclusion)
 * and manual collections (with explicit product lists) are backed up.
 *
 * The bulk operation approach is preferred for large stores as it:
 * - Handles pagination automatically
 * - Is not subject to the same rate limits as standard queries
 * - Can export millions of records efficiently
 *
 * @param client - GraphQL client with request method for API calls
 * @param outputDir - Directory where collections.json will be written
 * @returns BackupResult indicating success/failure, count of collections, and any error message
 *
 * @example
 * ```typescript
 * const client = createGraphQLClient(shop, accessToken);
 * const result = await backupCollectionsBulk(client, '/backups/2024-01-15');
 *
 * if (result.success) {
 *   console.log(`Backed up ${result.count} collections`);
 * } else {
 *   console.error(`Backup failed: ${result.error}`);
 * }
 * ```
 */
export async function backupCollectionsBulk(
  client: Pick<GraphQLClient, 'request'>,
  outputDir: string
): Promise<BackupResult> {
  try {
    // Step 1: Submit bulk operation with collection query
    const operationId = await submitBulkOperation(client, COLLECTION_BULK_QUERY);

    // Step 2: Poll for completion
    const completedOperation = await pollBulkOperation(client, operationId, {});

    // Step 3: Download results and reconstruct nested hierarchy
    // Shopify returns flat JSONL with __parentId references - we need to reconstruct
    // the hierarchy (e.g., collection -> products, metafields)
    let collections: BulkCollectionNode[] = [];

    if (completedOperation.url) {
      const flatData = await downloadBulkOperationResults<BulkOperationRecord>(completedOperation.url);
      collections = reconstructBulkData<BulkCollectionNode>(flatData, 'Collection');
    }

    // Step 4: Write collections.json to output directory
    const outputPath = path.join(outputDir, 'collections.json');
    await fs.writeFile(outputPath, JSON.stringify(collections, null, 2), 'utf-8');

    return {
      success: true,
      count: collections.length,
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
