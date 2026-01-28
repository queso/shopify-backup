import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock withRetry to pass through calls (or wrap them)
vi.mock('../../shopify.js', () => ({
  withRetry: vi.fn((fn: () => any) => fn()),
}));

import { backupProducts } from '../../backup/products.js';
import { withRetry } from '../../shopify.js';

describe('backupProducts', () => {
  let tempDir: string;
  let mockClient: any;

  const makeProduct = (id: number, title: string, variants: any[] = []) => ({
    id,
    title,
    variants: variants.length ? variants : [{ id: id * 100, title: 'Default' }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'products-test-'));
    mockClient = {
      rest: {
        get: vi.fn(),
      },
    };
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('pagination', () => {
    it('should fetch all products across multiple pages', async () => {
      mockClient.rest.get
        // Page 1: has next page link
        .mockResolvedValueOnce({
          body: { products: [makeProduct(1, 'Product A'), makeProduct(2, 'Product B')] },
          headers: { 'x-shopify-api-version': '2025-01' },
          pageInfo: { nextPage: { query: { page_info: 'page2token' } } },
        })
        // Page 2: no next page
        .mockResolvedValueOnce({
          body: { products: [makeProduct(3, 'Product C')] },
          headers: {},
          pageInfo: { nextPage: undefined },
        })
        // Product 1 metafields
        .mockResolvedValueOnce({ body: { metafields: [{ key: 'color', value: 'red' }] } })
        // Product 1 variant metafields
        .mockResolvedValueOnce({ body: { metafields: [] } })
        // Product 2 metafields
        .mockResolvedValueOnce({ body: { metafields: [] } })
        // Product 2 variant metafields
        .mockResolvedValueOnce({ body: { metafields: [] } })
        // Product 3 metafields
        .mockResolvedValueOnce({ body: { metafields: [] } })
        // Product 3 variant metafields
        .mockResolvedValueOnce({ body: { metafields: [] } });

      const { result } = await backupProducts(mockClient, tempDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });
  });

  describe('metafields', () => {
    it('should include product metafields for each product', async () => {
      const productMetafields = [
        { key: 'material', value: 'cotton', namespace: 'custom' },
      ];

      mockClient.rest.get
        .mockResolvedValueOnce({
          body: { products: [makeProduct(1, 'Shirt')] },
          pageInfo: { nextPage: undefined },
        })
        .mockResolvedValueOnce({ body: { metafields: productMetafields } })
        .mockResolvedValueOnce({ body: { metafields: [] } }); // variant metafields

      await backupProducts(mockClient, tempDir);

      const written = JSON.parse(fs.readFileSync(path.join(tempDir, 'products.json'), 'utf-8'));
      expect(written[0].metafields).toEqual(productMetafields);
    });

    it('should include variant metafields for each variant', async () => {
      const variantMetafields = [{ key: 'weight', value: '200g', namespace: 'custom' }];
      const product = makeProduct(1, 'Shirt', [
        { id: 100, title: 'Small' },
        { id: 101, title: 'Large' },
      ]);

      mockClient.rest.get
        .mockResolvedValueOnce({
          body: { products: [product] },
          pageInfo: { nextPage: undefined },
        })
        // product metafields
        .mockResolvedValueOnce({ body: { metafields: [] } })
        // variant 100 metafields
        .mockResolvedValueOnce({ body: { metafields: variantMetafields } })
        // variant 101 metafields
        .mockResolvedValueOnce({ body: { metafields: [] } });

      await backupProducts(mockClient, tempDir);

      const written = JSON.parse(fs.readFileSync(path.join(tempDir, 'products.json'), 'utf-8'));
      expect(written[0].variants[0].metafields).toEqual(variantMetafields);
      expect(written[0].variants[1].metafields).toEqual([]);
    });
  });

  describe('file output', () => {
    it('should write products.json with correct structure', async () => {
      mockClient.rest.get
        .mockResolvedValueOnce({
          body: { products: [makeProduct(1, 'Widget')] },
          pageInfo: { nextPage: undefined },
        })
        .mockResolvedValueOnce({ body: { metafields: [] } })
        .mockResolvedValueOnce({ body: { metafields: [] } });

      await backupProducts(mockClient, tempDir);

      const filePath = path.join(tempDir, 'products.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(Array.isArray(written)).toBe(true);
      expect(written[0]).toHaveProperty('id', 1);
      expect(written[0]).toHaveProperty('title', 'Widget');
    });
  });

  describe('return value', () => {
    it('should return BackupResult with correct count', async () => {
      mockClient.rest.get
        .mockResolvedValueOnce({
          body: { products: [makeProduct(1, 'A'), makeProduct(2, 'B')] },
          pageInfo: { nextPage: undefined },
        })
        .mockResolvedValueOnce({ body: { metafields: [] } })
        .mockResolvedValueOnce({ body: { metafields: [] } })
        .mockResolvedValueOnce({ body: { metafields: [] } })
        .mockResolvedValueOnce({ body: { metafields: [] } });

      const { result } = await backupProducts(mockClient, tempDir);

      expect(result).toEqual({ success: true, count: 2 });
    });
  });

  describe('empty store', () => {
    it('should handle zero products gracefully', async () => {
      mockClient.rest.get.mockResolvedValueOnce({
        body: { products: [] },
        pageInfo: { nextPage: undefined },
      });

      const { result } = await backupProducts(mockClient, tempDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);

      const written = JSON.parse(fs.readFileSync(path.join(tempDir, 'products.json'), 'utf-8'));
      expect(written).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return failed BackupResult on API error without throwing', async () => {
      mockClient.rest.get.mockRejectedValueOnce(new Error('API connection failed'));

      const { result } = await backupProducts(mockClient, tempDir);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.count).toBe(0);
    });
  });

  describe('retry integration', () => {
    it('should use withRetry wrapper for API calls', async () => {
      const mockedWithRetry = vi.mocked(withRetry);

      mockClient.rest.get
        .mockResolvedValueOnce({
          body: { products: [makeProduct(1, 'A')] },
          pageInfo: { nextPage: undefined },
        })
        .mockResolvedValueOnce({ body: { metafields: [] } })
        .mockResolvedValueOnce({ body: { metafields: [] } });

      await backupProducts(mockClient, tempDir);

      expect(mockedWithRetry).toHaveBeenCalled();
    });
  });
});
