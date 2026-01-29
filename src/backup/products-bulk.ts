/**
 * Product bulk backup using Shopify GraphQL Bulk Operations
 *
 * This module orchestrates the complete bulk operation flow for backing up
 * all products from a Shopify store:
 *
 * 1. Submit bulk operation with product query
 * 2. Poll for completion (handles RUNNING, COMPLETED, FAILED states)
 * 3. Download and parse JSONL results
 * 4. Write products.json to output directory
 *
 * This module also returns the products array for downstream image downloading.
 *
 * @module backup/products-bulk
 * @see https://shopify.dev/api/admin-graphql/2025-01/objects/BulkOperation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { GraphQLClient } from '../graphql/client.js';
import type { BackupResult } from '../types.js';
import type { BulkProductNode } from '../types/graphql.js';
import { submitBulkOperation, PRODUCT_BULK_QUERY } from '../graphql/bulk-operations.js';
import { pollBulkOperation } from '../graphql/polling.js';
import { downloadBulkOperationResults } from '../graphql/download.js';
import { reconstructBulkData, type BulkOperationRecord } from '../graphql/jsonl.js';

/**
 * Result from products bulk backup including both status and product data
 */
export interface ProductsBulkResult {
  /** Standard backup result with success/count/error */
  result: BackupResult;
  /** Products array for downstream processing (e.g., image download) */
  products: BulkProductNode[];
}

/**
 * Backup all products using Shopify bulk operations.
 *
 * This function orchestrates the complete bulk operation workflow:
 * - Submits a bulk operation query for all products
 * - Polls until the operation completes (or fails/times out)
 * - Downloads the JSONL results and parses them
 * - Writes the products to a JSON file in the output directory
 *
 * Unlike other backup functions, this returns both the result and the products
 * array because product data is needed for downstream image downloading.
 *
 * The bulk operation approach is preferred for large stores as it:
 * - Handles pagination automatically
 * - Is not subject to the same rate limits as standard queries
 * - Can export millions of records efficiently
 *
 * @param client - GraphQL client with request method for API calls
 * @param outputDir - Directory where products.json will be written
 * @returns Object containing BackupResult and products array
 *
 * @example
 * ```typescript
 * const client = createGraphQLClient(shop, accessToken);
 * const { result, products } = await backupProductsBulk(client, '/backups/2024-01-15');
 *
 * if (result.success) {
 *   console.log(`Backed up ${result.count} products`);
 *   // Use products for image downloading
 *   await downloadProductImages(products, outputDir);
 * } else {
 *   console.error(`Backup failed: ${result.error}`);
 * }
 * ```
 */
export async function backupProductsBulk(
  client: Pick<GraphQLClient, 'request'>,
  outputDir: string
): Promise<ProductsBulkResult> {
  try {
    // Step 1: Submit bulk operation with product query
    const operationId = await submitBulkOperation(client, PRODUCT_BULK_QUERY);

    // Step 2: Poll for completion
    const completedOperation = await pollBulkOperation(client, operationId, {});

    // Step 3: Download results and reconstruct nested hierarchy
    // Shopify returns flat JSONL with __parentId references - we need to reconstruct
    // the hierarchy (e.g., product -> variants -> variant metafields)
    let products: BulkProductNode[] = [];

    if (completedOperation.url) {
      const flatData = await downloadBulkOperationResults<BulkOperationRecord>(completedOperation.url);
      products = reconstructBulkData<BulkProductNode>(flatData, 'Product');
    }

    // Step 4: Write products.json to output directory
    const outputPath = path.join(outputDir, 'products.json');
    await fs.writeFile(outputPath, JSON.stringify(products, null, 2), 'utf-8');

    return {
      result: {
        success: true,
        count: products.length,
      },
      products,
    };
  } catch (error) {
    // Handle all errors and return failure result
    // This includes: submission failures, polling timeouts, download errors, and file write errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      result: {
        success: false,
        count: 0,
        error: errorMessage,
      },
      products: [],
    };
  }
}
