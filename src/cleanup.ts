import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CleanupResult } from './types.js';

const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function cleanupOldBackups(
  backupDir: string,
  retentionDays: number,
): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: [], kept: [], errors: [] };

  if (!fs.existsSync(backupDir)) {
    return result;
  }

  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const entry of entries) {
    if (!entry.isDirectory() || !DATE_DIR_PATTERN.test(entry.name)) {
      continue;
    }

    const dirDate = new Date(entry.name + 'T00:00:00');
    const ageInDays = Math.floor(
      (now.getTime() - dirDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (ageInDays > retentionDays) {
      try {
        fs.rmSync(path.join(backupDir, entry.name), {
          recursive: true,
          force: true,
        });
        result.deleted.push(entry.name);
      } catch (err) {
        result.errors.push(
          `Failed to delete ${entry.name}: ${(err as Error).message}`,
        );
      }
    } else {
      result.kept.push(entry.name);
    }
  }

  return result;
}
