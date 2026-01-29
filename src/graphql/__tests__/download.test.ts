import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadBulkOperationResults } from '../download.js';

describe('downloadBulkOperationResults', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('downloading and parsing valid JSONL', () => {
    it('should download and parse valid JSONL file', async () => {
      const jsonlContent = `{"id":"gid://shopify/Product/1","title":"Product A"}
{"id":"gid://shopify/Product/2","title":"Product B"}
{"id":"gid://shopify/Product/3","title":"Product C"}`;

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(jsonlContent),
      } as Response);

      const result = await downloadBulkOperationResults<{ id: string; title: string }>(
        'https://storage.shopifycloud.com/bulk-operation-output/12345.jsonl'
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: 'gid://shopify/Product/1', title: 'Product A' });
      expect(result[1]).toEqual({ id: 'gid://shopify/Product/2', title: 'Product B' });
      expect(result[2]).toEqual({ id: 'gid://shopify/Product/3', title: 'Product C' });
    });

    it('should return typed results with complex objects', async () => {
      const jsonlContent = `{"id":"gid://shopify/Customer/123","email":"test@example.com","address":{"city":"New York"}}`;

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(jsonlContent),
      } as Response);

      interface Customer {
        id: string;
        email: string;
        address: { city: string };
      }

      const result = await downloadBulkOperationResults<Customer>(
        'https://storage.shopifycloud.com/bulk-operation-output/customers.jsonl'
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gid://shopify/Customer/123');
      expect(result[0].email).toBe('test@example.com');
      expect(result[0].address.city).toBe('New York');
    });
  });

  describe('handling empty results', () => {
    it('should return empty array for empty JSONL file', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      } as Response);

      const result = await downloadBulkOperationResults(
        'https://storage.shopifycloud.com/bulk-operation-output/empty.jsonl'
      );

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for whitespace-only JSONL file', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('   \n\n   '),
      } as Response);

      const result = await downloadBulkOperationResults(
        'https://storage.shopifycloud.com/bulk-operation-output/whitespace.jsonl'
      );

      expect(result).toEqual([]);
    });
  });

  describe('handling HTTP errors', () => {
    it('should throw descriptive error on HTTP 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const promise = downloadBulkOperationResults('https://storage.shopifycloud.com/bulk-operation-output/missing.jsonl');

      await expect(promise).rejects.toThrow(/404.*not found/i);
    });

    it('should throw descriptive error on HTTP 500', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(
        downloadBulkOperationResults('https://storage.shopifycloud.com/bulk-operation-output/error.jsonl')
      ).rejects.toThrow(/500/);
    });

    it('should include URL context in HTTP error messages', async () => {
      const testUrl = 'https://storage.shopifycloud.com/bulk-operation-output/test.jsonl';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(downloadBulkOperationResults(testUrl)).rejects.toThrow(/403/);
    });
  });

  describe('handling network errors', () => {
    it('should throw on network timeout', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('network timeout'));

      await expect(
        downloadBulkOperationResults('https://storage.shopifycloud.com/bulk-operation-output/timeout.jsonl')
      ).rejects.toThrow(/timeout/i);
    });

    it('should throw on connection refused', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        downloadBulkOperationResults('https://storage.shopifycloud.com/bulk-operation-output/refused.jsonl')
      ).rejects.toThrow();
    });

    it('should throw on DNS resolution failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

      await expect(
        downloadBulkOperationResults('https://invalid-host.example.com/test.jsonl')
      ).rejects.toThrow();
    });
  });

  describe('fetch call verification', () => {
    it('should call fetch with the provided URL', async () => {
      const testUrl = 'https://storage.shopifycloud.com/bulk-operation-output/verify.jsonl';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"id":"1"}'),
      } as Response);

      await downloadBulkOperationResults(testUrl);

      expect(fetch).toHaveBeenCalledWith(testUrl);
    });
  });
});
