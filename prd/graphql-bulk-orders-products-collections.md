# PRD: GraphQL Bulk Operations for Orders, Products, and Collections

## Overview

Migrate orders, products, and collections backup to GraphQL Bulk Operations API to improve performance and enable metafield backup that is currently disabled due to REST API rate limits.

### Current State

| Module | Method | Records | Metafields | Issue |
|--------|--------|---------|------------|-------|
| Orders | REST pagination | 6,404 | Stubbed `[]` | Slow, no metafields |
| Products | REST pagination | 89 | Stubbed `[]` | Rate limits prevent metafield fetch |
| Collections | REST pagination | 2 | Stubbed `[]` | Rate limits prevent metafield fetch |

### Goals

1. **Orders:** Faster backup with complete order data including metafields
2. **Products:** Enable product and variant metafield backup
3. **Collections:** Enable collection metafield backup
4. **Consistency:** Use same bulk operation pattern as customer backup

### Success Metrics

- Orders backup completes in <2 minutes (vs current ~5+ minutes)
- Product metafields populated (currently empty arrays)
- Collection metafields populated (currently empty arrays)
- All existing tests pass
- No increase in API errors

---

## Technical Approach

### Reuse Existing Infrastructure

The customer bulk backup established reusable infrastructure:

```
src/graphql/
├── client.ts          # ✅ Reuse - GraphQL client
├── bulk-operations.ts # ✅ Extend - Add ORDER/PRODUCT/COLLECTION queries
├── polling.ts         # ✅ Reuse - pollBulkOperation()
├── download.ts        # ✅ Reuse - downloadBulkOperationResults()
└── jsonl.ts           # ✅ Reuse - parseJsonl(), reconstructNestedObjects()
```

### New Components Needed

1. **Bulk queries** in `bulk-operations.ts`:
   - `ORDER_BULK_QUERY`
   - `PRODUCT_BULK_QUERY`
   - `COLLECTION_BULK_QUERY`

2. **Backup orchestrators**:
   - `src/backup/orders-bulk.ts` - `backupOrdersBulk()`
   - `src/backup/products-bulk.ts` - `backupProductsBulk()`
   - `src/backup/collections-bulk.ts` - `backupCollectionsBulk()`

3. **Integration** in `src/backup.ts`:
   - Switch orders to `backupOrdersBulk()`
   - Switch products to `backupProductsBulk()`
   - Switch collections to `backupCollectionsBulk()`

---

## Part 1: Orders Bulk Backup

### GraphQL Query

```graphql
{
  orders(query: "created_at:>=1970-01-01") {
    edges {
      node {
        id
        legacyResourceId
        name
        email
        phone
        createdAt
        updatedAt
        processedAt
        closedAt
        cancelledAt
        cancelReason
        displayFinancialStatus
        displayFulfillmentStatus
        confirmed
        test
        taxesIncluded
        currencyCode
        presentmentCurrencyCode
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        note
        tags

        customer {
          id
          email
          firstName
          lastName
        }

        billingAddress {
          firstName lastName company
          address1 address2
          city province provinceCode
          country countryCodeV2
          zip phone
        }

        shippingAddress {
          firstName lastName company
          address1 address2
          city province provinceCode
          country countryCodeV2
          zip phone
        }

        lineItems(first: 250) {
          edges {
            node {
              id
              title
              variantTitle
              quantity
              sku
              vendor
              requiresShipping
              taxable
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              discountedUnitPriceSet { shopMoney { amount currencyCode } }
              originalTotalSet { shopMoney { amount currencyCode } }
              discountedTotalSet { shopMoney { amount currencyCode } }

              variant {
                id
                legacyResourceId
              }

              product {
                id
                legacyResourceId
              }
            }
          }
        }

        shippingLines(first: 10) {
          edges {
            node {
              title
              code
              source
              originalPriceSet { shopMoney { amount currencyCode } }
              discountedPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }

        transactions(first: 50) {
          id
          kind
          status
          gateway
          amountSet { shopMoney { amount currencyCode } }
          createdAt
          processedAt
        }

        fulfillments(first: 50) {
          id
          status
          createdAt
          updatedAt
          trackingInfo {
            company
            number
            url
          }
        }

        refunds(first: 50) {
          id
          createdAt
          note
          totalRefundedSet { shopMoney { amount currencyCode } }
        }

        discountApplications(first: 20) {
          edges {
            node {
              allocationMethod
              targetSelection
              targetType
              value {
                ... on MoneyV2 { amount currencyCode }
                ... on PricingPercentageValue { percentage }
              }
            }
          }
        }

        metafields(first: 50) {
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
```

### Output Type

```typescript
interface BulkOrderNode {
  id: string;
  legacyResourceId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  closedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  confirmed: boolean;
  test: boolean;
  note?: string;
  tags: string[];
  customer?: { id: string; email?: string; firstName?: string; lastName?: string };
  billingAddress?: Address;
  shippingAddress?: Address;
  lineItems: LineItem[];
  shippingLines: ShippingLine[];
  transactions: Transaction[];
  fulfillments: Fulfillment[];
  refunds: Refund[];
  discountApplications: DiscountApplication[];
  metafields: Metafield[];
  // Money fields...
}
```

### Acceptance Criteria

- [ ] `ORDER_BULK_QUERY` constant exported from `bulk-operations.ts`
- [ ] `backupOrdersBulk(client, outputDir)` function created
- [ ] Returns `BackupResult` with count and success status
- [ ] Writes `orders.json` with complete order data
- [ ] Order metafields included (currently stubbed)
- [ ] Line items, transactions, fulfillments, refunds included
- [ ] `backup.ts` updated to use bulk orders
- [ ] Graceful degradation on failure

---

## Part 2: Products Bulk Backup

### GraphQL Query

```graphql
{
  products {
    edges {
      node {
        id
        legacyResourceId
        title
        handle
        descriptionHtml
        vendor
        productType
        status
        tags
        createdAt
        updatedAt
        publishedAt
        templateSuffix
        giftCardTemplateSuffix
        hasOnlyDefaultVariant
        hasOutOfStockVariants
        tracksInventory
        totalInventory
        totalVariants

        options(first: 10) {
          id
          name
          position
          values
        }

        images(first: 250) {
          edges {
            node {
              id
              url
              altText
              width
              height
            }
          }
        }

        featuredImage {
          id
          url
          altText
        }

        seo {
          title
          description
        }

        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }

        metafields(first: 100) {
          edges {
            node {
              namespace
              key
              value
              type
              description
            }
          }
        }

        variants(first: 250) {
          edges {
            node {
              id
              legacyResourceId
              title
              displayName
              sku
              barcode
              position
              price
              compareAtPrice
              taxable
              taxCode
              availableForSale
              requiresShipping
              weight
              weightUnit
              inventoryQuantity

              selectedOptions {
                name
                value
              }

              image {
                id
                url
              }

              inventoryItem {
                id
                tracked
                sku
                requiresShipping
              }

              metafields(first: 50) {
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
    }
  }
}
```

### Output Type

```typescript
interface BulkProductNode {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  options: ProductOption[];
  images: ProductImage[];
  featuredImage?: ProductImage;
  seo: { title?: string; description?: string };
  priceRangeV2: PriceRange;
  metafields: Metafield[];
  variants: ProductVariant[];
}

interface ProductVariant {
  id: string;
  legacyResourceId: string;
  title: string;
  sku?: string;
  barcode?: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  selectedOptions: { name: string; value: string }[];
  metafields: Metafield[];
  // ...
}
```

### Acceptance Criteria

- [ ] `PRODUCT_BULK_QUERY` constant exported from `bulk-operations.ts`
- [ ] `backupProductsBulk(client, outputDir)` function created
- [ ] Returns `BackupResult` with count and success status
- [ ] Writes `products.json` with complete product data
- [ ] Product metafields included (currently stubbed)
- [ ] Variant metafields included (currently stubbed)
- [ ] All variants included with inventory data
- [ ] `backup.ts` updated to use bulk products
- [ ] Image download still works with new data structure
- [ ] Graceful degradation on failure

### Image Download Compatibility

The existing image download uses `product.images[].src`. GraphQL returns `images[].url`.

Options:
1. Transform GraphQL `url` to `src` for compatibility
2. Update image download to accept either `src` or `url`

Recommend option 2 for cleaner implementation.

---

## Part 3: Collections Bulk Backup

### GraphQL Query

```graphql
{
  collections {
    edges {
      node {
        id
        legacyResourceId
        title
        handle
        descriptionHtml
        sortOrder
        templateSuffix
        updatedAt

        image {
          url
          altText
          width
          height
        }

        seo {
          title
          description
        }

        ruleSet {
          appliedDisjunctively
          rules {
            column
            relation
            condition
          }
        }

        metafields(first: 100) {
          edges {
            node {
              namespace
              key
              value
              type
              description
            }
          }
        }

        products(first: 250) {
          edges {
            node {
              id
              legacyResourceId
            }
          }
        }
      }
    }
  }
}
```

### Output Type

```typescript
interface BulkCollectionNode {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  sortOrder: string;
  templateSuffix?: string;
  updatedAt: string;
  image?: { url: string; altText?: string };
  seo: { title?: string; description?: string };
  ruleSet?: CollectionRuleSet;
  metafields: Metafield[];
  products: { id: string; legacyResourceId: string }[];
}
```

### Acceptance Criteria

- [ ] `COLLECTION_BULK_QUERY` constant exported from `bulk-operations.ts`
- [ ] `backupCollectionsBulk(client, outputDir)` function created
- [ ] Returns `BackupResult` with count and success status
- [ ] Writes `collections.json` with complete collection data
- [ ] Collection metafields included (currently stubbed)
- [ ] Smart collection rules included
- [ ] Product associations included
- [ ] `backup.ts` updated to use bulk collections
- [ ] Graceful degradation on failure

---

## Work Items

### Phase 1: Shared Types and Utilities

#### WI-020: Add bulk operation types for orders, products, collections
- Add `BulkOrderNode`, `BulkProductNode`, `BulkCollectionNode` to `src/types/graphql.ts`
- Add `Metafield` interface if not exists
- Add supporting types (Address, LineItem, Transaction, etc.)

### Phase 2: Orders Bulk Backup

#### WI-021: Add ORDER_BULK_QUERY constant
- Create comprehensive order query in `bulk-operations.ts`
- Include all order fields, line items, transactions, fulfillments, metafields
- Test query validates against Shopify schema

#### WI-022: Implement backupOrdersBulk function
- Create `src/backup/orders-bulk.ts`
- Orchestrate: submit → poll → download → write
- Handle JSONL nested structure (line items have `__parentId`)
- Return `BackupResult`

#### WI-023: Integrate bulk orders with backup.ts
- Replace `backupOrders()` call with `backupOrdersBulk()`
- Update tests in `src/__tests__/backup.test.ts`
- Maintain graceful degradation

### Phase 3: Products Bulk Backup

#### WI-024: Add PRODUCT_BULK_QUERY constant
- Create comprehensive product query in `bulk-operations.ts`
- Include variants, options, images, metafields
- Include variant metafields (nested)

#### WI-025: Implement backupProductsBulk function
- Create `src/backup/products-bulk.ts`
- Handle JSONL structure with variants as children
- Reconstruct product → variant → metafield hierarchy
- Return `BackupResult`

#### WI-026: Update image download for GraphQL structure
- Modify `src/backup/images.ts` to handle `url` field (GraphQL) in addition to `src` (REST)
- Test image download works with new product structure

#### WI-027: Integrate bulk products with backup.ts
- Replace `backupProducts()` call with `backupProductsBulk()`
- Update tests
- Verify image download still works end-to-end

### Phase 4: Collections Bulk Backup

#### WI-028: Add COLLECTION_BULK_QUERY constant
- Create collection query in `bulk-operations.ts`
- Include rules, metafields, product associations

#### WI-029: Implement backupCollectionsBulk function
- Create `src/backup/collections-bulk.ts`
- Handle smart collection rules
- Return `BackupResult`

#### WI-030: Integrate bulk collections with backup.ts
- Replace `backupCollections()` call with `backupCollectionsBulk()`
- Update tests

### Phase 5: Cleanup

#### WI-031: Remove deprecated REST backup code
- Remove or mark as deprecated: `backupOrders()`, `backupProducts()`, `backupCollections()`
- Update CLAUDE.md and CHANGELOG.md
- Final integration test

---

## Dependencies

```
WI-020 (types)
   ├── WI-021 (order query) → WI-022 (order backup) → WI-023 (order integration)
   ├── WI-024 (product query) → WI-025 (product backup) → WI-026 (images) → WI-027 (product integration)
   └── WI-028 (collection query) → WI-029 (collection backup) → WI-030 (collection integration)
                                                                              ↓
                                                                    WI-031 (cleanup)
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONL structure differs from expected | High | Write comprehensive tests with real JSONL samples |
| Order volume causes timeout | Medium | Implement date-range chunking if needed |
| Image download breaks | High | WI-026 explicitly handles compatibility |
| Bulk operation quota exceeded | Low | Shopify allows many concurrent bulk ops |

---

## Testing Strategy

1. **Unit tests** for each new function (mocked)
2. **Integration tests** with real JSONL samples
3. **Live test** against test store before merge
4. **Comparison test**: Compare REST vs bulk output for same data

---

## Rollout Plan

1. Implement and test orders (highest impact)
2. Implement and test products (fixes metafields)
3. Implement and test collections
4. Run full backup comparison: REST vs bulk
5. Deploy to production
6. Monitor for 1 week
7. Remove REST backup code
