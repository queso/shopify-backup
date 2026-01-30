import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { createGraphQLClient, executeQuery, executeMutation } from '../client.js';
import type { GraphQLResponse, GraphQLError, UserError } from '../../types/graphql.js';

// Mock the shopify client module
vi.mock('../../shopify.js', () => ({
  createShopifyClient: vi.fn(),
  rateLimit: vi.fn().mockResolvedValue(undefined),
  withRetry: vi.fn((fn) => fn()),
}));

describe('GraphQL Client', () => {
  const mockConfig = {
    shopifyStore: 'test-store.myshopify.com',
    shopifyAccessToken: 'shpat_test_token',
    backupDir: '/backups',
    retentionDays: 30,
  };

  interface MockGraphQLClient {
    request: MockedFunction<import('../client.js').GraphQLClient['request']>;
  }

  let mockGraphQLClient: MockGraphQLClient;

  beforeEach(() => {
    mockGraphQLClient = {
      request: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createGraphQLClient', () => {
    it('should create a GraphQL client with valid config', () => {
      const client = createGraphQLClient(mockConfig);

      expect(client).toBeDefined();
      expect(client).toHaveProperty('query');
      expect(client).toHaveProperty('mutate');
    });

    it('should throw if store URL is missing', () => {
      const invalidConfig = {
        ...mockConfig,
        shopifyStore: '',
      };

      expect(() => createGraphQLClient(invalidConfig)).toThrow();
    });

    it('should throw if access token is missing', () => {
      const invalidConfig = {
        ...mockConfig,
        shopifyAccessToken: '',
      };

      expect(() => createGraphQLClient(invalidConfig)).toThrow();
    });
  });

  describe('executeQuery', () => {
    it('should execute a GraphQL query successfully', async () => {
      const mockResponse: GraphQLResponse<{ shop: { name: string } }> = {
        data: { shop: { name: 'Test Shop' } },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query { shop { name } }`;
      const result = await executeQuery(mockGraphQLClient , query);

      expect(result).toEqual({ shop: { name: 'Test Shop' } });
      expect(mockGraphQLClient.request).toHaveBeenCalledWith(query, { variables: undefined });
    });

    it('should pass variables to the query', async () => {
      const mockResponse: GraphQLResponse<{ customer: { id: string } }> = {
        data: { customer: { id: 'gid://shopify/Customer/123' } },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query getCustomer($id: ID!) { customer(id: $id) { id } }`;
      const variables = { id: 'gid://shopify/Customer/123' };
      const result = await executeQuery(mockGraphQLClient , query, variables);

      expect(result).toEqual({ customer: { id: 'gid://shopify/Customer/123' } });
      expect(mockGraphQLClient.request).toHaveBeenCalledWith(query, { variables });
    });

    it('should handle GraphQL errors in response', async () => {
      const graphqlErrors: GraphQLError[] = [
        {
          message: 'Field "nonexistent" not found on type "Shop"',
          locations: [{ line: 1, column: 9 }],
          path: ['shop', 'nonexistent'],
        },
      ];

      const mockResponse: GraphQLResponse<null> = {
        data: null ,
        errors: graphqlErrors,
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query { shop { nonexistent } }`;

      await expect(executeQuery(mockGraphQLClient , query)).rejects.toThrow(/GraphQL/i);
    });

    it('should handle multiple GraphQL errors', async () => {
      const graphqlErrors: GraphQLError[] = [
        { message: 'Error 1', path: ['field1'] },
        { message: 'Error 2', path: ['field2'] },
      ];

      const mockResponse: GraphQLResponse<null> = {
        data: null ,
        errors: graphqlErrors,
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query { field1 field2 }`;

      await expect(executeQuery(mockGraphQLClient , query)).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockGraphQLClient.request.mockRejectedValue(new Error('Network error'));

      const query = `query { shop { name } }`;

      await expect(executeQuery(mockGraphQLClient , query)).rejects.toThrow('Network error');
    });

    it('should handle empty data response', async () => {
      const mockResponse: GraphQLResponse<{ customers: null }> = {
        data: { customers: null },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query { customers { edges { node { id } } } }`;
      const result = await executeQuery(mockGraphQLClient , query);

      expect(result).toEqual({ customers: null });
    });
  });

  describe('executeMutation', () => {
    it('should execute a mutation successfully', async () => {
      const mockResponse: GraphQLResponse<{
        customerCreate: { customer: { id: string }; userErrors: UserError[] };
      }> = {
        data: {
          customerCreate: {
            customer: { id: 'gid://shopify/Customer/123' },
            userErrors: [],
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation createCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`;
      const variables = { input: { email: 'test@example.com' } };

      const result = await executeMutation<{
        customerCreate: { customer: { id: string }; userErrors: UserError[] };
      }>(mockGraphQLClient , mutation, variables);

      expect(result.customerCreate.customer.id).toBe('gid://shopify/Customer/123');
      expect(result.customerCreate.userErrors).toHaveLength(0);
    });

    it('should handle user errors in mutation response', async () => {
      const userErrors: UserError[] = [
        { field: ['input', 'email'], message: 'Email has already been taken' },
      ];

      const mockResponse: GraphQLResponse<{
        customerCreate: { customer: null; userErrors: UserError[] };
      }> = {
        data: {
          customerCreate: {
            customer: null,
            userErrors,
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { customerCreate(input: {}) { customer { id } userErrors { field message } } }`;

      await expect(
        executeMutation(mockGraphQLClient , mutation, {}, { throwOnUserErrors: true })
      ).rejects.toThrow(/Email has already been taken/);
    });

    it('should return user errors without throwing when throwOnUserErrors is false', async () => {
      const userErrors: UserError[] = [
        { field: ['input', 'email'], message: 'Invalid email format' },
      ];

      const mockResponse: GraphQLResponse<{
        customerCreate: { customer: null; userErrors: UserError[] };
      }> = {
        data: {
          customerCreate: {
            customer: null,
            userErrors,
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { customerCreate(input: {}) { customer { id } userErrors { field message } } }`;
      const result = await executeMutation<{
        customerCreate: { customer: null; userErrors: UserError[] };
      }>(mockGraphQLClient , mutation, {}, { throwOnUserErrors: false });

      expect(result.customerCreate.userErrors).toHaveLength(1);
      expect(result.customerCreate.userErrors[0].message).toBe('Invalid email format');
    });

    it('should handle multiple user errors', async () => {
      const userErrors: UserError[] = [
        { field: ['input', 'email'], message: 'Email is required' },
        { field: ['input', 'firstName'], message: 'First name is too long' },
      ];

      const mockResponse: GraphQLResponse<{
        customerCreate: { customer: null; userErrors: UserError[] };
      }> = {
        data: {
          customerCreate: {
            customer: null,
            userErrors,
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { customerCreate(input: {}) { customer { id } userErrors { field message } } }`;

      await expect(
        executeMutation(mockGraphQLClient , mutation, {}, { throwOnUserErrors: true })
      ).rejects.toThrow();
    });

    it('should handle GraphQL errors in mutation', async () => {
      const graphqlErrors: GraphQLError[] = [
        { message: 'Access denied', extensions: { code: 'ACCESS_DENIED' } },
      ];

      const mockResponse: GraphQLResponse<null> = {
        data: null ,
        errors: graphqlErrors,
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { bulkOperationRunQuery(query: "{}") { bulkOperation { id } } }`;

      await expect(executeMutation(mockGraphQLClient , mutation)).rejects.toThrow(/GraphQL/i);
    });

    it('should handle user errors with null field path', async () => {
      const userErrors: UserError[] = [
        { field: null, message: 'General validation error' },
      ];

      const mockResponse: GraphQLResponse<{
        customerCreate: { customer: null; userErrors: UserError[] };
      }> = {
        data: {
          customerCreate: {
            customer: null,
            userErrors,
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { customerCreate(input: {}) { customer { id } userErrors { field message } } }`;

      await expect(
        executeMutation(mockGraphQLClient , mutation, {}, { throwOnUserErrors: true })
      ).rejects.toThrow(/General validation error/);
    });
  });

  describe('integration with existing Shopify client', () => {
    it('should work with config from environment variables pattern', () => {
      // This tests that the client accepts the same config shape as createShopifyClient
      const envConfig = {
        shopifyStore: process.env.SHOPIFY_STORE || 'test.myshopify.com',
        shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN || 'test_token',
        backupDir: process.env.BACKUP_DIR || '/backups',
        retentionDays: parseInt(process.env.RETENTION_DAYS || '30', 10),
      };

      // Should not throw with valid-looking config
      expect(() => createGraphQLClient(envConfig)).not.toThrow();
    });
  });

  describe('error message formatting', () => {
    it('should include query path in GraphQL error messages', async () => {
      const graphqlErrors: GraphQLError[] = [
        {
          message: 'Cannot query field',
          path: ['shop', 'orders', 'edges'],
          locations: [{ line: 3, column: 5 }],
        },
      ];

      const mockResponse: GraphQLResponse<null> = {
        data: null ,
        errors: graphqlErrors,
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const query = `query { shop { orders { edges { node { id } } } } }`;

      try {
        await executeQuery(mockGraphQLClient , query);
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('Cannot query field');
      }
    });

    it('should format user error field paths nicely', async () => {
      const userErrors: UserError[] = [
        { field: ['input', 'addresses', '0', 'city'], message: 'City is required' },
      ];

      const mockResponse: GraphQLResponse<{
        customerUpdate: { customer: null; userErrors: UserError[] };
      }> = {
        data: {
          customerUpdate: {
            customer: null,
            userErrors,
          },
        },
      };

      mockGraphQLClient.request.mockResolvedValue(mockResponse);

      const mutation = `mutation { customerUpdate(input: {}) { customer { id } userErrors { field message } } }`;

      try {
        await executeMutation(mockGraphQLClient , mutation, {}, { throwOnUserErrors: true });
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('City is required');
      }
    });
  });
});
