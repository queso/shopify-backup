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
});
