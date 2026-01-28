# Changelog

All notable changes to this project will be documented in this file.

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
