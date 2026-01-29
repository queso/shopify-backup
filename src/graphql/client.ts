/**
 * GraphQL client wrapper for Shopify Admin API
 *
 * Provides a typed interface for executing GraphQL queries and mutations
 * with proper error handling for both GraphQL errors and user errors.
 */

import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import type { BackupConfig } from '../types.js';
import type { GraphQLResponse, GraphQLError, UserError } from '../types/graphql.js';

const PINNED_API_VERSION = ApiVersion.January25;

/**
 * GraphQL client interface returned by createGraphQLClient
 */
export interface GraphQLClient {
  query: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
  mutate: <T>(mutation: string, variables?: Record<string, unknown>) => Promise<T>;
  request: (query: string, options: { variables?: Record<string, unknown> }) => Promise<GraphQLResponse<unknown>>;
}

/**
 * Options for mutation execution
 */
export interface MutationOptions {
  /** Whether to throw an error when user errors are present in the response */
  throwOnUserErrors?: boolean;
}

/**
 * Custom error class for GraphQL errors
 */
export class GraphQLQueryError extends Error {
  public readonly errors: GraphQLError[];

  constructor(errors: GraphQLError[]) {
    const messages = errors.map((e) => e.message).join('; ');
    super(`GraphQL errors: ${messages}`);
    this.name = 'GraphQLQueryError';
    this.errors = errors;
  }
}

/**
 * Custom error class for Shopify user errors (validation errors in mutations)
 */
export class UserErrorsError extends Error {
  public readonly userErrors: UserError[];

  constructor(userErrors: UserError[]) {
    const messages = userErrors.map((e) => {
      const fieldPath = e.field ? e.field.join('.') : 'general';
      return `[${fieldPath}] ${e.message}`;
    }).join('; ');
    super(`User errors: ${messages}`);
    this.name = 'UserErrorsError';
    this.userErrors = userErrors;
  }
}

/**
 * Create a GraphQL client for Shopify Admin API
 *
 * @param config - Backup configuration with store URL and access token
 * @returns GraphQL client with query and mutate methods
 * @throws Error if store URL or access token is missing
 */
export function createGraphQLClient(config: BackupConfig): GraphQLClient {
  if (!config.shopifyStore) {
    throw new Error('Shopify store URL is required');
  }

  if (!config.shopifyAccessToken) {
    throw new Error('Shopify access token is required');
  }

  const api = shopifyApi({
    apiVersion: PINNED_API_VERSION,
    apiSecretKey: 'not-used-for-custom-apps',
    hostName: config.shopifyStore,
    isCustomStoreApp: true,
    adminApiAccessToken: config.shopifyAccessToken,
    isEmbeddedApp: false,
  });

  const session = api.session.customAppSession(config.shopifyStore);
  const graphqlClient = new api.clients.Graphql({ session });

  // Create a wrapper that matches our interface
  const client: GraphQLClient = {
    query: async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
      const response = await graphqlClient.request(query, { variables }) as unknown as GraphQLResponse<T>;
      if (response.errors && response.errors.length > 0) {
        throw new GraphQLQueryError(response.errors);
      }
      return response.data;
    },
    mutate: async <T>(mutation: string, variables?: Record<string, unknown>): Promise<T> => {
      const response = await graphqlClient.request(mutation, { variables }) as unknown as GraphQLResponse<T>;
      if (response.errors && response.errors.length > 0) {
        throw new GraphQLQueryError(response.errors);
      }
      return response.data;
    },
    request: async (query: string, options: { variables?: Record<string, unknown> }): Promise<GraphQLResponse<unknown>> => {
      return await graphqlClient.request(query, options) as unknown as GraphQLResponse<unknown>;
    },
  };

  return client;
}

/**
 * Execute a GraphQL query
 *
 * @param client - GraphQL client with request method
 * @param query - GraphQL query string
 * @param variables - Optional query variables
 * @returns Query result data
 * @throws GraphQLQueryError if the response contains GraphQL errors
 */
export async function executeQuery<T>(
  client: Pick<GraphQLClient, 'request'>,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await client.request(query, { variables }) as GraphQLResponse<T>;

  if (response.errors && response.errors.length > 0) {
    throw new GraphQLQueryError(response.errors);
  }

  return response.data;
}

/**
 * Extract user errors from a mutation response
 * Looks for userErrors field in any top-level mutation result
 */
function extractUserErrors(data: unknown): UserError[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const dataObj = data as Record<string, unknown>;
  const userErrors: UserError[] = [];

  for (const key of Object.keys(dataObj)) {
    const value = dataObj[key];
    if (value && typeof value === 'object' && 'userErrors' in value) {
      const errors = (value as { userErrors: UserError[] }).userErrors;
      if (Array.isArray(errors) && errors.length > 0) {
        userErrors.push(...errors);
      }
    }
  }

  return userErrors;
}

/**
 * Execute a GraphQL mutation
 *
 * @param client - GraphQL client with request method
 * @param mutation - GraphQL mutation string
 * @param variables - Optional mutation variables
 * @param options - Mutation options (e.g., throwOnUserErrors)
 * @returns Mutation result data
 * @throws GraphQLQueryError if the response contains GraphQL errors
 * @throws UserErrorsError if throwOnUserErrors is true and user errors are present
 */
export async function executeMutation<T>(
  client: Pick<GraphQLClient, 'request'>,
  mutation: string,
  variables?: Record<string, unknown>,
  options?: MutationOptions
): Promise<T> {
  const response = await client.request(mutation, { variables }) as GraphQLResponse<T>;

  if (response.errors && response.errors.length > 0) {
    throw new GraphQLQueryError(response.errors);
  }

  // Check for user errors if requested
  const throwOnUserErrors = options?.throwOnUserErrors ?? false;
  if (throwOnUserErrors) {
    const userErrors = extractUserErrors(response.data);
    if (userErrors.length > 0) {
      throw new UserErrorsError(userErrors);
    }
  }

  return response.data;
}
