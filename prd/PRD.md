# Shopify Backup

Nightly backup of Shopify store data to local JSON files and images. Designed to run as a Dokploy scheduled service, writing to a directory picked up by an existing B2/Backblaze backup pipeline.

## What Gets Backed Up

- Products (with variants and metafields)
- Product images (downloaded to disk)
- Customers
- Orders
- Pages
- Collections
- Blogs and articles
- Shop metafields

Each run produces a date-stamped directory with JSON exports and a `status.json` summary.

## Output Structure

```
/backups/shopify/
└── 2026-01-27/
    ├── products.json
    ├── customers.json
    ├── orders.json
    ├── pages.json
    ├── collections.json
    ├── blogs.json
    ├── metafields.json
    ├── status.json
    └── images/
        ├── 12345/        # product ID
        │   ├── 1.jpg
        │   └── 2.jpg
        └── 67890/
            └── 1.png
```

Old backups are automatically deleted based on the retention policy.

## Setup

### Prerequisites

- Node.js >= 20
- pnpm
- A Shopify Admin API access token with read access to products, customers, orders, content, and metafields

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOPIFY_STORE` | Yes | -- | Store domain, e.g. `your-store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Yes | -- | Admin API access token (`shpat_...`) |
| `BACKUP_DIR` | No | `/backups/shopify` | Directory for backup output |
| `RETENTION_DAYS` | No | `30` | Days to keep old backups |

### Generate an Access Token

1. Go to your Shopify admin: **Settings > Apps and sales channels > Develop apps**
2. Create an app and configure Admin API scopes (read access for products, customers, orders, content, metafields)
3. Install the app and copy the Admin API access token

## Running Locally

```bash
pnpm install
cp .env.example .env   # edit with your values
pnpm dev               # runs with tsx
```

## Docker Deployment (Dokploy)

The Dockerfile uses a multi-stage build with `node:20-alpine` and runs as a non-root user.

1. Create a new service in Dokploy pointing to this repo
2. Set the environment variables listed above
3. Mount a volume for backup output (e.g. `/backups` to wherever B2 sync picks up)
4. Configure a scheduled task with cron expression: `0 2 * * *` (daily at 2 AM)

Build and run manually with Docker:

```bash
docker build -t shopify-backup .
docker run --env-file .env -v /path/to/backups:/backups/shopify shopify-backup
```

## Development

```bash
pnpm install           # install dependencies
pnpm dev               # run the backup script locally
pnpm build             # compile TypeScript
pnpm start             # run compiled output
pnpm test              # run tests (Vitest)
pnpm test:watch        # run tests in watch mode
pnpm test:coverage     # run tests with coverage
pnpm lint              # lint with ESLint
pnpm typecheck         # type-check without emitting
```

## Rate Limiting

The Shopify Admin API allows 40 requests/second (leaky bucket). The script adds delays between paginated requests and handles 429 responses with exponential backoff.
