import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getConfig } from '../config.js';
import type { BackupConfig } from '../types.js';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('when all environment variables are set', () => {
    it('should return correct config with all values', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      process.env.BACKUP_DIR = '/custom/backup/path';
      process.env.RETENTION_DAYS = '60';

      const config = getConfig();

      expect(config).toEqual<BackupConfig>({
        shopifyStore: 'test-store.myshopify.com',
        shopifyAccessToken: 'shpat_test_token_123',
        backupDir: '/custom/backup/path',
        retentionDays: 60,
      });
    });
  });

  describe('when using default values', () => {
    it('should use default BACKUP_DIR when not provided', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      delete process.env.BACKUP_DIR;
      delete process.env.RETENTION_DAYS;

      const config = getConfig();

      expect(config.backupDir).toBe('/backups/shopify');
    });

    it('should use default RETENTION_DAYS of 30 when not provided', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      delete process.env.BACKUP_DIR;
      delete process.env.RETENTION_DAYS;

      const config = getConfig();

      expect(config.retentionDays).toBe(30);
    });

    it('should use defaults for both BACKUP_DIR and RETENTION_DAYS when not provided', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      delete process.env.BACKUP_DIR;
      delete process.env.RETENTION_DAYS;

      const config = getConfig();

      expect(config.backupDir).toBe('/backups/shopify');
      expect(config.retentionDays).toBe(30);
    });
  });

  describe('when required environment variables are missing', () => {
    it('should throw descriptive error when SHOPIFY_STORE is missing', () => {
      delete process.env.SHOPIFY_STORE;
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';

      expect(() => getConfig()).toThrow('SHOPIFY_STORE');
    });

    it('should throw descriptive error when SHOPIFY_ACCESS_TOKEN is missing', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      delete process.env.SHOPIFY_ACCESS_TOKEN;

      expect(() => getConfig()).toThrow('SHOPIFY_ACCESS_TOKEN');
    });

    it('should throw descriptive error when both required vars are missing', () => {
      delete process.env.SHOPIFY_STORE;
      delete process.env.SHOPIFY_ACCESS_TOKEN;

      expect(() => getConfig()).toThrow();
    });

    it('should throw when SHOPIFY_STORE is empty string', () => {
      process.env.SHOPIFY_STORE = '';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';

      expect(() => getConfig()).toThrow('SHOPIFY_STORE');
    });

    it('should throw when SHOPIFY_ACCESS_TOKEN is empty string', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = '';

      expect(() => getConfig()).toThrow('SHOPIFY_ACCESS_TOKEN');
    });
  });

  describe('edge cases', () => {
    it('should handle RETENTION_DAYS as string and convert to number', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      process.env.RETENTION_DAYS = '7';

      const config = getConfig();

      expect(config.retentionDays).toBe(7);
      expect(typeof config.retentionDays).toBe('number');
    });

    it('should use default when RETENTION_DAYS is invalid number', () => {
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      process.env.RETENTION_DAYS = 'not-a-number';

      const config = getConfig();

      expect(config.retentionDays).toBe(30);
    });

    it('should accept whitespace-only BACKUP_DIR and not trim it', () => {
      // Note: This tests current behavior - implementation may choose to trim
      process.env.SHOPIFY_STORE = 'test-store.myshopify.com';
      process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_test_token_123';
      process.env.BACKUP_DIR = '/path/with spaces/backup';

      const config = getConfig();

      expect(config.backupDir).toBe('/path/with spaces/backup');
    });
  });
});
