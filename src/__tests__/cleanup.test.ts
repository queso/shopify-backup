import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanupOldBackups } from '../cleanup.js';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('cleanupOldBackups', () => {
  let tempDir: string;

  function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  function createTestDir(name: string): void {
    fs.mkdirSync(path.join(tempDir, name), { recursive: true });
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('basic retention cleanup', () => {
    it('should delete directories older than retentionDays', async () => {
      const oldDir = daysAgo(35);
      const recentDir = daysAgo(5);
      createTestDir(oldDir);
      createTestDir(recentDir);

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toContain(oldDir);
      expect(result.kept).toContain(recentDir);
      expect(fs.existsSync(path.join(tempDir, oldDir))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, recentDir))).toBe(true);
    });

    it('should keep directories exactly at retention boundary', async () => {
      const boundaryDir = daysAgo(30);
      createTestDir(boundaryDir);

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.kept).toContain(boundaryDir);
      expect(result.deleted).not.toContain(boundaryDir);
    });

    it('should delete directories one day past retention boundary', async () => {
      const pastBoundaryDir = daysAgo(31);
      createTestDir(pastBoundaryDir);

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toContain(pastBoundaryDir);
      expect(fs.existsSync(path.join(tempDir, pastBoundaryDir))).toBe(false);
    });
  });

  describe('return value structure', () => {
    it('should return CleanupResult with deleted, kept, and errors arrays', async () => {
      createTestDir(daysAgo(5));

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result).toHaveProperty('deleted');
      expect(result).toHaveProperty('kept');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.deleted)).toBe(true);
      expect(Array.isArray(result.kept)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return correct counts for multiple directories', async () => {
      const old1 = daysAgo(40);
      const old2 = daysAgo(50);
      const old3 = daysAgo(60);
      const recent1 = daysAgo(10);
      const recent2 = daysAgo(20);

      createTestDir(old1);
      createTestDir(old2);
      createTestDir(old3);
      createTestDir(recent1);
      createTestDir(recent2);

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toHaveLength(3);
      expect(result.kept).toHaveLength(2);
    });
  });

  describe('date directory validation', () => {
    it('should ignore non-date directories (not YYYY-MM-DD format)', async () => {
      createTestDir('random-folder');
      createTestDir('backup-2026');
      createTestDir('2026-1-5');
      createTestDir('not-a-date');

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toHaveLength(0);
      expect(result.kept).toHaveLength(0);
      expect(fs.existsSync(path.join(tempDir, 'random-folder'))).toBe(true);
    });

    it('should process valid date directories and ignore invalid ones', async () => {
      const validOld = daysAgo(45);
      const validRecent = daysAgo(5);
      createTestDir(validOld);
      createTestDir(validRecent);
      createTestDir('invalid-dir');

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toContain(validOld);
      expect(result.kept).toContain(validRecent);
      expect(fs.existsSync(path.join(tempDir, 'invalid-dir'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty backup directory gracefully', async () => {
      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toHaveLength(0);
      expect(result.kept).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle retention of 0 days', async () => {
      const yesterday = daysAgo(1);
      createTestDir(yesterday);

      const result = await cleanupOldBackups(tempDir, 0);

      expect(result.deleted).toContain(yesterday);
      expect(fs.existsSync(path.join(tempDir, yesterday))).toBe(false);
    });

    it('should handle large retention period (365 days)', async () => {
      const dir30DaysOld = daysAgo(30);
      const dir100DaysOld = daysAgo(100);
      const dir400DaysOld = daysAgo(400);
      createTestDir(dir30DaysOld);
      createTestDir(dir100DaysOld);
      createTestDir(dir400DaysOld);

      const result = await cleanupOldBackups(tempDir, 365);

      expect(result.kept).toContain(dir30DaysOld);
      expect(result.kept).toContain(dir100DaysOld);
      expect(result.deleted).toContain(dir400DaysOld);
    });

    it('should handle non-existent backup directory gracefully', async () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');

      await expect(cleanupOldBackups(nonExistentDir, 30)).resolves.toBeDefined();
    });
  });

  describe('date calculation', () => {
    it('should calculate age based on directory name, not filesystem mtime', async () => {
      const oldDateName = daysAgo(45);
      const dirPath = path.join(tempDir, oldDateName);
      createTestDir(oldDateName);

      const now = new Date();
      fs.utimesSync(dirPath, now, now);

      const result = await cleanupOldBackups(tempDir, 30);

      expect(result.deleted).toContain(oldDateName);
    });
  });
});
