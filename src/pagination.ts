import { withRetry } from './shopify.js';

/**
 * Pagination options for Shopify REST API requests
 */
export interface PaginationOptions {
  /** Additional query parameters to include in every request */
  extraQuery?: Record<string, any>;
}

/**
 * Result from fetching all pages of a resource
 */
export interface PaginatedResult<T> {
  /** All items collected across all pages */
  items: T[];
  /** The final pageInfo object from the last response */
  pageInfo?: any;
}

/**
 * Fetches all pages of a Shopify REST API resource using cursor-based pagination.
 *
 * This utility handles the common pagination pattern where:
 * 1. Initial request is made with a limit parameter
 * 2. Subsequent requests include pagination tokens from pageInfo.nextPage.query
 * 3. Loop continues until pageInfo.nextPage is undefined
 *
 * @param client - Shopify API client instance
 * @param resourcePath - API endpoint path (e.g., 'products', 'customers', 'orders')
 * @param bodyKey - Key in response.body that contains the array of items
 * @param options - Additional options like extra query parameters
 * @returns Promise resolving to all items and final pageInfo
 *
 * @example
 * ```typescript
 * const { items } = await fetchAllPages(
 *   client,
 *   'orders',
 *   'orders',
 *   { extraQuery: { status: 'any' } }
 * );
 * ```
 */
export async function fetchAllPages<T = any>(
  client: any,
  resourcePath: string,
  bodyKey: string,
  options?: PaginationOptions,
): Promise<PaginatedResult<T>> {
  const allItems: T[] = [];
  let pageInfo: any = undefined;

  do {
    const params: any = {
      path: resourcePath,
      query: { limit: 250, ...options?.extraQuery },
    };

    if (pageInfo?.nextPage?.query) {
      // Shopify doesn't allow original query params when using page_info cursor
      params.query = { limit: 250, ...pageInfo.nextPage.query };
    }

    const response: any = await withRetry(() => client.rest.get({ ...params, tries: 1 }));
    const items = response.body[bodyKey];

    if (Array.isArray(items)) {
      allItems.push(...items);
    }

    pageInfo = response.pageInfo;
  } while (pageInfo?.nextPage);

  return { items: allItems, pageInfo };
}
