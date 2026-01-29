/**
 * TypeScript types for Shopify's GraphQL Bulk Operations API
 * Used for efficiently exporting large datasets like customers
 */

/**
 * Status of a bulk operation in Shopify's GraphQL API
 */
export enum BulkOperationStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  CANCELING = 'CANCELING',
  EXPIRED = 'EXPIRED',
}

/**
 * Error codes that can be returned by bulk operations
 */
export enum BulkOperationErrorCode {
  ACCESS_DENIED = 'ACCESS_DENIED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Represents a bulk operation in Shopify's GraphQL API
 */
export interface BulkOperation {
  id: string;
  status: BulkOperationStatus;
  errorCode: BulkOperationErrorCode | null;
  objectCount: string;
  url: string | null;
  createdAt: string;
  completedAt: string | null;
  fileSize: string | null;
  query: string;
  rootObjectCount: string;
}

/**
 * User error returned by Shopify mutations
 */
export interface UserError {
  field: string[] | null;
  message: string;
}

/**
 * Result of the bulkOperationRunQuery mutation
 */
export interface BulkOperationRunQueryResult {
  bulkOperation: BulkOperation | null;
  userErrors: UserError[];
}

/**
 * Result of the currentBulkOperation query
 */
export interface CurrentBulkOperationResult {
  currentBulkOperation: BulkOperation | null;
}

/**
 * Customer address as returned by GraphQL bulk export
 */
export interface CustomerAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  country: string | null;
  countryCodeV2: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
}

/**
 * Customer node as returned by GraphQL bulk export
 */
export interface CustomerNode {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  acceptsMarketing: boolean;
  taxExempt: boolean;
  defaultAddress: CustomerAddress | null;
  note: string | null;
  verifiedEmail: boolean;
  state: 'DECLINED' | 'DISABLED' | 'ENABLED' | 'INVITED';
  totalSpent: string;
  ordersCount: string;
}

/**
 * Email marketing consent state for a customer
 */
export interface CustomerEmailMarketingConsent {
  marketingState: 'NOT_SUBSCRIBED' | 'PENDING' | 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'REDACTED' | 'INVALID';
  consentUpdatedAt: string | null;
}

/**
 * Metafield as returned by bulk operations (flattened from edges/node structure)
 */
export interface CustomerMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
}

/**
 * Customer data as returned by JSONL bulk export.
 *
 * This differs from CustomerNode in that:
 * - It matches the CUSTOMER_BULK_QUERY fields
 * - Addresses are an array (not just defaultAddress)
 * - Includes emailMarketingConsent
 * - Metafields are included as a flattened array
 *
 * Note: Shopify bulk operation JSONL output flattens the edges/node structure,
 * so addresses and metafields appear as direct arrays on the customer object.
 */
export interface BulkCustomerNode {
  /** Shopify GID (e.g., "gid://shopify/Customer/123") */
  id: string;
  /** Customer's first name */
  firstName: string | null;
  /** Customer's last name */
  lastName: string | null;
  /** Customer's email address */
  email: string | null;
  /** Customer's phone number */
  phone: string | null;
  /** Account state: DECLINED, DISABLED, ENABLED, or INVITED */
  state: 'DECLINED' | 'DISABLED' | 'ENABLED' | 'INVITED';
  /** Tags associated with the customer */
  tags: string[];
  /** ISO 8601 timestamp of when the customer was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the customer was last updated */
  updatedAt: string;
  /** Email marketing consent information */
  emailMarketingConsent: CustomerEmailMarketingConsent | null;
  /** Customer addresses */
  addresses: CustomerAddress[];
  /** Customer metafields */
  metafields: CustomerMetafield[];
}

/**
 * Generic GraphQL response wrapper
 */
export interface GraphQLResponse<T> {
  data: T;
  errors?: GraphQLError[];
}

/**
 * GraphQL error format
 */
export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
  extensions?: Record<string, unknown>;
}

/**
 * Wrapper for bulkOperationRunQuery mutation response
 */
export interface BulkOperationRunQueryResponse {
  bulkOperationRunQuery: BulkOperationRunQueryResult;
}

/**
 * Wrapper for currentBulkOperation query response
 */
export interface CurrentBulkOperationResponse {
  currentBulkOperation: BulkOperation | null;
}
