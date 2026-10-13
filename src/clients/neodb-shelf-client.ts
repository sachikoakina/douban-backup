import got, { HTTPError } from 'got';
import { consola } from 'consola';
import { NEODB_API_TOKEN } from '../config/service-credentials';
import { neodbTmdbConfig } from '../config/neodb-tmdb-settings';
import { formatHttpFailure, retryAfterDelay, sleep } from '../shared/http-client';
import type { NeodbMe, NeodbPagedMark, ShelfType } from '../types/platform-model';

/**
 * NeoDB 书架读取客户端。
 *
 * 与 clients/neodb-mark-client.ts 分离的原因：这里的 baseUrl 可配置
 * （支持自建实例），且只做只读的分页拉取。
 *
 * 已验证端点（接口依据见 README）：
 *   GET /api/token                            → 凭据探测
 *   GET /api/me                               → 当前账号
 *   GET /api/me/shelf/{type}?category=&page=  → PagedMarkSchema
 *
 * 注意 `type` 是**路径参数**而非查询参数——这是此处最易踩的集成坑，
 * 故下面显式拼接 URL。
 */

// ───────────────────────────────────────────────────────────────────────────
// NeoDB → TMDB path: shelf listing
//
// Verified endpoints (see README "接口依据" for sources):
//   GET /api/token                            → credential probe
//   GET /api/me                               → current account
//   GET /api/me/shelf/{type}?category=&page=  → PagedMarkSchema
//
// `type` is a PATH parameter, not a query parameter. That is the single most
// likely integration bug here, hence the explicit URL construction below.
//
// Uses its own client because the base URL is configurable (self-hosted
// instances), independent of the legacy calls above.
// ───────────────────────────────────────────────────────────────────────────

const neodbShelfClient = got.extend({
  prefixUrl: neodbTmdbConfig.neodb.baseUrl,
  headers: { accept: 'application/json' },
  timeout: { request: 30000 },
  retry: {
    limit: 3,
    methods: ['GET'],
    statusCodes: [408, 429, 500, 502, 503, 504],
    errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'],
    // 与 TMDB 客户端共用：优先 Retry-After，否则指数退避。
    calculateDelay: retryAfterDelay,
  },
});

function shelfAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${NEODB_API_TOKEN ?? ''}` };
}

function logShelfUnauthorized(): void {
  consola.error(
    'NeoDB 返回 401：token 无效或已过期。请到你的实例 /developer/ 页面重新授权并更新 NEODB_API_TOKEN。',
  );
}

export async function neodbThrottle(): Promise<void> {
  await sleep(neodbTmdbConfig.neodb.requestDelayMs);
}

/** GET /api/token — cheap way to validate credentials before a full run. */
export async function verifyNeodbToken(): Promise<boolean> {
  if (!NEODB_API_TOKEN) {
    return false;
  }
  try {
    await neodbShelfClient('api/token', { headers: shelfAuthHeaders() });
    return true;
  } catch (error) {
    if (error instanceof HTTPError && error.response.statusCode === 401) {
      logShelfUnauthorized();
    } else {
      consola.error('NeoDB token check failed: ', formatHttpFailure(error));
    }
    return false;
  }
}

/** GET /api/me */
export async function getNeodbMe(): Promise<NeodbMe | null> {
  if (!NEODB_API_TOKEN) {
    return null;
  }
  try {
    return (await neodbShelfClient('api/me', {
      headers: shelfAuthHeaders(),
    }).json()) as NeodbMe;
  } catch (error) {
    if (error instanceof HTTPError && error.response.statusCode === 401) {
      logShelfUnauthorized();
    } else {
      consola.error('Failed to fetch NeoDB account: ', formatHttpFailure(error));
    }
    return null;
  }
}

/**
 * One page of GET /api/me/shelf/{type}.
 * Returns null on failure so callers can tell "error" from "empty page".
 */
export async function fetchShelfPage(options: {
  shelfType: ShelfType;
  category?: string;
  page: number;
}): Promise<NeodbPagedMark | null> {
  if (!NEODB_API_TOKEN) {
    return null;
  }

  const searchParams: Record<string, string | number> = { page: options.page };
  if (options.category) {
    searchParams.category = options.category;
  }

  try {
    const result = (await neodbShelfClient(`api/me/shelf/${options.shelfType}`, {
      headers: shelfAuthHeaders(),
      searchParams,
    }).json()) as NeodbPagedMark;

    // Defensive: the shape is verified, but a proxy or a fork could differ.
    if (!Array.isArray(result?.data)) {
      consola.warn(
        `Unexpected shelf response for ${options.shelfType} page ${options.page}; treating as empty.`,
      );
      return { data: [], pages: 1, count: 0 };
    }
    return result;
  } catch (error) {
    if (error instanceof HTTPError && error.response.statusCode === 401) {
      logShelfUnauthorized();
    } else if (error instanceof HTTPError && error.response.statusCode === 404) {
      consola.warn(
        `Shelf "${options.shelfType}" returned 404 — it may not exist on this instance.`,
      );
    } else {
      consola.error(
        `Failed to fetch shelf ${options.shelfType} page ${options.page}: `,
        formatHttpFailure(error),
      );
    }
    return null;
  }
}

/**
 * Walk the pages of one shelf, up to `neodbTmdbConfig.maxPages`.
 * Stops early on an empty page or when the reported page count is reached.
 */
export async function fetchShelf(
  shelfType: ShelfType,
  category?: string,
): Promise<NeodbPagedMark['data']> {
  const collected: NeodbPagedMark['data'] = [];

  for (let page = 1; page <= neodbTmdbConfig.neodb.maxPages; page += 1) {
    const result = await fetchShelfPage({ shelfType, category, page });
    if (result === null) {
      consola.warn(`Aborting shelf "${shelfType}" at page ${page} after an error.`);
      break;
    }
    if (result.data.length === 0) {
      break;
    }

    collected.push(...result.data);

    const reportedPages = Number(result.pages);
    if (Number.isFinite(reportedPages) && page >= reportedPages) {
      break;
    }
    if (page === neodbTmdbConfig.neodb.maxPages) {
      consola.warn(
        `Shelf "${shelfType}" hit NEODB_MAX_PAGES (${neodbTmdbConfig.neodb.maxPages}); more items remain.`,
      );
      break;
    }
    await neodbThrottle();
  }

  return collected;
}
