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
