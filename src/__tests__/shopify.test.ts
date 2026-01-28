import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BackupConfig } from '../types.js';

// Mock the @shopify/shopify-api module
vi.mock('@shopify/shopify-api', () => ({
  shopifyApi: vi.fn(),
  LATEST_API_VERSION: '2025-01',
  ApiVersion: {
    January25: '2025-01',
  },
}));

// Import after mocking
import { createShopifyClient, withRetry } from '../shopify.js';
import { shopifyApi } from '@shopify/shopify-api';

describe('Shopify API Client', () => {
  const mockConfig: BackupConfig = {
    shopifyStore: 'test-store.myshopify.com',
    shopifyAccessToken: 'shpat_test_token_123',
    backupDir: '/backups/shopify',
    retentionDays: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createShopifyClient', () => {
    it('should create a Shopify API client with the correct configuration', () => {
      const mockClient = { rest: {}, graphql: {} };
      const mockShopifyApi = vi.mocked(shopifyApi);
      mockShopifyApi.mockReturnValue({
        clients: {
          Rest: vi.fn().mockReturnValue(mockClient),
          Graphql: vi.fn().mockReturnValue(mockClient),
        },
      } as any);

      createShopifyClient(mockConfig);

      expect(shopifyApi).toHaveBeenCalledWith(
        expect.objectContaining({
          apiVersion: '2025-01',
        })
      );
    });

    it('should pin API version to 2025-01, not use LATEST_API_VERSION', () => {
      const mockShopifyApi = vi.mocked(shopifyApi);
      mockShopifyApi.mockReturnValue({
        clients: {
          Rest: vi.fn(),
          Graphql: vi.fn(),
        },
      } as any);

      createShopifyClient(mockConfig);

      const callArgs = mockShopifyApi.mock.calls[0][0];
      expect(callArgs.apiVersion).toBe('2025-01');
    });

    it('should configure the client with the store domain from config', () => {
      const mockShopifyApi = vi.mocked(shopifyApi);
      mockShopifyApi.mockReturnValue({
        clients: {
          Rest: vi.fn(),
          Graphql: vi.fn(),
        },
      } as any);

      createShopifyClient(mockConfig);

      expect(shopifyApi).toHaveBeenCalledWith(
        expect.objectContaining({
          hostName: 'test-store.myshopify.com',
        })
      );
    });
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('should pass through successful requests without retry', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ data: 'success' });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should return the resolved value from the function', async () => {
      const mockFn = vi.fn().mockResolvedValue({ products: [1, 2, 3] });

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ products: [1, 2, 3] });
    });
  });

  describe('retry on 429 rate limit', () => {
    it('should retry on HTTP 429 response', async () => {
      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue({ data: 'success after retry' });

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ data: 'success after retry' });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should implement exponential backoff with 2x multiplier', async () => {
      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const callTimes: number[] = [];
      const mockFn = vi.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        if (callTimes.length < 4) {
          throw error429;
        }
        return { data: 'success' };
      });

      const resultPromise = withRetry(mockFn, { maxRetries: 3 });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockFn).toHaveBeenCalledTimes(4);

      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];
      const delay3 = callTimes[3] - callTimes[2];

      expect(delay1).toBeGreaterThanOrEqual(900);
      expect(delay1).toBeLessThanOrEqual(1100);
      expect(delay2).toBeGreaterThanOrEqual(1800);
      expect(delay2).toBeLessThanOrEqual(2200);
      expect(delay3).toBeGreaterThanOrEqual(3600);
      expect(delay3).toBeLessThanOrEqual(4400);
    });
  });

  describe('retry on network errors', () => {
    it('should retry on ECONNRESET errors', async () => {
      const networkError = new Error('socket hang up');
      (networkError as any).code = 'ECONNRESET';

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ data: 'success' });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should retry on ETIMEDOUT errors', async () => {
      const networkError = new Error('connection timed out');
      (networkError as any).code = 'ETIMEDOUT';

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ data: 'success' });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-retryable errors', () => {
    it('should throw immediately on HTTP 400 Bad Request', async () => {
      const error400 = new Error('Bad Request');
      (error400 as any).response = { status: 400 };

      const mockFn = vi.fn().mockRejectedValue(error400);

      await expect(withRetry(mockFn)).rejects.toThrow('Bad Request');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately on HTTP 401 Unauthorized', async () => {
      const error401 = new Error('Unauthorized');
      (error401 as any).response = { status: 401 };

      const mockFn = vi.fn().mockRejectedValue(error401);

      await expect(withRetry(mockFn)).rejects.toThrow('Unauthorized');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately on HTTP 404 Not Found', async () => {
      const error404 = new Error('Not Found');
      (error404 as any).response = { status: 404 };

      const mockFn = vi.fn().mockRejectedValue(error404);

      await expect(withRetry(mockFn)).rejects.toThrow('Not Found');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('max retries exhausted', () => {
    it('should throw after max retries are exhausted with default of 3', async () => {
      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const mockFn = vi.fn().mockRejectedValue(error429);

      const resultPromise = withRetry(mockFn);
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow();
      expect(mockFn).toHaveBeenCalledTimes(4);
    });

    it('should include retry count in error message when max retries exhausted', async () => {
      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const mockFn = vi.fn().mockRejectedValue(error429);

      const resultPromise = withRetry(mockFn, { maxRetries: 2 });
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(/2.*retr/i);
    });
  });

  describe('custom retry options', () => {
    it('should respect custom maxRetries option', async () => {
      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const mockFn = vi.fn().mockRejectedValue(error429);

      const resultPromise = withRetry(mockFn, { maxRetries: 5 });
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow();
      expect(mockFn).toHaveBeenCalledTimes(6);
    });

    it('should respect custom retryableStatuses option', async () => {
      const error418 = new Error("I'm a teapot");
      (error418 as any).response = { status: 418 };

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error418)
        .mockResolvedValue({ data: 'success' });

      await expect(withRetry(mockFn)).rejects.toThrow("I'm a teapot");
      expect(mockFn).toHaveBeenCalledTimes(1);

      mockFn.mockClear();
      mockFn.mockRejectedValueOnce(error418).mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(mockFn, { retryableStatuses: [418] });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({ data: 'success' });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('logging', () => {
    it('should log each retry attempt with attempt number and delay', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const error429 = new Error('Rate limited');
      (error429 as any).response = { status: 429 };

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429)
        .mockResolvedValue({ data: 'success' });

      const resultPromise = withRetry(mockFn, { maxRetries: 2 });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy.mock.calls[0][0]).toMatch(/attempt.*1|retry.*1/i);
      expect(consoleSpy.mock.calls[1][0]).toMatch(/attempt.*2|retry.*2/i);

      consoleSpy.mockRestore();
    });
  });
});
