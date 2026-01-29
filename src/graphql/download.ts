/**
 * Download and parse JSONL results from a Shopify bulk operation URL
 */

import { parseJsonl } from './jsonl.js';

/**
 * Download and parse the JSONL file from a completed bulk operation
 *
 * @param url - The URL of the bulk operation result file
 * @returns Promise resolving to an array of parsed results
 * @throws Error on HTTP errors (with status code) or network failures
 */
export async function downloadBulkOperationResults<T = Record<string, unknown>>(
  url: string
): Promise<T[]> {
  const response = await fetch(url);

  if (!response.ok) {
    const statusText = response.statusText || getStatusDescription(response.status);
    throw new Error(
      `Failed to download bulk operation results: ${response.status} ${statusText}`
    );
  }

  const jsonlContent = await response.text();
  return parseJsonl<T>(jsonlContent);
}

/**
 * Get a human-readable description for common HTTP status codes
 */
function getStatusDescription(status: number): string {
  const descriptions: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return descriptions[status] || 'Error';
}
