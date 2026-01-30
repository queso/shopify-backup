import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupResult, ContentBackupResult } from '../types.js';
import { fetchAllPages, type ShopifyClientWrapper } from '../pagination.js';

interface ShopifyData {
  metafields?: unknown[];
  [key: string]: unknown;
}

async function fetchPages(client: ShopifyClientWrapper): Promise<{ data: ShopifyData[]; result: BackupResult }> {
  const { items: allPages } = await fetchAllPages<ShopifyData>(client, 'pages', 'pages');
  return { data: allPages, result: { success: true, count: allPages.length } };
}

async function fetchCollections(client: ShopifyClientWrapper): Promise<{ data: ShopifyData[]; result: BackupResult }> {
  const allCollections: ShopifyData[] = [];

  // Smart collections
  const { items: smartCollections } = await fetchAllPages<ShopifyData>(
    client,
    'smart_collections',
    'smart_collections',
  );
  allCollections.push(...smartCollections);

  // Custom collections
  const { items: customCollections } = await fetchAllPages<ShopifyData>(
    client,
    'custom_collections',
    'custom_collections',
  );
  allCollections.push(...customCollections);

  // TODO: Metafield fetching skipped due to rate limits — use GraphQL bulk ops
  for (const collection of allCollections) {
    collection.metafields = [];
  }

  return { data: allCollections, result: { success: true, count: allCollections.length } };
}

async function fetchBlogs(client: ShopifyClientWrapper): Promise<{ data: ShopifyData[]; result: BackupResult }> {
  const { items: blogs } = await fetchAllPages<ShopifyData>(client, 'blogs', 'blogs');

  const allBlogs: ShopifyData[] = [];
  for (const blog of blogs) {
    // Fetch articles for each blog
    const { items: articles } = await fetchAllPages<ShopifyData>(
      client,
      `blogs/${blog.id}/articles`,
      'articles',
    );
    blog.articles = articles;
    allBlogs.push(blog);
  }

  return { data: allBlogs, result: { success: true, count: allBlogs.length } };
}

async function fetchShopMetafields(client: ShopifyClientWrapper): Promise<{ data: ShopifyData[]; result: BackupResult }> {
  const { items: allMetafields } = await fetchAllPages<ShopifyData>(client, 'metafields', 'metafields');
  return { data: allMetafields, result: { success: true, count: allMetafields.length } };
}

export async function backupContent(
  client: ShopifyClientWrapper,
  outputDir: string,
): Promise<ContentBackupResult> {
  const result: ContentBackupResult = {
    pages: { success: false, count: 0 },
    collections: { success: false, count: 0 },
    blogs: { success: false, count: 0 },
    shopMetafields: { success: false, count: 0 },
  };

  // Pages
  try {
    const pages = await fetchPages(client);
    await fs.writeFile(path.join(outputDir, 'pages.json'), JSON.stringify(pages.data, null, 2));
    result.pages = pages.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Pages backup failed:', errorMessage);
    result.pages = { success: false, count: 0, error: errorMessage };
  }

  // Collections
  try {
    const collections = await fetchCollections(client);
    await fs.writeFile(path.join(outputDir, 'collections.json'), JSON.stringify(collections.data, null, 2));
    result.collections = collections.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Collections backup failed:', errorMessage);
    result.collections = { success: false, count: 0, error: errorMessage };
  }

  // Blogs
  try {
    const blogs = await fetchBlogs(client);
    await fs.writeFile(path.join(outputDir, 'blogs.json'), JSON.stringify(blogs.data, null, 2));
    result.blogs = blogs.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Blogs backup failed:', errorMessage);
    result.blogs = { success: false, count: 0, error: errorMessage };
  }

  // Shop metafields
  try {
    const metafields = await fetchShopMetafields(client);
    await fs.writeFile(path.join(outputDir, 'metafields.json'), JSON.stringify(metafields.data, null, 2));
    result.shopMetafields = metafields.result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Shop metafields backup failed:', errorMessage);
    result.shopMetafields = { success: false, count: 0, error: errorMessage };
  }

  return result;
}
