import { HTTPError } from 'got';

/**
 * HTTP 客户端共用的重试与错误格式化。
 *
 * 原先这段逻辑在 clients/tmdb-client.ts 与 clients/neodb-shelf-client.ts
 * 里各写了一遍（逐字节相同），此处收敛为单一实现。
 */

/** 值得重试的 HTTP 状态码：限流 + 瞬时 5xx。 */
export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504] as const;

/** 值得重试的网络层错误码。 */
export const RETRYABLE_ERROR_CODES = [
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
] as const;

/** 延时指定毫秒。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * got 的 `retry.calculateDelay`：优先遵守 `Retry-After`，否则指数退避（上限 8s）。
 *
 * 只对 GET 生效——重放写请求可能覆盖用户手工设置的值。
 * 参数用宽松类型以匹配 got 的回调签名。
 */
export function retryAfterDelay(options: any): number {
  const { attemptCount, error, computedValue } = options ?? {};
  const raw = error?.response?.headers?.['retry-after'];
  const retryAfter = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return Math.min(2 ** attemptCount * 500, 8000) || computedValue;
}

/** 把 got 抛出的异常压成一行可读文本，用于错误日志。 */
export function formatHttpFailure(error: unknown): string {
  if (error instanceof HTTPError) {
    return `${error.response.statusCode} ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
