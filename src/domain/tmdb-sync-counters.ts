/**
 * NeoDB → TMDB 链路的细分计数器。
 *
 * 只被 paths/neodb-to-tmdb.ts 使用：该链路把它折叠成 PathReport 的形状，
 * 再交给 report/console-summary.ts 渲染，因此无需放进公共类型。
 */

export type SyncCounters = {
  scanned: number;
  skippedCategory: number;
  skippedShelf: number;
  skippedCached: number;
  /**
   * Same TMDB item reached again in one run (an item can sit on several
   * shelves). Counted so that the per-path self-check still adds up: without
   * it, a duplicate would bump `scanned` and nothing else.
   */
  skippedDuplicate: number;
  matchedTmdbLink: number;
  matchedImdb: number;
  matchedSearch: number;
  unmatched: number;
  writtenWatchlist: number;
  writtenRating: number;
  unchanged: number;
  failed: number;
};

export function newSyncCounters(): SyncCounters {
  return {
    scanned: 0,
    skippedCategory: 0,
    skippedShelf: 0,
    skippedCached: 0,
    skippedDuplicate: 0,
    matchedTmdbLink: 0,
    matchedImdb: 0,
    matchedSearch: 0,
    unmatched: 0,
    writtenWatchlist: 0,
    writtenRating: 0,
    unchanged: 0,
    failed: 0,
  };
}
