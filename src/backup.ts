import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BackupConfig, BackupStatus } from './types.js';
import type { BulkProductNode } from './types/graphql.js';
import { createShopifyClient } from './shopify.js';
import { createGraphQLClient } from './graphql/client.js';
import { backupProductsBulk } from './backup/products-bulk.js';
import { backupCustomersBulk } from './backup/customers-bulk.js';
import { backupOrdersBulk } from './backup/orders-bulk.js';
import { backupCollectionsBulk } from './backup/collections-bulk.js';
import { backupContent } from './backup/content.js';
import { downloadProductImages } from './images.js';
import { cleanupOldBackups } from './cleanup.js';

export async function runBackup(config: BackupConfig): Promise<BackupStatus> {
  const startedAt = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];
  const outputDir = path.join(config.backupDir, today);

  fs.mkdirSync(outputDir, { recursive: true });

  const client = createShopifyClient(config);
  const graphqlClient = createGraphQLClient(config);

  const status: BackupStatus = {
    started_at: startedAt,
    completed_at: '',
    backup_dir: outputDir,
    modules: {},
    counts: {},
    images: { downloaded: 0, failed: 0 },
    failed_images: [],
    cleanup: { deleted: [], kept: [], errors: [] },
    errors: [],
  };

  // Products (using GraphQL bulk operations)
  let productsData: BulkProductNode[] = [];
  try {
    const { result, products } = await backupProductsBulk(graphqlClient, outputDir);
    status.modules['products'] = result.success ? 'success' : 'failed';
    status.counts['products'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Products backup failed: ${result.error}`);
    }
    productsData = products;
  } catch (error: unknown) {
    status.modules['products'] = 'failed';
    status.counts['products'] = 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Products backup failed: ${errorMessage}`);
  }

  // Customers (using GraphQL bulk operations with REST fallback)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ShopifyClientWrapper is compatible with expected REST client type
    const result = await backupCustomersBulk(graphqlClient, outputDir, client as any);
    status.modules['customers'] = result.success ? 'success' : 'failed';
    status.counts['customers'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Customers backup failed: ${result.error}`);
    }
  } catch (error: unknown) {
    status.modules['customers'] = 'failed';
    status.counts['customers'] = 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Customers backup failed: ${errorMessage}`);
  }

  // Orders (using GraphQL bulk operations with REST fallback)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ShopifyClientWrapper is compatible with expected REST client type
    const result = await backupOrdersBulk(graphqlClient, outputDir, client as any);
    status.modules['orders'] = result.success ? 'success' : 'failed';
    status.counts['orders'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Orders backup failed: ${result.error}`);
    }
  } catch (error: unknown) {
    status.modules['orders'] = 'failed';
    status.counts['orders'] = 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Orders backup failed: ${errorMessage}`);
  }

  // Collections (using GraphQL bulk operations)
  try {
    const result = await backupCollectionsBulk(graphqlClient, outputDir);
    status.modules['collections'] = result.success ? 'success' : 'failed';
    status.counts['collections'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Collections backup failed: ${result.error}`);
    }
  } catch (error: unknown) {
    status.modules['collections'] = 'failed';
    status.counts['collections'] = 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Collections backup failed: ${errorMessage}`);
  }

  // Content (pages, blogs, shop metafields) - collections handled separately via bulk ops
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ShopifyClientWrapper is compatible with expected REST client type
    const contentResult = await backupContent(client as any, outputDir);
    status.modules['pages'] = contentResult.pages.success ? 'success' : 'failed';
    status.counts['pages'] = contentResult.pages.count;
    status.modules['blogs'] = contentResult.blogs.success ? 'success' : 'failed';
    status.counts['blogs'] = contentResult.blogs.count;
    status.modules['shop_metafields'] = contentResult.shopMetafields.success ? 'success' : 'failed';
    status.counts['shop_metafields'] = contentResult.shopMetafields.count;

    if (!contentResult.pages.success && contentResult.pages.error) {
      status.errors.push(`Pages backup failed: ${contentResult.pages.error}`);
    }
    if (!contentResult.blogs.success && contentResult.blogs.error) {
      status.errors.push(`Blogs backup failed: ${contentResult.blogs.error}`);
    }
    if (!contentResult.shopMetafields.success && contentResult.shopMetafields.error) {
      status.errors.push(`Shop metafields backup failed: ${contentResult.shopMetafields.error}`);
    }
  } catch (error: unknown) {
    status.modules['pages'] = 'failed';
    status.modules['blogs'] = 'failed';
    status.modules['shop_metafields'] = 'failed';
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Content backup failed: ${errorMessage}`);
  }

  // Images
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BulkProductNode is compatible with ProductWithImages
    const imageResult = await downloadProductImages(productsData as any, outputDir);
    status.images = { downloaded: imageResult.downloaded, failed: imageResult.failed };
    status.failed_images = imageResult.failedUrls;
    if (imageResult.failed > 0 && imageResult.downloaded > 0) {
      status.modules['images'] = 'partial';
    } else if (imageResult.failed > 0) {
      status.modules['images'] = 'failed';
    } else {
      status.modules['images'] = 'success';
    }
  } catch (error: unknown) {
    status.modules['images'] = 'failed';
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Image download failed: ${errorMessage}`);
  }

  // Cleanup
  try {
    const cleanupResult = await cleanupOldBackups(config.backupDir, config.retentionDays);
    status.cleanup = cleanupResult;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.errors.push(`Cleanup failed: ${errorMessage}`);
  }

  status.completed_at = new Date().toISOString();

  // Write status.json
  fs.writeFileSync(
    path.join(outputDir, 'status.json'),
    JSON.stringify(status, null, 2),
  );

  return status;
}
