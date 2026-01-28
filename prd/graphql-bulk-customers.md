# PRD: GraphQL Bulk Operations for Customer Backup

## Problem Statement

The current REST-based customer backup fails on stores with strict rate limits (2 req/sec on dev stores). The REST API uses request-based rate limiting, which causes failures when paginating through large datasets or stores with lower limits.

## Proposed Solution

Replace the REST-based customer backup with Shopify's GraphQL Bulk Operations API. This is a proof-of-concept to validate the approach before migrating other resources.

## Background

Shopify's Bulk Operations API:
- Submits a GraphQL query that runs asynchronously on Shopify's servers
- Returns a JSONL file URL when complete
- No impact on normal rate limits
- Ideal for large data exports

## Requirements

### Functional Requirements

1. **Submit bulk operation** - Create a bulk operation query for customers with all relevant fields (id, email, firstName, lastName, phone, addresses, tags, metafields, etc.)

2. **Poll for completion** - Check operation status until complete (or failed/cancelled)

3. **Download results** - Fetch the JSONL file from the returned URL

4. **Parse and save** - Convert JSONL to JSON array and save as `customers.json`

5. **Error handling** - Handle operation failures, timeouts, and partial results gracefully

6. **Fallback behavior** - If bulk operation fails, log error and continue with other backups (don't block entire backup)

### Non-Functional Requirements

- Poll interval: 2-5 seconds (configurable)
- Operation timeout: 10 minutes max wait
- Must work with existing backup flow (called from `runBackup()`)

## Technical Approach

### GraphQL Query

```graphql
mutation {
  bulkOperationRunQuery(
    query: """
    {
      customers {
        edges {
          node {
            id
            email
            firstName
            lastName
            phone
            state
            tags
            createdAt
            updatedAt
            addresses {
              address1
              address2
              city
              province
              country
              zip
              phone
            }
            metafields {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                }
              }
            }
          }
        }
      }
    }
    """
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
```

### Poll Query

```graphql
query {
  currentBulkOperation {
    id
    status
    errorCode
    objectCount
    url
  }
}
```

### New Files

- `src/graphql.ts` - GraphQL client wrapper and bulk operation utilities
- `src/backup/customers-bulk.ts` - Bulk operation implementation for customers

### Modified Files

- `src/backup/customers.ts` - Switch to use bulk operation, keep REST as potential fallback
- `src/shopify.ts` - Add GraphQL client creation alongside REST client

## Out of Scope

- Migrating other resources (products, orders, etc.) to bulk operations
- Webhook-based completion notification (polling is sufficient for backup use case)
- Incremental/delta backups

## Success Criteria

1. Customer backup completes successfully on stores with 2 req/sec limits
2. All customer fields including metafields are captured
3. Backup time is comparable or faster than REST approach
4. No impact on other backup modules

## Testing

- Unit tests for JSONL parsing
- Unit tests for bulk operation status handling
- Integration test with actual Shopify store (manual)
