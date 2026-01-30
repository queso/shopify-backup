import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { BackupConfig, BackupResult, BackupStatus, ContentBackupResult, ImageDownloadResult, CleanupResult } from '../types.js';
import type { BulkProductNode } from '../types/graphql.js';
import type { GraphQLClient } from '../graphql/client.js';
import type { ProductsBulkResult } from '../backup/products-bulk.js';

vi.mock('../backup/products.js', () => ({ backupProducts: vi.fn() }));
vi.mock('../backup/products-bulk.js', () => ({ backupProductsBulk: vi.fn() }));
vi.mock('../backup/customers-bulk.js', () => ({ backupCustomersBulk: vi.fn() }));
vi.mock('../backup/orders.js', () => ({ backupOrders: vi.fn() }));
vi.mock('../backup/orders-bulk.js', () => ({ backupOrdersBulk: vi.fn() }));
vi.mock('../backup/collections-bulk.js', () => ({ backupCollectionsBulk: vi.fn() }));
vi.mock('../backup/content.js', () => ({ backupContent: vi.fn() }));
vi.mock('../images.js', () => ({ downloadProductImages: vi.fn() }));
vi.mock('../cleanup.js', () => ({ cleanupOldBackups: vi.fn() }));
vi.mock('../shopify.js', () => ({ createShopifyClient: vi.fn().mockReturnValue({ rest: {} }) }));
vi.mock('../graphql/client.js', () => ({ createGraphQLClient: vi.fn().mockReturnValue({ request: vi.fn() }) }));

import { runBackup } from '../backup.js';
import { backupProducts } from '../backup/products.js';
import { backupProductsBulk } from '../backup/products-bulk.js';
import { backupCustomersBulk } from '../backup/customers-bulk.js';
import { backupOrders } from '../backup/orders.js';
import { backupOrdersBulk } from '../backup/orders-bulk.js';
import { backupCollectionsBulk } from '../backup/collections-bulk.js';
import { backupContent } from '../backup/content.js';
import { downloadProductImages } from '../images.js';
import { cleanupOldBackups } from '../cleanup.js';
import { createGraphQLClient } from '../graphql/client.js';

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

function createMockProduct(id: string = '1', title: string = 'Test Product'): BulkProductNode {
  return {
    id: `gid://shopify/Product/${id}`,
    legacyResourceId: id,
    title,
    handle: title.toLowerCase().replace(/\s+/g, '-'),
    descriptionHtml: '<p>Test description</p>',
    vendor: 'Test Vendor',
    productType: 'Test Type',
    status: 'ACTIVE' as const,
    tags: [],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    publishedAt: '2024-01-15T10:00:00Z',
    templateSuffix: null,
    giftCardTemplateSuffix: null,
    hasOnlyDefaultVariant: true,
    hasOutOfStockVariants: false,
    tracksInventory: false,
    totalInventory: 0,
    totalVariants: 1,
    options: [],
    images: [],
    featuredImage: null,
    seo: { title: null, description: null },
    priceRangeV2: {
      minVariantPrice: { amount: '0.00', currencyCode: 'USD' },
      maxVariantPrice: { amount: '0.00', currencyCode: 'USD' }
    },
    metafields: [],
    variants: []
  };
}

function setupAllMocksSuccess(): void {
  const productsData: BulkProductNode[] = [createMockProduct()];
  vi.mocked(backupProductsBulk).mockResolvedValue({ result: successResult(10), products: productsData } as ProductsBulkResult);
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

describe('runBackup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
    vi.clearAllMocks();
    setupAllMocksSuccess();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create a date-stamped directory under backupDir', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const expectedDir = path.join(tempDir, today);
    expect(fs.existsSync(expectedDir)).toBe(true);
  });

  it('should call all backup modules', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    expect(backupProductsBulk).toHaveBeenCalled();
    expect(backupCustomersBulk).toHaveBeenCalled();
    expect(backupOrdersBulk).toHaveBeenCalled();
    expect(backupCollectionsBulk).toHaveBeenCalled();
    expect(backupContent).toHaveBeenCalled();
    expect(downloadProductImages).toHaveBeenCalled();
    expect(cleanupOldBackups).toHaveBeenCalled();
  });

  it('should write status.json with correct structure', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const statusPath = path.join(tempDir, today, 'status.json');
    expect(fs.existsSync(statusPath)).toBe(true);

    const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(status).toHaveProperty('started_at');
    expect(status).toHaveProperty('completed_at');
    expect(status).toHaveProperty('backup_dir');
    expect(status).toHaveProperty('modules');
    expect(status).toHaveProperty('counts');
    expect(status).toHaveProperty('images');
    expect(status).toHaveProperty('failed_images');
    expect(status).toHaveProperty('cleanup');
    expect(status).toHaveProperty('errors');
  });

  it('should return a BackupStatus object', async () => {
    const config = makeConfig(tempDir);
    const result = await runBackup(config);

    expect(result.started_at).toBeDefined();
    expect(result.completed_at).toBeDefined();
    expect(result.backup_dir).toContain(tempDir);
    expect(result.modules).toBeDefined();
    expect(result.errors).toEqual([]);
  });

  it('should continue on partial failure and include errors', async () => {
    vi.mocked(backupCustomersBulk).mockRejectedValue(new Error('API rate limit'));
    const config = makeConfig(tempDir);

    const result = await runBackup(config);

    // Other modules should still have been called
    expect(backupProductsBulk).toHaveBeenCalled();
    expect(backupOrdersBulk).toHaveBeenCalled();
    expect(backupContent).toHaveBeenCalled();

    // Errors should be captured
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes('API rate limit'))).toBe(true);
    expect(result.modules['customers']).toBe('failed');
  });

  it('should include failed module status in status.json', async () => {
    vi.mocked(backupOrdersBulk).mockRejectedValue(new Error('Connection timeout'));
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const statusPath = path.join(tempDir, today, 'status.json');
    const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

    expect(status.modules['orders']).toBe('failed');
    expect(status.errors.some((e: string) => e.includes('Connection timeout'))).toBe(true);
  });

  it('should have valid ISO timestamps in status.json', async () => {
    const config = makeConfig(tempDir);
    const beforeRun = new Date().toISOString();
    const result = await runBackup(config);
    const afterRun = new Date().toISOString();

    // Timestamps should be valid ISO strings
    expect(() => new Date(result.started_at)).not.toThrow();
    expect(() => new Date(result.completed_at)).not.toThrow();

    // started_at should be within our test window
    expect(result.started_at >= beforeRun).toBe(true);
    expect(result.completed_at <= afterRun).toBe(true);
    expect(result.completed_at >= result.started_at).toBe(true);
  });

  // WI-028: Bulk Orders Integration Tests
  describe('bulk orders integration', () => {
    it('should call backupOrdersBulk instead of REST backupOrders', async () => {
      vi.mocked(backupOrdersBulk).mockResolvedValue(successResult(12));
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupOrdersBulk).toHaveBeenCalled();
      expect(backupOrders).not.toHaveBeenCalled();
    });

    it('should pass GraphQL client to backupOrdersBulk', async () => {
      const mockGraphQLClient: Pick<GraphQLClient, 'request'> = { request: vi.fn() };
      vi.mocked(createGraphQLClient).mockReturnValue(mockGraphQLClient as GraphQLClient);
      vi.mocked(backupOrdersBulk).mockResolvedValue(successResult(5));
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupOrdersBulk).toHaveBeenCalledWith(
        mockGraphQLClient,
        expect.stringContaining(tempDir),
        expect.objectContaining({ rest: expect.anything() })
      );
    });

    it('should report orders module status correctly in status.json', async () => {
      vi.mocked(backupOrdersBulk).mockResolvedValue(successResult(25));
      const config = makeConfig(tempDir);

      await runBackup(config);

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

      expect(status.modules['orders']).toBe('success');
      expect(status.counts['orders']).toBe(25);
    });

    it('should continue with other modules when orders backup fails', async () => {
      vi.mocked(backupOrdersBulk).mockRejectedValue(new Error('Bulk operation timeout'));
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      // Other modules should still have been called
      expect(backupProductsBulk).toHaveBeenCalled();
      expect(backupCustomersBulk).toHaveBeenCalled();
      expect(backupContent).toHaveBeenCalled();
      expect(downloadProductImages).toHaveBeenCalled();

      // Orders should be marked as failed
      expect(result.modules['orders']).toBe('failed');
      expect(result.errors.some((e: string) => e.includes('Bulk operation timeout'))).toBe(true);
    });

    it('should handle backupOrdersBulk returning error result', async () => {
      vi.mocked(backupOrdersBulk).mockResolvedValue({
        success: false,
        count: 0,
        error: 'GraphQL query failed',
      });
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      expect(result.modules['orders']).toBe('failed');
      expect(result.errors.some((e: string) => e.includes('GraphQL query failed'))).toBe(true);
    });
  });

  // WI-035: Bulk Collections Integration Tests
  describe('bulk collections integration', () => {
    it('should call backupCollectionsBulk for collections', async () => {
      vi.mocked(backupCollectionsBulk).mockResolvedValue(successResult(8));
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupCollectionsBulk).toHaveBeenCalled();
    });

    it('should pass GraphQL client to backupCollectionsBulk', async () => {
      const mockGraphQLClient: Pick<GraphQLClient, 'request'> = { request: vi.fn() };
      vi.mocked(createGraphQLClient).mockReturnValue(mockGraphQLClient as GraphQLClient);
      vi.mocked(backupCollectionsBulk).mockResolvedValue(successResult(5));
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupCollectionsBulk).toHaveBeenCalledWith(
        mockGraphQLClient,
        expect.stringContaining(tempDir)
      );
    });

    it('should report collections module status correctly', async () => {
      vi.mocked(backupCollectionsBulk).mockResolvedValue(successResult(15));
      const config = makeConfig(tempDir);

      await runBackup(config);

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

      expect(status.modules['collections']).toBe('success');
      expect(status.counts['collections']).toBe(15);
    });

    it('should still use REST backup for pages and blogs via backupContent', async () => {
      vi.mocked(backupCollectionsBulk).mockResolvedValue(successResult(5));
      const config = makeConfig(tempDir);

      await runBackup(config);

      // backupContent should still be called for pages and blogs
      expect(backupContent).toHaveBeenCalled();

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

      // Pages and blogs should come from backupContent (REST)
      expect(status.modules['pages']).toBe('success');
      expect(status.modules['blogs']).toBe('success');
    });

    it('should handle backupCollectionsBulk failure independently', async () => {
      vi.mocked(backupCollectionsBulk).mockRejectedValue(new Error('Collection bulk failed'));
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      // Other modules should succeed
      expect(backupProductsBulk).toHaveBeenCalled();
      expect(backupCustomersBulk).toHaveBeenCalled();
      expect(backupContent).toHaveBeenCalled();

      // Collections should be marked as failed
      expect(result.modules['collections']).toBe('failed');
      expect(result.errors.some((e: string) => e.includes('Collection bulk failed'))).toBe(true);
    });
  });

  // WI-032: Bulk Products Integration Tests
  describe('bulk products integration', () => {
    it('should call backupProductsBulk instead of REST backupProducts', async () => {
      const productsData: BulkProductNode[] = [createMockProduct('1', 'Test')];
      vi.mocked(backupProductsBulk).mockResolvedValue({ result: successResult(10), products: productsData });
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupProductsBulk).toHaveBeenCalled();
      expect(backupProducts).not.toHaveBeenCalled();
    });

    it('should pass GraphQL client to backupProductsBulk', async () => {
      const mockGraphQLClient: Pick<GraphQLClient, 'request'> = { request: vi.fn() };
      vi.mocked(createGraphQLClient).mockReturnValue(mockGraphQLClient as GraphQLClient);
      const productsData: BulkProductNode[] = [createMockProduct('1', 'Test')];
      vi.mocked(backupProductsBulk).mockResolvedValue({ result: successResult(5), products: productsData });
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(backupProductsBulk).toHaveBeenCalledWith(
        mockGraphQLClient,
        expect.stringContaining(tempDir)
      );
    });

    it('should pass products array from bulk result to downloadProductImages', async () => {
      const productsData: BulkProductNode[] = [
        { ...createMockProduct('1', 'Product 1'), images: [{ id: 'gid://shopify/ProductImage/1', url: 'http://example.com/1.jpg', altText: null, width: null, height: null }] },
        { ...createMockProduct('2', 'Product 2'), images: [{ id: 'gid://shopify/ProductImage/2', url: 'http://example.com/2.jpg', altText: null, width: null, height: null }] },
      ];
      vi.mocked(backupProductsBulk).mockResolvedValue({ result: successResult(2), products: productsData });
      const config = makeConfig(tempDir);

      await runBackup(config);

      expect(downloadProductImages).toHaveBeenCalledWith(
        productsData,
        expect.stringContaining(tempDir)
      );
    });

    it('should report products module status correctly in status.json', async () => {
      const productsData: BulkProductNode[] = [createMockProduct('1', 'Test')];
      vi.mocked(backupProductsBulk).mockResolvedValue({ result: successResult(25), products: productsData });
      const config = makeConfig(tempDir);

      await runBackup(config);

      const today = new Date().toISOString().split('T')[0];
      const statusPath = path.join(tempDir, today, 'status.json');
      const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

      expect(status.modules['products']).toBe('success');
      expect(status.counts['products']).toBe(25);
    });

    it('should continue with other modules when products backup fails', async () => {
      vi.mocked(backupProductsBulk).mockRejectedValue(new Error('Bulk operation timeout'));
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      // Other modules should still have been called
      expect(backupCustomersBulk).toHaveBeenCalled();
      expect(backupOrdersBulk).toHaveBeenCalled();
      expect(backupContent).toHaveBeenCalled();

      // Products should be marked as failed
      expect(result.modules['products']).toBe('failed');
      expect(result.errors.some((e: string) => e.includes('Bulk operation timeout'))).toBe(true);
    });

    it('should handle backupProductsBulk returning error result', async () => {
      vi.mocked(backupProductsBulk).mockResolvedValue({
        result: { success: false, count: 0, error: 'GraphQL query failed' },
        products: [],
      });
      const config = makeConfig(tempDir);

      const result = await runBackup(config);

      expect(result.modules['products']).toBe('failed');
      expect(result.errors.some((e: string) => e.includes('GraphQL query failed'))).toBe(true);
    });

    it('should pass empty products array to image download on failure', async () => {
      vi.mocked(backupProductsBulk).mockRejectedValue(new Error('Products fetch failed'));
      const config = makeConfig(tempDir);

      await runBackup(config);

      // Image download should be called with empty array when products backup fails
      expect(downloadProductImages).toHaveBeenCalledWith(
        [],
        expect.stringContaining(tempDir)
      );
    });
  });
});
