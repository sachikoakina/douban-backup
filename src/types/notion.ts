/**
 * Notion 属性载荷类型。
 *
 * 描述发送给 Notion API 的属性值结构，由 shared/notion-property-value.ts 构造。
 */

export enum NotionPropTypesEnum {
  TITLE = 'title',
  RICH_TEXT = 'rich_text',
  FILES = 'files',
  DATE = 'date',
  MULTI_SELECT = 'multi_select',
  NUMBER = 'number',
  URL = 'url',
}

export type NotionRichTextPropType = {
  id?: string;
  type: NotionPropTypesEnum.RICH_TEXT;
  rich_text: {
    type: 'text';
    text: {
      content: string;
    };
  }[];
};

export type NotionTitlePropType = {
  id?: 'title';
  type: NotionPropTypesEnum.TITLE;
  title: {
    text: {
      content: string;
    };
  }[];
};

export type NotionFilesPropType = {
  id?: string;
  type: NotionPropTypesEnum.FILES;
  files: {
    name: string;
    type: 'external';
    external: {
      url: string;
    };
  }[];
};

export type NotionDatePropType = {
  id?: string;
  type: NotionPropTypesEnum.DATE;
  date: {
    start: string;
    end: string | null;
    time_zone: string | null;
  };
};

export type NotionMultiSelectPropType = {
  id?: string;
  type: NotionPropTypesEnum.MULTI_SELECT;
  multi_select: {
    name: string;
  }[];
};

export type NotionNumberPropType = {
  id?: string;
  type: NotionPropTypesEnum.NUMBER;
  number: number | null;
};

export type NotionUrlPropType = {
  id?: string;
  type: NotionPropTypesEnum.URL;
  url: string;
};

export type NotionColPropTypes =
  | NotionRichTextPropType
  | NotionTitlePropType
  | NotionFilesPropType
  | NotionDatePropType
  | NotionMultiSelectPropType
  | NotionNumberPropType
  | NotionUrlPropType;

export type FailedItem = {
  link: string;
  title: string;
};
