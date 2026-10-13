import Parser from 'rss-parser';
import DB_PROPERTIES from '../../cols.json';

/**
 * 跨平台数据模型（纯类型 + 少量常量，无网络、无副作用）。
 *
 * 按平台分段：
 *   · 豆瓣     ItemCategory / ItemStatus / FeedItem —— 豆瓣 RSS 归一化后的条目
 *   · Bangumi  BangumiSubjectType / BangumiCollectionType —— 官方数字枚举的约束
 *   · NeoDB    NeodbItem / NeodbShelfEntry / NeodbPagedMark —— 目录条目与书架条目
 *   · TMDB     TmdbTarget / TmdbAccountStates / TmdbSearchResult —— 写入目标与现状
 *
 * 注意 NeoDB 与豆瓣共用同一套四种货架状态：
 *   ItemStatus 枚举（可写 `ItemStatus.Complete`）与 ShelfType 字符串联合
 *   （API 直接返回裸字符串，便于断言）表达的是同一组取值，二者刻意并存。
 *
 * 其余契约类型所在文件：
 *   · Notion 写入载荷 → types/notion.ts
 *   · 链路执行结果   → report/path-report.ts
 *   · TMDB 链路计数  → domain/tmdb-sync-counters.ts
 */

export type DB_PROPERTIES_KEYS = Exclude<keyof typeof DB_PROPERTIES, 'NAME'>;

export enum ItemCategory {
  Movie = 'movie',
  Music = 'music',
  Book = 'book',
  Game = 'game',
  Drama = 'drama',
}

// follow the schema value of Neodb
export enum ItemStatus {
  Wishlist = 'wishlist',
  Progress = 'progress',
  Complete = 'complete',
  Dropped = 'dropped',
}

export type RSSFeedItem = {
  [key: string]: any;
} & Parser.Item;

export type FeedItem = {
  id: string;
  link: string;
  title: string;
  rating: number | null;
  comment: string | null;
  time: string;
  status: ItemStatus;
  category: ItemCategory;
};

/** Bangumi SubjectType: 1 book, 2 anime, 3 music, 4 game, 6 real */
export type BangumiSubjectType = 1 | 2 | 3 | 4 | 6;

/** Bangumi CollectionType: 1 wish, 2 done, 3 doing, 4 on-hold, 5 dropped */
export type BangumiCollectionType = 1 | 2 | 3 | 4 | 5;

/** NeoDB shelf progress type */
export type NeodbProgressType =
  | 'page'
  | 'chapter'
  | 'part'
  | 'episode'
  | 'track'
  | 'cycle'
  | 'timestamp'
  | 'percentage';

// ───────────────────────────────────────────────────────────────────────────
// NeoDB → TMDB path
//
// Shapes below are copied from the verified NeoDB API reference, not guessed.
// See README "接口依据" for sources.
// ───────────────────────────────────────────────────────────────────────────

/** `{type}` path variable of GET /api/me/shelf/{type}. Verified: all four exist. */
export type ShelfType = 'wishlist' | 'progress' | 'complete' | 'dropped';

export const SHELF_TYPES: readonly ShelfType[] = [
  'wishlist',
  'progress',
  'complete',
  'dropped',
] as const;

/** `category` query parameter of GET /api/me/shelf/{type}. */
export type NeodbCategory =
  'book' | 'movie' | 'tv' | 'music' | 'game' | 'podcast' | 'performance';

export const NEODB_CATEGORIES: readonly NeodbCategory[] = [
  'book',
  'movie',
  'tv',
  'music',
  'game',
  'podcast',
  'performance',
] as const;

/**
 * ItemSchema — the catalog object, inlined as `mark.item` on the shelf API.
 *
 * This is the union of what the two sync paths need: the legacy Douban/Notion
 * fields (`id`, `brief`) and the shelf fields (`year`, `pub_year`,
 * `description`). Kept in types.ts so nothing imports back into neodb.ts.
 */
export type NeodbItem = {
  /** Legacy field required by the existing mark logic. */
  id: string;
  type: string;
  uuid: string;
  url: string;
  api_url: string;
  category: NeodbCategory | string;
  parent_uuid: string | null;
  display_title: string;
  title: string;
  /** Short summary (legacy field name). */
  brief: string;
  description: string;
  cover_image_url: string;
  rating: number;
  rating_count: number;
  localized_title?: { lang?: string; text?: string }[];
  localized_description?: { lang?: string; text?: string }[];
  /** Platform URLs; verified platforms include douban, imdb and tmdb. */
  external_resources: { url: string }[];
  /** MovieSchema / TVSchema only. */
  year?: number;
  /** EditionSchema (books) only. */
  pub_year?: number;
};

/**
 * MarkSchema — one element of `data[]` in PagedMarkSchema.
 *
 * Named `NeodbShelfEntry` to avoid colliding with `NeodbMark` in neodb.ts,
 * which is a different (item-less) shape used by the legacy mark logic.
 */
export type NeodbShelfEntry = {
  shelf_type: ShelfType | string;
  /** 0 = public, 1 = followers, 2 = private. Not mapped to TMDB (no equivalent). */
  visibility?: number;
  post_id?: number;
  /** Catalog item, inlined — no second request needed. */
  item: NeodbItem;
  created_time?: string;
  /** Free-text short comment. TMDB has no write endpoint for it. */
  comment_text?: string;
  /** 0 = unrated, 2 = 1 star … 10 = 5 stars. */
  rating_grade?: number;
  tags?: string[];
};

/** PagedMarkSchema — response of GET /api/me/shelf/{type}. */
export type NeodbPagedMark = {
  data: NeodbShelfEntry[];
  pages: number;
  count: number;
};

/** GET /api/me */
export type NeodbMe = {
  username?: string;
  display_name?: string;
  url?: string;
};

/** Only movie and tv can carry a TMDB user mark. */
export type TmdbMediaType = 'movie' | 'tv';

/** A resolved TMDB target — enough to address every write endpoint. */
export type TmdbTarget = {
  mediaType: TmdbMediaType;
  id: number;
  title?: string;
};

/**
 * GET /3/{movie|tv}/{id}/account_states.
 * `rated` is `{ value }` when rated and `false` when not — never a boolean.
 */
export type TmdbAccountStates = {
  id: number;
  favorite: boolean;
  rated: { value: number } | false;
  watchlist: boolean;
};

export type TmdbSearchResult = {
  id: number;
  media_type?: string;
  title?: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
};

/** How a NeoDB↔TMDB rating conflict resolves. */
export type TmdbRatingPolicy = 'tmdb_prefer' | 'overwrite';
