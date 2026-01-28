import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BackupResult } from '../../types.js';

// Mock withRetry to pass through the function directly
vi.mock('../../shopify.js', () => ({
  withRetry: vi.fn((fn: () => Promise<any>) => fn()),
}));

import { backupCustomers } from '../../backup/customers.js';

describe('backupCustomers', () => {
  let tmpDir: string;
  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'customers-test-'));
    mockClient = {
      rest: {
        get: vi.fn(),
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should fetch all customers with pagination', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { customers: [{ id: 1, email: 'a@test.com' }, { id: 2, email: 'b@test.com' }] },
        pageInfo: { nextPage: { query: { page_info: 'abc' } } },
      })
      .mockResolvedValueOnce({
        body: { customers: [{ id: 3, email: 'c@test.com' }] },
        pageInfo: { nextPage: undefined },
      })
      // Metafield calls for each customer
      .mockResolvedValueOnce({ body: { metafields: [{ key: 'vip', value: 'true' }] } })
      .mockResolvedValueOnce({ body: { metafields: [] } })
      .mockResolvedValueOnce({ body: { metafields: [{ key: 'notes', value: 'hello' }] } });

    const result = await backupCustomers(mockClient, tmpDir);

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'customers.json'), 'utf-8'));
    expect(written).toHaveLength(3);
  });

  it('should include customer metafields for each customer', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { customers: [{ id: 10, email: 'meta@test.com' }] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({
        body: { metafields: [{ key: 'loyalty', value: 'gold' }] },
      });

    await backupCustomers(mockClient, tmpDir);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'customers.json'), 'utf-8'));
    expect(written[0].metafields).toEqual([{ key: 'loyalty', value: 'gold' }]);
  });

  it('should write customers.json with correct structure', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { customers: [{ id: 1, email: 'x@test.com', first_name: 'Test' }] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({ body: { metafields: [] } });

    await backupCustomers(mockClient, tmpDir);

    const filePath = path.join(tmpDir, 'customers.json');
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);

    const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('id', 1);
    expect(data[0]).toHaveProperty('email', 'x@test.com');
  });

  it('should return correct BackupResult with count', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { customers: [{ id: 1 }, { id: 2 }] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({ body: { metafields: [] } })
      .mockResolvedValueOnce({ body: { metafields: [] } });

    const result: BackupResult = await backupCustomers(mockClient, tmpDir);

    expect(result).toEqual({ success: true, count: 2 });
  });

  it('should handle empty customer list gracefully', async () => {
    mockClient.rest.get.mockResolvedValueOnce({
      body: { customers: [] },
      pageInfo: { nextPage: undefined },
    });

    const result = await backupCustomers(mockClient, tmpDir);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);

    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'customers.json'), 'utf-8'));
    expect(written).toEqual([]);
  });

  it('should handle API errors and return failed BackupResult without throwing', async () => {
    mockClient.rest.get.mockRejectedValueOnce(new Error('Shopify API down'));

    const result = await backupCustomers(mockClient, tmpDir);

    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/Shopify API down/);
  });
});
