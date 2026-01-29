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
interface BulkOperationRecord {
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
