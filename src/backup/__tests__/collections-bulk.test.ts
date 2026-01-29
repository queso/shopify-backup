import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BackupResult } from '../../types.js';
import type { BulkOperation, CollectionRuleSet } from '../../types/graphql.js';
import { BulkOperationStatus, BulkOperationErrorCode } from '../../types/graphql.js';

// Mock the bulk operation dependencies
vi.mock('../../graphql/bulk-operations.js', () => ({
  submitBulkOperation: vi.fn(),
  COLLECTION_BULK_QUERY: '{ collections { edges { node { id } } } }',
}));

vi.mock('../../graphql/polling.js', () => ({
  pollBulkOperation: vi.fn(),
  BulkOperationError: class BulkOperationError extends Error {
    constructor(
      public status: BulkOperationStatus,
      public errorCode: BulkOperationErrorCode | null,
      message?: string
    ) {
      super(message || `Bulk operation ${status}`);
      this.name = 'BulkOperationError';
    }
  },
}));

vi.mock('../../graphql/download.js', () => ({
  downloadBulkOperationResults: vi.fn(),
}));

// Import mocked functions after mock setup
import { submitBulkOperation } from '../../graphql/bulk-operations.js';
import { pollBulkOperation, BulkOperationError } from '../../graphql/polling.js';
import { downloadBulkOperationResults } from '../../graphql/download.js';

// Import the function to test (will fail until implementation exists)
import { backupCollectionsBulk } from '../collections-bulk.js';

describe('backupCollectionsBulk', () => {
  let tmpDir: string;
  let mockClient: {
    request: ReturnType<typeof vi.fn>;
  };

  /**
   * Helper to create a mock completed bulk operation
   */
  function createCompletedOperation(options?: {
    url?: string | null;
    objectCount?: string;
  }): BulkOperation {
    return {
      id: 'gid://shopify/BulkOperation/123456789',
      status: BulkOperationStatus.COMPLETED,
      errorCode: null,
      objectCount: options?.objectCount ?? '0',
      url: options?.url ?? 'https://storage.shopifycloud.com/results.jsonl',
      createdAt: '2024-01-15T10:00:00Z',
      completedAt: '2024-01-15T10:05:00Z',
      fileSize: '1024',
      query: '{ collections { edges { node { id } } } }',
      rootObjectCount: options?.objectCount ?? '0',
    };
  }

  /**
   * Helper to create a mock smart collection rule set
   */
  function createMockRuleSet(options?: {
    disjunctive?: boolean;
    rules?: Array<{ column: string; relation: string; condition: string }>;
  }): CollectionRuleSet {
    return {
      appliedDisjunctively: options?.disjunctive ?? false,
      rules: options?.rules ?? [
        { column: 'TAG', relation: 'EQUALS', condition: 'sale' },
      ],
    };
  }

  /**
   * Helper to create flat JSONL data with __parentId references
   * (as Shopify actually returns it from bulk operations)
   */
  function createFlatCollectionData(
    collectionId: string,
    options?: {
      metafields?: Array<{ id: string; namespace: string; key: string; value: string }>;
      products?: Array<{ id: string; legacyResourceId: string }>;
      ruleSet?: CollectionRuleSet | null;
    }
  ): Array<Record<string, unknown>> {
    const parentId = `gid://shopify/Collection/${collectionId}`;
    const result: Array<Record<string, unknown>> = [{
      id: parentId,
      legacyResourceId: collectionId,
      title: `Collection ${collectionId}`,
      handle: `collection-${collectionId}`,
      descriptionHtml: '<p>Collection description</p>',
      sortOrder: 'MANUAL',
      templateSuffix: null,
      updatedAt: '2024-01-15T10:05:00Z',
      image: null,
      seo: { title: null, description: null },
      ruleSet: options?.ruleSet ?? null,
    }];

    // Add metafields with __parentId
    for (const metafield of options?.metafields ?? []) {
      result.push({
        id: metafield.id,
        namespace: metafield.namespace,
        key: metafield.key,
        value: metafield.value,
        type: 'single_line_text_field',
        __parentId: parentId,
      });
    }

    // Add products with __parentId
    for (const product of options?.products ?? []) {
      result.push({
        id: product.id,
        legacyResourceId: product.legacyResourceId,
        __parentId: parentId,
      });
    }

    return result;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'collections-bulk-test-'));
    mockClient = {
      request: vi.fn(),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('function export', () => {
    it('should export backupCollectionsBulk function', () => {
      expect(typeof backupCollectionsBulk).toBe('function');
    });
  });

  describe('successful backup end-to-end', () => {
    it('should orchestrate bulk operation flow and write collections.json', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/collections.jsonl';

      // Mock the bulk operation flow with flat JSONL data
      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl, objectCount: '2' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        ...createFlatCollectionData('1'),
        ...createFlatCollectionData('2'),
      ]);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify file was written
      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const collections = JSON.parse(fileContent);

      expect(collections).toHaveLength(2);
      expect(collections[0].title).toBe('Collection 1');
    });

    it('should call submitBulkOperation with the collection query', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(submitBulkOperation).toHaveBeenCalledTimes(1);
      expect(submitBulkOperation).toHaveBeenCalledWith(
        mockClient,
        expect.stringContaining('collections')
      );
    });

    it('should pass the operation ID to pollBulkOperation', async () => {
      const operationId = 'gid://shopify/BulkOperation/unique-id-12345';

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(pollBulkOperation).toHaveBeenCalledTimes(1);
      expect(pollBulkOperation).toHaveBeenCalledWith(
        mockClient,
        operationId,
        expect.any(Object)
      );
    });

    it('should download results from the completed operation URL', async () => {
      const resultUrl = 'https://storage.shopifycloud.com/special-results.jsonl';

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(downloadBulkOperationResults).toHaveBeenCalledWith(resultUrl);
    });
  });

  describe('empty result handling', () => {
    it('should handle null URL gracefully (returns success with count 0)', async () => {
      const operationWithNoUrl: BulkOperation = {
        ...createCompletedOperation(),
        url: null,
        objectCount: '0',
      };

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(operationWithNoUrl);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      // Should write empty array when no URL is provided
      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });

    it('should handle empty collection list gracefully', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ objectCount: '0' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return failure result on submission error', async () => {
      vi.mocked(submitBulkOperation).mockRejectedValue(
        new Error('A bulk operation is already in progress')
      );

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toMatch(/bulk operation/i);
    });

    it('should handle polling failure with BulkOperationError', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation timed out')
      );

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should handle download failure', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockRejectedValue(
        new Error('Failed to download bulk operation results: 404 Not Found')
      );

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/download|404/i);
    });

    it('should handle canceled bulk operation', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.CANCELED, null, 'Operation was canceled')
      );

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancel/i);
    });
  });

  describe('JSONL reconstruction', () => {
    it('should attach metafields to correct collections', async () => {
      const flatData = createFlatCollectionData('1', {
        metafields: [
          { id: 'gid://shopify/Metafield/100', namespace: 'custom', key: 'collection_promo', value: '20% off' },
          { id: 'gid://shopify/Metafield/101', namespace: 'custom', key: 'collection_banner', value: 'sale-banner.jpg' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const collections = JSON.parse(fileContent);

      expect(collections[0].metafields).toHaveLength(2);
      expect(collections[0].metafields[0].key).toBe('collection_promo');
      expect(collections[0].metafields[1].key).toBe('collection_banner');
    });

    it('should preserve smart collection rules', async () => {
      const ruleSet = createMockRuleSet({
        disjunctive: true,
        rules: [
          { column: 'TAG', relation: 'EQUALS', condition: 'sale' },
          { column: 'VENDOR', relation: 'EQUALS', condition: 'Acme' },
        ],
      });
      const flatData = createFlatCollectionData('1', { ruleSet });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const collections = JSON.parse(fileContent);

      expect(collections[0].ruleSet).not.toBeNull();
      expect(collections[0].ruleSet.appliedDisjunctively).toBe(true);
      expect(collections[0].ruleSet.rules).toHaveLength(2);
      expect(collections[0].ruleSet.rules[0].column).toBe('TAG');
      expect(collections[0].ruleSet.rules[0].condition).toBe('sale');
      expect(collections[0].ruleSet.rules[1].column).toBe('VENDOR');
      expect(collections[0].ruleSet.rules[1].condition).toBe('Acme');
    });

    it('should handle manual collection (null ruleSet) with products', async () => {
      const flatData = createFlatCollectionData('1', {
        ruleSet: null,
        products: [
          { id: 'gid://shopify/Product/100', legacyResourceId: '100' },
          { id: 'gid://shopify/Product/101', legacyResourceId: '101' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const collections = JSON.parse(fileContent);

      expect(collections[0].ruleSet).toBeNull();
      expect(collections[0].products).toHaveLength(2);
    });

    it('should handle mixed collection types (smart and manual)', async () => {
      const flatData = [
        ...createFlatCollectionData('1', { ruleSet: createMockRuleSet() }),
        ...createFlatCollectionData('2', {
          ruleSet: null,
          products: [{ id: 'gid://shopify/Product/100', legacyResourceId: '100' }],
        }),
      ];

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '2' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'collections.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const collections = JSON.parse(fileContent);

      expect(collections[0].ruleSet).not.toBeNull();
      expect(collections[1].ruleSet).toBeNull();
    });
  });

  describe('file output', () => {
    it('should write valid JSON file', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatCollectionData('1'));

      await backupCollectionsBulk(mockClient as any, tmpDir);

      const filePath = path.join(tmpDir, 'collections.json');

      // Verify file exists
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);

      // Verify it's valid JSON
      const content = await fs.readFile(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      // Verify structure is an array
      const data = JSON.parse(content);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should write collections to collections.json in output directory', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatCollectionData('42'));

      await backupCollectionsBulk(mockClient as any, tmpDir);

      const expectedPath = path.join(tmpDir, 'collections.json');
      const content = await fs.readFile(expectedPath, 'utf-8');
      const collections = JSON.parse(content);

      expect(collections).toHaveLength(1);
      expect(collections[0].legacyResourceId).toBe('42');
    });

    it('should preserve all collection fields and reconstruct children', async () => {
      const flatData = createFlatCollectionData('100', {
        metafields: [{ id: 'gid://shopify/Metafield/300', namespace: 'custom', key: 'test', value: 'value' }],
        ruleSet: createMockRuleSet(),
        products: [{ id: 'gid://shopify/Product/200', legacyResourceId: '200' }],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      await backupCollectionsBulk(mockClient as any, tmpDir);

      const content = await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8');
      const collections = JSON.parse(content);

      // Verify parent fields preserved
      expect(collections[0].id).toBe('gid://shopify/Collection/100');
      expect(collections[0].legacyResourceId).toBe('100');
      expect(collections[0].title).toBe('Collection 100');

      // Verify children reconstructed (without __parentId)
      expect(collections[0].metafields).toHaveLength(1);
      expect(collections[0].metafields[0].key).toBe('test');
      expect(collections[0].metafields[0]).not.toHaveProperty('__parentId');

      expect(collections[0].products).toHaveLength(1);
      expect(collections[0].products[0].legacyResourceId).toBe('200');
    });
  });

  describe('return value', () => {
    it('should return BackupResult with correct count', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        ...createFlatCollectionData('1'),
        ...createFlatCollectionData('2'),
        ...createFlatCollectionData('3'),
      ]);

      const result: BackupResult = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result).toEqual({
        success: true,
        count: 3,
      });
    });

    it('should return error message on failure', async () => {
      const errorMessage = 'Custom error from Shopify API';

      vi.mocked(submitBulkOperation).mockRejectedValue(new Error(errorMessage));

      const result: BackupResult = await backupCollectionsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain(errorMessage);
    });
  });
});
