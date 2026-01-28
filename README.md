# Shopify Backup

A read-only backup tool that exports your entire Shopify store to local JSON files and downloads all product images. Designed to run on a schedule so your store data is always recoverable — even if Shopify has an outage or data is accidentally deleted.

The tool is **completely read-only** and will never modify your store. It only uses GET requests against the Shopify Admin API.

## What Gets Backed Up

| Resource | File | Includes |
|----------|------|----------|
| Products | `products.json` | All fields, variants, product metafields, variant metafields |
| Product images | `images/{product_id}/` | Actual image files downloaded to disk |
| Customers | `customers.json` | All fields, customer metafields |
| Orders | `orders.json` | Full order history (all statuses), order metafields |
| Pages | `pages.json` | All published pages |
| Collections | `collections.json` | Smart + custom collections with metafields |
| Blogs | `blogs.json` | All blogs with their articles |
| Shop metafields | `metafields.json` | Store-level metafields |

Each run also writes a `status.json` with timestamps, per-module success/failure status, item counts, and any errors.

## Output Structure

```
/backups/shopify/
├── 2026-01-27/
│   ├── products.json
│   ├── customers.json
│   ├── orders.json
│   ├── pages.json
│   ├── collections.json
│   ├── blogs.json
│   ├── metafields.json
│   ├── status.json
│   └── images/
│       └── 8293748/
│           ├── 1.jpg
│           └── 2.png
├── 2026-01-26/
│   └── ...
```

Old backup directories are automatically cleaned up based on the retention policy.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` to get started.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SHOPIFY_STORE` | Yes | — | Your store domain (e.g. `my-store.myshopify.com`) |
| `SHOPIFY_ACCESS_TOKEN` | Yes | — | Admin API access token (starts with `shpat_`) |
| `BACKUP_DIR` | No | `/backups/shopify` | Where backup directories are written |
| `RETENTION_DAYS` | No | `30` | How many days of backups to keep |

### Creating a Shopify Access Token

1. In Shopify admin, go to **Settings > Apps and sales channels > Develop apps**
2. Create a new app
3. Under **Configuration**, add Admin API scopes:
   - `read_products`
   - `read_customers`
   - `read_orders`
   - `read_content`
   - `read_metaobjects`
4. Install the app and copy the **Admin API access token**

## Docker Deployment

The image uses a multi-stage build on `node:20-alpine` and runs as a non-root user.

### Build and Run

```bash
docker build -t shopify-backup .

docker run \
  -e SHOPIFY_STORE=my-store.myshopify.com \
  -e SHOPIFY_ACCESS_TOKEN=shpat_xxxxx \
  -v /path/to/backups:/backups/shopify \
  shopify-backup
```

Or with an env file:

```bash
docker run --env-file .env -v /path/to/backups:/backups/shopify shopify-backup
```

The container runs the backup once and exits. Schedule it with cron, Kubernetes CronJob, or your deployment platform's scheduler.

### Deploying with Dokploy

1. Create a new **Application** in Dokploy pointing to this repository
2. Set the four environment variables above in the Dokploy UI
3. Add a **persistent volume** mounting your backup storage to `/backups/shopify`
4. Under **Advanced > Scheduled Tasks**, add a cron job: `0 2 * * *` (runs daily at 2 AM)

The backup output directory will be picked up by whatever sync pipeline you have on the host (e.g. B2/Backblaze, rclone, restic).

## Local Development

```bash
pnpm install
cp .env.example .env    # fill in your values
pnpm dev                # run backup with tsx
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run backup locally (via tsx) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output |
| `pnpm test` | Run test suite (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint` | Lint with ESLint |
| `pnpm typecheck` | Type-check without emitting |

## How It Works

1. Reads configuration from environment variables
2. Connects to Shopify Admin API (pinned to API version `2025-01`)
3. Fetches each resource type using cursor-based pagination
4. Fetches metafields for products, variants, customers, orders, and collections
5. Downloads all product images to disk (skips already-downloaded files)
6. Writes JSON files to a date-stamped directory
7. Writes `status.json` summarizing the run
8. Deletes backup directories older than the retention period
9. Exits with code 1 if any module had errors

All API calls use exponential backoff with retry on 429 (rate limit), 500, 502, 503, and 504 responses, as well as network errors (ECONNRESET, ETIMEDOUT).
