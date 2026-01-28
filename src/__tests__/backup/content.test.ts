import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ContentBackupResult } from '../../types.js';

// Mock withRetry to pass through the function directly
vi.mock('../../shopify.js', () => ({
  withRetry: vi.fn((fn: () => Promise<any>) => fn()),
}));

import { backupContent } from '../../backup/content.js';

describe('backupContent', () => {
  let tmpDir: string;
  let mockClient: any;

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

  function mockGetResponses(...responses: any[]) {
    for (const resp of responses) {
      mockClient.rest.get.mockResolvedValueOnce(resp);
    }
  }

  // Helper: set up mocks for a full successful run with minimal data
  function mockFullSuccessRun() {
    mockGetResponses(
      // pages
      { body: { pages: [{ id: 1, title: 'About' }] }, pageInfo: { nextPage: undefined } },
      // smart collections
      { body: { smart_collections: [{ id: 10, title: 'Auto' }] }, pageInfo: { nextPage: undefined } },
      // custom collections
      { body: { custom_collections: [{ id: 20, title: 'Manual' }] }, pageInfo: { nextPage: undefined } },
      // collection metafields for id 10
      { body: { metafields: [{ key: 'seo', value: 'desc' }] } },
      // collection metafields for id 20
      { body: { metafields: [] } },
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

    await backupContent(mockClient, tmpDir);

    const pages = JSON.parse(await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8'));
    expect(pages).toEqual([{ id: 1, title: 'About' }]);
  });

  it('should fetch smart and custom collections and merge into collections.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient, tmpDir);

    const collections = JSON.parse(await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8'));
    expect(collections).toHaveLength(2);
    expect(collections.map((c: any) => c.id)).toEqual(expect.arrayContaining([10, 20]));
  });

  it('should include collection metafields for each collection', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient, tmpDir);

    const collections = JSON.parse(await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8'));
    const smart = collections.find((c: any) => c.id === 10);
    expect(smart.metafields).toEqual([{ key: 'seo', value: 'desc' }]);
  });

  it('should fetch blogs with articles and write blogs.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient, tmpDir);

    const blogs = JSON.parse(await fs.readFile(path.join(tmpDir, 'blogs.json'), 'utf-8'));
    expect(blogs).toHaveLength(1);
    expect(blogs[0].articles).toEqual([{ id: 200, title: 'Post 1' }]);
  });

  it('should fetch shop-level metafields and write metafields.json', async () => {
    mockFullSuccessRun();

    await backupContent(mockClient, tmpDir);

    const metafields = JSON.parse(await fs.readFile(path.join(tmpDir, 'metafields.json'), 'utf-8'));
    expect(metafields).toEqual([{ key: 'shop_info', value: 'val' }]);
  });

  it('should return ContentBackupResult with per-resource results', async () => {
    mockFullSuccessRun();

    const result: ContentBackupResult = await backupContent(mockClient, tmpDir);

    expect(result.pages).toEqual({ success: true, count: 1 });
    expect(result.collections).toEqual({ success: true, count: 2 });
    expect(result.blogs).toEqual({ success: true, count: 1 });
    expect(result.shopMetafields).toEqual({ success: true, count: 1 });
  });

  it('should handle API errors per resource without aborting others', async () => {
    mockClient.rest.get
      .mockRejectedValueOnce(new Error('Pages API error'))
      // smart collections
      .mockResolvedValueOnce({ body: { smart_collections: [] }, pageInfo: { nextPage: undefined } })
      // custom collections
      .mockResolvedValueOnce({ body: { custom_collections: [] }, pageInfo: { nextPage: undefined } })
      // blogs
      .mockResolvedValueOnce({ body: { blogs: [] }, pageInfo: { nextPage: undefined } })
      // shop metafields
      .mockResolvedValueOnce({ body: { metafields: [] }, pageInfo: { nextPage: undefined } });

    const result = await backupContent(mockClient, tmpDir);

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

    const result = await backupContent(mockClient, tmpDir);

    expect(result.pages).toEqual({ success: true, count: 0 });
    expect(result.collections).toEqual({ success: true, count: 0 });
    expect(result.blogs).toEqual({ success: true, count: 0 });
    expect(result.shopMetafields).toEqual({ success: true, count: 0 });

    const pages = JSON.parse(await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8'));
    expect(pages).toEqual([]);
  });
});
