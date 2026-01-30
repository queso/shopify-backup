import { describe, it, expect } from 'vitest';
import { parseJsonl, reconstructNestedObjects, reconstructBulkData } from '../jsonl.js';

describe('parseJsonl', () => {
  describe('parsing valid JSONL', () => {
    it('should parse valid JSONL with multiple lines', () => {
      const jsonl = `{"id":"1","name":"Product A"}
{"id":"2","name":"Product B"}
{"id":"3","name":"Product C"}`;

      const result = parseJsonl<{ id: string; name: string }>(jsonl);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: '1', name: 'Product A' });
      expect(result[1]).toEqual({ id: '2', name: 'Product B' });
      expect(result[2]).toEqual({ id: '3', name: 'Product C' });
    });

    it('should parse single line JSONL', () => {
      const jsonl = '{"id":"gid://shopify/Customer/123","email":"test@example.com"}';

      const result = parseJsonl<{ id: string; email: string }>(jsonl);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'gid://shopify/Customer/123',
        email: 'test@example.com',
      });
    });

    it('should handle lines with nested objects', () => {
      const jsonl = '{"id":"1","address":{"city":"New York","zip":"10001"}}';

      const result = parseJsonl<{ id: string; address: { city: string; zip: string } }>(jsonl);

      expect(result).toHaveLength(1);
      expect(result[0].address).toEqual({ city: 'New York', zip: '10001' });
    });

    it('should handle lines with arrays', () => {
      const jsonl = '{"id":"1","tags":["tag1","tag2","tag3"]}';

      const result = parseJsonl<{ id: string; tags: string[] }>(jsonl);

      expect(result).toHaveLength(1);
      expect(result[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  describe('handling empty input', () => {
    it('should return empty array for empty string', () => {
      const result = parseJsonl('');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for whitespace-only input', () => {
      const result = parseJsonl('   \n\n   \n');

      expect(result).toEqual([]);
    });

    it('should skip empty lines between valid JSON lines', () => {
      const jsonl = `{"id":"1"}

{"id":"2"}
`;

      const result = parseJsonl<{ id: string }>(jsonl);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1' });
      expect(result[1]).toEqual({ id: '2' });
    });
  });

  describe('error handling for malformed lines', () => {
    it('should throw on malformed JSON line with line number', () => {
      const jsonl = `{"id":"1"}
{invalid json}
{"id":"3"}`;

      expect(() => parseJsonl(jsonl)).toThrow();
      expect(() => parseJsonl(jsonl)).toThrow(/line 2/i);
    });

    it('should throw on incomplete JSON object', () => {
      const jsonl = '{"id":"1","name":';

      expect(() => parseJsonl(jsonl)).toThrow();
    });

    it('should throw on trailing comma in JSON', () => {
      const jsonl = '{"id":"1","name":"test",}';

      expect(() => parseJsonl(jsonl)).toThrow();
    });

    it('should provide descriptive error message for parsing failure', () => {
      const jsonl = `{"valid":"line"}
not valid json at all
{"another":"valid"}`;

      expect(() => parseJsonl(jsonl)).toThrow(/line 2/i);
    });
  });
});

describe('reconstructNestedObjects', () => {
  describe('handling flat JSONL with __parentId', () => {
    it('should reconstruct nested objects from flat JSONL with __parentId', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/123', email: 'test@example.com' },
        { id: 'gid://shopify/MailingAddress/456', address1: '123 Main St', __parentId: 'gid://shopify/Customer/123' },
        { id: 'gid://shopify/MailingAddress/789', address1: '456 Oak Ave', __parentId: 'gid://shopify/Customer/123' },
        { id: 'gid://shopify/Customer/999', email: 'other@example.com' },
      ];

      const result = reconstructNestedObjects(flatData, 'addresses');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('gid://shopify/Customer/123');
      expect(result[0].addresses).toHaveLength(2);
      expect((result[0].addresses as Array<Record<string, unknown>>)[0].address1).toBe('123 Main St');
      expect((result[0].addresses as Array<Record<string, unknown>>)[1].address1).toBe('456 Oak Ave');
      expect(result[1].id).toBe('gid://shopify/Customer/999');
      expect(result[1].addresses).toEqual([]);
    });

    it('should handle parent with no children', () => {
      const flatData = [{ id: 'gid://shopify/Customer/123', email: 'solo@example.com' }];

      const result = reconstructNestedObjects(flatData, 'children');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gid://shopify/Customer/123');
      expect(result[0].children).toEqual([]);
    });

    it('should handle empty input array', () => {
      const result = reconstructNestedObjects([], 'addresses');

      expect(result).toEqual([]);
    });

    it('should handle multiple parent types with interleaved children', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/1', email: 'first@example.com' },
        { id: 'gid://shopify/Metafield/101', key: 'custom.field1', __parentId: 'gid://shopify/Customer/1' },
        { id: 'gid://shopify/Customer/2', email: 'second@example.com' },
        { id: 'gid://shopify/Metafield/102', key: 'custom.field2', __parentId: 'gid://shopify/Customer/2' },
        { id: 'gid://shopify/Metafield/103', key: 'custom.field3', __parentId: 'gid://shopify/Customer/1' },
      ];

      const result = reconstructNestedObjects(flatData, 'metafields');

      expect(result).toHaveLength(2);
      expect(result[0].metafields).toHaveLength(2);
      expect((result[0].metafields as Array<Record<string, unknown>>)[0].key).toBe('custom.field1');
      expect((result[0].metafields as Array<Record<string, unknown>>)[1].key).toBe('custom.field3');
      expect(result[1].metafields).toHaveLength(1);
      expect((result[1].metafields as Array<Record<string, unknown>>)[0].key).toBe('custom.field2');
    });

    it('should remove __parentId from child objects in result', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/123', email: 'test@example.com' },
        { id: 'gid://shopify/MailingAddress/456', address1: '123 Main St', __parentId: 'gid://shopify/Customer/123' },
      ];

      const result = reconstructNestedObjects(flatData, 'addresses');

      expect((result[0].addresses as Array<Record<string, unknown>>)[0]).not.toHaveProperty('__parentId');
      expect((result[0].addresses as Array<Record<string, unknown>>)[0].address1).toBe('123 Main St');
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested Shopify GIDs', () => {
      const flatData = [
        { id: 'gid://shopify/Product/123456789', title: 'Test Product' },
        { id: 'gid://shopify/ProductVariant/987654321', sku: 'SKU-001', __parentId: 'gid://shopify/Product/123456789' },
      ];

      const result = reconstructNestedObjects(flatData, 'variants');

      expect(result).toHaveLength(1);
      expect(result[0].variants).toHaveLength(1);
      expect((result[0].variants as Array<Record<string, unknown>>)[0].sku).toBe('SKU-001');
    });

    it('should preserve all parent properties', () => {
      const flatData = [
        {
          id: 'gid://shopify/Customer/123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          tags: ['vip', 'loyal'],
        },
      ];

      const result = reconstructNestedObjects(flatData, 'addresses');

      expect(result[0]).toMatchObject({
        id: 'gid://shopify/Customer/123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        tags: ['vip', 'loyal'],
      });
    });
  });
});

/**
 * Tests for reconstructBulkData - handles multiple child types per parent
 * and multi-level nesting (e.g., product -> variant -> variant metafield)
 *
 * Shopify bulk operations return FLAT JSONL with __parentId references.
 * This function reconstructs the hierarchy based on GID type detection.
 */
describe('reconstructBulkData', () => {
  describe('orders reconstruction', () => {
    it('should reconstruct order with lineItems, transactions, fulfillments, metafields', () => {
      // Flat JSONL data as Shopify returns it
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001', email: 'test@test.com' },
        { id: 'gid://shopify/LineItem/101', title: 'Product A', quantity: 2, __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/LineItem/102', title: 'Product B', quantity: 1, __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/OrderTransaction/201', kind: 'SALE', status: 'SUCCESS', __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/Fulfillment/301', status: 'FULFILLED', __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/Metafield/401', namespace: 'custom', key: 'note', __parentId: 'gid://shopify/Order/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(1);
      expect(result[0].lineItems).toHaveLength(2);
      expect(result[0].transactions).toHaveLength(1);
      expect(result[0].fulfillments).toHaveLength(1);
      expect(result[0].metafields).toHaveLength(1);
    });

    it('should reconstruct order with refunds attached', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001', email: 'test@test.com' },
        { id: 'gid://shopify/Refund/501', createdAt: '2024-01-15', __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/Refund/502', createdAt: '2024-01-16', __parentId: 'gid://shopify/Order/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(1);
      expect(result[0].refunds).toHaveLength(2);
      expect((result[0].refunds as Array<Record<string, unknown>>)[0].createdAt).toBe('2024-01-15');
    });

    it('should reconstruct multiple orders with interleaved children', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/LineItem/101', title: 'Product A', __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/Order/2', name: '#1002' },
        { id: 'gid://shopify/LineItem/102', title: 'Product B', __parentId: 'gid://shopify/Order/2' },
        { id: 'gid://shopify/OrderTransaction/201', kind: 'SALE', __parentId: 'gid://shopify/Order/1' },
        { id: 'gid://shopify/OrderTransaction/202', kind: 'SALE', __parentId: 'gid://shopify/Order/2' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('#1001');
      expect(result[0].lineItems).toHaveLength(1);
      expect((result[0].lineItems as Array<Record<string, unknown>>)[0].title).toBe('Product A');
      expect(result[0].transactions).toHaveLength(1);
      expect(result[1].name).toBe('#1002');
      expect(result[1].lineItems).toHaveLength(1);
      expect((result[1].lineItems as Array<Record<string, unknown>>)[0].title).toBe('Product B');
      expect(result[1].transactions).toHaveLength(1);
    });

    it('should handle order with shipping lines', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/ShippingLine/601', title: 'Standard Shipping', __parentId: 'gid://shopify/Order/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result[0].shippingLines).toHaveLength(1);
      expect((result[0].shippingLines as Array<Record<string, unknown>>)[0].title).toBe('Standard Shipping');
    });

    it('should handle order with discount applications', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/DiscountApplication/701', title: '10% OFF', __parentId: 'gid://shopify/Order/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result[0].discountApplications).toHaveLength(1);
      expect((result[0].discountApplications as Array<Record<string, unknown>>)[0].title).toBe('10% OFF');
    });
  });

  describe('products reconstruction', () => {
    it('should reconstruct product with variants, images, metafields', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Test Product' },
        { id: 'gid://shopify/ProductVariant/101', title: 'Small', sku: 'SKU-S', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductVariant/102', title: 'Large', sku: 'SKU-L', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductImage/201', url: 'https://cdn.shopify.com/1.jpg', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/Metafield/301', namespace: 'custom', key: 'material', __parentId: 'gid://shopify/Product/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');

      expect(result).toHaveLength(1);
      expect(result[0].variants).toHaveLength(2);
      expect(result[0].images).toHaveLength(1);
      expect(result[0].metafields).toHaveLength(1);
    });

    it('should handle MediaImage GID for product images', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Test Product' },
        { id: 'gid://shopify/MediaImage/201', url: 'https://cdn.shopify.com/1.jpg', __parentId: 'gid://shopify/Product/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');

      expect(result[0].images).toHaveLength(1);
      expect((result[0].images as Array<Record<string, unknown>>)[0].url).toBe('https://cdn.shopify.com/1.jpg');
    });

    it('should reconstruct variant metafields attached to correct variants (multi-level nesting)', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Test Product' },
        { id: 'gid://shopify/ProductVariant/101', title: 'Small', sku: 'SKU-S', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductVariant/102', title: 'Large', sku: 'SKU-L', __parentId: 'gid://shopify/Product/1' },
        // Variant metafield - nested under variant!
        { id: 'gid://shopify/Metafield/302', namespace: 'custom', key: 'size_guide', __parentId: 'gid://shopify/ProductVariant/101' },
        { id: 'gid://shopify/Metafield/303', namespace: 'custom', key: 'color_code', __parentId: 'gid://shopify/ProductVariant/102' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');
      const variants = result[0].variants as Array<Record<string, unknown>>;
      const v0Metafields = variants[0].metafields as Array<Record<string, unknown>>;
      const v1Metafields = variants[1].metafields as Array<Record<string, unknown>>;

      expect(variants).toHaveLength(2);
      // Variant 101 should have metafield 302
      expect(v0Metafields).toHaveLength(1);
      expect(v0Metafields[0].key).toBe('size_guide');
      // Variant 102 should have metafield 303
      expect(v1Metafields).toHaveLength(1);
      expect(v1Metafields[0].key).toBe('color_code');
    });

    it('should handle mixed product metafields and variant metafields', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Test Product' },
        { id: 'gid://shopify/ProductVariant/101', title: 'Small', __parentId: 'gid://shopify/Product/1' },
        // Product-level metafield
        { id: 'gid://shopify/Metafield/301', namespace: 'custom', key: 'product_care', __parentId: 'gid://shopify/Product/1' },
        // Variant-level metafield
        { id: 'gid://shopify/Metafield/302', namespace: 'custom', key: 'variant_material', __parentId: 'gid://shopify/ProductVariant/101' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');
      const metafields = result[0].metafields as Array<Record<string, unknown>>;
      const variants = result[0].variants as Array<Record<string, unknown>>;
      const variantMetafields = variants[0].metafields as Array<Record<string, unknown>>;

      // Product should have its own metafield
      expect(metafields).toHaveLength(1);
      expect(metafields[0].key).toBe('product_care');
      // Variant should have its own metafield
      expect(variantMetafields).toHaveLength(1);
      expect(variantMetafields[0].key).toBe('variant_material');
    });

    it('should reconstruct multiple products with complete hierarchies', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Product A' },
        { id: 'gid://shopify/ProductVariant/101', title: 'A-Small', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductImage/201', url: 'https://cdn.shopify.com/a.jpg', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/Product/2', title: 'Product B' },
        { id: 'gid://shopify/ProductVariant/102', title: 'B-Large', __parentId: 'gid://shopify/Product/2' },
        { id: 'gid://shopify/Metafield/301', namespace: 'custom', key: 'a_meta', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/Metafield/302', namespace: 'custom', key: 'b_meta', __parentId: 'gid://shopify/Product/2' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Product A');
      expect(result[0].variants).toHaveLength(1);
      expect(result[0].images).toHaveLength(1);
      expect(result[0].metafields).toHaveLength(1);
      expect(result[1].title).toBe('Product B');
      expect(result[1].variants).toHaveLength(1);
      expect(result[1].images).toHaveLength(0);
      expect(result[1].metafields).toHaveLength(1);
    });
  });

  describe('collections reconstruction', () => {
    it('should reconstruct collection with products and metafields', () => {
      const flatData = [
        { id: 'gid://shopify/Collection/1', title: 'Summer Collection' },
        { id: 'gid://shopify/Product/101', title: 'T-Shirt', __parentId: 'gid://shopify/Collection/1' },
        { id: 'gid://shopify/Product/102', title: 'Shorts', __parentId: 'gid://shopify/Collection/1' },
        { id: 'gid://shopify/Metafield/201', namespace: 'custom', key: 'season', __parentId: 'gid://shopify/Collection/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Collection');

      expect(result).toHaveLength(1);
      expect(result[0].products).toHaveLength(2);
      expect(result[0].metafields).toHaveLength(1);
    });

    it('should handle collection with only metafields (smart collection)', () => {
      const flatData = [
        { id: 'gid://shopify/Collection/1', title: 'Smart Collection', ruleSet: { rules: [] } },
        { id: 'gid://shopify/Metafield/201', namespace: 'custom', key: 'banner', __parentId: 'gid://shopify/Collection/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Collection');

      expect(result[0].products).toHaveLength(0);
      expect(result[0].metafields).toHaveLength(1);
    });
  });

  describe('customers reconstruction', () => {
    it('should reconstruct customer with addresses and metafields', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/1', email: 'test@example.com' },
        { id: 'gid://shopify/MailingAddress/101', address1: '123 Main St', __parentId: 'gid://shopify/Customer/1' },
        { id: 'gid://shopify/MailingAddress/102', address1: '456 Oak Ave', __parentId: 'gid://shopify/Customer/1' },
        { id: 'gid://shopify/Metafield/201', namespace: 'custom', key: 'loyalty_tier', __parentId: 'gid://shopify/Customer/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Customer');

      expect(result).toHaveLength(1);
      expect(result[0].addresses).toHaveLength(2);
      expect(result[0].metafields).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty data', () => {
      expect(reconstructBulkData([], 'Order')).toEqual([]);
    });

    it('should handle orphan children (missing parent)', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/LineItem/101', title: 'Product', __parentId: 'gid://shopify/Order/999' }, // Parent doesn't exist
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(1);
      expect(result[0].lineItems).toHaveLength(0); // Orphan not attached
    });

    it('should preserve order of parents', () => {
      const flatData = [
        { id: 'gid://shopify/Order/2', name: '#1002' },
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/Order/3', name: '#1003' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result[0].name).toBe('#1002');
      expect(result[1].name).toBe('#1001');
      expect(result[2].name).toBe('#1003');
    });

    it('should remove __parentId from reconstructed children', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Test' },
        { id: 'gid://shopify/ProductVariant/101', title: 'Small', __parentId: 'gid://shopify/Product/1' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');
      const variants = result[0].variants as Array<Record<string, unknown>>;

      expect(variants[0]).not.toHaveProperty('__parentId');
    });

    it('should initialize empty arrays for all child types', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result[0].lineItems).toEqual([]);
      expect(result[0].transactions).toEqual([]);
      expect(result[0].fulfillments).toEqual([]);
      expect(result[0].refunds).toEqual([]);
      expect(result[0].metafields).toEqual([]);
    });

    it('should handle unknown child type gracefully', () => {
      const flatData = [
        { id: 'gid://shopify/Order/1', name: '#1001' },
        { id: 'gid://shopify/UnknownType/999', foo: 'bar', __parentId: 'gid://shopify/Order/1' },
      ];

      // Should not throw, but unknown child won't be attached
      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('#1001');
    });

    it('should handle parent type not matching root type', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/1', email: 'test@example.com' }, // Customer, not Order
        { id: 'gid://shopify/MailingAddress/101', address1: '123 Main St', __parentId: 'gid://shopify/Customer/1' },
      ];

      // When looking for Orders, customer should not be included
      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result).toHaveLength(0);
    });

    it('should preserve all original properties on parent', () => {
      const flatData = [
        {
          id: 'gid://shopify/Order/1',
          name: '#1001',
          email: 'customer@example.com',
          totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
          tags: ['rush', 'gift'],
          customField: 'preserved',
        },
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Order');

      expect(result[0].name).toBe('#1001');
      expect(result[0].email).toBe('customer@example.com');
      expect(result[0].totalPriceSet).toEqual({ shopMoney: { amount: '100.00', currencyCode: 'USD' } });
      expect(result[0].tags).toEqual(['rush', 'gift']);
      expect(result[0].customField).toBe('preserved');
    });

    it('should handle deeply nested variant metafields with multiple variants', () => {
      const flatData = [
        { id: 'gid://shopify/Product/1', title: 'Product' },
        { id: 'gid://shopify/ProductVariant/101', title: 'Small', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductVariant/102', title: 'Medium', __parentId: 'gid://shopify/Product/1' },
        { id: 'gid://shopify/ProductVariant/103', title: 'Large', __parentId: 'gid://shopify/Product/1' },
        // Variant 101 gets 2 metafields
        { id: 'gid://shopify/Metafield/201', key: 'meta1', __parentId: 'gid://shopify/ProductVariant/101' },
        { id: 'gid://shopify/Metafield/202', key: 'meta2', __parentId: 'gid://shopify/ProductVariant/101' },
        // Variant 102 gets 1 metafield
        { id: 'gid://shopify/Metafield/203', key: 'meta3', __parentId: 'gid://shopify/ProductVariant/102' },
        // Variant 103 gets no metafields
      ];

      const result = reconstructBulkData<Record<string, unknown>>(flatData, 'Product');
      const variants = result[0].variants as Array<Record<string, unknown>>;

      expect(variants).toHaveLength(3);
      expect(variants[0].metafields).toHaveLength(2);
      expect(variants[1].metafields).toHaveLength(1);
      expect(variants[2].metafields).toHaveLength(0);
    });
  });
});
