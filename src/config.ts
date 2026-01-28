import type { BackupConfig } from './types.js';

/**
 * Default backup directory if BACKUP_DIR is not set
 */
const DEFAULT_BACKUP_DIR = '/backups/shopify';

/**
 * Default retention period in days if RETENTION_DAYS is not set
 */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Reads configuration from environment variables and returns a validated BackupConfig.
 * Throws an error if required environment variables are missing or empty.
 *
 * Required environment variables:
 * - SHOPIFY_STORE: The Shopify store domain (e.g., 'arcane-layer.myshopify.com')
 * - SHOPIFY_ACCESS_TOKEN: Shopify Admin API access token
 *
 * Optional environment variables:
 * - BACKUP_DIR: Directory to store backups (default: '/backups/shopify')
 * - RETENTION_DAYS: Number of days to retain backups (default: 30)
 */
export function getConfig(): BackupConfig {
  const shopifyStore = process.env.SHOPIFY_STORE;
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const backupDir = process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  const retentionDaysRaw = process.env.RETENTION_DAYS;

  if (!shopifyStore) {
    throw new Error('Required environment variable SHOPIFY_STORE is missing or empty');
  }

  if (!shopifyAccessToken) {
    throw new Error('Required environment variable SHOPIFY_ACCESS_TOKEN is missing or empty');
  }

  let retentionDays = DEFAULT_RETENTION_DAYS;
  if (retentionDaysRaw !== undefined) {
    const parsed = parseInt(retentionDaysRaw, 10);
    if (!isNaN(parsed)) {
      retentionDays = parsed;
    }
  }

  return {
    shopifyStore,
    shopifyAccessToken,
    backupDir,
    retentionDays,
  };
}
