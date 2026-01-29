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
  CUSTOMER_BULK_QUERY: '{ customers { edges { node { id } } } }',
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
import { backupCustomersBulk } from '../customers-bulk.js';

describe('backupCustomersBulk', () => {
  let tmpDir: string;
  let mockClient: {
    request: ReturnType<typeof vi.fn>;
  };

  /**
   * Helper to create a mock completed bulk operation
   */
  function createCompletedOperation(options?: {
    url?: string;
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
      query: '{ customers { edges { node { id } } } }',
      rootObjectCount: options?.objectCount ?? '0',
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'customers-bulk-test-'));
    mockClient = {
      request: vi.fn(),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('successful backup end-to-end', () => {
    it('should orchestrate bulk operation flow and write customers.json', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/customers.jsonl';

      // Mock the bulk operation flow
      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl, objectCount: '3' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        { id: 'gid://shopify/Customer/1', email: 'alice@example.com', firstName: 'Alice' },
        { id: 'gid://shopify/Customer/2', email: 'bob@example.com', firstName: 'Bob' },
        { id: 'gid://shopify/Customer/3', email: 'charlie@example.com', firstName: 'Charlie' },
      ]);

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);

      // Verify file was written
      const filePath = path.join(tmpDir, 'customers.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const customers = JSON.parse(fileContent);

      expect(customers).toHaveLength(3);
      expect(customers[0].email).toBe('alice@example.com');
    });

    it('should call submitBulkOperation with the customer query', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      expect(submitBulkOperation).toHaveBeenCalledTimes(1);
      expect(submitBulkOperation).toHaveBeenCalledWith(
        mockClient,
        expect.stringContaining('customers')
      );
    });

    it('should pass the operation ID to pollBulkOperation', async () => {
      const operationId = 'gid://shopify/BulkOperation/unique-id-12345';

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      expect(pollBulkOperation).toHaveBeenCalledTimes(1);
      expect(pollBulkOperation).toHaveBeenCalledWith(
        mockClient,
        operationId,
        expect.any(Object) // options
      );
    });

    it('should download results from the completed operation URL', async () => {
      const resultUrl = 'https://storage.shopifycloud.com/special-results.jsonl';

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      expect(downloadBulkOperationResults).toHaveBeenCalledWith(resultUrl);
    });
  });

  describe('error handling', () => {
    it('should handle bulk operation submission failure', async () => {
      vi.mocked(submitBulkOperation).mockRejectedValue(
        new Error('A bulk operation is already in progress')
      );

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toMatch(/bulk operation/i);
    });

    it('should handle polling failure with BulkOperationError', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation timed out')
      );

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('should handle polling timeout', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new Error('Polling timeout after 600000ms')
      );

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timeout/i);
    });

    it('should handle download failure', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockRejectedValue(
        new Error('Failed to download bulk operation results: 404 Not Found')
      );

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/download|404/i);
    });

    it('should handle canceled bulk operation', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.CANCELED, null, 'Operation was canceled')
      );

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancel/i);
    });
  });

  describe('empty customer list', () => {
    it('should handle empty customer list gracefully', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ objectCount: '0' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      // Should still write an empty array to the file
      const filePath = path.join(tmpDir, 'customers.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const customers = JSON.parse(fileContent);

      expect(customers).toEqual([]);
    });

    it('should handle null URL from completed operation (no results)', async () => {
      const operationWithNoUrl: BulkOperation = {
        ...createCompletedOperation(),
        url: null,
        objectCount: '0',
      };

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(operationWithNoUrl);

      const result = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      // Should write empty array when no URL is provided
      const filePath = path.join(tmpDir, 'customers.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });
  });

  describe('file output', () => {
    it('should write valid JSON file', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        { id: 'gid://shopify/Customer/1', email: 'test@example.com' },
      ]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      const filePath = path.join(tmpDir, 'customers.json');

      // Verify file exists
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);

      // Verify it's valid JSON
      const content = await fs.readFile(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();

      // Verify structure
      const data = JSON.parse(content);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should write customers to customers.json in output directory', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        {
          id: 'gid://shopify/Customer/42',
          email: 'customer@shop.com',
          firstName: 'Test',
          lastName: 'Customer',
        },
      ]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      const expectedPath = path.join(tmpDir, 'customers.json');
      const content = await fs.readFile(expectedPath, 'utf-8');
      const customers = JSON.parse(content);

      expect(customers).toHaveLength(1);
      expect(customers[0]).toEqual({
        id: 'gid://shopify/Customer/42',
        email: 'customer@shop.com',
        firstName: 'Test',
        lastName: 'Customer',
      });
    });

    it('should preserve all customer fields from bulk operation', async () => {
      const customerData = {
        id: 'gid://shopify/Customer/100',
        email: 'full@example.com',
        firstName: 'Full',
        lastName: 'Customer',
        phone: '+1234567890',
        state: 'ENABLED',
        tags: ['vip', 'wholesale'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T12:00:00Z',
        addresses: [
          {
            address1: '123 Main St',
            city: 'New York',
            province: 'NY',
            country: 'United States',
            zip: '10001',
          },
        ],
        metafields: [
          { namespace: 'custom', key: 'loyalty_tier', value: 'gold' },
        ],
      };

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([customerData]);

      await backupCustomersBulk(mockClient as any, tmpDir);

      const content = await fs.readFile(path.join(tmpDir, 'customers.json'), 'utf-8');
      const customers = JSON.parse(content);

      expect(customers[0]).toEqual(customerData);
    });
  });

  describe('return value', () => {
    it('should return BackupResult with correct count', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([
        { id: 'gid://shopify/Customer/1' },
        { id: 'gid://shopify/Customer/2' },
        { id: 'gid://shopify/Customer/3' },
        { id: 'gid://shopify/Customer/4' },
        { id: 'gid://shopify/Customer/5' },
      ]);

      const result: BackupResult = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result).toEqual({
        success: true,
        count: 5,
      });
    });

    it('should return error message on failure', async () => {
      const errorMessage = 'Custom error from Shopify API';

      vi.mocked(submitBulkOperation).mockRejectedValue(new Error(errorMessage));

      const result: BackupResult = await backupCustomersBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain(errorMessage);
    });
  });
});
