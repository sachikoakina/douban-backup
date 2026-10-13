import dotenv from 'dotenv';
import { consola } from 'consola';
import type { FeedItem } from '../types/platform-model';
import { neodbToken, syncFeedItemToNeodb } from '../clients/neodb-mark-client';
import { filterDoubanFeedsByCategory, syncConfig } from '../config/sync-switches';

dotenv.config();

/**
 * Asynchronously handles syncing feed items to NeoDB.
 *
 * @param {FeedItem[]} feeds - the array of feed items to sync
 * @return {Promise<void>}
 */
export default async function handleNeodb(feeds: FeedItem[]): Promise<void> {
  if (!neodbToken) {
    return;
  }

  const filtered = filterDoubanFeedsByCategory(
    feeds,
    syncConfig.doubanNeodbCategories,
    'Douban → NeoDB',
  );

  consola.start('Going to sync to NeoDB...');
  for (const item of filtered) {
    await syncFeedItemToNeodb(item);
  }
  consola.success('NeoDB synced ✨');
}
