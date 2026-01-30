import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ContentBackupResult } from '../../types.js';

// Mock withRetry to pass through the function directly
vi.mock('../../shopify.js', () => ({
  withRetry: vi.fn(<T>(fn: () => Promise<T>) => fn()),
}));

import { backupContent } from '../../backup/content.js';
import type { ShopifyClientWrapper } from '../../pagination.js';

interface MockClient {
  rest: {
    get: (params: unknown) => Promise<unknown>;
  };
}

describe('backupContent', () => {
  let tmpDir: string;
  let mockClient: MockClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-test-'));
    mockClient = {
      rest: {
        get: vi.fn(),
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function mockGetResponses(...responses: unknown[]): void {
    for (const resp of responses) {
      (mockClient.rest.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(resp);
    }
  }

  // Helper: set up mocks for a full successful run with minimal data
  function mockFullSuccessRun(): void {
    mockGetResponses(
      // pages
      { body: { pages: [{ id: 1, title: 'About' }] }, pageInfo: { nextPage: undefined } },
      // smart collections
      { body: { smart_collections: [{ id: 10, title: 'Auto' }] }, pageInfo: { nextPage: undefined } },
      // custom collections
      { body: { custom_collections: [{ id: 20, title: 'Manual' }] }, pageInfo: { nextPage: undefined } },
      // NOTE: collection metafields are intentionally stubbed as [] in the implementation
      // due to rate limits (see TODO in content.ts)
      // blogs
      { body: { blogs: [{ id: 100, title: 'News' }] }, pageInfo: { nextPage: undefined } },
      // articles for blog 100
      { body: { articles: [{ id: 200, title: 'Post 1' }] }, pageInfo: { nextPage: undefined } },
      // shop metafields
      { body: { metafields: [{ key: 'shop_info', value: 'val' }] }, pageInfo: { nextPage: undefined } },
    );
  }

  it('should fetch all pages and write pages.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    const pages = JSON.parse(await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8'));
    expect(pages).toEqual([{ id: 1, title: 'About' }]);
  });

  it('should fetch smart and custom collections and merge into collections.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    const collections = JSON.parse(await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8')) as Array<{ id: number }>;
    expect(collections).toHaveLength(2);
    expect(collections.map((c) => c.id)).toEqual(expect.arrayContaining([10, 20]));
  });

  it('should stub collection metafields as empty arrays (TODO: use GraphQL bulk ops)', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    const collections = JSON.parse(await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8')) as Array<{ id: number; metafields: unknown[] }>;
    const smart = collections.find((c) => c.id === 10);
    expect(smart).toBeDefined();
    // Metafields are intentionally stubbed as [] due to rate limits
    expect(smart!.metafields).toEqual([]);
  });

  it('should fetch blogs with articles and write blogs.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    const blogs = JSON.parse(await fs.readFile(path.join(tmpDir, 'blogs.json'), 'utf-8'));
    expect(blogs).toHaveLength(1);
    expect(blogs[0].articles).toEqual([{ id: 200, title: 'Post 1' }]);
  });

  it('should fetch shop-level metafields and write metafields.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    const metafields = JSON.parse(await fs.readFile(path.join(tmpDir, 'metafields.json'), 'utf-8'));
    expect(metafields).toEqual([{ key: 'shop_info', value: 'val' }]);
  });

  it('should return ContentBackupResult with per-resource results', async () => {
    mockFullSuccessRun();

    const result: ContentBackupResult = await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    expect(result.pages).toEqual({ success: true, count: 1 });
    expect(result.collections).toEqual({ success: true, count: 2 });
    expect(result.blogs).toEqual({ success: true, count: 1 });
    expect(result.shopMetafields).toEqual({ success: true, count: 1 });
  });

  it('should handle API errors per resource without aborting others', async () => {
    (mockClient.rest.get as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Pages API error'))
      // smart collections
      .mockResolvedValueOnce({ body: { smart_collections: [] }, pageInfo: { nextPage: undefined } })
      // custom collections
      .mockResolvedValueOnce({ body: { custom_collections: [] }, pageInfo: { nextPage: undefined } })
      // blogs
      .mockResolvedValueOnce({ body: { blogs: [] }, pageInfo: { nextPage: undefined } })
      // shop metafields
      .mockResolvedValueOnce({ body: { metafields: [] }, pageInfo: { nextPage: undefined } });

    const result = await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    expect(result.pages.success).toBe(false);
    expect(result.pages.error).toBeDefined();
    // Other resources should still succeed
    expect(result.collections.success).toBe(true);
    expect(result.blogs.success).toBe(true);
    expect(result.shopMetafields.success).toBe(true);
  });

  it('should handle empty data gracefully', async () => {
    mockGetResponses(
      // pages empty
      { body: { pages: [] }, pageInfo: { nextPage: undefined } },
      // smart collections empty
      { body: { smart_collections: [] }, pageInfo: { nextPage: undefined } },
      // custom collections empty
      { body: { custom_collections: [] }, pageInfo: { nextPage: undefined } },
      // blogs empty
      { body: { blogs: [] }, pageInfo: { nextPage: undefined } },
      // shop metafields empty
      { body: { metafields: [] }, pageInfo: { nextPage: undefined } },
    );

    const result = await backupContent(mockClient as ShopifyClientWrapper, tmpDir);

    expect(result.pages).toEqual({ success: true, count: 0 });
    expect(result.collections).toEqual({ success: true, count: 0 });
    expect(result.blogs).toEqual({ success: true, count: 0 });
    expect(result.shopMetafields).toEqual({ success: true, count: 0 });

    const pages = JSON.parse(await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8'));
    expect(pages).toEqual([]);
  });
});
