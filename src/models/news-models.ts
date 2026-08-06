import type { NewsSource } from "../news-formatters";

export interface NewsArticle {
  readonly title: string;
  readonly url: string;
  readonly source: NewsSource;
  readonly publishedAt: number;
  readonly content?: NewsArticleContent;
}

export interface TextArticleBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ImageArticleBlock {
  readonly type: "image";
  readonly url: string;
  readonly alt: string;
}

export interface VideoArticleBlock {
  readonly type: "video";
  readonly url: string;
  readonly mimeType: string | undefined;
}

export type NewsArticleBlock = TextArticleBlock | ImageArticleBlock | VideoArticleBlock;

export interface NewsArticleContent {
  readonly blocks: readonly NewsArticleBlock[];
}

export interface NewsLink {
  readonly title: string;
  readonly href: string;
  readonly publishedAt: number;
}
