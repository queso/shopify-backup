# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shopify backup script that dumps store data nightly to a directory picked up by existing B2/Backblaze backup pipeline. Runs as a scheduled Dokploy service.

## Tech Stack

- Node.js + TypeScript
- @shopify/shopify-api for Shopify REST and GraphQL clients
- GraphQL Bulk Operations for efficient large-scale data export
- Deployed via Dokploy with cron schedule (`0 2 * * *`)

## Environment Variables

```bash
SHOPIFY_STORE=arcane-layer.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
BACKUP_DIR=/backups/shopify
RETENTION_DAYS=30
```

## Architecture

The script authenticates with Shopify Admin API, paginates through each resource type (products, customers, orders, pages, collections, blogs), writes JSON files, downloads product images, and cleans up old backups based on retention policy.

Output structure:
```
/backups/shopify/YYYY-MM-DD/
├── products.json
├── customers.json
├── orders.json
├── pages.json
├── collections.json
├── blogs.json
├── metafields.json
└── images/{product_id}/{n}.{ext}
```

## GraphQL Bulk Operations

The `src/graphql/` module provides efficient bulk data export using Shopify's GraphQL Bulk Operations API:

```
src/graphql/
├── client.ts          # GraphQL client wrapper with error handling
├── bulk-operations.ts # Bulk operation submission and query constants
├── polling.ts         # Async polling with timeout/abort support
├── download.ts        # JSONL result file download
└── jsonl.ts           # JSONL parsing and nested object reconstruction
```

### Available Bulk Queries

| Query | Description |
|-------|-------------|
| `CUSTOMER_BULK_QUERY` | Customers with addresses and metafields |
| `ORDER_BULK_QUERY` | Orders with line items, transactions, fulfillments, refunds, metafields |
| `PRODUCT_BULK_QUERY` | Products with variants, images, and metafields (including variant metafields) |
| `COLLECTION_BULK_QUERY` | Collections with products, smart collection rules, and metafields |

### Bulk Backup Modules

```
src/backup/
├── customers-bulk.ts   # backupCustomersBulk()
├── orders-bulk.ts      # backupOrdersBulk()
├── products-bulk.ts    # backupProductsBulk() - returns { result, products }
└── collections-bulk.ts # backupCollectionsBulk()
```

### Usage Pattern
```typescript
import { createGraphQLClient } from './graphql/client.js';
import { backupOrdersBulk } from './backup/orders-bulk.js';

const client = createGraphQLClient(config);
const result = await backupOrdersBulk(client, outputDir);
// result: { success: boolean, count: number, error?: string }
```

### JSONL Reconstruction
Shopify bulk operations return flat JSONL with `__parentId` references. The `reconstructBulkData()` function in `jsonl.ts` handles:
- Multiple child types per parent (products have variants, images, AND metafields)
- Multi-level nesting (product → variant → variant metafield)
- Type detection by Shopify GID prefix

### Why Bulk Operations?
- **Async processing** - Shopify processes queries in background, no rate limits during execution
- **Large datasets** - Handles 10,000+ records efficiently
- **Complete data** - Metafields included (REST API hits rate limits for metafield fetching)
- **JSONL format** - Streaming-friendly output, parsed with `parseJsonl()`

### REST API Fallback
Customers and orders backup automatically fall back to REST API when GraphQL returns `ACCESS_DENIED`:
- **Shopify Basic plans** lack Protected Customer Data access for GraphQL bulk operations
- **Higher-tier plans** (Shopify, Advanced, Plus) use fast GraphQL bulk operations
- Fallback is automatic - no configuration needed
- REST fallback is slower but still works (~5 min vs ~1 min for full GraphQL)

## Shopify API Rate Limits

- 40 requests/second (leaky bucket)
- Use bulk operations where available
- Add small delay between paginated requests
- Handle 429 responses with exponential backoff

## Data to Backup

**GraphQL Bulk Operations (primary method):**
- Customers (with addresses and metafields)
- Orders (with line items, transactions, fulfillments, refunds, metafields)
- Products (with variants, images, metafields, variant metafields)
- Collections (with product associations, smart collection rules, metafields)

**REST API:**
- Product images (actual files downloaded, not just URLs)
- Pages
- Blogs/articles
- Shop metafields

## A(i)-Team Integration

This project uses the A(i)-Team plugin for PRD-driven development.

### When to Use A(i)-Team

Use the A(i)-Team workflow when:
- Implementing features from a PRD document
- Working on multi-file changes that benefit from TDD
- Building features that need structured test -> implement -> review flow

### Commands

- `/ateam plan <prd-file>` - Decompose a PRD into tracked work items
- `/ateam run` - Execute the mission with parallel agents
- `/ateam status` - Check current progress
- `/ateam resume` - Resume an interrupted mission

### Workflow

1. Place your PRD in the `prd/` directory
2. Run `/ateam plan prd/your-feature.md`
3. Run `/ateam run` to execute

The A(i)-Team will:
- Break down the PRD into testable units
- Write tests first (TDD)
- Implement to pass tests
- Review each feature
- Probe for bugs
- Update documentation and commit

**Do NOT** work on PRD features directly without using `/ateam plan` first.
