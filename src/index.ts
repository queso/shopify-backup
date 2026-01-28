import { getConfig } from './config.js';
import { runBackup } from './backup.js';

async function main(): Promise<void> {
  console.log('Shopify backup starting...');

  const config = getConfig();
  const status = await runBackup(config);

  const failed = status.errors.length > 0;
  console.log(`Backup completed: ${Object.keys(status.counts).map((k) => `${k}=${status.counts[k]}`).join(', ')}`);
  console.log(`Images: ${status.images.downloaded} downloaded, ${status.images.failed} failed`);

  if (status.errors.length > 0) {
    console.error('Errors:');
    for (const err of status.errors) {
      console.error(`  - ${err}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
