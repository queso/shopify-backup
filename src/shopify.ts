import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import type { BackupConfig, RetryOptions } from './types.js';

const PINNED_API_VERSION = ApiVersion.January25;

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const RETRYABLE_NETWORK_CODES = ['ECONNRESET', 'ETIMEDOUT'];

// Simple rate limiter: ensures minimum interval between API calls
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // 3s between requests (very conservative for small bucket stores)

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types
export function createShopifyClient(config: BackupConfig): { rest: any; api: any } {
  const api = shopifyApi({
    apiVersion: PINNED_API_VERSION,
    apiSecretKey: 'not-used-for-custom-apps',
    hostName: config.shopifyStore,
    isCustomStoreApp: true,
    adminApiAccessToken: config.shopifyAccessToken,
    isEmbeddedApp: false,
  });

  const session = api.session.customAppSession(config.shopifyStore);
  const restClient = new api.clients.Rest({ session });

  return { rest: restClient, api };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 2000;
  const maxDelay = options?.maxDelay ?? 30000;
  const retryableStatuses = options?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: Error | undefined;
  const throttleMaxRetries = Math.max(maxRetries, 5);

  for (let attempt = 0; attempt <= throttleMaxRetries; attempt++) {
    try {
      await rateLimit();
      return await fn();
    } catch (error: any) {
      lastError = error;

      const isThrottled =
        error?.message?.includes?.('throttling') || error?.message?.includes?.('Exceeded') ||
        error?.message?.includes?.('maximum number of retries');
      const effectiveMax = isThrottled ? throttleMaxRetries : maxRetries;

      if (attempt >= effectiveMax) break;

      const isRetryableStatus =
        error?.response?.status != null &&
        retryableStatuses.includes(error.response.status);
      const isRetryableNetwork =
        error?.code != null && RETRYABLE_NETWORK_CODES.includes(error.code);

      if (!isRetryableStatus && !isRetryableNetwork && !isThrottled) {
        throw error;
      }

      // Use Retry-After header if available, otherwise exponential backoff
      const retryAfterSec = error?.retryAfter;
      const throttleDelay = retryAfterSec ? retryAfterSec * 1000 + 500 : (isThrottled ? 4000 : baseDelay);
      const delay = retryAfterSec ? throttleDelay : Math.min(throttleDelay * Math.pow(2, attempt), maxDelay);
      console.warn(
        `Retry ${attempt + 1}/${effectiveMax} after ${delay}ms${isThrottled ? ' (throttled)' : ''}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Reset rate limiter so the next rateLimit() call won't skip the wait
      lastRequestTime = Date.now();
    }
  }

  throw new Error(
    `Failed after retries: ${lastError?.message ?? 'unknown error'}`,
  );
}
