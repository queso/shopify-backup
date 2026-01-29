# Changelog

All notable changes to this project will be documented in this file.

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
