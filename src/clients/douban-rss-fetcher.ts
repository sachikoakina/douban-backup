import Parser from 'rss-parser';
import got from 'got';
import { consola } from 'consola';
import { DOUBAN_RSS_USER_AGENT } from '../config/service-credentials';
import type { RSSFeedItem } from '../types/platform-model';

/**
 * 抓取豆瓣个人 RSS。
 *
 * 只负责把 XML 取回来，不做归一化（解析见 domain/douban-rss-parser.ts）。
 * 豆瓣对机房 IP 与裸请求经常返回 401/403，故对这两类状态码做了限次重试。
 */

export async function fetchRSSFeeds(): Promise<RSSFeedItem[]> {
  const DOUBAN_USER_ID = process.env.DOUBAN_USER_ID;
  if (!DOUBAN_USER_ID) {
    throw new Error('DOUBAN_USER_ID is not set');
  }

  const url = `https://www.douban.com/feed/people/${DOUBAN_USER_ID}/interests`;
  const parser = new Parser();

  try {
    // Douban often 403s bare requests from CI; use a browser-like UA via got.
    // Timeouts / transient 5xx are common on Actions — retry a few times.
    const xml = await got(url, {
      headers: {
        'User-Agent': DOUBAN_RSS_USER_AGENT,
        Accept:
          'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: 'https://www.douban.com/',
      },
      timeout: { request: 60000 },
      retry: {
        limit: 3,
        methods: ['GET'],
        statusCodes: [401, 403, 408, 413, 429, 500, 502, 503, 504],
        errorCodes: [
          'ETIMEDOUT',
          'ECONNRESET',
          'EADDRINUSE',
          'ECONNREFUSED',
          'EPIPE',
          'ENOTFOUND',
          'ENETUNREACH',
          'EAI_AGAIN',
        ],
        calculateDelay: ({ attemptCount, error, computedValue }) => {
          // Cap 401/403 retries — often permanent WAF blocks.
          const status = error?.response?.statusCode;
          if ((status === 401 || status === 403) && attemptCount <= 2) {
            return attemptCount * 2500;
          }
          if (status === 401 || status === 403) {
            return 0;
          }
          return computedValue;
        },
      },
    }).text();

    const feeds = await parser.parseString(xml);
    return feeds.items;
  } catch (error: any) {
    const status = error?.response?.statusCode;
    if (status === 401 || status === 403) {
      consola.error(
        `Douban RSS returned ${status} (blocked or need browser session). ` +
          'CI/机房 IP 常被拦；可设 DOUBAN_RSS_USER_AGENT，或暂时只开 SYNC_BANGUMI_NEODB。',
      );
    } else {
      consola.error('Failed to parse RSS url: ', error);
    }
    throw error;
  }
}
