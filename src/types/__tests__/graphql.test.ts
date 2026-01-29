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
  type Metafield,
  type MoneyV2,
  type MoneyBag,
  type OrderAddress,
  type OrderCustomer,
  type OrderLineItem,
  type OrderShippingLine,
  type OrderTransaction,
  type OrderFulfillment,
  type OrderRefund,
  type OrderDiscountApplication,
  type BulkOrderNode,
  type ProductOption,
  type ProductImage,
  type ProductSeo,
  type ProductPriceRange,
  type ProductVariant,
  type BulkProductNode,
  type CollectionImage,
  type CollectionSeo,
  type CollectionRule,
  type CollectionRuleSet,
  type CollectionProductReference,
  type BulkCollectionNode,
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

  // ============================================================
  // NEW TESTS: Generic Metafield and Bulk Operation Node Types
  // ============================================================

  describe('Metafield interface', () => {
    it('should accept a complete metafield', () => {
      const metafield: Metafield = {
        namespace: 'custom',
        key: 'loyalty_points',
        value: '150',
        type: 'number_integer',
      };

      expect(metafield.namespace).toBe('custom');
      expect(metafield.key).toBe('loyalty_points');
      expect(metafield.value).toBe('150');
      expect(metafield.type).toBe('number_integer');
    });

    it('should accept a JSON metafield', () => {
      const metafield: Metafield = {
        namespace: 'app_data',
        key: 'config',
        value: '{"enabled":true,"threshold":50}',
        type: 'json',
      };

      expect(metafield.type).toBe('json');
      expect(JSON.parse(metafield.value)).toEqual({ enabled: true, threshold: 50 });
    });

    it('should accept common metafield types', () => {
      const types = ['single_line_text_field', 'multi_line_text_field', 'number_integer', 'number_decimal', 'json', 'boolean', 'date', 'date_time', 'url', 'color', 'weight', 'volume', 'dimension'];

      types.forEach((type) => {
        const metafield: Metafield = {
          namespace: 'test',
          key: 'field',
          value: 'test_value',
          type,
        };
        expect(metafield.type).toBe(type);
      });
    });
  });

  describe('MoneyV2 interface', () => {
    it('should accept amount and currency code', () => {
      const money: MoneyV2 = {
        amount: '99.99',
        currencyCode: 'USD',
      };

      expect(money.amount).toBe('99.99');
      expect(money.currencyCode).toBe('USD');
    });

    it('should accept different currency codes', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

      currencies.forEach((currency) => {
        const money: MoneyV2 = {
          amount: '100.00',
          currencyCode: currency,
        };
        expect(money.currencyCode).toBe(currency);
      });
    });
  });

  describe('MoneyBag interface', () => {
    it('should contain shopMoney', () => {
      const moneyBag: MoneyBag = {
        shopMoney: {
          amount: '150.00',
          currencyCode: 'USD',
        },
      };

      expect(moneyBag.shopMoney.amount).toBe('150.00');
      expect(moneyBag.shopMoney.currencyCode).toBe('USD');
    });
  });

  // ============================================================
  // BulkOrderNode and Related Types
  // ============================================================

  describe('OrderAddress interface', () => {
    it('should accept a complete order address', () => {
      const address: OrderAddress = {
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        address1: '123 Main St',
        address2: 'Suite 100',
        city: 'New York',
        province: 'New York',
        provinceCode: 'NY',
        country: 'United States',
        countryCodeV2: 'US',
        zip: '10001',
        phone: '+1-555-123-4567',
      };

      expect(address.firstName).toBe('John');
      expect(address.countryCodeV2).toBe('US');
    });

    it('should accept an address with null optional fields', () => {
      const address: OrderAddress = {
        firstName: null,
        lastName: null,
        company: null,
        address1: '123 Main St',
        address2: null,
        city: 'New York',
        province: null,
        provinceCode: null,
        country: 'United States',
        countryCodeV2: 'US',
        zip: '10001',
        phone: null,
      };

      expect(address.company).toBeNull();
      expect(address.address1).toBe('123 Main St');
    });
  });

  describe('OrderCustomer interface', () => {
    it('should accept a complete order customer reference', () => {
      const customer: OrderCustomer = {
        id: 'gid://shopify/Customer/123456',
        email: 'customer@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      expect(customer.id).toBe('gid://shopify/Customer/123456');
      expect(customer.email).toBe('customer@example.com');
    });

    it('should accept a customer with null optional fields', () => {
      const customer: OrderCustomer = {
        id: 'gid://shopify/Customer/789',
        email: null,
        firstName: null,
        lastName: null,
      };

      expect(customer.id).toBeDefined();
      expect(customer.email).toBeNull();
    });
  });

  describe('OrderLineItem interface', () => {
    it('should accept a complete line item', () => {
      const lineItem: OrderLineItem = {
        id: 'gid://shopify/LineItem/111',
        title: 'Widget Pro',
        variantTitle: 'Large / Blue',
        quantity: 2,
        sku: 'WIDGET-PRO-LG-BLU',
        vendor: 'Acme Widgets',
        requiresShipping: true,
        taxable: true,
        originalUnitPriceSet: { shopMoney: { amount: '29.99', currencyCode: 'USD' } },
        discountedUnitPriceSet: { shopMoney: { amount: '24.99', currencyCode: 'USD' } },
        originalTotalSet: { shopMoney: { amount: '59.98', currencyCode: 'USD' } },
        discountedTotalSet: { shopMoney: { amount: '49.98', currencyCode: 'USD' } },
        variant: {
          id: 'gid://shopify/ProductVariant/222',
          legacyResourceId: '222',
        },
        product: {
          id: 'gid://shopify/Product/333',
          legacyResourceId: '333',
        },
      };

      expect(lineItem.title).toBe('Widget Pro');
      expect(lineItem.quantity).toBe(2);
      expect(lineItem.originalUnitPriceSet.shopMoney.amount).toBe('29.99');
    });

    it('should accept a line item with null optional fields', () => {
      const lineItem: OrderLineItem = {
        id: 'gid://shopify/LineItem/444',
        title: 'Basic Item',
        variantTitle: null,
        quantity: 1,
        sku: null,
        vendor: null,
        requiresShipping: false,
        taxable: false,
        originalUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
        discountedUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
        originalTotalSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
        discountedTotalSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
        variant: null,
        product: null,
      };

      expect(lineItem.sku).toBeNull();
      expect(lineItem.variant).toBeNull();
    });
  });

  describe('OrderShippingLine interface', () => {
    it('should accept a complete shipping line', () => {
      const shippingLine: OrderShippingLine = {
        title: 'Standard Shipping',
        code: 'STANDARD',
        source: 'shopify',
        originalPriceSet: { shopMoney: { amount: '9.99', currencyCode: 'USD' } },
        discountedPriceSet: { shopMoney: { amount: '4.99', currencyCode: 'USD' } },
      };

      expect(shippingLine.title).toBe('Standard Shipping');
      expect(shippingLine.originalPriceSet.shopMoney.amount).toBe('9.99');
    });

    it('should accept a shipping line with null optional fields', () => {
      const shippingLine: OrderShippingLine = {
        title: 'Free Shipping',
        code: null,
        source: null,
        originalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        discountedPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
      };

      expect(shippingLine.code).toBeNull();
    });
  });

  describe('OrderTransaction interface', () => {
    it('should accept a complete transaction', () => {
      const transaction: OrderTransaction = {
        id: 'gid://shopify/OrderTransaction/555',
        kind: 'SALE',
        status: 'SUCCESS',
        gateway: 'stripe',
        amountSet: { shopMoney: { amount: '99.99', currencyCode: 'USD' } },
        createdAt: '2026-01-28T10:00:00Z',
        processedAt: '2026-01-28T10:00:05Z',
      };

      expect(transaction.kind).toBe('SALE');
      expect(transaction.status).toBe('SUCCESS');
    });

    it('should accept different transaction kinds', () => {
      const kinds = ['SALE', 'CAPTURE', 'AUTHORIZATION', 'VOID', 'REFUND', 'CHANGE'];

      kinds.forEach((kind) => {
        const transaction: OrderTransaction = {
          id: 'gid://shopify/OrderTransaction/1',
          kind,
          status: 'SUCCESS',
          gateway: 'manual',
          amountSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
          createdAt: '2026-01-28T10:00:00Z',
          processedAt: null,
        };
        expect(transaction.kind).toBe(kind);
      });
    });
  });

  describe('OrderFulfillment interface', () => {
    it('should accept a complete fulfillment', () => {
      const fulfillment: OrderFulfillment = {
        id: 'gid://shopify/Fulfillment/666',
        status: 'SUCCESS',
        createdAt: '2026-01-28T12:00:00Z',
        updatedAt: '2026-01-29T08:00:00Z',
        trackingInfo: [
          {
            company: 'UPS',
            number: '1Z999AA10123456784',
            url: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
          },
        ],
      };

      expect(fulfillment.status).toBe('SUCCESS');
      expect(fulfillment.trackingInfo).toHaveLength(1);
      expect(fulfillment.trackingInfo[0].company).toBe('UPS');
    });

    it('should accept a fulfillment with empty tracking', () => {
      const fulfillment: OrderFulfillment = {
        id: 'gid://shopify/Fulfillment/777',
        status: 'PENDING',
        createdAt: '2026-01-28T12:00:00Z',
        updatedAt: '2026-01-28T12:00:00Z',
        trackingInfo: [],
      };

      expect(fulfillment.trackingInfo).toHaveLength(0);
    });
  });

  describe('OrderRefund interface', () => {
    it('should accept a complete refund', () => {
      const refund: OrderRefund = {
        id: 'gid://shopify/Refund/888',
        createdAt: '2026-01-29T10:00:00Z',
        note: 'Customer requested refund',
        totalRefundedSet: { shopMoney: { amount: '25.00', currencyCode: 'USD' } },
      };

      expect(refund.note).toBe('Customer requested refund');
      expect(refund.totalRefundedSet.shopMoney.amount).toBe('25.00');
    });

    it('should accept a refund with null note', () => {
      const refund: OrderRefund = {
        id: 'gid://shopify/Refund/999',
        createdAt: '2026-01-29T11:00:00Z',
        note: null,
        totalRefundedSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
      };

      expect(refund.note).toBeNull();
    });
  });

  describe('OrderDiscountApplication interface', () => {
    it('should accept a percentage discount', () => {
      const discount: OrderDiscountApplication = {
        allocationMethod: 'ACROSS',
        targetSelection: 'ALL',
        targetType: 'LINE_ITEM',
        value: {
          percentage: 10,
        },
      };

      expect(discount.value.percentage).toBe(10);
      expect(discount.value.amount).toBeUndefined();
    });

    it('should accept a fixed amount discount', () => {
      const discount: OrderDiscountApplication = {
        allocationMethod: 'ONE',
        targetSelection: 'EXPLICIT',
        targetType: 'LINE_ITEM',
        value: {
          amount: '5.00',
          currencyCode: 'USD',
        },
      };

      expect(discount.value.amount).toBe('5.00');
      expect(discount.value.currencyCode).toBe('USD');
    });

    it('should accept a shipping discount', () => {
      const discount: OrderDiscountApplication = {
        allocationMethod: 'EACH',
        targetSelection: 'ALL',
        targetType: 'SHIPPING_LINE',
        value: {
          percentage: 100,
        },
      };

      expect(discount.targetType).toBe('SHIPPING_LINE');
    });
  });

  describe('BulkOrderNode interface', () => {
    it('should accept a complete order with all fields', () => {
      const order: BulkOrderNode = {
        id: 'gid://shopify/Order/123456',
        legacyResourceId: '123456',
        name: '#1001',
        email: 'customer@example.com',
        phone: '+1-555-123-4567',
        createdAt: '2026-01-28T10:00:00Z',
        updatedAt: '2026-01-28T10:05:00Z',
        processedAt: '2026-01-28T10:00:05Z',
        closedAt: null,
        cancelledAt: null,
        cancelReason: null,
        displayFinancialStatus: 'PAID',
        displayFulfillmentStatus: 'FULFILLED',
        confirmed: true,
        test: false,
        taxesIncluded: false,
        currencyCode: 'USD',
        presentmentCurrencyCode: 'USD',
        subtotalPriceSet: { shopMoney: { amount: '89.97', currencyCode: 'USD' } },
        totalPriceSet: { shopMoney: { amount: '99.96', currencyCode: 'USD' } },
        totalTaxSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalDiscountsSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
        totalShippingPriceSet: { shopMoney: { amount: '9.99', currencyCode: 'USD' } },
        totalRefundedSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        currentTotalPriceSet: { shopMoney: { amount: '99.96', currencyCode: 'USD' } },
        note: 'Please ship quickly',
        tags: ['priority', 'wholesale'],
        customer: {
          id: 'gid://shopify/Customer/789',
          email: 'customer@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
        },
        billingAddress: {
          firstName: 'Jane',
          lastName: 'Doe',
          company: null,
          address1: '123 Billing St',
          address2: null,
          city: 'New York',
          province: 'New York',
          provinceCode: 'NY',
          country: 'United States',
          countryCodeV2: 'US',
          zip: '10001',
          phone: '+1-555-123-4567',
        },
        shippingAddress: {
          firstName: 'Jane',
          lastName: 'Doe',
          company: 'Acme Corp',
          address1: '456 Shipping Ave',
          address2: 'Floor 2',
          city: 'Los Angeles',
          province: 'California',
          provinceCode: 'CA',
          country: 'United States',
          countryCodeV2: 'US',
          zip: '90001',
          phone: '+1-555-987-6543',
        },
        lineItems: [
          {
            id: 'gid://shopify/LineItem/1',
            title: 'Product A',
            variantTitle: 'Medium',
            quantity: 2,
            sku: 'SKU-A-M',
            vendor: 'Vendor A',
            requiresShipping: true,
            taxable: true,
            originalUnitPriceSet: { shopMoney: { amount: '29.99', currencyCode: 'USD' } },
            discountedUnitPriceSet: { shopMoney: { amount: '24.99', currencyCode: 'USD' } },
            originalTotalSet: { shopMoney: { amount: '59.98', currencyCode: 'USD' } },
            discountedTotalSet: { shopMoney: { amount: '49.98', currencyCode: 'USD' } },
            variant: { id: 'gid://shopify/ProductVariant/100', legacyResourceId: '100' },
            product: { id: 'gid://shopify/Product/200', legacyResourceId: '200' },
          },
        ],
        shippingLines: [
          {
            title: 'Standard Shipping',
            code: 'STANDARD',
            source: 'shopify',
            originalPriceSet: { shopMoney: { amount: '9.99', currencyCode: 'USD' } },
            discountedPriceSet: { shopMoney: { amount: '9.99', currencyCode: 'USD' } },
          },
        ],
        transactions: [
          {
            id: 'gid://shopify/OrderTransaction/1',
            kind: 'SALE',
            status: 'SUCCESS',
            gateway: 'stripe',
            amountSet: { shopMoney: { amount: '99.96', currencyCode: 'USD' } },
            createdAt: '2026-01-28T10:00:10Z',
            processedAt: '2026-01-28T10:00:15Z',
          },
        ],
        fulfillments: [
          {
            id: 'gid://shopify/Fulfillment/1',
            status: 'SUCCESS',
            createdAt: '2026-01-28T14:00:00Z',
            updatedAt: '2026-01-29T08:00:00Z',
            trackingInfo: [{ company: 'USPS', number: '9400111899223456789012', url: null }],
          },
        ],
        refunds: [],
        discountApplications: [
          {
            allocationMethod: 'ACROSS',
            targetSelection: 'ALL',
            targetType: 'LINE_ITEM',
            value: { percentage: 10 },
          },
        ],
        metafields: [
          { namespace: 'custom', key: 'order_source', value: 'mobile_app', type: 'single_line_text_field' },
        ],
      };

      expect(order.id).toBe('gid://shopify/Order/123456');
      expect(order.name).toBe('#1001');
      expect(order.displayFinancialStatus).toBe('PAID');
      expect(order.lineItems).toHaveLength(1);
      expect(order.transactions).toHaveLength(1);
      expect(order.fulfillments).toHaveLength(1);
      expect(order.metafields).toHaveLength(1);
    });

    it('should accept a minimal order with null optional fields', () => {
      const order: BulkOrderNode = {
        id: 'gid://shopify/Order/999',
        legacyResourceId: '999',
        name: '#1002',
        email: null,
        phone: null,
        createdAt: '2026-01-29T00:00:00Z',
        updatedAt: '2026-01-29T00:00:00Z',
        processedAt: null,
        closedAt: null,
        cancelledAt: null,
        cancelReason: null,
        displayFinancialStatus: 'PENDING',
        displayFulfillmentStatus: 'UNFULFILLED',
        confirmed: false,
        test: true,
        taxesIncluded: false,
        currencyCode: 'USD',
        presentmentCurrencyCode: 'USD',
        subtotalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalTaxSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalDiscountsSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalShippingPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalRefundedSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        currentTotalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        note: null,
        tags: [],
        customer: null,
        billingAddress: null,
        shippingAddress: null,
        lineItems: [],
        shippingLines: [],
        transactions: [],
        fulfillments: [],
        refunds: [],
        discountApplications: [],
        metafields: [],
      };

      expect(order.email).toBeNull();
      expect(order.customer).toBeNull();
      expect(order.lineItems).toHaveLength(0);
    });

    it('should accept all valid financial statuses', () => {
      const statuses = ['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'];

      statuses.forEach((status) => {
        const order: BulkOrderNode = {
          id: 'gid://shopify/Order/1',
          legacyResourceId: '1',
          name: '#1',
          email: null,
          phone: null,
          createdAt: '2026-01-29T00:00:00Z',
          updatedAt: '2026-01-29T00:00:00Z',
          processedAt: null,
          closedAt: null,
          cancelledAt: null,
          cancelReason: null,
          displayFinancialStatus: status,
          displayFulfillmentStatus: 'UNFULFILLED',
          confirmed: true,
          test: false,
          taxesIncluded: false,
          currencyCode: 'USD',
          presentmentCurrencyCode: 'USD',
          subtotalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          totalTaxSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          totalDiscountsSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          totalShippingPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          totalRefundedSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          currentTotalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
          note: null,
          tags: [],
          customer: null,
          billingAddress: null,
          shippingAddress: null,
          lineItems: [],
          shippingLines: [],
          transactions: [],
          fulfillments: [],
          refunds: [],
          discountApplications: [],
          metafields: [],
        };
        expect(order.displayFinancialStatus).toBe(status);
      });
    });

    it('should accept a cancelled order', () => {
      const order: BulkOrderNode = {
        id: 'gid://shopify/Order/cancelled',
        legacyResourceId: 'cancelled',
        name: '#1003',
        email: 'cancelled@example.com',
        phone: null,
        createdAt: '2026-01-28T10:00:00Z',
        updatedAt: '2026-01-29T12:00:00Z',
        processedAt: '2026-01-28T10:00:00Z',
        closedAt: '2026-01-29T12:00:00Z',
        cancelledAt: '2026-01-29T12:00:00Z',
        cancelReason: 'CUSTOMER',
        displayFinancialStatus: 'REFUNDED',
        displayFulfillmentStatus: 'UNFULFILLED',
        confirmed: true,
        test: false,
        taxesIncluded: false,
        currencyCode: 'USD',
        presentmentCurrencyCode: 'USD',
        subtotalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
        totalPriceSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
        totalTaxSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalDiscountsSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalShippingPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        totalRefundedSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
        currentTotalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'USD' } },
        note: 'Cancelled by customer request',
        tags: [],
        customer: null,
        billingAddress: null,
        shippingAddress: null,
        lineItems: [],
        shippingLines: [],
        transactions: [],
        fulfillments: [],
        refunds: [
          {
            id: 'gid://shopify/Refund/1',
            createdAt: '2026-01-29T12:00:00Z',
            note: 'Full refund',
            totalRefundedSet: { shopMoney: { amount: '50.00', currencyCode: 'USD' } },
          },
        ],
        discountApplications: [],
        metafields: [],
      };

      expect(order.cancelledAt).toBe('2026-01-29T12:00:00Z');
      expect(order.cancelReason).toBe('CUSTOMER');
      expect(order.refunds).toHaveLength(1);
    });
  });

  // ============================================================
  // BulkProductNode and Related Types
  // ============================================================

  describe('ProductOption interface', () => {
    it('should accept a complete product option', () => {
      const option: ProductOption = {
        id: 'gid://shopify/ProductOption/1',
        name: 'Size',
        position: 1,
        values: ['Small', 'Medium', 'Large', 'X-Large'],
      };

      expect(option.name).toBe('Size');
      expect(option.values).toContain('Medium');
    });

    it('should accept a color option', () => {
      const option: ProductOption = {
        id: 'gid://shopify/ProductOption/2',
        name: 'Color',
        position: 2,
        values: ['Red', 'Blue', 'Green'],
      };

      expect(option.position).toBe(2);
      expect(option.values).toHaveLength(3);
    });
  });

  describe('ProductImage interface', () => {
    it('should accept a complete product image', () => {
      const image: ProductImage = {
        id: 'gid://shopify/ProductImage/1',
        url: 'https://cdn.shopify.com/s/files/1/0000/0001/products/image.jpg',
        altText: 'Product front view',
        width: 1024,
        height: 768,
      };

      expect(image.url).toContain('cdn.shopify.com');
      expect(image.altText).toBe('Product front view');
      expect(image.width).toBe(1024);
    });

    it('should accept an image with null optional fields', () => {
      const image: ProductImage = {
        id: 'gid://shopify/ProductImage/2',
        url: 'https://cdn.shopify.com/s/files/1/0000/0001/products/image2.jpg',
        altText: null,
        width: null,
        height: null,
      };

      expect(image.altText).toBeNull();
      expect(image.width).toBeNull();
    });
  });

  describe('ProductSeo interface', () => {
    it('should accept complete SEO data', () => {
      const seo: ProductSeo = {
        title: 'Amazing Widget - Best Price Guaranteed',
        description: 'Shop our amazing widgets with free shipping.',
      };

      expect(seo.title).toContain('Widget');
      expect(seo.description).toBeDefined();
    });

    it('should accept SEO with null fields', () => {
      const seo: ProductSeo = {
        title: null,
        description: null,
      };

      expect(seo.title).toBeNull();
      expect(seo.description).toBeNull();
    });
  });

  describe('ProductPriceRange interface', () => {
    it('should accept a price range', () => {
      const priceRange: ProductPriceRange = {
        minVariantPrice: { amount: '9.99', currencyCode: 'USD' },
        maxVariantPrice: { amount: '49.99', currencyCode: 'USD' },
      };

      expect(priceRange.minVariantPrice.amount).toBe('9.99');
      expect(priceRange.maxVariantPrice.amount).toBe('49.99');
    });

    it('should accept same min and max for single variant', () => {
      const priceRange: ProductPriceRange = {
        minVariantPrice: { amount: '29.99', currencyCode: 'USD' },
        maxVariantPrice: { amount: '29.99', currencyCode: 'USD' },
      };

      expect(priceRange.minVariantPrice.amount).toBe(priceRange.maxVariantPrice.amount);
    });
  });

  describe('ProductVariant interface', () => {
    it('should accept a complete product variant', () => {
      const variant: ProductVariant = {
        id: 'gid://shopify/ProductVariant/123',
        legacyResourceId: '123',
        title: 'Medium / Blue',
        displayName: 'Widget Pro - Medium / Blue',
        sku: 'WIDGET-M-BLU',
        barcode: '123456789012',
        position: 1,
        price: '29.99',
        compareAtPrice: '39.99',
        taxable: true,
        taxCode: 'P0000000',
        availableForSale: true,
        requiresShipping: true,
        weight: 1.5,
        weightUnit: 'POUNDS',
        inventoryQuantity: 100,
        selectedOptions: [
          { name: 'Size', value: 'Medium' },
          { name: 'Color', value: 'Blue' },
        ],
        image: {
          id: 'gid://shopify/ProductImage/456',
          url: 'https://cdn.shopify.com/variant-image.jpg',
        },
        inventoryItem: {
          id: 'gid://shopify/InventoryItem/789',
          tracked: true,
          sku: 'WIDGET-M-BLU',
          requiresShipping: true,
        },
        metafields: [
          { namespace: 'custom', key: 'material', value: 'cotton', type: 'single_line_text_field' },
        ],
      };

      expect(variant.title).toBe('Medium / Blue');
      expect(variant.price).toBe('29.99');
      expect(variant.selectedOptions).toHaveLength(2);
      expect(variant.metafields).toHaveLength(1);
    });

    it('should accept a variant with null optional fields', () => {
      const variant: ProductVariant = {
        id: 'gid://shopify/ProductVariant/999',
        legacyResourceId: '999',
        title: 'Default Title',
        displayName: 'Simple Product - Default Title',
        sku: null,
        barcode: null,
        position: 1,
        price: '10.00',
        compareAtPrice: null,
        taxable: true,
        taxCode: null,
        availableForSale: true,
        requiresShipping: false,
        weight: null,
        weightUnit: 'POUNDS',
        inventoryQuantity: null,
        selectedOptions: [],
        image: null,
        inventoryItem: null,
        metafields: [],
      };

      expect(variant.sku).toBeNull();
      expect(variant.compareAtPrice).toBeNull();
      expect(variant.selectedOptions).toHaveLength(0);
    });
  });

  describe('BulkProductNode interface', () => {
    it('should accept a complete product with all fields', () => {
      const product: BulkProductNode = {
        id: 'gid://shopify/Product/123456',
        legacyResourceId: '123456',
        title: 'Premium Widget Pro',
        handle: 'premium-widget-pro',
        descriptionHtml: '<p>The best widget you can buy.</p>',
        vendor: 'Acme Widgets',
        productType: 'Widgets',
        status: 'ACTIVE',
        tags: ['featured', 'bestseller', 'new'],
        createdAt: '2025-06-01T00:00:00Z',
        updatedAt: '2026-01-28T12:00:00Z',
        publishedAt: '2025-06-01T08:00:00Z',
        templateSuffix: 'special',
        giftCardTemplateSuffix: null,
        hasOnlyDefaultVariant: false,
        hasOutOfStockVariants: false,
        tracksInventory: true,
        totalInventory: 500,
        totalVariants: 6,
        options: [
          { id: 'gid://shopify/ProductOption/1', name: 'Size', position: 1, values: ['S', 'M', 'L'] },
          { id: 'gid://shopify/ProductOption/2', name: 'Color', position: 2, values: ['Red', 'Blue'] },
        ],
        images: [
          {
            id: 'gid://shopify/ProductImage/1',
            url: 'https://cdn.shopify.com/product-main.jpg',
            altText: 'Product main image',
            width: 2048,
            height: 2048,
          },
        ],
        featuredImage: {
          id: 'gid://shopify/ProductImage/1',
          url: 'https://cdn.shopify.com/product-main.jpg',
          altText: 'Product main image',
          width: 2048,
          height: 2048,
        },
        seo: {
          title: 'Premium Widget Pro - Best Widgets',
          description: 'Shop the best widgets at great prices.',
        },
        priceRangeV2: {
          minVariantPrice: { amount: '19.99', currencyCode: 'USD' },
          maxVariantPrice: { amount: '39.99', currencyCode: 'USD' },
        },
        metafields: [
          { namespace: 'custom', key: 'care_instructions', value: 'Machine wash cold', type: 'multi_line_text_field' },
        ],
        variants: [
          {
            id: 'gid://shopify/ProductVariant/1',
            legacyResourceId: '1',
            title: 'S / Red',
            displayName: 'Premium Widget Pro - S / Red',
            sku: 'WIDGET-S-RED',
            barcode: null,
            position: 1,
            price: '19.99',
            compareAtPrice: '24.99',
            taxable: true,
            taxCode: null,
            availableForSale: true,
            requiresShipping: true,
            weight: 0.5,
            weightUnit: 'POUNDS',
            inventoryQuantity: 50,
            selectedOptions: [
              { name: 'Size', value: 'S' },
              { name: 'Color', value: 'Red' },
            ],
            image: null,
            inventoryItem: {
              id: 'gid://shopify/InventoryItem/1',
              tracked: true,
              sku: 'WIDGET-S-RED',
              requiresShipping: true,
            },
            metafields: [],
          },
        ],
      };

      expect(product.id).toBe('gid://shopify/Product/123456');
      expect(product.title).toBe('Premium Widget Pro');
      expect(product.status).toBe('ACTIVE');
      expect(product.options).toHaveLength(2);
      expect(product.variants).toHaveLength(1);
      expect(product.metafields).toHaveLength(1);
    });

    it('should accept a minimal product with null optional fields', () => {
      const product: BulkProductNode = {
        id: 'gid://shopify/Product/999',
        legacyResourceId: '999',
        title: 'Simple Product',
        handle: 'simple-product',
        descriptionHtml: '',
        vendor: '',
        productType: '',
        status: 'DRAFT',
        tags: [],
        createdAt: '2026-01-29T00:00:00Z',
        updatedAt: '2026-01-29T00:00:00Z',
        publishedAt: null,
        templateSuffix: null,
        giftCardTemplateSuffix: null,
        hasOnlyDefaultVariant: true,
        hasOutOfStockVariants: false,
        tracksInventory: false,
        totalInventory: 0,
        totalVariants: 1,
        options: [],
        images: [],
        featuredImage: null,
        seo: { title: null, description: null },
        priceRangeV2: {
          minVariantPrice: { amount: '0.00', currencyCode: 'USD' },
          maxVariantPrice: { amount: '0.00', currencyCode: 'USD' },
        },
        metafields: [],
        variants: [],
      };

      expect(product.publishedAt).toBeNull();
      expect(product.featuredImage).toBeNull();
      expect(product.images).toHaveLength(0);
    });

    it('should accept all valid product statuses', () => {
      const statuses: BulkProductNode['status'][] = ['ACTIVE', 'ARCHIVED', 'DRAFT'];

      statuses.forEach((status) => {
        const product: BulkProductNode = {
          id: 'gid://shopify/Product/1',
          legacyResourceId: '1',
          title: 'Test Product',
          handle: 'test',
          descriptionHtml: '',
          vendor: '',
          productType: '',
          status,
          tags: [],
          createdAt: '2026-01-29T00:00:00Z',
          updatedAt: '2026-01-29T00:00:00Z',
          publishedAt: null,
          templateSuffix: null,
          giftCardTemplateSuffix: null,
          hasOnlyDefaultVariant: true,
          hasOutOfStockVariants: false,
          tracksInventory: false,
          totalInventory: 0,
          totalVariants: 1,
          options: [],
          images: [],
          featuredImage: null,
          seo: { title: null, description: null },
          priceRangeV2: {
            minVariantPrice: { amount: '0.00', currencyCode: 'USD' },
            maxVariantPrice: { amount: '0.00', currencyCode: 'USD' },
          },
          metafields: [],
          variants: [],
        };
        expect(product.status).toBe(status);
      });
    });

    it('should accept a product with variant metafields', () => {
      const product: BulkProductNode = {
        id: 'gid://shopify/Product/variantmeta',
        legacyResourceId: 'variantmeta',
        title: 'Product with Variant Metafields',
        handle: 'variant-meta',
        descriptionHtml: '',
        vendor: '',
        productType: '',
        status: 'ACTIVE',
        tags: [],
        createdAt: '2026-01-29T00:00:00Z',
        updatedAt: '2026-01-29T00:00:00Z',
        publishedAt: '2026-01-29T00:00:00Z',
        templateSuffix: null,
        giftCardTemplateSuffix: null,
        hasOnlyDefaultVariant: false,
        hasOutOfStockVariants: false,
        tracksInventory: true,
        totalInventory: 10,
        totalVariants: 1,
        options: [],
        images: [],
        featuredImage: null,
        seo: { title: null, description: null },
        priceRangeV2: {
          minVariantPrice: { amount: '10.00', currencyCode: 'USD' },
          maxVariantPrice: { amount: '10.00', currencyCode: 'USD' },
        },
        metafields: [],
        variants: [
          {
            id: 'gid://shopify/ProductVariant/vm1',
            legacyResourceId: 'vm1',
            title: 'Default',
            displayName: 'Product - Default',
            sku: 'VM-001',
            barcode: null,
            position: 1,
            price: '10.00',
            compareAtPrice: null,
            taxable: true,
            taxCode: null,
            availableForSale: true,
            requiresShipping: true,
            weight: null,
            weightUnit: 'POUNDS',
            inventoryQuantity: 10,
            selectedOptions: [],
            image: null,
            inventoryItem: null,
            metafields: [
              { namespace: 'variant', key: 'custom_color_code', value: '#FF5733', type: 'color' },
              { namespace: 'variant', key: 'material_composition', value: '100% organic cotton', type: 'single_line_text_field' },
            ],
          },
        ],
      };

      expect(product.variants[0].metafields).toHaveLength(2);
      expect(product.variants[0].metafields[0].type).toBe('color');
    });
  });

  // ============================================================
  // BulkCollectionNode and Related Types
  // ============================================================

  describe('CollectionImage interface', () => {
    it('should accept a complete collection image', () => {
      const image: CollectionImage = {
        url: 'https://cdn.shopify.com/collections/winter-sale.jpg',
        altText: 'Winter Sale Collection',
        width: 1200,
        height: 800,
      };

      expect(image.url).toContain('collections');
      expect(image.altText).toBe('Winter Sale Collection');
    });

    it('should accept an image with null optional fields', () => {
      const image: CollectionImage = {
        url: 'https://cdn.shopify.com/collections/no-alt.jpg',
        altText: null,
        width: null,
        height: null,
      };

      expect(image.altText).toBeNull();
    });
  });

  describe('CollectionSeo interface', () => {
    it('should accept complete collection SEO', () => {
      const seo: CollectionSeo = {
        title: 'Best Winter Deals - 50% Off',
        description: 'Shop our winter collection with amazing discounts.',
      };

      expect(seo.title).toContain('Winter');
    });

    it('should accept SEO with null fields', () => {
      const seo: CollectionSeo = {
        title: null,
        description: null,
      };

      expect(seo.title).toBeNull();
    });
  });

  describe('CollectionRule interface', () => {
    it('should accept a tag-based rule', () => {
      const rule: CollectionRule = {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'sale',
      };

      expect(rule.column).toBe('TAG');
      expect(rule.condition).toBe('sale');
    });

    it('should accept a price-based rule', () => {
      const rule: CollectionRule = {
        column: 'VARIANT_PRICE',
        relation: 'GREATER_THAN',
        condition: '50.00',
      };

      expect(rule.column).toBe('VARIANT_PRICE');
      expect(rule.relation).toBe('GREATER_THAN');
    });

    it('should accept different column types', () => {
      const columns = ['TAG', 'TITLE', 'TYPE', 'VENDOR', 'VARIANT_PRICE', 'VARIANT_COMPARE_AT_PRICE', 'VARIANT_WEIGHT', 'VARIANT_INVENTORY', 'VARIANT_TITLE'];

      columns.forEach((column) => {
        const rule: CollectionRule = {
          column,
          relation: 'EQUALS',
          condition: 'test',
        };
        expect(rule.column).toBe(column);
      });
    });

    it('should accept different relation types', () => {
      const relations = ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'STARTS_WITH', 'ENDS_WITH', 'CONTAINS', 'NOT_CONTAINS'];

      relations.forEach((relation) => {
        const rule: CollectionRule = {
          column: 'TAG',
          relation,
          condition: 'test',
        };
        expect(rule.relation).toBe(relation);
      });
    });
  });

  describe('CollectionRuleSet interface', () => {
    it('should accept a rule set with multiple rules (disjunctive)', () => {
      const ruleSet: CollectionRuleSet = {
        appliedDisjunctively: true,
        rules: [
          { column: 'TAG', relation: 'EQUALS', condition: 'sale' },
          { column: 'TAG', relation: 'EQUALS', condition: 'clearance' },
        ],
      };

      expect(ruleSet.appliedDisjunctively).toBe(true);
      expect(ruleSet.rules).toHaveLength(2);
    });

    it('should accept a rule set with conjunctive rules', () => {
      const ruleSet: CollectionRuleSet = {
        appliedDisjunctively: false,
        rules: [
          { column: 'TAG', relation: 'EQUALS', condition: 'winter' },
          { column: 'VARIANT_PRICE', relation: 'GREATER_THAN', condition: '25.00' },
        ],
      };

      expect(ruleSet.appliedDisjunctively).toBe(false);
    });
  });

  describe('CollectionProductReference interface', () => {
    it('should accept a product reference', () => {
      const ref: CollectionProductReference = {
        id: 'gid://shopify/Product/123',
        legacyResourceId: '123',
      };

      expect(ref.id).toBe('gid://shopify/Product/123');
      expect(ref.legacyResourceId).toBe('123');
    });
  });

  describe('BulkCollectionNode interface', () => {
    it('should accept a complete manual collection', () => {
      const collection: BulkCollectionNode = {
        id: 'gid://shopify/Collection/123456',
        legacyResourceId: '123456',
        title: 'Summer Collection 2026',
        handle: 'summer-collection-2026',
        descriptionHtml: '<p>Our latest summer styles.</p>',
        sortOrder: 'BEST_SELLING',
        templateSuffix: 'featured',
        updatedAt: '2026-01-28T15:00:00Z',
        image: {
          url: 'https://cdn.shopify.com/collections/summer-2026.jpg',
          altText: 'Summer 2026 Collection',
          width: 1600,
          height: 900,
        },
        seo: {
          title: 'Summer Collection 2026 - Hot Styles',
          description: 'Shop the hottest summer styles of 2026.',
        },
        ruleSet: null,
        metafields: [
          { namespace: 'custom', key: 'season', value: 'summer', type: 'single_line_text_field' },
          { namespace: 'custom', key: 'year', value: '2026', type: 'number_integer' },
        ],
        products: [
          { id: 'gid://shopify/Product/1', legacyResourceId: '1' },
          { id: 'gid://shopify/Product/2', legacyResourceId: '2' },
          { id: 'gid://shopify/Product/3', legacyResourceId: '3' },
        ],
      };

      expect(collection.id).toBe('gid://shopify/Collection/123456');
      expect(collection.title).toBe('Summer Collection 2026');
      expect(collection.ruleSet).toBeNull();
      expect(collection.products).toHaveLength(3);
      expect(collection.metafields).toHaveLength(2);
    });

    it('should accept a smart collection with rules', () => {
      const collection: BulkCollectionNode = {
        id: 'gid://shopify/Collection/smart123',
        legacyResourceId: 'smart123',
        title: 'Sale Items',
        handle: 'sale-items',
        descriptionHtml: '<p>All items currently on sale.</p>',
        sortOrder: 'PRICE_ASC',
        templateSuffix: null,
        updatedAt: '2026-01-29T10:00:00Z',
        image: null,
        seo: {
          title: 'Sale Items - Great Deals',
          description: 'Find great deals on all sale items.',
        },
        ruleSet: {
          appliedDisjunctively: true,
          rules: [
            { column: 'TAG', relation: 'EQUALS', condition: 'sale' },
            { column: 'TAG', relation: 'EQUALS', condition: 'clearance' },
            { column: 'TAG', relation: 'EQUALS', condition: 'discount' },
          ],
        },
        metafields: [],
        products: [],
      };

      expect(collection.ruleSet).not.toBeNull();
      expect(collection.ruleSet!.rules).toHaveLength(3);
      expect(collection.ruleSet!.appliedDisjunctively).toBe(true);
    });

    it('should accept a minimal collection with null optional fields', () => {
      const collection: BulkCollectionNode = {
        id: 'gid://shopify/Collection/minimal',
        legacyResourceId: 'minimal',
        title: 'Empty Collection',
        handle: 'empty-collection',
        descriptionHtml: '',
        sortOrder: 'MANUAL',
        templateSuffix: null,
        updatedAt: '2026-01-29T00:00:00Z',
        image: null,
        seo: { title: null, description: null },
        ruleSet: null,
        metafields: [],
        products: [],
      };

      expect(collection.image).toBeNull();
      expect(collection.templateSuffix).toBeNull();
      expect(collection.products).toHaveLength(0);
    });

    it('should accept different sort orders', () => {
      const sortOrders = ['MANUAL', 'BEST_SELLING', 'ALPHA_ASC', 'ALPHA_DESC', 'PRICE_ASC', 'PRICE_DESC', 'CREATED_DESC', 'CREATED'];

      sortOrders.forEach((sortOrder) => {
        const collection: BulkCollectionNode = {
          id: 'gid://shopify/Collection/1',
          legacyResourceId: '1',
          title: 'Test',
          handle: 'test',
          descriptionHtml: '',
          sortOrder,
          templateSuffix: null,
          updatedAt: '2026-01-29T00:00:00Z',
          image: null,
          seo: { title: null, description: null },
          ruleSet: null,
          metafields: [],
          products: [],
        };
        expect(collection.sortOrder).toBe(sortOrder);
      });
    });

    it('should accept a collection with metafields', () => {
      const collection: BulkCollectionNode = {
        id: 'gid://shopify/Collection/withmeta',
        legacyResourceId: 'withmeta',
        title: 'Collection With Metadata',
        handle: 'collection-with-metadata',
        descriptionHtml: '',
        sortOrder: 'MANUAL',
        templateSuffix: null,
        updatedAt: '2026-01-29T00:00:00Z',
        image: null,
        seo: { title: null, description: null },
        ruleSet: null,
        metafields: [
          { namespace: 'custom', key: 'featured_on_homepage', value: 'true', type: 'boolean' },
          { namespace: 'custom', key: 'banner_color', value: '#FF5733', type: 'color' },
          { namespace: 'app_data', key: 'sync_id', value: '12345', type: 'number_integer' },
        ],
        products: [],
      };

      expect(collection.metafields).toHaveLength(3);
      expect(collection.metafields[0].namespace).toBe('custom');
      expect(collection.metafields[1].type).toBe('color');
    });
  });
});
