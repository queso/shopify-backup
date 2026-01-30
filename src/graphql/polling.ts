/**
 * Bulk operation polling for Shopify GraphQL API
 *
 * This module provides functionality to poll a bulk operation until completion.
 */

import type { GraphQLClient } from './client.js';
import type {
  BulkOperation,
  BulkOperationStatus,
  BulkOperationErrorCode,
  GraphQLResponse,
  CurrentBulkOperationResponse,
} from '../types/graphql.js';
import { rateLimit } from '../shopify.js';

/** Default polling interval: 1 second */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/** Default timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** GraphQL query to check current bulk operation status */
const CURRENT_BULK_OPERATION_QUERY = `
  query {
    currentBulkOperation {
      id
      status
      errorCode
      objectCount
      url
      createdAt
      completedAt
      fileSize
      query
      rootObjectCount
    }
  }
`;

/**
 * Terminal statuses that indicate failure
 */
const FAILURE_STATUSES: Set<string> = new Set(['FAILED', 'CANCELED', 'EXPIRED']);

/**
 * Statuses that indicate we should continue polling
 */
const POLLING_STATUSES: Set<string> = new Set(['CREATED', 'RUNNING', 'CANCELING']);

/**
 * Options for polling a bulk operation
 */
export interface PollOptions {
  /** Polling interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Timeout in milliseconds (default: 600000 - 10 minutes) */
  timeoutMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Error thrown when a bulk operation fails or is canceled
 */
export class BulkOperationError extends Error {
  public readonly status: BulkOperationStatus | string;
  public readonly errorCode: BulkOperationErrorCode | null;

  constructor(status: BulkOperationStatus | string, errorCode: BulkOperationErrorCode | null, message?: string) {
    const errorCodeStr = errorCode ? ` (${errorCode})` : '';
    const fullMessage = message
      ? `Bulk operation ${status}${errorCodeStr}: ${message}`
      : `Bulk operation ${status}${errorCodeStr}`;
    super(fullMessage);
    this.name = 'BulkOperationError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

/**
 * Sleep for specified duration, respecting abort signal.
 *
 * Resolves when timeout completes or signal is aborted.
 * Does not reject - caller should check signal.aborted after await.
 *
 * @param ms - Duration to sleep in milliseconds
 * @param signal - Optional AbortSignal to cancel the sleep early
 * @returns Promise that resolves after the delay or when aborted
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      resolve();
    };

    timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Check if the abort signal is triggered and throw if aborted.
 *
 * @param signal - Optional AbortSignal to check
 * @throws Error with message "Polling aborted" if the signal is aborted
 */
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Polling aborted');
  }
}

/**
 * Poll a bulk operation until it completes, fails, or times out.
 *
 * Uses Shopify's `currentBulkOperation` query which returns the currently
 * running bulk operation for the authenticated app. This query does not
 * require an operation ID because Shopify only allows one bulk operation
 * per app at a time.
 *
 * @param client - GraphQL client with request method
 * @param _operationId - The bulk operation ID. This parameter is retained for:
 *   1. API contract stability - callers naturally have the operation ID from initiating the operation
 *   2. Future compatibility - Shopify may add operation-specific polling endpoints
 *   3. Logging/debugging - enables correlation between initiation and polling
 *   Note: Currently unused because `currentBulkOperation` returns the active operation without an ID.
 * @param options - Polling options (interval, timeout, abort signal)
 * @returns The completed bulk operation with download URL
 * @throws BulkOperationError if the operation fails or is canceled
 * @throws Error if the operation times out or is aborted
 */
export async function pollBulkOperation(
  client: Pick<GraphQLClient, 'request'>,
  _operationId: string,
  options?: PollOptions
): Promise<BulkOperation> {
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options?.signal;

  // Check if already aborted before starting
  checkAborted(signal);

  console.debug(`[polling] Starting bulk operation polling (interval: ${pollIntervalMs}ms, timeout: ${timeoutMs}ms)`);

  const startTime = Date.now();
  let pollCount = 0;

   
  while (true) {
    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(`Polling timeout after ${timeoutMs}ms`);
    }

    // Check abort signal
    checkAborted(signal);

    // Query current bulk operation (respecting global rate limits)
    pollCount++;
    await rateLimit();
    const response = (await client.request(CURRENT_BULK_OPERATION_QUERY, {})) as GraphQLResponse<CurrentBulkOperationResponse>;

    const operation = response.data.currentBulkOperation;

    // Handle null operation
    if (!operation) {
      throw new Error('No bulk operation found');
    }

    const status = operation.status;

    console.debug(`[polling] Poll #${pollCount}: status=${status}, objectCount=${operation.objectCount ?? 'N/A'}`);

    // Check for completion
    if (status === 'COMPLETED') {
      console.debug(`[polling] Bulk operation completed successfully after ${pollCount} poll(s)`);
      return operation;
    }

    // Check for failure statuses
    if (FAILURE_STATUSES.has(status)) {
      console.debug(`[polling] Bulk operation failed with status=${status}, errorCode=${operation.errorCode ?? 'none'}`);
      throw new BulkOperationError(status, operation.errorCode);
    }

    // Continue polling for in-progress statuses
    if (POLLING_STATUSES.has(status)) {
      await sleep(pollIntervalMs, signal);
      // Check if aborted during sleep
      checkAborted(signal);
      continue;
    }

    // Unknown status - treat as error
    throw new BulkOperationError(status, operation.errorCode, `Unknown status: ${status}`);
  }
}
