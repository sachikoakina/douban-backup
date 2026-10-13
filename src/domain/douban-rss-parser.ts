import { JSDOM } from 'jsdom';
import {
  ALL_STATUS,
  STATUS_TITLE_PREFIX,
  RATING_TEXT,
  SeeState,
  ReadState,
  PlayState,
  ListenState,
} from './platform-mappings';
import {
  ItemCategory,
  type ItemStatus,
  type RSSFeedItem,
  type FeedItem,
} from '../types/platform-model';

/**
 * 豆瓣 RSS 条目的归一化（纯函数，无网络）。
 *
 * 输入是 rss-parser 解析出的原始 item，输出是各链路统一消费的 FeedItem。
 * 抓取见 clients/douban-rss-fetcher.ts。
 */

type ItemInfo = {
  category: ItemCategory;
  id: string;
  status: ItemStatus;
};
/**
 * Normalize the given array of RSS feed items.
 *
 * @param {RSSFeedItem[]} feeds - The array of RSS feed items to be normalized.
 * @return {FeedItem[]} The normalized array of feed items.
 */
export function handleRSSFeeds(feeds: RSSFeedItem[]): FeedItem[] {
  const normalizedFeeds: FeedItem[] = [];

  feeds.forEach((item) => {
    const itemInfo = extractItemInfo(item.title!, item.link!);
    if (!itemInfo) {
      return;
    }
    const { category, id, status } = itemInfo;
    const dom = new JSDOM(item.content!.trim());
    const contents = [...dom.window.document.querySelectorAll('td p')];
    const ratingElements = contents.filter((el) => el.textContent!.startsWith('推荐'));
    let ratingNumber = 0;
    if (ratingElements.length) {
      const rating = ratingElements[0].textContent!.replace(/^推荐: /, '').trim();
      ratingNumber = RATING_TEXT[rating as keyof typeof RATING_TEXT];
    }
    const commentElements = contents.filter((el) => el.textContent!.startsWith('备注'));
    let comment = '';
    if (commentElements.length) {
      comment = commentElements[0].textContent!.replace(/^备注: /, '').trim();
    }
    const title = (item.title || '').replace(STATUS_TITLE_PREFIX, '').trim();
    const result = {
      id,
      link: item.link,
      title,
      rating: ratingNumber || null,
      comment: typeof comment === 'string' ? comment : null, // 备注：XXX -> 短评
      time: item.isoDate, // '2021-05-30T06:49:34.000Z'
      status,
      category,
    } as FeedItem;
    normalizedFeeds.push(result);
  });

  return normalizedFeeds;
}

/**
 * Extracts the category, ID, and status from the given title and link
 * which are from RSS feed item.
 *
 * @param {string} title - The title to extract the information from.
 * @param {string} link - The link to extract the information from.
 * @return {ItemInfo} An object containing the extracted category, ID, and status.
 */
export function extractItemInfo(title: string, link: string): ItemInfo | undefined {
  const m = title.match(ALL_STATUS)?.[1];

  if (!m) {
    return;
  }

  if (Object.keys(SeeState).includes(m)) {
    const isMovie =
      link.startsWith('http://movie.douban.com/') ||
      link.startsWith('https://movie.douban.com/');
    return {
      category: isMovie ? ItemCategory.Movie : ItemCategory.Drama,
      id: isMovie
        ? (link.match(/movie\.douban\.com\/subject\/(\d+)\/?/)?.[1] ?? '')
        : (link.match(/www\.douban\.com\/location\/drama\/(\d+)\/?/)?.[1] ?? ''),
      status: SeeState[m as keyof typeof SeeState],
    };
  } else if (Object.keys(ReadState).includes(m)) {
    return {
      category: ItemCategory.Book,
      id: link.match(/book\.douban\.com\/subject\/(\d+)\/?/)?.[1] ?? '',
      status: ReadState[m as keyof typeof ReadState],
    };
  } else if (Object.keys(ListenState).includes(m)) {
    return {
      category: ItemCategory.Music,
      id: link.match(/music\.douban\.com\/subject\/(\d+)\/?/)?.[1] ?? '',
      status: ListenState[m as keyof typeof ListenState],
    };
  } else if (Object.keys(PlayState).includes(m)) {
    return {
      category: ItemCategory.Game,
      id: link.match(/www\.douban\.com\/game\/(\d+)\/?/)?.[1] ?? '',
      status: PlayState[m as keyof typeof PlayState],
    };
  }

  return;
}
