/**
 * JSONL (JSON Lines) parser utilities for Shopify Bulk Operations
 *
 * Shopify bulk operations return data in JSONL format where each line
 * is a valid JSON object. Parent objects are followed by their children
 * which have a __parentId field linking back to the parent.
 */

/**
 * Parse a JSONL string into an array of typed objects
 *
 * @param jsonl - The JSONL string to parse
 * @returns Array of parsed objects
 * @throws Error with line number if parsing fails
 */
export function parseJsonl<T = Record<string, unknown>>(jsonl: string): T[] {
  if (!jsonl || jsonl.trim() === '') {
    return [];
  }

  const lines = jsonl.split('\n');
  const results: T[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as T;
      results.push(parsed);
    } catch (error) {
      const lineNumber = i + 1;
      throw new Error(
        `Failed to parse JSON at line ${lineNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return results;
}

/**
 * Record with id and optional __parentId for Shopify bulk operation results
 */
export interface BulkOperationRecord {
  id: string;
  __parentId?: string;
  [key: string]: unknown;
}

/**
 * Reconstruct nested objects from flat JSONL data with __parentId references
 *
 * Shopify bulk operations return a flat list where child objects have a
 * __parentId field. This function groups children under their parent objects.
 *
 * @param flatData - Array of flat records from parseJsonl
 * @param childKey - The key to use for the nested children array
 * @returns Array of parent objects with nested children
 */
export function reconstructNestedObjects<TParent extends BulkOperationRecord>(
  flatData: BulkOperationRecord[],
  childKey: string
): (TParent & Record<string, unknown>)[] {
  if (flatData.length === 0) {
    return [];
  }

  const parents: Map<string, TParent & Record<string, unknown>> = new Map();
  const parentOrder: string[] = [];

  // First pass: identify parents (records without __parentId)
  for (const record of flatData) {
    if (!record.__parentId) {
      const parent = { ...record, [childKey]: [] } as TParent & Record<string, unknown>;
      parents.set(record.id, parent);
      parentOrder.push(record.id);
    }
  }

  // Second pass: attach children to their parents
  for (const record of flatData) {
    if (record.__parentId) {
      const parent = parents.get(record.__parentId);
      if (parent) {
        // Remove __parentId from child before adding
        const { __parentId, ...childWithoutParentId } = record;
        (parent[childKey] as unknown[]).push(childWithoutParentId);
      }
    }
  }

  // Return parents in their original order
  return parentOrder.map((id) => parents.get(id)!);
}

/**
 * Supported root types for bulk operations
 */
export type RootType = 'Order' | 'Product' | 'Collection' | 'Customer';

/**
 * GID prefix to root type mapping
 */
const ROOT_PREFIXES: Record<RootType, string> = {
  Order: 'gid://shopify/Order/',
  Product: 'gid://shopify/Product/',
  Collection: 'gid://shopify/Collection/',
  Customer: 'gid://shopify/Customer/',
};

/**
 * GID prefix to child array key mapping
 */
const CHILD_TYPE_MAP: Record<string, string> = {
  'gid://shopify/LineItem/': 'lineItems',
  'gid://shopify/OrderTransaction/': 'transactions',
  'gid://shopify/Fulfillment/': 'fulfillments',
  'gid://shopify/Refund/': 'refunds',
  'gid://shopify/ShippingLine/': 'shippingLines',
  'gid://shopify/DiscountApplication/': 'discountApplications',
  'gid://shopify/ProductVariant/': 'variants',
  'gid://shopify/ProductImage/': 'images',
  'gid://shopify/MediaImage/': 'images',
  'gid://shopify/Metafield/': 'metafields',
  'gid://shopify/MailingAddress/': 'addresses',
  'gid://shopify/Product/': 'products',
};

/**
 * Child types that can themselves have children (for multi-level nesting)
 */
const INTERMEDIATE_TYPES: Record<string, string> = {
  'gid://shopify/ProductVariant/': 'variants',
};

/**
 * Child types allowed per root type
 */
const ALLOWED_CHILDREN: Record<RootType, string[]> = {
  Order: ['lineItems', 'transactions', 'fulfillments', 'refunds', 'shippingLines', 'discountApplications', 'metafields'],
  Product: ['variants', 'images', 'metafields'],
  Collection: ['products', 'metafields'],
  Customer: ['addresses', 'metafields'],
};

/**
 * Detect the child type key from a GID string
 *
 * @param id - The Shopify GID
 * @returns The array key for this child type, or undefined if unknown
 */
function getChildTypeKey(id: string | undefined): string | undefined {
  if (!id) return undefined;
  for (const [prefix, key] of Object.entries(CHILD_TYPE_MAP)) {
    if (id.startsWith(prefix)) {
      return key;
    }
  }
  return undefined;
}

/**
 * Check if the ID represents an intermediate type that can have children
 *
 * @param id - The Shopify GID
 * @returns True if this ID represents an intermediate type
 */
function isIntermediateType(id: string | undefined): boolean {
  if (!id) return false;
  for (const prefix of Object.keys(INTERMEDIATE_TYPES)) {
    if (id.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Reconstruct hierarchical data from flat Shopify bulk operation JSONL output
 *
 * Shopify bulk operations return FLAT JSONL data with __parentId references.
 * This function reconstructs the nested hierarchy based on GID type detection.
 *
 * Handles:
 * - Multiple child types per parent (e.g., order with lineItems AND transactions)
 * - Multi-level nesting (e.g., product -> variant -> variant metafield)
 * - Preserves original order of parents
 * - Removes __parentId from children
 *
 * @param flatData - Array of flat records from parseJsonl
 * @param rootType - The type of root objects to extract
 * @returns Array of reconstructed parent objects with nested children
 */
export function reconstructBulkData<T>(
  flatData: BulkOperationRecord[],
  rootType: RootType
): T[] {
  if (flatData.length === 0) {
    return [];
  }

  const rootPrefix = ROOT_PREFIXES[rootType];
  const allowedChildren = ALLOWED_CHILDREN[rootType];

  // Maps for tracking objects
  const roots: Map<string, Record<string, unknown>> = new Map();
  const rootOrder: string[] = [];
  const intermediates: Map<string, Record<string, unknown>> = new Map();

  // First pass: identify root objects and initialize child arrays
  for (const record of flatData) {
    if (!record.__parentId && record.id && record.id.startsWith(rootPrefix)) {
      const root: Record<string, unknown> = { ...record };

      // Initialize empty arrays for all allowed child types
      for (const childType of allowedChildren) {
        root[childType] = [];
      }

      roots.set(record.id, root);
      rootOrder.push(record.id);
    }
  }

  // Second pass: identify intermediate types (e.g., variants) and first-level children
  for (const record of flatData) {
    if (record.__parentId) {
      const parent = roots.get(record.__parentId);

      if (parent) {
        const childTypeKey = getChildTypeKey(record.id);

        if (childTypeKey && allowedChildren.includes(childTypeKey)) {
          const { __parentId, ...childWithoutParentId } = record;

          // If this is an intermediate type, initialize its child arrays and track it
          if (isIntermediateType(record.id)) {
            childWithoutParentId.metafields = [];
            intermediates.set(record.id, childWithoutParentId);
          }

          (parent[childTypeKey] as unknown[]).push(childWithoutParentId);
        }
      }
    }
  }

  // Third pass: attach children to intermediate types (e.g., variant metafields)
  for (const record of flatData) {
    if (record.__parentId) {
      const intermediate = intermediates.get(record.__parentId);

      if (intermediate) {
        const childTypeKey = getChildTypeKey(record.id);

        if (childTypeKey === 'metafields') {
          const { __parentId, ...childWithoutParentId } = record;
          (intermediate.metafields as unknown[]).push(childWithoutParentId);
        }
      }
    }
  }

  // Return roots in their original order
  return rootOrder.map((id) => roots.get(id) as T);
}
