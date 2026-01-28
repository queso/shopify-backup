import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock the shopify module to control withRetry behavior
vi.mock('../../shopify.js', () => ({
  withRetry: vi.fn((fn: () => Promise<any>) => fn()),
}));

import { backupOrders } from '../../backup/orders.js';
import { withRetry } from '../../shopify.js';

describe('backupOrders', () => {
  let outputDir: string;
  let mockClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    outputDir = await mkdtemp(join(tmpdir(), 'orders-test-'));

    mockClient = {
      rest: {
        get: vi.fn(),
      },
    };
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it('should fetch all orders with pagination and write orders.json', async () => {
    const order1 = { id: 1001, name: '#1001', total_price: '50.00' };
    const order2 = { id: 1002, name: '#1002', total_price: '75.00' };
    const order3 = { id: 1003, name: '#1003', total_price: '100.00' };

    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { orders: [order1, order2] },
        pageInfo: { nextPage: { query: { page_info: 'abc123' } } },
      })
      .mockResolvedValueOnce({
        body: { orders: [order3] },
        pageInfo: { nextPage: undefined },
      })
      // Metafield calls for each order
      .mockResolvedValueOnce({ body: { metafields: [{ key: 'note', value: 'vip' }] } })
      .mockResolvedValueOnce({ body: { metafields: [] } })
      .mockResolvedValueOnce({ body: { metafields: [{ key: 'tag', value: 'rush' }] } });

    const result = await backupOrders(mockClient, outputDir);

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);

    const written = JSON.parse(await readFile(join(outputDir, 'orders.json'), 'utf-8'));
    expect(written).toHaveLength(3);
  });

  it('should use status=any to include all order statuses', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { orders: [{ id: 1 }] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({ body: { metafields: [] } });

    await backupOrders(mockClient, outputDir);

    const firstCall = mockClient.rest.get.mock.calls[0];
    // Expect the request includes status=any somewhere in path or query
    const callArgs = JSON.stringify(firstCall);
    expect(callArgs).toContain('any');
  });

  it('should include order metafields for each order', async () => {
    const order = { id: 2001, name: '#2001' };
    const metafields = [
      { key: 'delivery_date', value: '2026-02-01', namespace: 'custom' },
    ];

    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { orders: [order] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({ body: { metafields } });

    const result = await backupOrders(mockClient, outputDir);

    const written = JSON.parse(await readFile(join(outputDir, 'orders.json'), 'utf-8'));
    expect(written[0].metafields).toEqual(metafields);
    expect(result.success).toBe(true);
  });

  it('should return correct BackupResult with count', async () => {
    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { orders: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] },
        pageInfo: { nextPage: undefined },
      })
      // 5 metafield calls
      .mockResolvedValue({ body: { metafields: [] } });

    const result = await backupOrders(mockClient, outputDir);

    expect(result).toEqual({
      success: true,
      count: 5,
    });
  });

  it('should handle stores with no orders gracefully', async () => {
    mockClient.rest.get.mockResolvedValueOnce({
      body: { orders: [] },
      pageInfo: { nextPage: undefined },
    });

    const result = await backupOrders(mockClient, outputDir);

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);

    const written = JSON.parse(await readFile(join(outputDir, 'orders.json'), 'utf-8'));
    expect(written).toEqual([]);
  });

  it('should handle API errors and return failed BackupResult without throwing', async () => {
    mockClient.rest.get.mockRejectedValueOnce(new Error('Shopify API unavailable'));

    const result = await backupOrders(mockClient, outputDir);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.count).toBe(0);
  });

  it('should use withRetry for API calls', async () => {
    const mockedWithRetry = vi.mocked(withRetry);

    mockClient.rest.get
      .mockResolvedValueOnce({
        body: { orders: [{ id: 1 }] },
        pageInfo: { nextPage: undefined },
      })
      .mockResolvedValueOnce({ body: { metafields: [] } });

    await backupOrders(mockClient, outputDir);

    expect(mockedWithRetry).toHaveBeenCalled();
  });
});
