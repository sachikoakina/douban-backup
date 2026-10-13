import DB_PROPERTIES from '../../cols.json';
import {
  NotionPropTypesEnum,
  type NotionColPropTypes,
  type NotionDatePropType,
  type NotionFilesPropType,
  type NotionMultiSelectPropType,
  type NotionNumberPropType,
  type NotionRichTextPropType,
  type NotionTitlePropType,
  type NotionUrlPropType,
} from '../types/notion';
import { ItemCategory } from '../types/platform-model';

/**
 * Notion 属性值的构造（纯函数，无网络）。
 *
 * 把豆瓣侧抓来的原始值转成 Notion API 要求的属性载荷；
 * 载荷的类型定义在 types/notion.ts。
 */

/**
 * Retrieves the data source ID for the given category.
 *
 * @param {ItemCategory} category - The category of the item.
 * @returns {string} The corresponding database ID.
 */
export function getDataSourceId(category: ItemCategory): string {
  const databasesMap = {
    [ItemCategory.Movie]: process.env.NOTION_MOVIE_DATABASE_ID,
    [ItemCategory.Music]: process.env.NOTION_MUSIC_DATABASE_ID,
    [ItemCategory.Book]: process.env.NOTION_BOOK_DATABASE_ID,
    [ItemCategory.Game]: process.env.NOTION_GAME_DATABASE_ID,
    [ItemCategory.Drama]: process.env.NOTION_DRAMA_DATABASE_ID,
  };
  return databasesMap[category] as string;
}
/**
 * Generates the value for a property based on the given parameters, ready to insert
 * into notion database.
 *
 * @param {any} value - the value to be processed
 * @param {NotionPropTypesEnum} type - the type of the Notion database property
 * @param {string} key - the key associated with the property
 * @return {any} the generated value for the property later will be sent to notion to create an item
 */
export function buildPropertyValue(
  value: any,
  type: NotionPropTypesEnum,
  key: string,
): NotionColPropTypes | undefined {
  switch (type) {
    case NotionPropTypesEnum.TITLE:
      return {
        type: NotionPropTypesEnum.TITLE,
        title: [
          {
            text: {
              content: value,
            },
          },
        ],
      } as NotionTitlePropType;
    case NotionPropTypesEnum.FILES:
      return {
        type: NotionPropTypesEnum.FILES,
        files: [
          {
            name: value,
            type: 'external',
            external: {
              url: value,
            },
          },
        ],
      } as NotionFilesPropType;
    case NotionPropTypesEnum.DATE:
      return {
        type: NotionPropTypesEnum.DATE,
        date: {
          start: value,
        },
      } as NotionDatePropType;
    case NotionPropTypesEnum.MULTI_SELECT:
      return key === DB_PROPERTIES.RATING
        ? ({
            type: NotionPropTypesEnum.MULTI_SELECT,
            multi_select: value ? [{ name: value.toString() }] : [],
          } as NotionMultiSelectPropType)
        : ({
            type: NotionPropTypesEnum.MULTI_SELECT,
            multi_select: (value || []).map((g: string) => ({ name: g })),
          } as NotionMultiSelectPropType);
    case NotionPropTypesEnum.RICH_TEXT:
      return {
        type: NotionPropTypesEnum.RICH_TEXT,
        rich_text: [
          {
            type: 'text',
            text: {
              content: value || '',
            },
          },
        ],
      } as NotionRichTextPropType;
    case NotionPropTypesEnum.NUMBER:
      return {
        type: NotionPropTypesEnum.NUMBER,
        number: value ? Number(value) : null,
      } as NotionNumberPropType;
    case NotionPropTypesEnum.URL:
      return {
        type: NotionPropTypesEnum.URL,
        url: value,
      } as NotionUrlPropType;
    default:
      break;
  }
}
