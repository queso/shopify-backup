import { describe, it, expect } from 'vitest';
import { parseJsonl, reconstructNestedObjects } from '../jsonl.js';

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
      expect((result[0].addresses as any[])[0].address1).toBe('123 Main St');
      expect((result[0].addresses as any[])[1].address1).toBe('456 Oak Ave');
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
      expect((result[0].metafields as any[])[0].key).toBe('custom.field1');
      expect((result[0].metafields as any[])[1].key).toBe('custom.field3');
      expect(result[1].metafields).toHaveLength(1);
      expect((result[1].metafields as any[])[0].key).toBe('custom.field2');
    });

    it('should remove __parentId from child objects in result', () => {
      const flatData = [
        { id: 'gid://shopify/Customer/123', email: 'test@example.com' },
        { id: 'gid://shopify/MailingAddress/456', address1: '123 Main St', __parentId: 'gid://shopify/Customer/123' },
      ];

      const result = reconstructNestedObjects(flatData, 'addresses');

      expect((result[0].addresses as any[])[0]).not.toHaveProperty('__parentId');
      expect((result[0].addresses as any[])[0].address1).toBe('123 Main St');
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
      expect((result[0].variants as any[])[0].sku).toBe('SKU-001');
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
