import type { NewsArticle, NewsArticleContent } from "../models/news-models";
import type { NewsSource } from "../news-formatters";
import { NowNewsHandler } from "./nownews-handler";
import { RthkNewsHandler } from "./rthk-handler";

export const NEWS_SOURCES: readonly NewsSource[] = ["rthk", "now"];

export { toNowArticleUrl } from "./nownews-handler";
export { toRthkArticleUrl } from "./rthk-handler";

export interface NewsSourceDefinition {
  readonly label: string;
  readonly description: string;
  readonly latestNewsUrl: string;
  readonly contentSelector: string;
  readonly ignoredSelectors: readonly string[];
}

export interface NewsSourceHandler {
  readonly source: NewsSource;
  readonly definition: NewsSourceDefinition;
  parseLatestArticles(payload: string): readonly NewsArticle[];
  parseLatestArticleContents(payload: string): ReadonlyMap<string, NewsArticleContent>;
  parseArticleContent(html: string, articleUrl: string): NewsArticleContent;
}

export interface NewsSourceHandlerFactory {
  create(source: NewsSource): NewsSourceHandler;
}

export class DefaultNewsSourceHandlerFactory implements NewsSourceHandlerFactory {
  private readonly handlers: Readonly<Record<NewsSource, NewsSourceHandler>> = {
    rthk: new RthkNewsHandler(),
    now: new NowNewsHandler(),
  };

  public create(source: NewsSource): NewsSourceHandler {
    return this.handlers[source];
  }
}

const newsSourceHandlerFactory = new DefaultNewsSourceHandlerFactory();

export function getNewsSourceHandler(source: NewsSource): NewsSourceHandler {
  return newsSourceHandlerFactory.create(source);
}

export function getNewsSourceDefinition(source: NewsSource): NewsSourceDefinition {
  return getNewsSourceHandler(source).definition;
}
