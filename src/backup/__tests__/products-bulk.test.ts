import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BulkOperation } from '../../types/graphql.js';
import { BulkOperationStatus, BulkOperationErrorCode } from '../../types/graphql.js';

// Mock the bulk operation dependencies
vi.mock('../../graphql/bulk-operations.js', () => ({
  submitBulkOperation: vi.fn(),
  PRODUCT_BULK_QUERY: '{ products { edges { node { id } } } }',
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
import { backupProductsBulk } from '../products-bulk.js';

describe('backupProductsBulk', () => {
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
      query: '{ products { edges { node { id } } } }',
      rootObjectCount: options?.objectCount ?? '0',
    };
  }

  /**
   * Helper to create flat JSONL data with __parentId references
   * (as Shopify actually returns it from bulk operations)
   */
  function createFlatProductData(
    productId: string,
    options?: {
      variants?: Array<{ id: string; sku: string; variantMetafields?: Array<{ id: string; key: string; value: string }> }>;
      metafields?: Array<{ id: string; key: string; value: string; namespace: string }>;
      images?: Array<{ id: string; url: string }>;
    }
  ): Array<Record<string, unknown>> {
    const parentId = `gid://shopify/Product/${productId}`;
    const result: Array<Record<string, unknown>> = [{
      id: parentId,
      legacyResourceId: productId,
      title: `Product ${productId}`,
      handle: `product-${productId}`,
      descriptionHtml: '<p>Description</p>',
      vendor: 'Test Vendor',
      productType: 'Test Type',
      status: 'ACTIVE',
      tags: ['tag1', 'tag2'],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:05:00Z',
      publishedAt: '2024-01-15T10:00:00Z',
      templateSuffix: null,
      giftCardTemplateSuffix: null,
      hasOnlyDefaultVariant: false,
      hasOutOfStockVariants: false,
      tracksInventory: true,
      totalInventory: 100,
      totalVariants: 1,
      options: [{ id: 'gid://shopify/ProductOption/1', name: 'Size', position: 1, values: ['Small', 'Medium', 'Large'] }],
      featuredImage: null,
      seo: { title: null, description: null },
      priceRangeV2: {
        minVariantPrice: { amount: '29.99', currencyCode: 'USD' },
        maxVariantPrice: { amount: '29.99', currencyCode: 'USD' },
      },
    }];

    // Add variants with __parentId
    for (const variant of options?.variants ?? []) {
      result.push({
        id: variant.id,
        legacyResourceId: variant.id.replace('gid://shopify/ProductVariant/', ''),
        title: `Variant`,
        displayName: `Product - Variant`,
        sku: variant.sku,
        barcode: null,
        position: 1,
        price: '29.99',
        compareAtPrice: null,
        taxable: true,
        taxCode: null,
        availableForSale: true,
        requiresShipping: true,
        weight: 1.0,
        weightUnit: 'POUNDS',
        inventoryQuantity: 100,
        selectedOptions: [{ name: 'Size', value: 'Medium' }],
        image: null,
        inventoryItem: null,
        __parentId: parentId,
      });

      // Add variant metafields with __parentId pointing to the variant
      for (const metafield of variant.variantMetafields ?? []) {
        result.push({
          id: metafield.id,
          namespace: 'custom',
          key: metafield.key,
          value: metafield.value,
          type: 'single_line_text_field',
          __parentId: variant.id,
        });
      }
    }

    // Add product-level metafields with __parentId
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

    // Add images with __parentId
    for (const image of options?.images ?? []) {
      result.push({
        id: image.id,
        url: image.url,
        altText: null,
        width: 800,
        height: 600,
        __parentId: parentId,
      });
    }

    return result;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'products-bulk-test-'));
    mockClient = {
      request: vi.fn(),
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('function export', () => {
    it('should export backupProductsBulk function', () => {
      expect(typeof backupProductsBulk).toBe('function');
    });
  });

  describe('successful backup end-to-end', () => {
    it('should return result with BackupResult and products array', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/products.jsonl';
      // Return flat JSONL data as Shopify actually does
      const flatData = [
        ...createFlatProductData('1'),
        ...createFlatProductData('2'),
      ];

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ url: resultUrl, objectCount: '2' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { result, products: returnedProducts } = await backupProductsBulk(mockClient as any, tmpDir);

      // Verify result structure
      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify products are returned
      expect(returnedProducts).toHaveLength(2);
      expect(returnedProducts[0].title).toBe('Product 1');
    });

    it('should write products.json to output directory', async () => {
      const flatData = [
        ...createFlatProductData('1'),
        ...createFlatProductData('2'),
      ];

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '2' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      await backupProductsBulk(mockClient as any, tmpDir);

      const filePath = path.join(tmpDir, 'products.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const savedProducts = JSON.parse(fileContent);

      expect(savedProducts).toHaveLength(2);
      expect(savedProducts[0].handle).toBe('product-1');
    });

    it('should call submitBulkOperation with the product query', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupProductsBulk(mockClient as any, tmpDir);

      expect(submitBulkOperation).toHaveBeenCalledTimes(1);
      expect(submitBulkOperation).toHaveBeenCalledWith(
        mockClient,
        expect.stringContaining('products')
      );
    });

    it('should pass the operation ID to pollBulkOperation', async () => {
      const operationId = 'gid://shopify/BulkOperation/unique-id-12345';

      vi.mocked(submitBulkOperation).mockResolvedValue(operationId);
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      await backupProductsBulk(mockClient as any, tmpDir);

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

      await backupProductsBulk(mockClient as any, tmpDir);

      expect(downloadBulkOperationResults).toHaveBeenCalledWith(resultUrl);
    });
  });

  describe('empty result handling', () => {
    it('should handle null URL gracefully', async () => {
      const operationWithNoUrl: BulkOperation = {
        ...createCompletedOperation(),
        url: null,
        objectCount: '0',
      };

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(operationWithNoUrl);

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(products).toEqual([]);

      // Should write empty array when no URL is provided
      const filePath = path.join(tmpDir, 'products.json');
      const fileContent = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(fileContent)).toEqual([]);
    });

    it('should handle empty product list gracefully', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(
        createCompletedOperation({ objectCount: '0' })
      );
      vi.mocked(downloadBulkOperationResults).mockResolvedValue([]);

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(products).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return failure result on submission error', async () => {
      vi.mocked(submitBulkOperation).mockRejectedValue(
        new Error('A bulk operation is already in progress')
      );

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toMatch(/bulk operation/i);
      expect(products).toEqual([]);
    });

    it('should handle polling failure with BulkOperationError', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation timed out')
      );

      const { result } = await backupProductsBulk(mockClient as any, tmpDir);

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

      const { result } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/download|404/i);
    });

    it('should handle canceled bulk operation', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockRejectedValue(
        new BulkOperationError(BulkOperationStatus.CANCELED, null, 'Operation was canceled')
      );

      const { result } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancel/i);
    });
  });

  describe('JSONL reconstruction', () => {
    it('should reconstruct products with variants hierarchy', async () => {
      const flatData = createFlatProductData('1', {
        variants: [
          { id: 'gid://shopify/ProductVariant/100', sku: 'SKU-100' },
          { id: 'gid://shopify/ProductVariant/101', sku: 'SKU-101' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(true);
      expect(products[0].variants).toHaveLength(2);
      expect(products[0].variants[0].sku).toBe('SKU-100');
      expect(products[0].variants[1].sku).toBe('SKU-101');
    });

    it('should reconstruct variant metafields attached to correct variants', async () => {
      const flatData = createFlatProductData('1', {
        variants: [
          {
            id: 'gid://shopify/ProductVariant/100',
            sku: 'SKU-100',
            variantMetafields: [
              { id: 'gid://shopify/Metafield/500', key: 'variant_material', value: 'cotton' },
            ],
          },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(products[0].variants[0].metafields).toHaveLength(1);
      expect(products[0].variants[0].metafields[0].key).toBe('variant_material');
      expect(products[0].variants[0].metafields[0].value).toBe('cotton');
    });

    it('should attach product metafields to correct products', async () => {
      const flatData = createFlatProductData('1', {
        metafields: [
          { id: 'gid://shopify/Metafield/600', namespace: 'custom', key: 'product_care', value: 'Machine wash' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(products[0].metafields).toHaveLength(1);
      expect(products[0].metafields[0].key).toBe('product_care');
      expect(products[0].metafields[0].value).toBe('Machine wash');
    });

    it('should attach images to products', async () => {
      const flatData = createFlatProductData('1', {
        images: [
          { id: 'gid://shopify/ProductImage/100', url: 'https://cdn.shopify.com/image-100.jpg' },
          { id: 'gid://shopify/ProductImage/101', url: 'https://cdn.shopify.com/image-101.jpg' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(products[0].images).toHaveLength(2);
      expect(products[0].images[0].url).toBe('https://cdn.shopify.com/image-100.jpg');
      expect(products[0].images[1].url).toBe('https://cdn.shopify.com/image-101.jpg');
    });

    it('should handle complete product hierarchy (products -> variants -> variant metafields)', async () => {
      const flatData = createFlatProductData('1', {
        variants: [
          {
            id: 'gid://shopify/ProductVariant/100',
            sku: 'SKU-100',
            variantMetafields: [
              { id: 'gid://shopify/Metafield/700', key: 'variant_color', value: 'blue' },
            ],
          },
          {
            id: 'gid://shopify/ProductVariant/101',
            sku: 'SKU-101',
            variantMetafields: [
              { id: 'gid://shopify/Metafield/701', key: 'variant_size', value: 'large' },
            ],
          },
        ],
        metafields: [
          { id: 'gid://shopify/Metafield/800', namespace: 'custom', key: 'product_season', value: 'summer' },
        ],
        images: [
          { id: 'gid://shopify/ProductImage/200', url: 'https://cdn.shopify.com/image-200.jpg' },
        ],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation({ objectCount: '1' }));
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { products } = await backupProductsBulk(mockClient as any, tmpDir);

      // Product level
      expect(products[0].metafields).toHaveLength(1);
      expect(products[0].metafields[0].key).toBe('product_season');

      // Variant level
      expect(products[0].variants).toHaveLength(2);
      expect(products[0].variants[0].metafields[0].key).toBe('variant_color');
      expect(products[0].variants[1].metafields[0].key).toBe('variant_size');

      // Images
      expect(products[0].images).toHaveLength(1);
    });
  });

  describe('file output', () => {
    it('should write valid JSON file', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatProductData('1'));

      await backupProductsBulk(mockClient as any, tmpDir);

      const filePath = path.join(tmpDir, 'products.json');

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

    it('should write products to products.json in output directory', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(createFlatProductData('42'));

      await backupProductsBulk(mockClient as any, tmpDir);

      const expectedPath = path.join(tmpDir, 'products.json');
      const content = await fs.readFile(expectedPath, 'utf-8');
      const products = JSON.parse(content);

      expect(products).toHaveLength(1);
      expect(products[0].legacyResourceId).toBe('42');
    });

    it('should preserve all product fields and reconstruct children', async () => {
      const flatData = createFlatProductData('100', {
        variants: [{ id: 'gid://shopify/ProductVariant/200', sku: 'SKU-200' }],
        metafields: [{ id: 'gid://shopify/Metafield/300', namespace: 'custom', key: 'test', value: 'value' }],
        images: [{ id: 'gid://shopify/ProductImage/400', url: 'https://cdn.shopify.com/image-400.jpg' }],
      });

      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      await backupProductsBulk(mockClient as any, tmpDir);

      const content = await fs.readFile(path.join(tmpDir, 'products.json'), 'utf-8');
      const products = JSON.parse(content);

      // Verify parent fields preserved
      expect(products[0].id).toBe('gid://shopify/Product/100');
      expect(products[0].legacyResourceId).toBe('100');
      expect(products[0].title).toBe('Product 100');

      // Verify children reconstructed (without __parentId)
      expect(products[0].variants).toHaveLength(1);
      expect(products[0].variants[0].sku).toBe('SKU-200');
      expect(products[0].variants[0]).not.toHaveProperty('__parentId');

      expect(products[0].metafields).toHaveLength(1);
      expect(products[0].metafields[0].key).toBe('test');

      expect(products[0].images).toHaveLength(1);
      expect(products[0].images[0].url).toBe('https://cdn.shopify.com/image-400.jpg');
    });
  });

  describe('return value', () => {
    it('should return BackupResult with correct count and products array', async () => {
      vi.mocked(submitBulkOperation).mockResolvedValue('gid://shopify/BulkOperation/123');
      vi.mocked(pollBulkOperation).mockResolvedValue(createCompletedOperation());
      const flatData = [
        ...createFlatProductData('1'),
        ...createFlatProductData('2'),
        ...createFlatProductData('3'),
      ];
      vi.mocked(downloadBulkOperationResults).mockResolvedValue(flatData);

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result).toEqual({
        success: true,
        count: 3,
      });
      expect(products).toHaveLength(3);
    });

    it('should return error message and empty products on failure', async () => {
      const errorMessage = 'Custom error from Shopify API';

      vi.mocked(submitBulkOperation).mockRejectedValue(new Error(errorMessage));

      const { result, products } = await backupProductsBulk(mockClient as any, tmpDir);

      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain(errorMessage);
      expect(products).toEqual([]);
    });
  });
});
