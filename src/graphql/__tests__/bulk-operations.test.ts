import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitBulkOperation, CUSTOMER_BULK_QUERY } from '../bulk-operations.js';
import { BulkOperationStatus } from '../../types/graphql.js';
import type { GraphQLResponse, BulkOperationRunQueryResponse, UserError, GraphQLError } from '../../types/graphql.js';

describe('submitBulkOperation', () => {
  let mockClient: {
    request: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockClient = {
      request: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful submission', () => {
    it('should submit a bulk operation and return the operation ID', async () => {
      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: {
              id: 'gid://shopify/BulkOperation/123456789',
              status: BulkOperationStatus.CREATED,
              errorCode: null,
              objectCount: '0',
              url: null,
              createdAt: '2024-01-15T10:00:00Z',
              completedAt: null,
              fileSize: null,
              query: '{ customers { edges { node { id } } } }',
              rootObjectCount: '0',
            },
            userErrors: [],
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ customers { edges { node { id email } } } }';
      const result = await submitBulkOperation(mockClient as any, query);

      expect(result).toBe('gid://shopify/BulkOperation/123456789');
      expect(mockClient.request).toHaveBeenCalledTimes(1);
    });

    it('should pass the query to the mutation', async () => {
      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: {
              id: 'gid://shopify/BulkOperation/987654321',
              status: BulkOperationStatus.CREATED,
              errorCode: null,
              objectCount: '0',
              url: null,
              createdAt: '2024-01-15T10:00:00Z',
              completedAt: null,
              fileSize: null,
              query: '{ products { edges { node { id } } } }',
              rootObjectCount: '0',
            },
            userErrors: [],
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ products { edges { node { id title } } } }';
      await submitBulkOperation(mockClient as any, query);

      // Verify the mutation was called with the query as a variable
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.stringContaining('bulkOperationRunQuery'),
        expect.objectContaining({
          variables: expect.objectContaining({ query }),
        })
      );
    });
  });

  describe('user errors', () => {
    it('should throw on user errors from the mutation', async () => {
      const userErrors: UserError[] = [
        {
          field: ['query'],
          message: 'A bulk operation is already in progress',
        },
      ];

      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors,
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ customers { edges { node { id } } } }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow(
        /bulk operation is already in progress/i
      );
    });

    it('should throw on multiple user errors', async () => {
      const userErrors: UserError[] = [
        { field: ['query'], message: 'Invalid query syntax' },
        { field: ['query'], message: 'Field not allowed in bulk operation' },
      ];

      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors,
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ invalidQuery }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow();
    });

    it('should throw on user errors with null field', async () => {
      const userErrors: UserError[] = [
        { field: null, message: 'Access denied for bulk operations' },
      ];

      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors,
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ customers { edges { node { id } } } }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow(
        /Access denied/i
      );
    });
  });

  describe('GraphQL errors', () => {
    it('should throw on GraphQL errors', async () => {
      const graphqlErrors: GraphQLError[] = [
        {
          message: 'Internal error. Please try again later.',
          locations: [{ line: 1, column: 1 }],
        },
      ];

      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: null as any,
        errors: graphqlErrors,
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ customers { edges { node { id } } } }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow(/GraphQL/i);
    });

    it('should throw on network errors', async () => {
      mockClient.request.mockRejectedValue(new Error('Network request failed'));

      const query = '{ customers { edges { node { id } } } }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow(
        /Network request failed/
      );
    });
  });

  describe('edge cases', () => {
    it('should throw when bulkOperation is null but no user errors', async () => {
      const mockResponse: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors: [],
          },
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const query = '{ customers { edges { node { id } } } }';

      await expect(submitBulkOperation(mockClient as any, query)).rejects.toThrow();
    });
  });
});

describe('CUSTOMER_BULK_QUERY', () => {
  it('should be defined as a constant', () => {
    expect(CUSTOMER_BULK_QUERY).toBeDefined();
    expect(typeof CUSTOMER_BULK_QUERY).toBe('string');
  });

  it('should contain the customers query', () => {
    expect(CUSTOMER_BULK_QUERY).toContain('customers');
  });

  it('should include essential customer fields', () => {
    expect(CUSTOMER_BULK_QUERY).toContain('id');
    expect(CUSTOMER_BULK_QUERY).toContain('email');
    expect(CUSTOMER_BULK_QUERY).toContain('firstName');
    expect(CUSTOMER_BULK_QUERY).toContain('lastName');
  });

  it('should include addresses', () => {
    expect(CUSTOMER_BULK_QUERY).toContain('addresses');
    expect(CUSTOMER_BULK_QUERY).toContain('city');
    expect(CUSTOMER_BULK_QUERY).toContain('province');
    expect(CUSTOMER_BULK_QUERY).toContain('country');
  });

  it('should include metafields', () => {
    expect(CUSTOMER_BULK_QUERY).toContain('metafields');
    expect(CUSTOMER_BULK_QUERY).toContain('namespace');
    expect(CUSTOMER_BULK_QUERY).toContain('key');
    expect(CUSTOMER_BULK_QUERY).toContain('value');
  });
});
