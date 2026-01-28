import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { BackupConfig, BackupResult, BackupStatus, ContentBackupResult, ImageDownloadResult, CleanupResult } from '../types.js';

vi.mock('../backup/products.js', () => ({ backupProducts: vi.fn() }));
vi.mock('../backup/customers.js', () => ({ backupCustomers: vi.fn() }));
vi.mock('../backup/orders.js', () => ({ backupOrders: vi.fn() }));
vi.mock('../backup/content.js', () => ({ backupContent: vi.fn() }));
vi.mock('../images.js', () => ({ downloadProductImages: vi.fn() }));
vi.mock('../cleanup.js', () => ({ cleanupOldBackups: vi.fn() }));
vi.mock('../shopify.js', () => ({ createShopifyClient: vi.fn().mockReturnValue({}) }));

import { runBackup } from '../backup.js';
import { backupProducts } from '../backup/products.js';
import { backupCustomers } from '../backup/customers.js';
import { backupOrders } from '../backup/orders.js';
import { backupContent } from '../backup/content.js';
import { downloadProductImages } from '../images.js';
import { cleanupOldBackups } from '../cleanup.js';

function makeConfig(backupDir: string): BackupConfig {
  return {
    shopifyStore: 'test.myshopify.com',
    shopifyAccessToken: 'shpat_test',
    backupDir,
    retentionDays: 30,
  };
}

function successResult(count: number): BackupResult {
  return { success: true, count };
}

function setupAllMocksSuccess(): void {
  const productsData = [{ id: 1, title: 'Test Product' }];
  vi.mocked(backupProducts).mockResolvedValue({ result: successResult(10), products: productsData } as any);
  vi.mocked(backupCustomers).mockResolvedValue(successResult(5));
  vi.mocked(backupOrders).mockResolvedValue(successResult(8));
  vi.mocked(backupContent).mockResolvedValue({
    pages: successResult(3),
    collections: successResult(2),
    blogs: successResult(1),
    shopMetafields: successResult(4),
  } as ContentBackupResult);
  vi.mocked(downloadProductImages).mockResolvedValue({
    success: true,
    downloaded: 15,
    failed: 0,
    failedUrls: [],
  } as ImageDownloadResult);
  vi.mocked(cleanupOldBackups).mockResolvedValue({
    deleted: [],
    kept: [],
    errors: [],
  } as CleanupResult);
}

describe('runBackup', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
    vi.clearAllMocks();
    setupAllMocksSuccess();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create a date-stamped directory under backupDir', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const expectedDir = path.join(tempDir, today);
    expect(fs.existsSync(expectedDir)).toBe(true);
  });

  it('should call all backup modules', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    expect(backupProducts).toHaveBeenCalled();
    expect(backupCustomers).toHaveBeenCalled();
    expect(backupOrders).toHaveBeenCalled();
    expect(backupContent).toHaveBeenCalled();
    expect(downloadProductImages).toHaveBeenCalled();
    expect(cleanupOldBackups).toHaveBeenCalled();
  });

  it('should write status.json with correct structure', async () => {
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const statusPath = path.join(tempDir, today, 'status.json');
    expect(fs.existsSync(statusPath)).toBe(true);

    const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    expect(status).toHaveProperty('started_at');
    expect(status).toHaveProperty('completed_at');
    expect(status).toHaveProperty('backup_dir');
    expect(status).toHaveProperty('modules');
    expect(status).toHaveProperty('counts');
    expect(status).toHaveProperty('images');
    expect(status).toHaveProperty('failed_images');
    expect(status).toHaveProperty('cleanup');
    expect(status).toHaveProperty('errors');
  });

  it('should return a BackupStatus object', async () => {
    const config = makeConfig(tempDir);
    const result = await runBackup(config);

    expect(result.started_at).toBeDefined();
    expect(result.completed_at).toBeDefined();
    expect(result.backup_dir).toContain(tempDir);
    expect(result.modules).toBeDefined();
    expect(result.errors).toEqual([]);
  });

  it('should continue on partial failure and include errors', async () => {
    vi.mocked(backupCustomers).mockRejectedValue(new Error('API rate limit'));
    const config = makeConfig(tempDir);

    const result = await runBackup(config);

    // Other modules should still have been called
    expect(backupProducts).toHaveBeenCalled();
    expect(backupOrders).toHaveBeenCalled();
    expect(backupContent).toHaveBeenCalled();

    // Errors should be captured
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes('API rate limit'))).toBe(true);
    expect(result.modules['customers']).toBe('failed');
  });

  it('should include failed module status in status.json', async () => {
    vi.mocked(backupOrders).mockRejectedValue(new Error('Connection timeout'));
    const config = makeConfig(tempDir);
    await runBackup(config);

    const today = new Date().toISOString().split('T')[0];
    const statusPath = path.join(tempDir, today, 'status.json');
    const status: BackupStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

    expect(status.modules['orders']).toBe('failed');
    expect(status.errors.some((e: string) => e.includes('Connection timeout'))).toBe(true);
  });

  it('should have valid ISO timestamps in status.json', async () => {
    const config = makeConfig(tempDir);
    const beforeRun = new Date().toISOString();
    const result = await runBackup(config);
    const afterRun = new Date().toISOString();

    // Timestamps should be valid ISO strings
    expect(() => new Date(result.started_at)).not.toThrow();
    expect(() => new Date(result.completed_at)).not.toThrow();

    // started_at should be within our test window
    expect(result.started_at >= beforeRun).toBe(true);
    expect(result.completed_at <= afterRun).toBe(true);
    expect(result.completed_at >= result.started_at).toBe(true);
  });
});
