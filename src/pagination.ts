import type { RestClient } from '@shopify/shopify-api';
import type { PageInfo, RestRequestReturn } from '@shopify/shopify-api';
import { withRetry } from './shopify.js';

/**
 * Query parameters for Shopify REST API requests
 */
export type QueryParams = Record<string, unknown>;

/**
 * Pagination options for Shopify REST API requests
 */
export interface PaginationOptions {
  /** Additional query parameters to include in every request */
  extraQuery?: QueryParams;
}

/**
 * Result from fetching all pages of a resource
 */
export interface PaginatedResult<T> {
  /** All items collected across all pages */
  items: T[];
  /** The final pageInfo object from the last response */
  pageInfo?: PageInfo;
}

/**
 * Shopify client wrapper interface
 */
export interface ShopifyClientWrapper {
  rest: RestClient;
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
export async function fetchAllPages<T>(
  client: ShopifyClientWrapper,
  resourcePath: string,
  bodyKey: string,
  options?: PaginationOptions,
): Promise<PaginatedResult<T>> {
  const allItems: T[] = [];
  let pageInfo: PageInfo | undefined = undefined;

  do {
    // Build request parameters
    let query: QueryParams;

    if (pageInfo?.nextPage?.query) {
      // Shopify doesn't allow original query params when using page_info cursor
      // Only use the pagination cursor params for subsequent requests
      query = { ...pageInfo.nextPage.query };
    } else {
      // Initial request - include limit and any extra query params
      query = { limit: 250, ...options?.extraQuery };
    }

    // Note: query is typed as QueryParams (Record<string, unknown>) but the Shopify API
    // internally expects SearchParams from @shopify/admin-api-client. Since we don't have
    // direct access to that type and the runtime behavior is compatible, we cast here.
    const response: RestRequestReturn<Record<string, unknown>> = await withRetry(() =>
      client.rest.get({
        path: resourcePath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: query as any,
        tries: 1,
      })
    );
    const items = response.body[bodyKey];

    if (Array.isArray(items)) {
      allItems.push(...items);
    }

    pageInfo = response.pageInfo;
  } while (pageInfo?.nextPage);

  return { items: allItems, pageInfo };
}

/**
 * Fetches all pages of a Shopify REST API resource with a callback per page.
 * This avoids accumulating all items in memory - useful for large datasets.
 *
 * @param client - Shopify API client instance
 * @param resourcePath - API endpoint path (e.g., 'products', 'customers', 'orders')
 * @param bodyKey - Key in response.body that contains the array of items
 * @param options - Additional options like extra query parameters
 * @param onPage - Callback invoked with each page of items
 * @returns Promise resolving to total count and final pageInfo
 */
export async function fetchAllPagesStreaming<T>(
  client: ShopifyClientWrapper,
  resourcePath: string,
  bodyKey: string,
  options: PaginationOptions | undefined,
  onPage: (items: T[]) => void,
): Promise<{ count: number; pageInfo?: PageInfo }> {
  let pageInfo: PageInfo | undefined = undefined;
  let totalCount = 0;

  do {
    let query: QueryParams;

    if (pageInfo?.nextPage?.query) {
      query = { ...pageInfo.nextPage.query };
    } else {
      query = { limit: 250, ...options?.extraQuery };
    }

    const response: RestRequestReturn<Record<string, unknown>> = await withRetry(() =>
      client.rest.get({
        path: resourcePath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query: query as any,
        tries: 1,
      })
    );
    const items = response.body[bodyKey];

    if (Array.isArray(items)) {
      onPage(items as T[]);
      totalCount += items.length;
    }

    pageInfo = response.pageInfo;
  } while (pageInfo?.nextPage);

  return { count: totalCount, pageInfo };
}
