import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { pollBulkOperation, BulkOperationError } from '../polling.js';
import { BulkOperationStatus, BulkOperationErrorCode } from '../../types/graphql.js';
import type { GraphQLResponse, CurrentBulkOperationResponse } from '../../types/graphql.js';
import type { GraphQLClient } from '../client.js';

// Mock the rateLimit function to avoid real delays in tests
vi.mock('../../shopify.js', () => ({
  rateLimit: vi.fn().mockResolvedValue(undefined),
}));

interface MockGraphQLClient {
  request: MockedFunction<GraphQLClient['request']>;
}

describe('pollBulkOperation', () => {
  let mockClient: MockGraphQLClient;

  beforeEach(() => {
    mockClient = {
      request: vi.fn(),
    };
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a bulk operation response with the given status
   */
  function createOperationResponse(
    id: string,
    status: BulkOperationStatus,
    options?: {
      url?: string | null;
      errorCode?: BulkOperationErrorCode | null;
      objectCount?: string;
    }
  ): GraphQLResponse<CurrentBulkOperationResponse> {
    return {
      data: {
        currentBulkOperation: {
          id,
          status,
          errorCode: options?.errorCode ?? null,
          objectCount: options?.objectCount ?? '0',
          url: options?.url ?? null,
          createdAt: '2024-01-15T10:00:00Z',
          completedAt: status === BulkOperationStatus.COMPLETED ? '2024-01-15T10:05:00Z' : null,
          fileSize: options?.url ? '1024' : null,
          query: '{ customers { edges { node { id } } } }',
          rootObjectCount: options?.objectCount ?? '0',
        },
      },
    };
  }

  describe('successful polling', () => {
    it('should poll until COMPLETED and return operation with URL', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      // First call: RUNNING, second call: COMPLETED
      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl, objectCount: '150' })
        );

      const pollPromise = pollBulkOperation(mockClient, operationId);

      // Advance past first poll interval
      await vi.advanceTimersByTimeAsync(1000);

      const result = await pollPromise;

      expect(result.status).toBe('COMPLETED');
      expect(result.url).toBe(resultUrl);
      expect(result.objectCount).toBe('150');
      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it('should return immediately if already COMPLETED on first poll', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl })
      );

      const result = await pollBulkOperation(mockClient, operationId);

      expect(result.status).toBe('COMPLETED');
      expect(result.url).toBe(resultUrl);
      expect(mockClient.request).toHaveBeenCalledTimes(1);
    });

    it('should poll through multiple RUNNING states', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      // Multiple RUNNING states before COMPLETED
      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.CREATED))
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING, { objectCount: '50' }))
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING, { objectCount: '100' }))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl, objectCount: '150' })
        );

      const pollPromise = pollBulkOperation(mockClient, operationId);

      // Advance through poll intervals
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await pollPromise;

      expect(result.status).toBe('COMPLETED');
      expect(mockClient.request).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('should throw BulkOperationError on FAILED status with error code', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.FAILED, {
          errorCode: BulkOperationErrorCode.TIMEOUT,
        })
      );

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(BulkOperationError);
    });

    it('should include error code in BulkOperationError message', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.FAILED, {
          errorCode: BulkOperationErrorCode.ACCESS_DENIED,
        })
      );

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(/ACCESS_DENIED/);
    });

    it('should throw BulkOperationError on CANCELED status', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.CANCELED)
      );

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(BulkOperationError);
    });

    it('should include CANCELED in error message', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.CANCELED)
      );

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(/CANCEL/i);
    });

    it('should throw if operation becomes FAILED after RUNNING', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.FAILED, {
            errorCode: BulkOperationErrorCode.INTERNAL_SERVER_ERROR,
          })
        );

      let caughtError: unknown;
      const pollPromise = pollBulkOperation(mockClient, operationId).catch((e) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(1000);
      await pollPromise;

      expect(caughtError).toBeInstanceOf(BulkOperationError);
    });
  });

  describe('timeout', () => {
    it('should timeout after configured duration', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      // Always return RUNNING
      mockClient.request.mockResolvedValue(
        createOperationResponse(operationId, BulkOperationStatus.RUNNING)
      );

      // Use a short timeout for testing (5 seconds)
      let caughtError: unknown;
      const pollPromise = pollBulkOperation(mockClient, operationId, {
        timeoutMs: 5000,
        pollIntervalMs: 1000,
      }).catch((e) => {
        caughtError = e;
      });

      // Advance past the timeout
      await vi.advanceTimersByTimeAsync(6000);
      await pollPromise;

      expect((caughtError as Error).message).toMatch(/timeout/i);
    });

    it('should use default timeout of 10 minutes', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      // Always return RUNNING
      mockClient.request.mockResolvedValue(
        createOperationResponse(operationId, BulkOperationStatus.RUNNING)
      );

      let caughtError: unknown;
      const pollPromise = pollBulkOperation(mockClient, operationId).catch((e) => {
        caughtError = e;
      });

      // Advance just under 10 minutes - should still be polling
      await vi.advanceTimersByTimeAsync(9 * 60 * 1000);

      // Verify we haven't rejected yet (operation is still running)
      expect(mockClient.request).toHaveBeenCalled();
      expect(caughtError).toBeUndefined();

      // Advance past 10 minutes
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      await pollPromise;

      expect((caughtError as Error).message).toMatch(/timeout/i);
    });
  });

  describe('AbortSignal cancellation', () => {
    it('should respect AbortSignal cancellation', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const abortController = new AbortController();

      // Always return RUNNING
      mockClient.request.mockResolvedValue(
        createOperationResponse(operationId, BulkOperationStatus.RUNNING)
      );

      let caughtError: unknown;
      const pollPromise = pollBulkOperation(mockClient, operationId, {
        signal: abortController.signal,
      }).catch((e) => {
        caughtError = e;
      });

      // Let first poll complete
      await vi.advanceTimersByTimeAsync(100);

      // Abort the operation
      abortController.abort();

      // Advance timers to let the abort be processed
      await vi.advanceTimersByTimeAsync(1000);
      await pollPromise;

      expect((caughtError as Error).message).toMatch(/abort/i);
    });

    it('should not start polling if already aborted', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const abortController = new AbortController();
      abortController.abort(); // Pre-abort

      await expect(
        pollBulkOperation(mockClient, operationId, {
          signal: abortController.signal,
        })
      ).rejects.toThrow(/abort/i);

      expect(mockClient.request).not.toHaveBeenCalled();
    });
  });

  describe('configurable poll interval', () => {
    it('should use default poll interval of 1 second', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl })
        );

      const pollPromise = pollBulkOperation(mockClient, operationId);

      // After 500ms, should only have one request
      await vi.advanceTimersByTimeAsync(500);
      expect(mockClient.request).toHaveBeenCalledTimes(1);

      // After 1000ms total, should have second request
      await vi.advanceTimersByTimeAsync(500);

      await pollPromise;

      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it('should use custom poll interval when configured', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl })
        );

      const pollPromise = pollBulkOperation(mockClient, operationId, {
        pollIntervalMs: 2000,
      });

      // After 1000ms, should only have initial request
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockClient.request).toHaveBeenCalledTimes(1);

      // After 2000ms total, should have second request
      await vi.advanceTimersByTimeAsync(1000);

      await pollPromise;

      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it('should use faster poll interval for quick operations', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';
      const resultUrl = 'https://storage.shopifycloud.com/results.jsonl';

      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.RUNNING))
        .mockResolvedValueOnce(
          createOperationResponse(operationId, BulkOperationStatus.COMPLETED, { url: resultUrl })
        );

      const pollPromise = pollBulkOperation(mockClient, operationId, {
        pollIntervalMs: 100, // Fast polling
      });

      // After 200ms, should have 3 requests
      await vi.advanceTimersByTimeAsync(200);

      await pollPromise;

      expect(mockClient.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases', () => {
    it('should throw if currentBulkOperation returns null', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      const nullResponse: GraphQLResponse<CurrentBulkOperationResponse> = {
        data: {
          currentBulkOperation: null,
        },
      };

      mockClient.request.mockResolvedValueOnce(nullResponse);

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow();
    });

    it('should handle network errors during polling', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockRejectedValue(new Error('Network error'));

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(/Network error/);
    });

    it('should handle CANCELING status and continue polling', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.CANCELING))
        .mockResolvedValueOnce(createOperationResponse(operationId, BulkOperationStatus.CANCELED));

      let caughtError: unknown;
      const pollPromise = pollBulkOperation(mockClient, operationId).catch((e) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(1000);
      await pollPromise;

      expect((caughtError as Error).message).toMatch(/CANCEL/i);
      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it('should handle EXPIRED status', async () => {
      const operationId = 'gid://shopify/BulkOperation/123456789';

      mockClient.request.mockResolvedValueOnce(
        createOperationResponse(operationId, BulkOperationStatus.EXPIRED)
      );

      await expect(pollBulkOperation(mockClient, operationId)).rejects.toThrow(BulkOperationError);
    });
  });
});

describe('BulkOperationError', () => {
  it('should be an instance of Error', () => {
    const error = new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation failed');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have status and errorCode properties', () => {
    const error = new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.ACCESS_DENIED, 'Access denied');
    expect(error.status).toBe(BulkOperationStatus.FAILED);
    expect(error.errorCode).toBe('ACCESS_DENIED');
  });

  it('should format message with status and error code', () => {
    const error = new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.TIMEOUT, 'Operation timed out');
    expect(error.message).toContain('FAILED');
    expect(error.message).toContain('TIMEOUT');
  });

  it('should handle null error code', () => {
    const error = new BulkOperationError('CANCELED', null, 'Operation was canceled');
    expect(error.status).toBe('CANCELED');
    expect(error.errorCode).toBeNull();
  });

  it('should work without a custom message', () => {
    const error = new BulkOperationError(BulkOperationStatus.FAILED, BulkOperationErrorCode.INTERNAL_SERVER_ERROR);
    expect(error.message).toContain('FAILED');
    expect(error.message).toContain('INTERNAL_SERVER_ERROR');
  });
});
