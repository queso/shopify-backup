/**
 * Bulk operations module for Shopify GraphQL API
 *
 * Provides functions for submitting and managing bulk operations.
 * @see https://shopify.dev/api/admin-graphql/2025-01/objects/BulkOperation
 */

import type { GraphQLClient } from './client.js';
import { UserErrorsError } from './client.js';
import type { GraphQLResponse, BulkOperationRunQueryResponse } from '../types/graphql.js';

/**
 * GraphQL mutation to submit a bulk operation query
 */
const BULK_OPERATION_RUN_QUERY_MUTATION = `
mutation BulkOperationRunQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
      errorCode
      objectCount
      url
      createdAt
      completedAt
      fileSize
      query
      rootObjectCount
    }
    userErrors {
      field
      message
    }
  }
}
`;

/**
 * Customer bulk query for exporting all customers with addresses and metafields
 * Used as the default query for customer backups
 */
export const CUSTOMER_BULK_QUERY = `
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
        emailMarketingConsent {
          marketingState
          consentUpdatedAt
        }
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
`;

/**
 * Order bulk query for exporting all orders with line items, transactions, and fulfillments
 * Used for order backups via GraphQL bulk operations
 */
export const ORDER_BULK_QUERY = `
{
  orders {
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
        subtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        note
        tags
        customer {
          id
          email
          firstName
          lastName
        }
        billingAddress {
          firstName
          lastName
          company
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
        }
        shippingAddress {
          firstName
          lastName
          company
          address1
          address2
          city
          province
          provinceCode
          country
          countryCodeV2
          zip
          phone
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
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              originalTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
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
              originalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
        transactions(first: 50) {
          id
          kind
          status
          gateway
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
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
          totalRefundedSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
        discountApplications(first: 20) {
          edges {
            node {
              allocationMethod
              targetSelection
              targetType
              value {
                ... on MoneyV2 {
                  amount
                  currencyCode
                }
                ... on PricingPercentageValue {
                  percentage
                }
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
`;

/**
 * Product bulk query for exporting all products with variants, images, and metafields
 * Used for product backups via GraphQL bulk operations
 */
export const PRODUCT_BULK_QUERY = `
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
        hasOnlyDefaultVariant
        tracksInventory
        totalInventory
        totalVariants
        options {
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
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
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
`;

/**
 * Collection bulk query for exporting all collections with products and metafields
 * Used for collection backups via GraphQL bulk operations
 */
export const COLLECTION_BULK_QUERY = `
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
`;

/**
 * Submit a bulk operation query to Shopify
 *
 * @param client - GraphQL client with request method
 * @param query - The GraphQL query to run as a bulk operation
 * @returns The bulk operation ID on success
 * @throws UserErrorsError if the mutation returns user errors
 * @throws GraphQLQueryError if the mutation returns GraphQL errors
 * @throws Error if the bulk operation is null but no errors are returned
 */
export async function submitBulkOperation(
  client: Pick<GraphQLClient, 'request'>,
  query: string
): Promise<string> {
  const response = await client.request(BULK_OPERATION_RUN_QUERY_MUTATION, {
    variables: { query },
  }) as GraphQLResponse<BulkOperationRunQueryResponse>;

  // Check for null/undefined response
  if (!response) {
    throw new Error('Bulk operation submission failed: no response from server');
  }

  // Check for GraphQL errors
  if (response.errors && response.errors.length > 0) {
    const messages = response.errors.map((e) => e.message).join('; ');
    throw new Error(`GraphQL errors: ${messages}`);
  }

  // Check for null/undefined data or bulkOperationRunQuery
  if (!response.data || !response.data.bulkOperationRunQuery) {
    throw new Error('Bulk operation submission failed: invalid response structure');
  }

  const { bulkOperationRunQuery } = response.data;

  // Check for user errors
  if (bulkOperationRunQuery.userErrors && bulkOperationRunQuery.userErrors.length > 0) {
    throw new UserErrorsError(bulkOperationRunQuery.userErrors);
  }

  // Check if bulk operation was created
  if (!bulkOperationRunQuery.bulkOperation) {
    throw new Error('Bulk operation submission failed: no operation returned');
  }

  return bulkOperationRunQuery.bulkOperation.id;
}
