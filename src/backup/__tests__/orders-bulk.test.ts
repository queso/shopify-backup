import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BackupResult } from '../../types.js';
import type { BulkOperation } from '../../types/graphql.js';
import { BulkOperationStatus, BulkOperationErrorCode } from '../../types/graphql.js';

// Mock the bulk operation dependencies
vi.mock('../../graphql/bulk-operations.js', () => ({
  submitBulkOperation: vi.fn(),
  ORDER_BULK_QUERY: '{ orders { edges { node { id } } } }',
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
import { backupOrdersBulk } from '../orders-bulk.js';

describe('backupOrdersBulk', () => {
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
      query: '{ orders { edges { node { id } } } }',
      rootObjectCount: options?.objectCount ?? '0',
    };
  }

  /**
   * Helper to create a mock order (parent object - no __parentId)
   */
  function createMockOrder(id: string) {
    return {
      id: `gid://shopify/Order/${id}`,
      legacyResourceId: id,
      name: `#${1000 + parseInt(id)}`,
      email: `customer${id}@example.com`,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:05:00Z',
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'FULFILLED',
      currencyCode: 'USD',
      totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
    };
  }

  /**
   * Helper to create flat JSONL data with __parentId references
   * (as Shopify actually returns it from bulk operations)
   */
  function createFlatOrderData(
    orderId: string,
    options?: {
      lineItems?: Array<{ id: string; title: string; quantity: number }>;
      transactions?: Array<{ id: string; kind: string; status: string }>;
      fulfillments?: Array<{ id: string; status: string }>;
    }
  ): Array<Record<string, unknown>> {
    const parentId = `gid://shopify/Order/${orderId}`;
    const result: Array<Record<string, unknown>> = [createMockOrder(orderId)];

    // Add line items with __parentId
    for (const lineItem of options?.lineItems ?? []) {
      result.push({ ...lineItem, __parentId: parentId });
    }

    // Add transactions with __parentId
    for (const transaction of options?.transactions ?? []) {
      result.push({ ...transaction, __parentId: parentId });
    }

    // Add fulfillments with __parentId
    for (const fulfillment of options?.fulfillments ?? []) {
      result.push({ ...fulfillment, __parentId: parentId });
    }

    return result;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orders-bulk-test-'));
    mockClient = {
      request: vi.fn(),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('function export', () => {
    it('should export backupOrdersBulk function', () => {
      expect(typeof backupOrdersBulk).toBe('function');
    });
  });

  describe('successful backup end-to-end', () => {
    it('should orchestrate bulk operation flow and write orders.json', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/orders.jsonl';

      // Mock the bulk operation flow with flat JSONL data
      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl, objectCount: '2' })
      );
      // Return flat data as Shopify actually does
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        ...createFlatOrderData('1'),
        ...createFlatOrderData('2'),
      ]);

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify file was written
      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const orders = JSON.parse(fileContent);

      expect(orders).toHaveLength(2);
      expect(orders[0].name).toBe('#1001');
    });

    it('should call submitBulkOperation with the order query', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupOrdersBulk(mockClient as any, tmpDir);

      expect(submitBulkOperation).toHaveBeenCalledTimes(1);
      expect(submitBulkOperation).toHaveBeenCalledWith(
        mockClient,
        expect.stringContaining('orders')
      );
    });

    it('should pass the operation ID to pollBulkOperation', async () => {
      const operationId = 'gid://shopify/BulkOperation/unique-id-12345';

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupOrdersBulk(mockClient as any, tmpDir);

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

      await backupOrdersBulk(mockClient as any, tmpDir);

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

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      // Should write empty array when no URL is provided
      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });

    it('should handle empty order list gracefully', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ objectCount: '0' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return failure result on submission error', async () => {
      vi.mocked(submitBulkOperation).mockRejectedValue(
        new Error('A bulk operation is already in progress')
      );

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toMatch(/bulk operation/i);
    });

    it('should handle polling failure with BulkOperationError', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation timed out')
      );

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

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

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/download|404/i);
    });

    it('should handle canceled bulk operation', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.CANCELED, null, 'Operation was canceled')
      );

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancel/i);
    });
  });

  describe('JSONL reconstruction', () => {
    it('should reconstruct nested line items attached to orders', async () => {
      // Provide flat JSONL data as Shopify returns it
      const flatData = createFlatOrderData('1', {
        lineItems: [
          { id: 'gid://shopify/LineItem/100', title: 'T-Shirt', quantity: 2 },
          { id: 'gid://shopify/LineItem/101', title: 'Hat', quantity: 1 },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const orders = JSON.parse(fileContent);

      expect(orders[0].lineItems).toHaveLength(2);
      expect(orders[0].lineItems[0].title).toBe('T-Shirt');
      expect(orders[0].lineItems[1].title).toBe('Hat');
    });

    it('should reconstruct transactions attached to orders', async () => {
      const flatData = createFlatOrderData('1', {
        transactions: [
          { id: 'gid://shopify/OrderTransaction/200', kind: 'SALE', status: 'SUCCESS' },
          { id: 'gid://shopify/OrderTransaction/201', kind: 'REFUND', status: 'SUCCESS' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const orders = JSON.parse(fileContent);

      expect(orders[0].transactions).toHaveLength(2);
      expect(orders[0].transactions[0].kind).toBe('SALE');
      expect(orders[0].transactions[1].kind).toBe('REFUND');
    });

    it('should reconstruct fulfillments attached to orders', async () => {
      const flatData = createFlatOrderData('1', {
        fulfillments: [
          { id: 'gid://shopify/Fulfillment/300', status: 'SUCCESS' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const result = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);

      const filePath = path.join(tmpDir, 'orders.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const orders = JSON.parse(fileContent);

      expect(orders[0].fulfillments).toHaveLength(1);
      expect(orders[0].fulfillments[0].status).toBe('SUCCESS');
    });
  });

  describe('file output', () => {
    it('should write valid JSON file', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatOrderData('1'));

      await backupOrdersBulk(mockClient as any, tmpDir);

      const filePath = path.join(tmpDir, 'orders.json');

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

    it('should write orders to orders.json in output directory', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatOrderData('42'));

      await backupOrdersBulk(mockClient as any, tmpDir);

      const expectedPath = path.join(tmpDir, 'orders.json');
      const content = await fs.readFile(expectedPath, 'utf-8');
      const orders = JSON.parse(content);

      expect(orders).toHaveLength(1);
      expect(orders[0].legacyResourceId).toBe('42');
    });

    it('should preserve all order fields from bulk operation and reconstruct children', async () => {
      // Flat data as Shopify returns it
      const flatData = createFlatOrderData('100', {
        lineItems: [{ id: 'gid://shopify/LineItem/1', title: 'Product', quantity: 1 }],
        transactions: [{ id: 'gid://shopify/OrderTransaction/1', kind: 'SALE', status: 'SUCCESS' }],
        fulfillments: [{ id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS' }],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      await backupOrdersBulk(mockClient as any, tmpDir);

      const content = await fs.readFile(path.join(tmpDir, 'orders.json'), 'utf-8');
      const orders = JSON.parse(content);

      // Verify parent fields preserved
      expect(orders[0].id).toBe('gid://shopify/Order/100');
      expect(orders[0].legacyResourceId).toBe('100');
      expect(orders[0].name).toBe('#1100');

      // Verify children reconstructed (without __parentId)
      expect(orders[0].lineItems).toHaveLength(1);
      expect(orders[0].lineItems[0].title).toBe('Product');
      expect(orders[0].lineItems[0]).not.toHaveProperty('__parentId');

      expect(orders[0].transactions).toHaveLength(1);
      expect(orders[0].transactions[0].kind).toBe('SALE');

      expect(orders[0].fulfillments).toHaveLength(1);
      expect(orders[0].fulfillments[0].status).toBe('SUCCESS');
    });
  });

  describe('return value', () => {
    it('should return BackupResult with correct count', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      // Return flat data for 3 orders (each with no children = just the order object)
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        ...createFlatOrderData('1'),
        ...createFlatOrderData('2'),
        ...createFlatOrderData('3'),
      ]);

      const result: BackupResult = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result).toEqual({
        success: true,
        count: 3,
      });
    });

    it('should return error message on failure', async () => {
      const errorMessage = 'Custom error from Shopify API';

      vi.mocked(submitBulkOperation).mockRejectedValue(new Error(errorMessage));

      const result: BackupResult = await backupOrdersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain(errorMessage);
    });
  });
});
