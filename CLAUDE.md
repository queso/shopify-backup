# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shopify backup script that dumps store data nightly to a directory picked up by existing B2/Backblaze backup pipeline. Runs as a scheduled Dokploy service.

## Tech Stack

- Node.js + TypeScript
- @shopify/shopify-api for Shopify API client
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

## Shopify API Rate Limits

- 40 requests/second (leaky bucket)
- Use bulk operations where available
- Add small delay between paginated requests
- Handle 429 responses with exponential backoff

## Data to Backup

- Products (all fields, variants, metafields)
- Product images (actual files downloaded, not just URLs)
- Customers
- Orders
- Pages
- Collections
- Blogs/articles

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
