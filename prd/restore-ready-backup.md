# PRD: Restore-Ready Backup Structure

## Problem Statement

The current backup captures Shopify data but isn't structured for restore. Key issues:

1. **Image filenames use `position`, but variants reference images by `id`** - On restore, we'd need to cross-reference the images array to map variant images correctly
2. **Shopify assigns new IDs on creation** - All product, variant, image, customer, and order IDs will change during restore, breaking hardcoded references
3. **No clear dependency ordering** - Collections reference products, orders reference customers and variants, but relationships aren't explicit
4. **Scattered metadata** - Metafields are embedded in parent objects rather than clearly associated

## Current Backup Structure

```
/backups/shopify/YYYY-MM-DD/
├── products.json       # Full product objects with embedded variants, images, metafields
├── customers.json
├── orders.json
├── pages.json
├── collections.json
├── blogs.json
├── metafields.json     # Shop-level metafields only
└── images/{product_id}/{position}.{ext}
```

## Goals

1. Structure backup data so restore is straightforward without complex cross-referencing
2. Preserve all relationships between entities using stable identifiers
3. Document restore order dependencies
4. Ensure variant-to-image associations survive the restore process

## Non-Goals

- Writing actual restore scripts (future work)
- Backing up theme files or assets
- Backing up apps or app data
- Point-in-time incremental backups

---

## Proposed Changes

### 1. Image Directory Structure

**Current:** `images/{product_id}/{position}.{ext}`

**Problem:** Position can change if images are reordered. Variant `image_id` references Shopify's image ID, not position.

**Proposed:** `images/{product_id}/{image_id}.{ext}`

This provides a stable identifier that matches what variants reference. Include an `images-manifest.json` per product:

```json
{
  "product_id": 9773314277659,
  "product_handle": "articulated-lobster",
  "images": [
    {
      "id": 47281890754843,
      "filename": "47281890754843.jpg",
      "position": 7,
      "alt": "Lobster with bucket",
      "variant_ids": [49739557962011],
      "src": "https://cdn.shopify.com/..."
    }
  ]
}
```

### 2. Restore Manifest

Create a top-level `restore-manifest.json` that documents:

```json
{
  "backup_date": "2026-01-28",
  "shop": "arcane-layer.myshopify.com",
  "restore_order": [
    "customers",
    "products",
    "collections",
    "pages",
    "blogs",
    "orders"
  ],
  "entity_counts": {
    "products": 45,
    "variants": 128,
    "images": 312,
    "customers": 89,
    "orders": 156,
    "collections": 12,
    "pages": 8,
    "blogs": 2,
    "blog_articles": 15,
    "inventory_locations": 2,
    "inventory_levels": 256,
    "redirects": 23,
    "price_rules": 5
  },
  "warnings": [
    "Orders cannot be fully restored (Shopify limitation) - archived for reference only",
    "Customer passwords cannot be restored - customers must reset",
    "Gift cards cannot be restored (security/financial reasons)"
  ]
}
```

### 3. Products with Explicit Relationships

Restructure `products.json` to make variant-image relationships explicit:

```json
{
  "id": 9773314277659,
  "handle": "articulated-lobster",
  "title": "3d printed articulated Lobster",
  "...other_fields": "...",

  "variants": [
    {
      "id": 49739557929243,
      "sku": "LOBSTER-ONLY",
      "title": "lobster only",
      "price": "6.00",
      "image_id": 47281890885915,
      "image_ref": {
        "id": 47281890885915,
        "position": 11,
        "filename": "47281890885915.jpg"
      },
      "...other_fields": "..."
    }
  ],

  "images": [
    {
      "id": 47281890885915,
      "position": 11,
      "filename": "47281890885915.jpg",
      "alt": null,
      "width": 4284,
      "height": 5712,
      "variant_ids": [49739557929243]
    }
  ]
}
```

The `image_ref` on each variant provides direct restore guidance without needing to cross-reference.

### 4. Inventory Levels by Location

Current backup only captures `inventory_quantity` (total across all locations). For multi-location stores, we need per-location data.

**locations.json:**
```json
[
  {
    "id": 12345,
    "name": "Main Warehouse",
    "address1": "123 Storage Lane",
    "city": "Austin",
    "province": "TX",
    "country": "US",
    "active": true
  },
  {
    "id": 67890,
    "name": "Retail Store",
    "address1": "456 Shop Street",
    "city": "Austin",
    "province": "TX",
    "country": "US",
    "active": true
  }
]
```

**levels.json:**
```json
[
  {
    "inventory_item_id": 51792493379867,
    "variant_id": 49739557929243,
    "variant_sku": "LOBSTER-ONLY",
    "product_handle": "articulated-lobster",
    "levels": [
      { "location_id": 12345, "location_name": "Main Warehouse", "available": 5 },
      { "location_id": 67890, "location_name": "Retail Store", "available": 2 }
    ]
  }
]
```

Including `variant_sku` and `product_handle` allows restore by stable identifier when IDs change.

### 5. URL Redirects

Back up all URL redirects to preserve SEO and prevent broken links:

**redirects.json:**
```json
[
  {
    "id": 123,
    "path": "/products/old-lobster-name",
    "target": "/products/articulated-lobster"
  },
  {
    "id": 456,
    "path": "/sale",
    "target": "/collections/summer-sale"
  }
]
```

Restore redirects last to avoid conflicts with resources being created.

### 6. Handle-Based References for Collections

Collections reference products by ID. For restore, include handles:

```json
{
  "id": 12345,
  "handle": "summer-sale",
  "title": "Summer Sale",
  "products": [
    { "id": 9773314277659, "handle": "articulated-lobster", "position": 1 },
    { "id": 9778628460827, "handle": "bigfoot-figure", "position": 2 }
  ]
}
```

Handles are stable identifiers that survive restore (assuming no conflicts).

### 7. Orders - Archive Only

Orders present a challenge:
- Shopify doesn't allow creating orders via API with full historical data
- Order IDs, line item references, and customer IDs will all differ

**Recommendation:** Mark orders as "archive only" in the manifest. Document that orders serve as historical record, not restorable data. For actual order restoration, Shopify's native backup/export or contacting support is required.

Include in orders.json:

```json
{
  "_restore_note": "Orders are archived for reference only. Shopify API does not support creating historical orders with original dates, financial status, and fulfillment status.",
  "orders": [...]
}
```

### 8. Customer Data Considerations

Customers can be restored, but:
- Passwords cannot be restored (customers must reset)
- Order history linkage will be lost (orders aren't restorable)
- Email marketing consent status should be preserved

Add to customer records:

```json
{
  "id": 123456,
  "email": "customer@example.com",
  "accepts_marketing": true,
  "marketing_consent_updated_at": "2025-06-15T10:30:00Z",
  "_restore_notes": {
    "password": "Customer must reset password after restore",
    "orders": "Historical orders not linked - archive only"
  }
}
```

---

## Restore Order Dependencies

```
1. Customers (no dependencies)
   ↓
2. Inventory Locations (needed before inventory levels)
   ↓
3. Products (no dependencies, but needed by collections/orders)
   - Create product
   - Upload images (using new image IDs)
   - Create variants with image associations
   - Set metafields
   ↓
4. Inventory Levels (depends on products + locations)
   - Set quantity per variant per location
   ↓
5. Collections (depends on products existing)
   - Smart collections: restore rules only
   - Custom collections: restore product membership by handle
   ↓
6. Pages (no dependencies)
   ↓
7. Blogs + Articles (articles depend on blog existing)
   ↓
8. Shop Metafields (no dependencies)
   ↓
9. URL Redirects (restore last - paths must not conflict with existing resources)
   ↓
10. Price Rules / Discounts (may require manual review)

NOT RESTORABLE:
- Orders (archive only)
- Gift cards (security/financial reasons)
```

---

## New Backup Structure

```
/backups/shopify/YYYY-MM-DD/
├── restore-manifest.json
├── products/
│   ├── index.json              # All products with embedded variants + image refs
│   └── images/
│       ├── {product_id}/
│       │   ├── manifest.json   # Image metadata for this product
│       │   ├── {image_id}.jpg
│       │   └── {image_id}.png
├── inventory/
│   ├── locations.json          # All inventory locations
│   └── levels.json             # Inventory levels per variant per location
├── customers.json
├── collections.json            # With product handles, not just IDs
├── pages.json
├── blogs.json                  # Includes articles nested
├── metafields.json             # Shop-level
├── redirects.json              # URL redirects for SEO preservation
├── price-rules.json            # Discounts and price rules
└── archive/
    └── orders.json             # Clearly marked as non-restorable archive
```

---

## Migration Path

1. Update image download to use `image.id` instead of `image.position` for filenames
2. Add `image_ref` to variant objects during backup
3. Add product handles to collection product lists
4. Generate `restore-manifest.json` with counts and restore order
5. Move orders to `archive/` subdirectory with restore notes
6. Add per-product image manifests
7. Add inventory location + levels backup (InventoryLevel API)
8. Add URL redirects backup (Redirect API)
9. Add price rules / discounts backup (PriceRule API)

---

## Success Criteria

- [ ] A fresh Shopify store can be populated from backup with correct variant-image associations
- [ ] Collection product membership is restored correctly
- [ ] All metafields are restored to their parent entities
- [ ] Restore manifest clearly documents what can/cannot be restored
- [ ] Image files can be matched to their metadata without position ambiguity
- [ ] Inventory levels are restored per location with correct quantities
- [ ] URL redirects are preserved for SEO continuity
- [ ] Price rules and discounts are documented (restored where API allows)
- [ ] Product status (active/draft/archived) is preserved

---

## Decisions

1. **Inventory locations** - Yes, back up inventory levels per location. Use the InventoryLevel API to capture quantity at each location.

2. **Price rules / Discounts** - Yes, back up if API supports it. Even if restore requires manual steps, having the data is valuable.

3. **Product status** - Preserve original `active`/`draft`/`archived` status on restore.

4. **URL Redirects** - Yes, back up via Redirect API. Critical for SEO - preserves:
   - Redirects from old handles when products were renamed
   - Custom redirects (e.g., `/sale` → `/collections/summer-sale`)
   - Legacy URL mappings from previous site migrations

## Open Questions

1. **Draft orders** - Include in archive or skip entirely?
