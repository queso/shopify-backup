import { describe, it, expect } from 'vitest';
import {
  BulkOperationStatus,
  BulkOperationErrorCode,
  type BulkOperation,
  type BulkOperationRunQueryResult,
  type UserError,
  type CustomerNode,
  type CustomerAddress,
  type GraphQLResponse,
  type GraphQLError,
  type BulkOperationRunQueryResponse,
  type CurrentBulkOperationResponse,
  type CurrentBulkOperationResult,
} from '../graphql.js';

describe('GraphQL Types', () => {
  describe('BulkOperationStatus enum', () => {
    it('should have CREATED status', () => {
      expect(BulkOperationStatus.CREATED).toBe('CREATED');
    });

    it('should have RUNNING status', () => {
      expect(BulkOperationStatus.RUNNING).toBe('RUNNING');
    });

    it('should have COMPLETED status', () => {
      expect(BulkOperationStatus.COMPLETED).toBe('COMPLETED');
    });

    it('should have FAILED status', () => {
      expect(BulkOperationStatus.FAILED).toBe('FAILED');
    });

    it('should have CANCELED status', () => {
      expect(BulkOperationStatus.CANCELED).toBe('CANCELED');
    });

    it('should have CANCELING status', () => {
      expect(BulkOperationStatus.CANCELING).toBe('CANCELING');
    });

    it('should have EXPIRED status', () => {
      expect(BulkOperationStatus.EXPIRED).toBe('EXPIRED');
    });
  });

  describe('BulkOperationErrorCode enum', () => {
    it('should have ACCESS_DENIED error code', () => {
      expect(BulkOperationErrorCode.ACCESS_DENIED).toBe('ACCESS_DENIED');
    });

    it('should have INTERNAL_SERVER_ERROR error code', () => {
      expect(BulkOperationErrorCode.INTERNAL_SERVER_ERROR).toBe('INTERNAL_SERVER_ERROR');
    });

    it('should have TIMEOUT error code', () => {
      expect(BulkOperationErrorCode.TIMEOUT).toBe('TIMEOUT');
    });
  });

  describe('BulkOperation interface', () => {
    it('should accept a valid completed bulk operation', () => {
      const operation: BulkOperation = {
        id: 'gid://shopify/BulkOperation/123456',
        status: BulkOperationStatus.COMPLETED,
        errorCode: null,
        objectCount: '1500',
        url: 'https://storage.shopify.com/exports/file.jsonl',
        createdAt: '2026-01-28T10:00:00Z',
        completedAt: '2026-01-28T10:05:00Z',
        fileSize: '2048000',
        query: 'query { customers { edges { node { id } } } }',
        rootObjectCount: '1500',
      };

      expect(operation.id).toBe('gid://shopify/BulkOperation/123456');
      expect(operation.status).toBe(BulkOperationStatus.COMPLETED);
      expect(operation.url).not.toBeNull();
    });

    it('should accept a running bulk operation with null optional fields', () => {
      const operation: BulkOperation = {
        id: 'gid://shopify/BulkOperation/789',
        status: BulkOperationStatus.RUNNING,
        errorCode: null,
        objectCount: '0',
        url: null,
        createdAt: '2026-01-28T10:00:00Z',
        completedAt: null,
        fileSize: null,
        query: 'query { customers { edges { node { id } } } }',
        rootObjectCount: '0',
      };

      expect(operation.status).toBe(BulkOperationStatus.RUNNING);
      expect(operation.url).toBeNull();
      expect(operation.completedAt).toBeNull();
    });

    it('should accept a failed bulk operation with error code', () => {
      const operation: BulkOperation = {
        id: 'gid://shopify/BulkOperation/999',
        status: BulkOperationStatus.FAILED,
        errorCode: BulkOperationErrorCode.TIMEOUT,
        objectCount: '500',
        url: null,
        createdAt: '2026-01-28T10:00:00Z',
        completedAt: '2026-01-28T10:10:00Z',
        fileSize: null,
        query: 'query { customers { edges { node { id } } } }',
        rootObjectCount: '500',
      };

      expect(operation.status).toBe(BulkOperationStatus.FAILED);
      expect(operation.errorCode).toBe(BulkOperationErrorCode.TIMEOUT);
    });
  });

  describe('UserError interface', () => {
    it('should accept a user error with field path', () => {
      const error: UserError = {
        field: ['input', 'query'],
        message: 'Query is invalid',
      };

      expect(error.field).toEqual(['input', 'query']);
      expect(error.message).toBe('Query is invalid');
    });

    it('should accept a user error with null field', () => {
      const error: UserError = {
        field: null,
        message: 'General error occurred',
      };

      expect(error.field).toBeNull();
      expect(error.message).toBe('General error occurred');
    });
  });

  describe('BulkOperationRunQueryResult interface', () => {
    it('should accept a successful result with bulk operation', () => {
      const result: BulkOperationRunQueryResult = {
        bulkOperation: {
          id: 'gid://shopify/BulkOperation/123',
          status: BulkOperationStatus.CREATED,
          errorCode: null,
          objectCount: '0',
          url: null,
          createdAt: '2026-01-28T10:00:00Z',
          completedAt: null,
          fileSize: null,
          query: 'query { customers { edges { node { id } } } }',
          rootObjectCount: '0',
        },
        userErrors: [],
      };

      expect(result.bulkOperation).not.toBeNull();
      expect(result.userErrors).toHaveLength(0);
    });

    it('should accept a failed result with user errors', () => {
      const result: BulkOperationRunQueryResult = {
        bulkOperation: null,
        userErrors: [
          { field: ['input'], message: 'Another operation is in progress' },
        ],
      };

      expect(result.bulkOperation).toBeNull();
      expect(result.userErrors).toHaveLength(1);
      expect(result.userErrors[0].message).toBe('Another operation is in progress');
    });
  });

  describe('CustomerAddress interface', () => {
    it('should accept a complete customer address', () => {
      const address: CustomerAddress = {
        address1: '123 Main St',
        address2: 'Apt 4',
        city: 'New York',
        country: 'United States',
        countryCodeV2: 'US',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1-555-123-4567',
        province: 'New York',
        provinceCode: 'NY',
        zip: '10001',
      };

      expect(address.city).toBe('New York');
      expect(address.countryCodeV2).toBe('US');
    });

    it('should accept a minimal address with null fields', () => {
      const address: CustomerAddress = {
        address1: null,
        address2: null,
        city: null,
        country: null,
        countryCodeV2: null,
        firstName: null,
        lastName: null,
        phone: null,
        province: null,
        provinceCode: null,
        zip: null,
      };

      expect(address.address1).toBeNull();
    });
  });

  describe('CustomerNode interface', () => {
    it('should accept a complete customer node', () => {
      const customer: CustomerNode = {
        id: 'gid://shopify/Customer/123456',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '+1-555-987-6543',
        createdAt: '2025-06-15T08:30:00Z',
        updatedAt: '2026-01-20T14:00:00Z',
        tags: ['vip', 'wholesale'],
        acceptsMarketing: true,
        taxExempt: false,
        defaultAddress: {
          address1: '456 Oak Ave',
          address2: null,
          city: 'Los Angeles',
          country: 'United States',
          countryCodeV2: 'US',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+1-555-987-6543',
          province: 'California',
          provinceCode: 'CA',
          zip: '90001',
        },
        note: 'Preferred customer',
        verifiedEmail: true,
        state: 'ENABLED',
        totalSpent: '5000.00',
        ordersCount: '25',
      };

      expect(customer.id).toBe('gid://shopify/Customer/123456');
      expect(customer.tags).toContain('vip');
      expect(customer.state).toBe('ENABLED');
    });

    it('should accept a minimal customer node with null optional fields', () => {
      const customer: CustomerNode = {
        id: 'gid://shopify/Customer/789',
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        tags: [],
        acceptsMarketing: false,
        taxExempt: false,
        defaultAddress: null,
        note: null,
        verifiedEmail: false,
        state: 'DISABLED',
        totalSpent: '0.00',
        ordersCount: '0',
      };

      expect(customer.firstName).toBeNull();
      expect(customer.defaultAddress).toBeNull();
      expect(customer.tags).toHaveLength(0);
    });

    it('should accept all valid customer states', () => {
      const states: CustomerNode['state'][] = ['DECLINED', 'DISABLED', 'ENABLED', 'INVITED'];

      states.forEach((state) => {
        const customer: CustomerNode = {
          id: 'gid://shopify/Customer/1',
          firstName: null,
          lastName: null,
          email: null,
          phone: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          tags: [],
          acceptsMarketing: false,
          taxExempt: false,
          defaultAddress: null,
          note: null,
          verifiedEmail: false,
          state: state,
          totalSpent: '0.00',
          ordersCount: '0',
        };

        expect(customer.state).toBe(state);
      });
    });
  });

  describe('GraphQLError interface', () => {
    it('should accept a complete GraphQL error', () => {
      const error: GraphQLError = {
        message: 'Field not found',
        locations: [{ line: 5, column: 10 }],
        path: ['customers', 'edges', '0', 'node'],
        extensions: { code: 'FIELD_NOT_FOUND' },
      };

      expect(error.message).toBe('Field not found');
      expect(error.locations).toHaveLength(1);
    });

    it('should accept a minimal GraphQL error', () => {
      const error: GraphQLError = {
        message: 'Unknown error',
      };

      expect(error.message).toBe('Unknown error');
      expect(error.locations).toBeUndefined();
    });
  });

  describe('GraphQLResponse wrapper', () => {
    it('should wrap a successful response', () => {
      const response: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: {
              id: 'gid://shopify/BulkOperation/123',
              status: BulkOperationStatus.CREATED,
              errorCode: null,
              objectCount: '0',
              url: null,
              createdAt: '2026-01-28T10:00:00Z',
              completedAt: null,
              fileSize: null,
              query: 'query { customers { edges { node { id } } } }',
              rootObjectCount: '0',
            },
            userErrors: [],
          },
        },
      };

      expect(response.data.bulkOperationRunQuery.bulkOperation).not.toBeNull();
      expect(response.errors).toBeUndefined();
    });

    it('should wrap a response with errors', () => {
      const response: GraphQLResponse<BulkOperationRunQueryResponse> = {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: null,
            userErrors: [],
          },
        },
        errors: [{ message: 'Rate limit exceeded' }],
      };

      expect(response.errors).toHaveLength(1);
      expect(response.errors![0].message).toBe('Rate limit exceeded');
    });
  });

  describe('CurrentBulkOperationResult interface', () => {
    it('should accept a result with active operation', () => {
      const result: CurrentBulkOperationResult = {
        currentBulkOperation: {
          id: 'gid://shopify/BulkOperation/456',
          status: BulkOperationStatus.RUNNING,
          errorCode: null,
          objectCount: '100',
          url: null,
          createdAt: '2026-01-28T10:00:00Z',
          completedAt: null,
          fileSize: null,
          query: 'query { customers { edges { node { id } } } }',
          rootObjectCount: '100',
        },
      };

      expect(result.currentBulkOperation).not.toBeNull();
      expect(result.currentBulkOperation!.status).toBe(BulkOperationStatus.RUNNING);
    });

    it('should accept a result with no active operation', () => {
      const result: CurrentBulkOperationResult = {
        currentBulkOperation: null,
      };

      expect(result.currentBulkOperation).toBeNull();
    });
  });

  describe('CurrentBulkOperationResponse wrapper', () => {
    it('should wrap the current bulk operation response', () => {
      const response: CurrentBulkOperationResponse = {
        currentBulkOperation: {
          id: 'gid://shopify/BulkOperation/789',
          status: BulkOperationStatus.COMPLETED,
          errorCode: null,
          objectCount: '2000',
          url: 'https://storage.shopify.com/exports/file.jsonl',
          createdAt: '2026-01-28T09:00:00Z',
          completedAt: '2026-01-28T09:30:00Z',
          fileSize: '5000000',
          query: 'query { customers { edges { node { id } } } }',
          rootObjectCount: '2000',
        },
      };

      expect(response.currentBulkOperation).not.toBeNull();
    });
  });
});
