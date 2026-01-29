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

// ============================================================
// Generic Types
// ============================================================

/**
 * Generic metafield as returned by bulk operations
 */
export interface Metafield {
  /** Metafield namespace */
  namespace: string;
  /** Metafield key */
  key: string;
  /** Metafield value (always a string, parse based on type) */
  value: string;
  /** Metafield type (e.g., 'single_line_text_field', 'json', 'number_integer') */
  type: string;
  /** Optional description of the metafield */
  description?: string | null;
}

/**
 * Shopify MoneyV2 type - represents a monetary value with currency
 */
export interface MoneyV2 {
  /** Decimal money amount as a string */
  amount: string;
  /** Currency code (e.g., 'USD', 'EUR') */
  currencyCode: string;
}

/**
 * Shopify MoneyBag type - contains shop money
 */
export interface MoneyBag {
  /** Shop money in the store's currency */
  shopMoney: MoneyV2;
}

// ============================================================
// Order Types
// ============================================================

/**
 * Address on an order (billing or shipping)
 */
export interface OrderAddress {
  /** First name */
  firstName: string | null;
  /** Last name */
  lastName: string | null;
  /** Company name */
  company: string | null;
  /** Address line 1 */
  address1: string | null;
  /** Address line 2 */
  address2: string | null;
  /** City */
  city: string | null;
  /** Province/state name */
  province: string | null;
  /** Province/state code */
  provinceCode: string | null;
  /** Country name */
  country: string | null;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCodeV2: string | null;
  /** Postal/zip code */
  zip: string | null;
  /** Phone number */
  phone: string | null;
}

/**
 * Customer reference on an order
 */
export interface OrderCustomer {
  /** Shopify GID (e.g., "gid://shopify/Customer/123") */
  id: string;
  /** Customer email */
  email: string | null;
  /** Customer first name */
  firstName: string | null;
  /** Customer last name */
  lastName: string | null;
}

/**
 * Line item on an order
 */
export interface OrderLineItem {
  /** Shopify GID (e.g., "gid://shopify/LineItem/123") */
  id: string;
  /** Product title */
  title: string;
  /** Variant title */
  variantTitle: string | null;
  /** Quantity ordered */
  quantity: number;
  /** SKU */
  sku: string | null;
  /** Vendor name */
  vendor: string | null;
  /** Whether the item requires shipping */
  requiresShipping: boolean;
  /** Whether the item is taxable */
  taxable: boolean;
  /** Original unit price */
  originalUnitPriceSet: MoneyBag;
  /** Discounted unit price */
  discountedUnitPriceSet: MoneyBag;
  /** Original total price */
  originalTotalSet: MoneyBag;
  /** Discounted total price */
  discountedTotalSet: MoneyBag;
  /** Product variant reference */
  variant: { id: string; legacyResourceId: string } | null;
  /** Product reference */
  product: { id: string; legacyResourceId: string } | null;
}

/**
 * Shipping line on an order
 */
export interface OrderShippingLine {
  /** Shipping method title */
  title: string;
  /** Shipping method code */
  code: string | null;
  /** Shipping source */
  source: string | null;
  /** Original shipping price */
  originalPriceSet: MoneyBag;
  /** Discounted shipping price */
  discountedPriceSet: MoneyBag;
}

/**
 * Transaction on an order
 */
export interface OrderTransaction {
  /** Shopify GID (e.g., "gid://shopify/OrderTransaction/123") */
  id: string;
  /** Transaction kind (e.g., 'SALE', 'CAPTURE', 'AUTHORIZATION', 'VOID', 'REFUND', 'CHANGE') */
  kind: string;
  /** Transaction status (e.g., 'SUCCESS', 'FAILURE', 'PENDING') */
  status: string;
  /** Payment gateway */
  gateway: string;
  /** Transaction amount */
  amountSet: MoneyBag;
  /** ISO 8601 timestamp of when the transaction was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the transaction was processed */
  processedAt: string | null;
}

/**
 * Tracking info for a fulfillment
 */
export interface FulfillmentTrackingInfo {
  /** Shipping company name */
  company: string | null;
  /** Tracking number */
  number: string | null;
  /** Tracking URL */
  url: string | null;
}

/**
 * Fulfillment on an order
 */
export interface OrderFulfillment {
  /** Shopify GID (e.g., "gid://shopify/Fulfillment/123") */
  id: string;
  /** Fulfillment status (e.g., 'SUCCESS', 'PENDING', 'CANCELLED', 'ERROR', 'FAILURE') */
  status: string;
  /** ISO 8601 timestamp of when the fulfillment was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the fulfillment was last updated */
  updatedAt: string;
  /** Tracking information */
  trackingInfo: FulfillmentTrackingInfo[];
}

/**
 * Refund on an order
 */
export interface OrderRefund {
  /** Shopify GID (e.g., "gid://shopify/Refund/123") */
  id: string;
  /** ISO 8601 timestamp of when the refund was created */
  createdAt: string;
  /** Refund note */
  note: string | null;
  /** Total refunded amount */
  totalRefundedSet: MoneyBag;
}

/**
 * Discount value - can be a percentage or fixed amount
 */
export interface DiscountValue {
  /** Percentage discount (present if this is a percentage discount) */
  percentage?: number;
  /** Fixed amount discount (present if this is a fixed amount discount) */
  amount?: string;
  /** Currency code (present if this is a fixed amount discount) */
  currencyCode?: string;
}

/**
 * Discount application on an order
 */
export interface OrderDiscountApplication {
  /** How the discount is allocated ('ACROSS', 'EACH', 'ONE') */
  allocationMethod: string;
  /** Which items the discount targets ('ALL', 'ENTITLED', 'EXPLICIT') */
  targetSelection: string;
  /** Type of target ('LINE_ITEM', 'SHIPPING_LINE') */
  targetType: string;
  /** Discount value */
  value: DiscountValue;
}

/**
 * Order node as returned by GraphQL bulk export
 */
export interface BulkOrderNode {
  /** Shopify GID (e.g., "gid://shopify/Order/123") */
  id: string;
  /** Legacy numeric ID */
  legacyResourceId: string;
  /** Order name/number (e.g., "#1001") */
  name: string;
  /** Customer email */
  email: string | null;
  /** Customer phone */
  phone: string | null;
  /** ISO 8601 timestamp of when the order was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the order was last updated */
  updatedAt: string;
  /** ISO 8601 timestamp of when the order was processed */
  processedAt: string | null;
  /** ISO 8601 timestamp of when the order was closed */
  closedAt: string | null;
  /** ISO 8601 timestamp of when the order was cancelled */
  cancelledAt: string | null;
  /** Reason for cancellation */
  cancelReason: string | null;
  /** Financial status display value */
  displayFinancialStatus: string;
  /** Fulfillment status display value */
  displayFulfillmentStatus: string;
  /** Whether the order is confirmed */
  confirmed: boolean;
  /** Whether this is a test order */
  test: boolean;
  /** Whether taxes are included in prices */
  taxesIncluded: boolean;
  /** Order currency code */
  currencyCode: string;
  /** Presentment currency code */
  presentmentCurrencyCode: string;
  /** Subtotal price */
  subtotalPriceSet: MoneyBag;
  /** Total price */
  totalPriceSet: MoneyBag;
  /** Total tax */
  totalTaxSet: MoneyBag;
  /** Total discounts */
  totalDiscountsSet: MoneyBag;
  /** Total shipping price */
  totalShippingPriceSet: MoneyBag;
  /** Total refunded amount */
  totalRefundedSet: MoneyBag;
  /** Current total price (after refunds) */
  currentTotalPriceSet: MoneyBag;
  /** Order note */
  note: string | null;
  /** Order tags */
  tags: string[];
  /** Customer reference */
  customer: OrderCustomer | null;
  /** Billing address */
  billingAddress: OrderAddress | null;
  /** Shipping address */
  shippingAddress: OrderAddress | null;
  /** Line items */
  lineItems: OrderLineItem[];
  /** Shipping lines */
  shippingLines: OrderShippingLine[];
  /** Transactions */
  transactions: OrderTransaction[];
  /** Fulfillments */
  fulfillments: OrderFulfillment[];
  /** Refunds */
  refunds: OrderRefund[];
  /** Discount applications */
  discountApplications: OrderDiscountApplication[];
  /** Metafields */
  metafields: Metafield[];
}

// ============================================================
// Product Types
// ============================================================

/**
 * Product option (e.g., Size, Color)
 */
export interface ProductOption {
  /** Shopify GID (e.g., "gid://shopify/ProductOption/123") */
  id: string;
  /** Option name (e.g., 'Size', 'Color') */
  name: string;
  /** Option position */
  position: number;
  /** Available option values */
  values: string[];
}

/**
 * Product image
 */
export interface ProductImage {
  /** Shopify GID (e.g., "gid://shopify/ProductImage/123") */
  id: string;
  /** Image URL */
  url: string;
  /** Image alt text */
  altText: string | null;
  /** Image width in pixels */
  width: number | null;
  /** Image height in pixels */
  height: number | null;
}

/**
 * Product SEO settings
 */
export interface ProductSeo {
  /** SEO title */
  title: string | null;
  /** SEO description */
  description: string | null;
}

/**
 * Product price range
 */
export interface ProductPriceRange {
  /** Minimum variant price */
  minVariantPrice: MoneyV2;
  /** Maximum variant price */
  maxVariantPrice: MoneyV2;
}

/**
 * Selected option on a product variant
 */
export interface ProductVariantSelectedOption {
  /** Option name */
  name: string;
  /** Option value */
  value: string;
}

/**
 * Variant image (simplified)
 */
export interface ProductVariantImage {
  /** Shopify GID */
  id: string;
  /** Image URL */
  url: string;
}

/**
 * Inventory item for a variant
 */
export interface ProductVariantInventoryItem {
  /** Shopify GID (e.g., "gid://shopify/InventoryItem/123") */
  id: string;
  /** Whether inventory is tracked */
  tracked: boolean;
  /** SKU */
  sku: string | null;
  /** Whether the item requires shipping */
  requiresShipping: boolean;
}

/**
 * Product variant
 */
export interface ProductVariant {
  /** Shopify GID (e.g., "gid://shopify/ProductVariant/123") */
  id: string;
  /** Legacy numeric ID */
  legacyResourceId: string;
  /** Variant title */
  title: string;
  /** Display name (product title + variant title) */
  displayName: string;
  /** SKU */
  sku: string | null;
  /** Barcode */
  barcode: string | null;
  /** Position in the product's variant list */
  position: number;
  /** Price */
  price: string;
  /** Compare at price */
  compareAtPrice: string | null;
  /** Whether the variant is taxable */
  taxable: boolean;
  /** Tax code */
  taxCode: string | null;
  /** Whether the variant is available for sale */
  availableForSale: boolean;
  /** Whether the variant requires shipping */
  requiresShipping: boolean;
  /** Weight */
  weight: number | null;
  /** Weight unit (e.g., 'POUNDS', 'KILOGRAMS', 'GRAMS', 'OUNCES') */
  weightUnit: string;
  /** Inventory quantity */
  inventoryQuantity: number | null;
  /** Selected options */
  selectedOptions: ProductVariantSelectedOption[];
  /** Variant image */
  image: ProductVariantImage | null;
  /** Inventory item */
  inventoryItem: ProductVariantInventoryItem | null;
  /** Variant metafields */
  metafields: Metafield[];
}

/**
 * Product node as returned by GraphQL bulk export
 */
export interface BulkProductNode {
  /** Shopify GID (e.g., "gid://shopify/Product/123") */
  id: string;
  /** Legacy numeric ID */
  legacyResourceId: string;
  /** Product title */
  title: string;
  /** URL handle */
  handle: string;
  /** Product description (HTML) */
  descriptionHtml: string;
  /** Vendor name */
  vendor: string;
  /** Product type */
  productType: string;
  /** Product status: ACTIVE, ARCHIVED, or DRAFT */
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  /** Product tags */
  tags: string[];
  /** ISO 8601 timestamp of when the product was created */
  createdAt: string;
  /** ISO 8601 timestamp of when the product was last updated */
  updatedAt: string;
  /** ISO 8601 timestamp of when the product was published (null if not published) */
  publishedAt: string | null;
  /** Template suffix */
  templateSuffix: string | null;
  /** Gift card template suffix */
  giftCardTemplateSuffix: string | null;
  /** Whether the product has only a default variant */
  hasOnlyDefaultVariant: boolean;
  /** Whether any variants are out of stock */
  hasOutOfStockVariants: boolean;
  /** Whether inventory is tracked */
  tracksInventory: boolean;
  /** Total inventory across all variants */
  totalInventory: number;
  /** Total number of variants */
  totalVariants: number;
  /** Product options */
  options: ProductOption[];
  /** Product images */
  images: ProductImage[];
  /** Featured image */
  featuredImage: ProductImage | null;
  /** SEO settings */
  seo: ProductSeo;
  /** Price range */
  priceRangeV2: ProductPriceRange;
  /** Product metafields */
  metafields: Metafield[];
  /** Product variants */
  variants: ProductVariant[];
}

// ============================================================
// Collection Types
// ============================================================

/**
 * Collection image
 */
export interface CollectionImage {
  /** Image URL */
  url: string;
  /** Image alt text */
  altText: string | null;
  /** Image width in pixels */
  width: number | null;
  /** Image height in pixels */
  height: number | null;
}

/**
 * Collection SEO settings
 */
export interface CollectionSeo {
  /** SEO title */
  title: string | null;
  /** SEO description */
  description: string | null;
}

/**
 * Rule for smart collections
 */
export interface CollectionRule {
  /** Column to match against (e.g., 'TAG', 'TITLE', 'VENDOR', 'VARIANT_PRICE') */
  column: string;
  /** Relation type (e.g., 'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'CONTAINS') */
  relation: string;
  /** Condition value to match */
  condition: string;
}

/**
 * Rule set for smart collections
 */
export interface CollectionRuleSet {
  /** Whether rules are applied with OR (true) or AND (false) */
  appliedDisjunctively: boolean;
  /** Collection rules */
  rules: CollectionRule[];
}

/**
 * Product reference in a collection
 */
export interface CollectionProductReference {
  /** Shopify GID (e.g., "gid://shopify/Product/123") */
  id: string;
  /** Legacy numeric ID */
  legacyResourceId: string;
}

/**
 * Collection node as returned by GraphQL bulk export
 */
export interface BulkCollectionNode {
  /** Shopify GID (e.g., "gid://shopify/Collection/123") */
  id: string;
  /** Legacy numeric ID */
  legacyResourceId: string;
  /** Collection title */
  title: string;
  /** URL handle */
  handle: string;
  /** Collection description (HTML) */
  descriptionHtml: string;
  /** Sort order (e.g., 'MANUAL', 'BEST_SELLING', 'ALPHA_ASC', 'PRICE_DESC') */
  sortOrder: string;
  /** Template suffix */
  templateSuffix: string | null;
  /** ISO 8601 timestamp of when the collection was last updated */
  updatedAt: string;
  /** Collection image */
  image: CollectionImage | null;
  /** SEO settings */
  seo: CollectionSeo;
  /** Rule set for smart collections (null for manual collections) */
  ruleSet: CollectionRuleSet | null;
  /** Collection metafields */
  metafields: Metafield[];
  /** Products in the collection */
  products: CollectionProductReference[];
}
