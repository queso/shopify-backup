/**
 * Shared TypeScript types for the Shopify Backup application
 */

/**
 * Configuration for the backup process, loaded from environment variables
 */
export interface BackupConfig {
  /** Shopify store domain (e.g., 'arcane-layer.myshopify.com') */
  shopifyStore: string;
  /** Shopify Admin API access token */
  shopifyAccessToken: string;
  /** Directory to store backups (default: '/backups/shopify') */
  backupDir: string;
  /** Number of days to retain backups (default: 30) */
  retentionDays: number;
}

/**
 * Result from a backup module operation
 */
export interface BackupResult {
  /** Whether the backup completed successfully */
  success: boolean;
  /** Number of items backed up */
  count: number;
  /** Error message if the backup failed */
  error?: string;
}

/**
 * Result from image download operations
 */
export interface ImageDownloadResult {
  /** Whether at least some images were downloaded */
  success: boolean;
  /** Number of images successfully downloaded */
  downloaded: number;
  /** Number of images that failed to download */
  failed: number;
  /** URLs of images that failed to download */
  failedUrls: string[];
}

/**
 * Result from retention cleanup operations
 */
export interface CleanupResult {
  /** Directory names that were deleted */
  deleted: string[];
  /** Directory names that were kept */
  kept: string[];
  /** Error messages for any failed deletions */
  errors: string[];
}

/**
 * Result from content backup (pages, collections, blogs, shop metafields)
 */
export interface ContentBackupResult {
  pages: BackupResult;
  collections: BackupResult;
  blogs: BackupResult;
  shopMetafields: BackupResult;
}

/**
 * Comprehensive status of a backup run, written to status.json
 */
export interface BackupStatus {
  /** ISO timestamp when backup started */
  started_at: string;
  /** ISO timestamp when backup completed */
  completed_at: string;
  /** Path to the backup directory for this run */
  backup_dir: string;
  /** Status of each backup module */
  modules: Record<string, 'success' | 'failed' | 'partial'>;
  /** Count of items backed up per module */
  counts: Record<string, number>;
  /** Image download statistics */
  images: {
    downloaded: number;
    failed: number;
  };
  /** URLs of images that failed to download */
  failed_images: string[];
  /** Cleanup operation results */
  cleanup: CleanupResult;
  /** Error messages from failed modules */
  errors: string[];
}

/**
 * Options for the retry wrapper
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelay?: number;
  /** Maximum delay in milliseconds between retries (default: 30000) */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

/**
 * Generic Shopify REST API response structure
 */
export interface ShopifyRestResponse<T> {
  body: T;
  pageInfo?: {
    nextPage?: {
      query: Record<string, unknown>;
    };
  };
}

/**
 * Response body for products endpoint
 */
export interface ProductsBody {
  products: any[];
}

/**
 * Response body for customers endpoint
 */
export interface CustomersBody {
  customers: any[];
}

/**
 * Response body for orders endpoint
 */
export interface OrdersBody {
  orders: any[];
}

/**
 * Response body for pages endpoint
 */
export interface PagesBody {
  pages: any[];
}

/**
 * Response body for smart_collections endpoint
 */
export interface SmartCollectionsBody {
  smart_collections: any[];
}

/**
 * Response body for custom_collections endpoint
 */
export interface CustomCollectionsBody {
  custom_collections: any[];
}

/**
 * Response body for blogs endpoint
 */
export interface BlogsBody {
  blogs: any[];
}

/**
 * Response body for metafields endpoint
 */
export interface MetafieldsBody {
  metafields: any[];
}

/**
 * Response body for articles endpoint
 */
export interface ArticlesBody {
  articles: any[];
}
