import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BackupConfig, BackupStatus } from './types.js';
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
  let productsData: any[] = [];
  try {
    const { result, products } = await backupProductsBulk(graphqlClient, outputDir);
    status.modules['products'] = result.success ? 'success' : 'failed';
    status.counts['products'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Products backup failed: ${result.error}`);
    }
    productsData = products;
  } catch (error: any) {
    status.modules['products'] = 'failed';
    status.counts['products'] = 0;
    status.errors.push(`Products backup failed: ${error.message}`);
  }

  // Customers (using GraphQL bulk operations with REST fallback)
  try {
    const result = await backupCustomersBulk(graphqlClient, outputDir, client);
    status.modules['customers'] = result.success ? 'success' : 'failed';
    status.counts['customers'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Customers backup failed: ${result.error}`);
    }
  } catch (error: any) {
    status.modules['customers'] = 'failed';
    status.counts['customers'] = 0;
    status.errors.push(`Customers backup failed: ${error.message}`);
  }

  // Orders (using GraphQL bulk operations with REST fallback)
  try {
    const result = await backupOrdersBulk(graphqlClient, outputDir, client);
    status.modules['orders'] = result.success ? 'success' : 'failed';
    status.counts['orders'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Orders backup failed: ${result.error}`);
    }
  } catch (error: any) {
    status.modules['orders'] = 'failed';
    status.counts['orders'] = 0;
    status.errors.push(`Orders backup failed: ${error.message}`);
  }

  // Collections (using GraphQL bulk operations)
  try {
    const result = await backupCollectionsBulk(graphqlClient, outputDir);
    status.modules['collections'] = result.success ? 'success' : 'failed';
    status.counts['collections'] = result.count;
    if (!result.success && result.error) {
      status.errors.push(`Collections backup failed: ${result.error}`);
    }
  } catch (error: any) {
    status.modules['collections'] = 'failed';
    status.counts['collections'] = 0;
    status.errors.push(`Collections backup failed: ${error.message}`);
  }

  // Content (pages, blogs, shop metafields) - collections handled separately via bulk ops
  try {
    const contentResult = await backupContent(client, outputDir);
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
  } catch (error: any) {
    status.modules['pages'] = 'failed';
    status.modules['blogs'] = 'failed';
    status.modules['shop_metafields'] = 'failed';
    status.errors.push(`Content backup failed: ${error.message}`);
  }

  // Images
  try {
    const imageResult = await downloadProductImages(productsData, outputDir);
    status.images = { downloaded: imageResult.downloaded, failed: imageResult.failed };
    status.failed_images = imageResult.failedUrls;
    if (imageResult.failed > 0 && imageResult.downloaded > 0) {
      status.modules['images'] = 'partial';
    } else if (imageResult.failed > 0) {
      status.modules['images'] = 'failed';
    } else {
      status.modules['images'] = 'success';
    }
  } catch (error: any) {
    status.modules['images'] = 'failed';
    status.errors.push(`Image download failed: ${error.message}`);
  }

  // Cleanup
  try {
    const cleanupResult = await cleanupOldBackups(config.backupDir, config.retentionDays);
    status.cleanup = cleanupResult;
  } catch (error: any) {
    status.errors.push(`Cleanup failed: ${error.message}`);
  }

  status.completed_at = new Date().toISOString();

  // Write status.json
  fs.writeFileSync(
    path.join(outputDir, 'status.json'),
    JSON.stringify(status, null, 2),
  );

  return status;
}
