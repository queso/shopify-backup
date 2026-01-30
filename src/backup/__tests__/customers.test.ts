/**
 * Integration tests for customer bulk backup in the runBackup flow
 *
 * Tests that runBackup properly:
 * - Calls backupCustomersBulk instead of REST backup
 * - Handles customer backup failures gracefully (continues with other backups)
 * - Reports customer counts correctly in status
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  BackupConfig,
  BackupResult,
  BackupStatus,
  ContentBackupResult,
  ImageDownloadResult,
  CleanupResult,
} from '../../types.js';
import type { BulkProductNode } from '../../types/graphql.js';

// Mock all backup modules
vi.mock('../products.js', () => ({ backupProducts: vi.fn() }));
vi.mock('../products-bulk.js', () => ({ backupProductsBulk: vi.fn() }));
vi.mock('../customers-bulk.js', () => ({ backupCustomersBulk: vi.fn() }));
vi.mock('../orders-bulk.js', () => ({ backupOrdersBulk: vi.fn() }));
vi.mock('../collections-bulk.js', () => ({ backupCollectionsBulk: vi.fn() }));
vi.mock('../content.js', () => ({ backupContent: vi.fn() }));
vi.mock('../../images.js', () => ({ downloadProductImages: vi.fn() }));
vi.mock('../../cleanup.js', () => ({ cleanupOldBackups: vi.fn() }));
vi.mock('../../shopify.js', () => ({
  createShopifyClient: vi.fn().mockReturnValue({}),
  withRetry: vi.fn(<T>(fn: () => Promise<T>) => fn()),
}));
vi.mock('../../graphql/client.js', () => ({
  createGraphQLClient: vi.fn().mockReturnValue({ request: vi.fn() }),
}));

// Import the module under test after mocks are set up
import { runBackup } from '../../backup.js';
import { backupProductsBulk } from '../products-bulk.js';
import { backupCustomersBulk } from '../customers-bulk.js';
import { backupOrdersBulk } from '../orders-bulk.js';
import { backupCollectionsBulk } from '../collections-bulk.js';
import { backupContent } from '../content.js';
import { downloadProductImages } from '../../images.js';
import { cleanupOldBackups } from '../../cleanup.js';

function makeConfig(backupDir: string): BackupConfig {
  return {
    shopifyStore: 'test.myshopify.com',
    shopifyAccessToken: 'shpat_test',
    backupDir,
    retentionDays: 30,
  };
}

function successResult(count: number): BackupResult {
  return { success: true, count };
}

function failedResult(error: string): BackupResult {
  return { success: false, count: 0, error };
}

interface MockProduct {
  id: string;
  title: string;
  images: unknown[];
}

function setupAllMocksSuccess(): void {
  const productsData: MockProduct[] = [{ id: 'gid://shopify/Product/1', title: 'Test Product', images: [] }];
  vi.mocked(backupProductsBulk).mockResolvedValue({
    result: successResult(10),
    products: productsData as unknown as BulkProductNode[],
  });
  vi.mocked(backupCustomersBulk).mockResolvedValue(successResult(5));
  vi.mocked(backupOrdersBulk).mockResolvedValue(successResult(8));
  vi.mocked(backupCollectionsBulk).mockResolvedValue(successResult(2));
  vi.mocked(backupContent).mockResolvedValue({
    pages: successResult(3),
    collections: successResult(2),
    blogs: successResult(1),
    shopMetafields: successResult(4),
  } as ContentBackupResult);
  vi.mocked(downloadProductImages).mockResolvedValue({
    success: true,
    downloaded: 15,
    failed: 0,
    failedUrls: [],
  } as ImageDownloadResult);
  vi.mocked(cleanupOldBackups).mockResolvedValue({
    deleted: [],
    kept: [],
    errors: [],
  } as CleanupResult);
}

describe('runBackup - Customer Bulk Backup Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-bulk-test-'));
    vi.clearAllMocks();
    setupAllMocksSuccess();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('bulk backup usage', () => {
    it('should call backupCustomersBulk instead of REST backup', async () => {
      const config = makeConfig(tempDir);

      await runBackup(config);

      // Verify bulk backup was called
      expect(backupCustomersBulk).toHaveBeenCalledTimes(1);
    });

    it('should pass GraphQL client, output directory, and REST client to backupCustomersBulk', async () => {
      const config = makeConfig(tempDir);

      await runBackup(config);

      // Verify it was called with GraphQL client, output directory, and REST client for fallback
      expect(backupCustomersBulk).toHaveBeenCalledWith(
        expect.anything(), // GraphQL client
        expect.stringContaining(tempDir), // Output directory path
        expect.anything() // REST client for fallback
      );
    });
  });

  describe('graceful degradation on failure', () => {
    it('should continue with other backups when customer bulk backup fails', async () => {
      // Make customer backup fail
      vi.mocked(backupCustomersBulk).mockResolvedValue(
        failedResult('Bulk operation failed: TIMEOUT')
      );
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      // Other modules should still have been called
      expect(backupProductsBulk).toHaveBeenCalled();
      expect(backupOrdersBulk).toHaveBeenCalled();
      expect(backupContent).toHaveBeenCalled();
      expect(downloadProductImages).toHaveBeenCalled();
      expect(cleanupOldBackups).toHaveBeenCalled();

      // Should have error recorded
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.toLowerCase().includes('customer'))
      ).toBe(true);
    });

    it('should mark customers module as failed when bulk backup fails', async () => {
      vi.mocked(backupCustomersBulk).mockResolvedValue(
        failedResult('Bulk operation error')
      );
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      expect(result.modules['customers']).toBe('failed');
    });

    it('should continue with other backups when customer bulk backup throws', async () => {
      // Make customer backup throw an exception
      vi.mocked(backupCustomersBulk).mockRejectedValue(
        new Error('GraphQL client error')
      );
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      // Other modules should still have been called
      expect(backupProductsBulk).toHaveBeenCalled();
      expect(backupOrdersBulk).toHaveBeenCalled();
      expect(backupContent).toHaveBeenCalled();

      // Error should be captured
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.modules['customers']).toBe('failed');
    });

    it('should record customer backup error in status.json', async () => {
      const errorMessage = 'Bulk operation canceled by Shopify';
      vi.mocked(backupCustomersBulk).mockResolvedValue(failedResult(errorMessage));
      const config = makeConfig(tempDir);

      await runBackup(config);

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(
        fs.readFileSync(statusPath, 'utf-8')
      );

      expect(status.modules['customers']).toBe('failed');
      expect(
        status.errors.some((e) => e.includes('Customers backup failed'))
      ).toBe(true);
    });
  });

  describe('successful backup status', () => {
    it('should report customer count in status on successful bulk backup', async () => {
      vi.mocked(backupCustomersBulk).mockResolvedValue(successResult(42));
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      expect(result.counts['customers']).toBe(42);
      expect(result.modules['customers']).toBe('success');
    });

    it('should write customer count to status.json', async () => {
      vi.mocked(backupCustomersBulk).mockResolvedValue(successResult(100));
      const config = makeConfig(tempDir);

      await runBackup(config);

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(
        fs.readFileSync(statusPath, 'utf-8')
      );

      expect(status.counts['customers']).toBe(100);
      expect(status.modules['customers']).toBe('success');
    });

    it('should handle zero customers gracefully', async () => {
      vi.mocked(backupCustomersBulk).mockResolvedValue(successResult(0));
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      expect(result.counts['customers']).toBe(0);
      expect(result.modules['customers']).toBe('success');
      expect(result.errors).toEqual([]);
    });
  });
});
