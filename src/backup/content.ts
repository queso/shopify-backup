import fs from 'node:fs/promises';
import path from 'node:path';
import type { BackupResult, ContentBackupResult } from '../types.js';
import { fetchAllPages } from '../pagination.js';

async function fetchPages(client: any): Promise<{ data: any[]; result: BackupResult }> {
  const { items: allPages } = await fetchAllPages(client, 'pages', 'pages');
  return { data: allPages, result: { success: true, count: allPages.length } };
}

async function fetchCollections(client: any): Promise<{ data: any[]; result: BackupResult }> {
  const allCollections: any[] = [];

  // Smart collections
  const { items: smartCollections } = await fetchAllPages(
    client,
    'smart_collections',
    'smart_collections',
  );
  allCollections.push(...smartCollections);

  // Custom collections
  const { items: customCollections } = await fetchAllPages(
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

async function fetchBlogs(client: any): Promise<{ data: any[]; result: BackupResult }> {
  const { items: blogs } = await fetchAllPages(client, 'blogs', 'blogs');

  const allBlogs: any[] = [];
  for (const blog of blogs) {
    // Fetch articles for each blog
    const { items: articles } = await fetchAllPages(
      client,
      `blogs/${blog.id}/articles`,
      'articles',
    );
    blog.articles = articles;
    allBlogs.push(blog);
  }

  return { data: allBlogs, result: { success: true, count: allBlogs.length } };
}

async function fetchShopMetafields(client: any): Promise<{ data: any[]; result: BackupResult }> {
  const { items: allMetafields } = await fetchAllPages(client, 'metafields', 'metafields');
  return { data: allMetafields, result: { success: true, count: allMetafields.length } };
}

export async function backupContent(
  client: any,
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
  } catch (error: any) {
    console.warn('Pages backup failed:', error.message);
    result.pages = { success: false, count: 0, error: error.message };
  }

  // Collections
  try {
    const collections = await fetchCollections(client);
    await fs.writeFile(path.join(outputDir, 'collections.json'), JSON.stringify(collections.data, null, 2));
    result.collections = collections.result;
  } catch (error: any) {
    console.warn('Collections backup failed:', error.message);
    result.collections = { success: false, count: 0, error: error.message };
  }

  // Blogs
  try {
    const blogs = await fetchBlogs(client);
    await fs.writeFile(path.join(outputDir, 'blogs.json'), JSON.stringify(blogs.data, null, 2));
    result.blogs = blogs.result;
  } catch (error: any) {
    console.warn('Blogs backup failed:', error.message);
    result.blogs = { success: false, count: 0, error: error.message };
  }

  // Shop metafields
  try {
    const metafields = await fetchShopMetafields(client);
    await fs.writeFile(path.join(outputDir, 'metafields.json'), JSON.stringify(metafields.data, null, 2));
    result.shopMetafields = metafields.result;
  } catch (error: any) {
    console.warn('Shop metafields backup failed:', error.message);
    result.shopMetafields = { success: false, count: 0, error: error.message };
  }

  return result;
}
