import dotenv from 'dotenv';
import { consola } from 'consola';
import { ItemCategory } from '../types/platform-model';

/**
 * 通用的环境变量解析器（与具体链路无关）。
 *
 * 读取顺序约定：空值/未设置 → 默认值；非法值 → 告警并回退默认值。
 * 具体链路的开关与白名单见 config/sync-switches.ts 与 config/neodb-tmdb-settings.ts。
 */

dotenv.config();

/**
 * Parse env flag. Empty/unset → defaultValue.
 * Truthy: 1, true, yes, on (case-insensitive).
 */
export function envEnabled(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/** Douban RSS category tokens (English + Chinese aliases). */
export const DOUBAN_CATEGORY_ALIASES: Record<string, ItemCategory> = {
  movie: ItemCategory.Movie,
  music: ItemCategory.Music,
  book: ItemCategory.Book,
  game: ItemCategory.Game,
  drama: ItemCategory.Drama,
  电影: ItemCategory.Movie,
  音乐: ItemCategory.Music,
  书籍: ItemCategory.Book,
  书: ItemCategory.Book,
  游戏: ItemCategory.Game,
  话剧: ItemCategory.Drama,
};

/**
 * Bangumi → NeoDB category tokens.
 * `manga` is books with platform "漫画"; `book` covers all books.
 */
export type BangumiNeodbCategory =
  'anime' | 'manga' | 'book' | 'music' | 'game' | 'real';

export const BANGUMI_CATEGORY_ALIASES: Record<string, BangumiNeodbCategory> = {
  anime: 'anime',
  manga: 'manga',
  book: 'book',
  music: 'music',
  game: 'game',
  real: 'real',
  动画: 'anime',
  动漫: 'anime',
  漫画: 'manga',
  书籍: 'book',
  书: 'book',
  音乐: 'music',
  游戏: 'game',
  三次元: 'real',
};

export type CategoryAllowlist<T extends string> =
  | { mode: 'all' }
  | { mode: 'none'; raw: string }
  | { mode: 'set'; values: ReadonlySet<T> };

/** How Douban/Bangumi marks merge into an existing NeoDB mark. */
export type NeodbMergePolicy = 'overwrite' | 'neodb_prefer';

/**
 * Parse merge profile. Empty/unset → defaultValue.
 * Invalid values warn and fall back to defaultValue.
 */
export function parseMergeProfile(
  envName: string,
  defaultValue: NeodbMergePolicy = 'neodb_prefer',
): NeodbMergePolicy {
  const raw = process.env[envName];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'overwrite' || value === 'neodb_prefer') {
    return value;
  }
  consola.warn(
    `${envName}=${raw} is invalid (use overwrite|neodb_prefer); falling back to ${defaultValue}`,
  );
  return defaultValue;
}

export function splitCategoryTokens(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  return raw
    .split(/[,，\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Parse a comma-separated category allowlist.
 * Empty/unset → all. Non-empty with zero recognized tokens → none (fail closed).
 */
export function parseCategoryAllowlist<T extends string>(
  envName: string,
  aliases: Record<string, T>,
): CategoryAllowlist<T> {
  const raw = process.env[envName];
  const tokens = splitCategoryTokens(raw);
  if (tokens.length === 0) {
    return { mode: 'all' };
  }

  const values = new Set<T>();
  const unknown: string[] = [];
  for (const token of tokens) {
    const mapped = aliases[token];
    if (mapped) {
      values.add(mapped);
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length) {
    consola.warn(`${envName}: unrecognized category token(s): ${unknown.join(', ')}`);
  }

  if (values.size === 0) {
    consola.warn(
      `${envName} has no recognized categories; syncing nothing for this path (set empty to allow all).`,
    );
    return { mode: 'none', raw: raw ?? '' };
  }

  return { mode: 'set', values };
}

export function formatAllowlist<T extends string>(
  allowlist: CategoryAllowlist<T>,
): string {
  if (allowlist.mode === 'all') {
    return 'all';
  }
  if (allowlist.mode === 'none') {
    return 'none';
  }
  return [...allowlist.values].sort().join('|');
}
