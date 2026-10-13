import { consola } from 'consola';
import {
  BANGUMI_CATEGORY_ALIASES,
  DOUBAN_CATEGORY_ALIASES,
  envEnabled,
  formatAllowlist,
  parseCategoryAllowlist,
  parseMergeProfile,
  type BangumiNeodbCategory,
  type CategoryAllowlist,
} from './env-parsers';
import {
  ItemCategory,
  type BangumiSubjectType,
  type FeedItem,
} from '../types/platform-model';

/**
 * 豆瓣 / Bangumi 四条链路的开关与类别白名单。
 *
 * NeoDB → TMDB 的设置刻意独立放在 neodb-tmdb-settings.ts：那条链路默认关闭，
 * 分文件后修改它不会扰动本文件的默认行为。
 */

export const syncConfig = {
  /** Douban RSS → Notion */
  doubanNotion: envEnabled('SYNC_DOUBAN_NOTION', false),
  /** Douban RSS → NeoDB */
  doubanNeodb: envEnabled('SYNC_DOUBAN_NEODB', true),
  /** Douban RSS → Bangumi */
  doubanBangumi: envEnabled('SYNC_DOUBAN_BANGUMI', true),
  /** Bangumi collections → NeoDB */
  bangumiNeodb: envEnabled('SYNC_BANGUMI_NEODB', true),
  /** Bangumi → NeoDB progress (episode/chapter/track). Default off. */
  bangumiNeodbProgress: envEnabled('SYNC_BANGUMI_NEODB_PROGRESS', false),

  doubanNotionCategories: parseCategoryAllowlist(
    'SYNC_DOUBAN_NOTION_CATEGORIES',
    DOUBAN_CATEGORY_ALIASES,
  ),
  doubanNeodbCategories: parseCategoryAllowlist(
    'SYNC_DOUBAN_NEODB_CATEGORIES',
    DOUBAN_CATEGORY_ALIASES,
  ),
  doubanBangumiCategories: parseCategoryAllowlist(
    'SYNC_DOUBAN_BANGUMI_CATEGORIES',
    DOUBAN_CATEGORY_ALIASES,
  ),
  bangumiNeodbCategories: parseCategoryAllowlist(
    'SYNC_BANGUMI_NEODB_CATEGORIES',
    BANGUMI_CATEGORY_ALIASES,
  ),

  doubanNeodbMerge: parseMergeProfile('SYNC_DOUBAN_NEODB_MERGE'),
  bangumiNeodbMerge: parseMergeProfile('SYNC_BANGUMI_NEODB_MERGE'),
};

export function needsDoubanRss(): boolean {
  return syncConfig.doubanNotion || syncConfig.doubanNeodb || syncConfig.doubanBangumi;
}

export function isDoubanCategoryAllowed(
  allowlist: CategoryAllowlist<ItemCategory>,
  category: ItemCategory,
): boolean {
  if (allowlist.mode === 'all') {
    return true;
  }
  if (allowlist.mode === 'none') {
    return false;
  }
  return allowlist.values.has(category);
}

/**
 * Filter Douban feed items by a path's category allowlist.
 * Logs one info line per skipped item.
 */
export function filterDoubanFeedsByCategory(
  feeds: FeedItem[],
  allowlist: CategoryAllowlist<ItemCategory>,
  pathLabel: string,
): FeedItem[] {
  if (allowlist.mode === 'all') {
    return feeds;
  }
  return feeds.filter((item) => {
    if (isDoubanCategoryAllowed(allowlist, item.category)) {
      return true;
    }
    consola.info(
      `${pathLabel}: skip category ${item.category}: `,
      `${item.title || item.id}[${item.link}]`,
    );
    return false;
  });
}

/** Bangumi subject_type values needed for the allowlist (for API query). */
export function bangumiSubjectTypesForAllowlist(
  allowlist: CategoryAllowlist<BangumiNeodbCategory>,
): BangumiSubjectType[] | null {
  if (allowlist.mode === 'all') {
    return null;
  }
  if (allowlist.mode === 'none') {
    return [];
  }

  const types = new Set<BangumiSubjectType>();
  for (const cat of allowlist.values) {
    switch (cat) {
      case 'book':
      case 'manga':
        types.add(1);
        break;
      case 'anime':
        types.add(2);
        break;
      case 'music':
        types.add(3);
        break;
      case 'game':
        types.add(4);
        break;
      case 'real':
        types.add(6);
        break;
    }
  }
  return [...types].sort((a, b) => a - b);
}

/**
 * Whether a Bangumi collection's subject_type is in scope before platform checks.
 * Manga-only still needs books (type 1) here; call {@link needsBangumiMangaPlatformCheck}.
 */
export function isBangumiSubjectTypeAllowed(
  allowlist: CategoryAllowlist<BangumiNeodbCategory>,
  subjectType: BangumiSubjectType,
): boolean {
  if (allowlist.mode === 'all') {
    return true;
  }
  if (allowlist.mode === 'none') {
    return false;
  }

  const { values } = allowlist;
  switch (subjectType) {
    case 1:
      return values.has('book') || values.has('manga');
    case 2:
      return values.has('anime');
    case 3:
      return values.has('music');
    case 4:
      return values.has('game');
    case 6:
      return values.has('real');
    default:
      return false;
  }
}

/**
 * True when books must be filtered by platform === "漫画"
 * (manga allowed, full book not).
 */
export function needsBangumiMangaPlatformCheck(
  allowlist: CategoryAllowlist<BangumiNeodbCategory>,
): boolean {
  return (
    allowlist.mode === 'set' &&
    allowlist.values.has('manga') &&
    !allowlist.values.has('book')
  );
}

export function describeSyncConfig(): string {
  const lines = [
    `Douban→Notion: ${syncConfig.doubanNotion ? 'on' : 'off'} (${formatAllowlist(syncConfig.doubanNotionCategories)})`,
    `Douban→NeoDB: ${syncConfig.doubanNeodb ? 'on' : 'off'} (${formatAllowlist(syncConfig.doubanNeodbCategories)}, merge=${syncConfig.doubanNeodbMerge})`,
    `Douban→Bangumi: ${syncConfig.doubanBangumi ? 'on' : 'off'} (${formatAllowlist(syncConfig.doubanBangumiCategories)})`,
    `Bangumi→NeoDB: ${syncConfig.bangumiNeodb ? 'on' : 'off'} (${formatAllowlist(syncConfig.bangumiNeodbCategories)}, merge=${syncConfig.bangumiNeodbMerge}, progress=${syncConfig.bangumiNeodbProgress ? 'on' : 'off'})`,
  ];
  return lines.join(', ');
}

// ───────────────────────────────────────────────────────────────────────────
// Shared review log
//
// `SYNC_UNMATCHED_LOG` started life as a NeoDB → TMDB option, but the file it
// names is useful to every path: it is where entries a path could not process
// are appended for later review. Each writer stamps its own `source`, so both
// directions can share one file without ambiguity.
// ───────────────────────────────────────────────────────────────────────────

/** Where unprocessable entries are appended. Empty disables the log. */
export const unmatchedLogFile =
  process.env.SYNC_UNMATCHED_LOG ?? '.cache/unmatched.json';
