import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ImageDownloadResult } from '../types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { downloadProductImages } from '../images.js';

function makeProduct(id: number, images: Array<{ src: string; position: number }>) {
  return { id, images };
}

function fakeImageResponse(contentType = 'image/jpeg') {
  return Promise.resolve(
    new Response(Buffer.from('fake-image-data'), {
      status: 200,
      headers: { 'Content-Type': contentType },
    })
  );
}

describe('downloadProductImages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-test-'));
    vi.clearAllMocks();
    mockFetch.mockImplementation(() => fakeImageResponse());
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should download images to correct paths (images/{product_id}/1.jpg)', async () => {
    const products = [
      makeProduct(100, [{ src: 'https://cdn.shopify.com/photo.jpg', position: 1 }]),
    ];

    await downloadProductImages(products, tempDir);

    const expectedPath = path.join(tempDir, 'images', '100', '1.jpg');
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('should preserve file extension from URL', async () => {
    const products = [
      makeProduct(200, [
        { src: 'https://cdn.shopify.com/photo.png', position: 1 },
        { src: 'https://cdn.shopify.com/photo.webp', position: 2 },
      ]),
    ];

    await downloadProductImages(products, tempDir);

    expect(fs.existsSync(path.join(tempDir, 'images', '200', '1.png'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'images', '200', '2.webp'))).toBe(true);
  });

  it('should retry on download failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockImplementationOnce(() => fakeImageResponse());

    const products = [
      makeProduct(300, [{ src: 'https://cdn.shopify.com/photo.jpg', position: 1 }]),
    ];

    const result = await downloadProductImages(products, tempDir);

    expect(result.downloaded).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should continue with next image after max failures', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockImplementation(() => fakeImageResponse());

    const products = [
      makeProduct(400, [
        { src: 'https://cdn.shopify.com/bad.jpg', position: 1 },
        { src: 'https://cdn.shopify.com/good.jpg', position: 2 },
      ]),
    ];

    const result = await downloadProductImages(products, tempDir);

    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(fs.existsSync(path.join(tempDir, 'images', '400', '2.jpg'))).toBe(true);
  });

  it('should track failed URLs in result', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'));

    const products = [
      makeProduct(500, [{ src: 'https://cdn.shopify.com/broken.jpg', position: 1 }]),
    ];

    const result = await downloadProductImages(products, tempDir);

    expect(result.failedUrls).toContain('https://cdn.shopify.com/broken.jpg');
  });

  it('should return correct ImageDownloadResult counts', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockImplementation(() => fakeImageResponse());

    const products = [
      makeProduct(600, [
        { src: 'https://cdn.shopify.com/a.jpg', position: 1 },
        { src: 'https://cdn.shopify.com/b.jpg', position: 2 },
        { src: 'https://cdn.shopify.com/c.jpg', position: 3 },
      ]),
    ];

    const result: ImageDownloadResult = await downloadProductImages(products, tempDir);

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failedUrls).toHaveLength(1);
  });

  it('should handle products with no images', async () => {
    const products = [makeProduct(700, [])];

    const result = await downloadProductImages(products, tempDir);

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.failedUrls).toHaveLength(0);
  });

  it('should skip already-existing files (idempotent)', async () => {
    const imgDir = path.join(tempDir, 'images', '800');
    fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, '1.jpg'), 'existing-data');

    const products = [
      makeProduct(800, [{ src: 'https://cdn.shopify.com/photo.jpg', position: 1 }]),
    ];

    await downloadProductImages(products, tempDir);

    expect(mockFetch).not.toHaveBeenCalled();
    const content = fs.readFileSync(path.join(imgDir, '1.jpg'), 'utf-8');
    expect(content).toBe('existing-data');
  });

  it('should name files sequentially by position (1.jpg, 2.png)', async () => {
    const products = [
      makeProduct(900, [
        { src: 'https://cdn.shopify.com/first.jpg', position: 1 },
        { src: 'https://cdn.shopify.com/second.png', position: 2 },
        { src: 'https://cdn.shopify.com/third.webp', position: 3 },
      ]),
    ];

    await downloadProductImages(products, tempDir);

    const imgDir = path.join(tempDir, 'images', '900');
    const files = fs.readdirSync(imgDir).sort();
    expect(files).toEqual(['1.jpg', '2.png', '3.webp']);
  });

  // WI-031: GraphQL Image Structure Support
  describe('GraphQL image structure support', () => {
    it('should download images with REST structure (image.src field)', async () => {
      const products = [
        makeProduct(1000, [
          { src: 'https://cdn.shopify.com/rest-image.jpg', position: 1 },
        ]),
      ];

      const result = await downloadProductImages(products, tempDir);

      expect(result.downloaded).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'images', '1000', '1.jpg'))).toBe(true);
    });

    it('should download images with GraphQL structure (image.url field)', async () => {
      // GraphQL bulk operations return images with 'url' instead of 'src'
      const products = [
        {
          id: 1001,
          images: [
            { url: 'https://cdn.shopify.com/graphql-image.png', position: 1 },
          ],
        },
      ];

      const result = await downloadProductImages(products, tempDir);

      expect(result.downloaded).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'images', '1001', '1.png'))).toBe(true);
    });

    it('should handle products with no images gracefully', async () => {
      const products = [
        { id: 1002, images: [] },
        { id: 1003, images: null },
        { id: 1004 }, // no images property at all
      ];

      const result = await downloadProductImages(products, tempDir);

      expect(result.success).toBe(true);
      expect(result.downloaded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should detect extension from REST URL format', async () => {
      const products = [
        makeProduct(1005, [
          { src: 'https://cdn.shopify.com/s/files/1/0123/product.webp?v=123', position: 1 },
        ]),
      ];

      await downloadProductImages(products, tempDir);

      expect(fs.existsSync(path.join(tempDir, 'images', '1005', '1.webp'))).toBe(true);
    });

    it('should detect extension from GraphQL URL format', async () => {
      // GraphQL may return URLs with different query params or formats
      const products = [
        {
          id: 1006,
          images: [
            { url: 'https://cdn.shopify.com/s/files/1/0123/image.png?width=1024&height=1024', position: 1 },
          ],
        },
      ];

      await downloadProductImages(products, tempDir);

      expect(fs.existsSync(path.join(tempDir, 'images', '1006', '1.png'))).toBe(true);
    });

    it('should handle mixed products (some REST, some GraphQL format)', async () => {
      const products = [
        // REST format product
        makeProduct(1007, [
          { src: 'https://cdn.shopify.com/rest.jpg', position: 1 },
        ]),
        // GraphQL format product
        {
          id: 1008,
          images: [
            { url: 'https://cdn.shopify.com/graphql.png', position: 1 },
          ],
        },
      ];

      const result = await downloadProductImages(products, tempDir);

      expect(result.downloaded).toBe(2);
      expect(fs.existsSync(path.join(tempDir, 'images', '1007', '1.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'images', '1008', '1.png'))).toBe(true);
    });

    it('should default to .jpg when URL has no extension', async () => {
      const products = [
        {
          id: 1009,
          images: [
            { url: 'https://cdn.shopify.com/s/files/1/0123/image', position: 1 },
          ],
        },
      ];

      await downloadProductImages(products, tempDir);

      expect(fs.existsSync(path.join(tempDir, 'images', '1009', '1.jpg'))).toBe(true);
    });

    it('should prefer url over src when both are present', async () => {
      // In case of data migration, both might exist - prefer GraphQL url
      const products = [
        {
          id: 1010,
          images: [
            {
              src: 'https://cdn.shopify.com/old-rest.jpg',
              url: 'https://cdn.shopify.com/new-graphql.png',
              position: 1,
            },
          ],
        },
      ];

      await downloadProductImages(products, tempDir);

      // Should use the url field
      expect(mockFetch).toHaveBeenCalledWith('https://cdn.shopify.com/new-graphql.png');
    });
  });
});
