# Changelog

All notable changes to this project will be documented in this file.

## [0.3.1] - 2026-01-30

### Fixed
- **Image downloads for GraphQL products** - Was only downloading ~101 images instead of all 2,558
  - GraphQL images don't have `position` field, causing all images per product to save as `undefined.jpg` (overwriting each other)
  - Now uses array index as fallback when `position` is missing
  - Uses `legacyResourceId` for directory names instead of full GID (`gid://shopify/Product/...`) which created invalid paths with colons
- **REST API pagination** - Fixed cursor-based pagination mixing original query params with page_info cursor
  - Shopify rejects requests that combine `page_info` with other query parameters
  - Subsequent paginated requests now only include cursor params
- **Out of memory crash on REST fallback** - Streaming write for large datasets
  - REST fallback for orders (124MB) and customers caused JavaScript heap OOM
  - Now streams each record to disk instead of accumulating in memory
  - Added `fetchAllPagesStreaming()` for memory-efficient pagination
  - Increased Node memory limit to 2GB in Dockerfile as safety net

## [0.3.0] - 2026-01-29

### Added

#### REST API Fallback for Protected Customer Data
- **Automatic fallback** when GraphQL bulk operations fail with `ACCESS_DENIED`
  - Shopify Basic plans lack Protected Customer Data access for GraphQL
  - Customers and orders automatically fall back to REST API pagination
  - Higher-tier plans (Shopify, Advanced, Plus) use fast GraphQL bulk operations
- Fallback logs: `[customers] GraphQL bulk operation denied, falling back to REST API`

#### GraphQL Bulk Operations for Orders, Products, and Collections
- **ORDER_BULK_QUERY** - Comprehensive order export query
  - Core order fields (name, email, phone, dates, status)
  - Financial data (totalPriceSet, subtotalPriceSet, taxes, discounts)
  - Customer reference
  - Line items with pricing
  - Transactions, fulfillments, refunds
  - Shipping and billing addresses
  - Metafields (previously unavailable via REST due to rate limits)

- **PRODUCT_BULK_QUERY** - Complete product export query
  - All product fields (title, handle, status, vendor, productType)
  - Product options
  - Images with URL and dimensions
  - Variants with full details
  - Product metafields
  - Variant metafields (nested)

- **COLLECTION_BULK_QUERY** - Collection export query
  - Collection fields (title, handle, sortOrder)
  - Smart collection rules (ruleSet)
  - Product associations
  - Metafields

- **reconstructBulkData()** - Multi-type JSONL reconstruction
  - Handles multiple child types per parent (products have variants, images, AND metafields)
  - Multi-level nesting support (product → variant → variant metafield)
  - Type detection by Shopify GID prefix

#### New Backup Modules
- `src/backup/orders-bulk.ts` - `backupOrdersBulk()` function
- `src/backup/products-bulk.ts` - `backupProductsBulk()` function (returns products for image download)
- `src/backup/collections-bulk.ts` - `backupCollectionsBulk()` function

#### Type Definitions
- `BulkOrderNode` - Full order structure with all nested types
- `BulkProductNode` - Product with variants, images, metafields
- `BulkCollectionNode` - Collection with rules and product associations
- `Metafield` - Reusable metafield interface

### Changed
- **Orders backup now uses GraphQL bulk operations** instead of REST API
  - Metafields now included (previously stubbed as empty arrays)
- **Products backup now uses GraphQL bulk operations** instead of REST API
  - Product metafields now included
  - Variant metafields now included
- **Collections backup now uses GraphQL bulk operations** instead of REST API
  - Metafields now included
  - Smart collection rules preserved
- **Image download** now supports both REST (`src`) and GraphQL (`url`) formats
- Updated `src/backup.ts` to use all bulk backup functions

### Deprecated
- `backupOrders()` in `src/backup/orders.ts` - Use `backupOrdersBulk()` instead
- `backupProducts()` in `src/backup/products.ts` - Use `backupProductsBulk()` instead

### Fixed
- JSONL reconstruction for multi-level nested objects (variant metafields were not attached to variants)
- JSONL reconstruction handles records without `id` field (null guard)
- Removed invalid GraphQL fields from bulk queries:
  - `ProductVariant`: removed `requiresShipping`, `weight`, `weightUnit` (not available in 2025-01 API)
  - `Order`: removed `fulfillmentStatus` (use `displayFulfillmentStatus` instead)

### Technical Details
- 319 tests for GraphQL and backup modules
- All bulk operations include metafields (resolves known limitation from v0.1.0)
- Tested: 89 products, 3,308 customers, 6,415 orders backed up successfully
- Performance: ~5 min total with REST fallback, ~1 min with full GraphQL access

## [0.2.0] - 2026-01-29

### Added

#### GraphQL Bulk Operations for Customers
- **GraphQL client wrapper** - New `src/graphql/client.ts` with typed interface for Shopify GraphQL API
  - `createGraphQLClient()` - Creates authenticated GraphQL client
  - `executeQuery()` / `executeMutation()` - Typed query/mutation execution
  - `GraphQLQueryError` / `UserErrorsError` - Structured error handling
- **Bulk operation submission** - `submitBulkOperation()` in `src/graphql/bulk-operations.ts`
  - Executes `bulkOperationRunQuery` mutation
  - Returns operation ID for polling
  - Includes `CUSTOMER_BULK_QUERY` with comprehensive customer fields
- **Bulk operation polling** - `pollBulkOperation()` in `src/graphql/polling.ts`
  - Configurable poll interval (default: 1 second)
  - Configurable timeout (default: 10 minutes)
  - AbortSignal support for cancellation
  - Debug-level logging for polling progress
  - Rate limiting coordination with global rate limiter
- **JSONL parsing** - `src/graphql/jsonl.ts` utilities
  - `parseJsonl()` - Parses Shopify bulk operation JSONL output
  - `reconstructNestedObjects()` - Rebuilds parent-child relationships from flat JSONL
- **JSONL download** - `downloadBulkOperationResults()` in `src/graphql/download.ts`
  - Fetches and parses bulk operation result files
  - Typed generic interface for result objects
- **Customer bulk backup** - `backupCustomersBulk()` in `src/backup/customers-bulk.ts`
  - Orchestrates full bulk operation flow: submit → poll → download → write
  - Returns `BackupResult` with success status and count
  - Graceful error handling with detailed error messages

#### Type System Enhancements
- New GraphQL types in `src/types/graphql.ts`:
  - `BulkOperation`, `BulkOperationStatus`, `BulkOperationErrorCode`
  - `GraphQLClient`, `GraphQLResponse`, `GraphQLError`
  - `CustomerNode`, `BulkCustomerNode` for typed customer data
  - `UserError` for Shopify mutation errors

### Changed
- **Customer backup now uses GraphQL bulk operations** instead of REST API pagination
  - Significantly faster for large customer lists (3,304 customers in ~30 seconds vs minutes)
  - Better rate limit handling (bulk operations are async)
  - Graceful degradation - backup continues if customer backup fails
- Updated `src/backup.ts` to use `backupCustomersBulk()` with GraphQL client
- Re-exported GraphQL client from `src/shopify.ts` for unified API access

### Fixed
- TypeScript enum usage in test files (use `BulkOperationStatus.CREATED` instead of string literals)
- Generic type parameters for `executeMutation()` calls in tests
- Added `BulkCustomerNode` type for proper typing of bulk customer data

### Technical Details
- 129 new unit tests for GraphQL modules
- All tests pass (224 total)
- Docker build succeeds
- Tested against live Shopify store: 3,304 customers, 6,404 orders backed up successfully

## [0.1.0] - 2026-01-28

Initial release of the Shopify backup utility.

### Added

#### Core Backup Features
- **Products backup** - Exports all products with variants to `products.json`
- **Customers backup** - Exports all customer records to `customers.json`
- **Orders backup** - Exports all orders (any status) to `orders.json`
- **Pages backup** - Exports all CMS pages to `pages.json`
- **Collections backup** - Exports smart and custom collections to `collections.json`
- **Blogs backup** - Exports all blogs with their articles to `blogs.json`
- **Shop metafields backup** - Exports shop-level metafields to `metafields.json`
- **Product images** - Downloads all product images to `images/{product_id}/{position}.{ext}`
- **Status reporting** - Generates `status.json` with backup results, counts, and timing

#### Infrastructure
- Environment-based configuration via `SHOPIFY_STORE`, `SHOPIFY_ACCESS_TOKEN`, `BACKUP_DIR`, and `RETENTION_DAYS`
- Cursor-based pagination for all Shopify REST API resources (250 items per page)
- Rate limiting with 3-second minimum interval between API requests
- Exponential backoff retry logic for 429/5xx errors and network failures
- Respects `Retry-After` header from Shopify API
- Automatic cleanup of backups older than retention period (default: 30 days)
- Date-stamped output directories (`YYYY-MM-DD` format)
- Idempotent image downloads (skips existing files)

#### Developer Experience
- TypeScript with strict type checking
- Vitest test suite with unit tests for all modules
- ESLint configuration
- Multi-stage Docker build with `node:20-alpine` base
- Non-root user execution in container
- Example environment file (`.env.example`)

#### Deployment
- Dockerfile optimized for Dokploy scheduled services
- Ready for cron-based execution (`0 2 * * *` recommended)
- Volume mount support for B2/Backblaze backup pipeline integration

### Technical Details
- Pinned to Shopify Admin API version `2025-01`
- Uses `@shopify/shopify-api` v11 SDK
- Node.js 20+ required
- pnpm package manager

### Known Limitations
- Product and collection metafield fetching is stubbed out due to REST API rate limit constraints; future versions may use GraphQL bulk operations
