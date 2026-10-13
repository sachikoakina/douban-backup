import { consola } from 'consola';
import { envEnabled, splitCategoryTokens } from './env-parsers';
import { unmatchedLogFile } from './sync-switches';
import { NEODB_API_TOKEN } from './service-credentials';
import {
  SHELF_TYPES,
  type TmdbRatingPolicy,
  type ShelfType,
} from '../types/platform-model';

/**
 * NeoDB 书架 → TMDB 链路的全部设置。
 *
 * 这条链路默认关闭（SYNC_NEODB_TMDB=0），把所有读取集中在此文件，
 * 可保证新增或调整它不会改变既有四条链路的行为。
 */

// ───────────────────────────────────────────────────────────────────────────
// NeoDB → TMDB path
//
// Kept as its own object rather than merged into `syncConfig` above, so this
// addition cannot perturb the existing Douban/Bangumi behaviour.
// All environment reads for this path live here, nowhere else.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Shelves processed by default.
 * `dropped` is deliberately absent — the mapping skips it, so including it
 * would only waste requests. It can still be listed explicitly; it simply
 * resolves to "no TMDB operation".
 */
const DEFAULT_TMDB_SHELF_TYPES: readonly ShelfType[] = [
  'wishlist',
  'progress',
  'complete',
];

function envInt(name: string, defaultValue: number, min = 0): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < min) {
    return defaultValue;
  }
  return Math.floor(raw);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Which shelves to process. Empty env → the default subset above. */
function resolveTmdbShelfTypes(): ShelfType[] {
  const tokens = splitCategoryTokens(process.env.SYNC_SHELF_TYPES);
  if (tokens.length === 0) {
    return [...DEFAULT_TMDB_SHELF_TYPES];
  }

  const resolved: ShelfType[] = [];
  const unknown: string[] = [];
  for (const token of tokens) {
    if ((SHELF_TYPES as readonly string[]).includes(token)) {
      resolved.push(token as ShelfType);
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length) {
    consola.warn(`SYNC_SHELF_TYPES: unrecognized value(s): ${unknown.join(', ')}`);
  }
  if (resolved.length === 0) {
    consola.warn('SYNC_SHELF_TYPES resolved to nothing; no shelf will be synced.');
  }
  return resolved;
}

/**
 * Rating conflict policy. Separate parser from {@link parseMergeProfile} because
 * the choices differ: here the *target* is TMDB.
 */
function resolveRatingProfile(): TmdbRatingPolicy {
  const raw = (process.env.SYNC_RATING_PROFILE ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'tmdb_prefer') {
    return 'tmdb_prefer';
  }
  if (raw === 'overwrite' || raw === 'neodb_prefer') {
    return 'overwrite';
  }
  consola.warn(
    `SYNC_RATING_PROFILE=${raw} is invalid (use tmdb_prefer|overwrite); using tmdb_prefer.`,
  );
  return 'tmdb_prefer';
}

export const neodbTmdbConfig = {
  /** Default OFF: a new path must not change behaviour until explicitly enabled. */
  enabled: envEnabled('SYNC_NEODB_TMDB', false),
  shelfTypes: resolveTmdbShelfTypes(),
  /** Category allowlist. Empty → all syncable categories (movie, tv). */
  categories: splitCategoryTokens(process.env.SYNC_CATEGORIES),
  dryRun: envEnabled('SYNC_DRY_RUN', false),
  maxItems: envInt('SYNC_MAX_ITEMS', 200, 1),
  ratingProfile: resolveRatingProfile(),
  yearTolerance: envInt('SYNC_YEAR_TOLERANCE', 1, 0),
  /** Incremental de-duplication store. Empty string disables it. */
  stateFile: process.env.SYNC_STATE_FILE ?? '.cache/sync-state.json',
  incremental: envEnabled('SYNC_INCREMENTAL', true),
  /** Unmatched items are dumped here for review. Empty disables. */
  unmatchedLog: unmatchedLogFile,

  neodb: {
    /** Self-hosted instances: point this at your server. */
    baseUrl: stripTrailingSlash(process.env.NEODB_BASE_URL || 'https://neodb.social'),
    requestDelayMs: envInt('NEODB_REQUEST_DELAY_MS', 300),
    maxPages: envInt('NEODB_MAX_PAGES', 10, 1),
  },

  tmdb: {
    apiKey: process.env.TMDB_API_KEY,
    /** Overridable for proxies/mirrors. */
    baseUrl: stripTrailingSlash(
      process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
    ),
    /** v4 user token; converted to a session when no session id is supplied. */
    accessToken: process.env.TMDB_ACCESS_TOKEN,
    /** v3 session id. Required for any write. */
    sessionId: process.env.TMDB_SESSION_ID,
    /** Optional; resolved via /3/account when absent. */
    accountId: process.env.TMDB_ACCOUNT_ID,
    language: process.env.TMDB_LANGUAGE || 'zh-CN',
    includeAdult: envEnabled('TMDB_INCLUDE_ADULT', false),
    requestDelayMs: envInt('TMDB_REQUEST_DELAY_MS', 300),
  },
};

/** Categories the user asked for, restricted to what TMDB can hold. */
export function resolveTargetCategories(): string[] {
  return neodbTmdbConfig.categories.length > 0
    ? neodbTmdbConfig.categories
    : ['movie', 'tv'];
}

export function describeNeodbTmdbConfig(): string {
  const shelves = neodbTmdbConfig.shelfTypes.join('|') || '(none)';
  return (
    `NeoDB→TMDB: ${neodbTmdbConfig.enabled ? 'on' : 'off'} ` +
    `shelves=${shelves}, categories=${resolveTargetCategories().join('|')}, ` +
    `dryRun=${neodbTmdbConfig.dryRun}, incremental=${neodbTmdbConfig.incremental}, ` +
    `rating=${neodbTmdbConfig.ratingProfile}, maxItems=${neodbTmdbConfig.maxItems}`
  );
}

/**
 * Credential check, run before any request is attempted.
 *
 * Note on the TMDB side: a v4 *read* token carries `"scopes":["api_read"]` and
 * cannot write. Writes need a v3 session id or a user-scoped v4 token.
 */
export function validateNeodbTmdbCredentials(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!neodbTmdbConfig.enabled) {
    return { ok: true, problems };
  }
  if (!neodbTokenConfigured()) {
    problems.push('NEODB_API_TOKEN is not set — cannot read your shelf.');
  }
  if (!neodbTmdbConfig.tmdb.apiKey) {
    problems.push('TMDB_API_KEY is not set — TMDB requests cannot be addressed.');
  }
  if (!neodbTmdbConfig.tmdb.sessionId && !neodbTmdbConfig.tmdb.accessToken) {
    problems.push(
      'Neither TMDB_SESSION_ID nor TMDB_ACCESS_TOKEN is set — TMDB writes are impossible.',
    );
  }

  return { ok: problems.length === 0, problems };
}

function neodbTokenConfigured(): boolean {
  return Boolean(NEODB_API_TOKEN);
}
