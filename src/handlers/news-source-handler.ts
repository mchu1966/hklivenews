import { load } from "cheerio";
import { toNewsArticles } from "../helpers/news-article-utils";
import {
  cleanText,
  extractTextPreservingLineBreaks,
  isRecord,
  toSafeMediaUrl,
} from "../helpers/news-helpers";
import type { NewsArticle, NewsArticleBlock, NewsArticleContent } from "../models/news-models";
import type { NewsSource } from "../news-formatters";
import { parseArticleContentFromHtml } from "../parsers/article-html-parser";

const LATEST_NEWS_URL = "https://news.rthk.hk/rthk/ch/latest-news.htm";
const NOW_NEWS_LIST_URL =
  "https://newsapi1.now.com/pccw-news-api/api/getNewsListv2?category=119&pageNo=1&pageSize=50";
const RTHK_HOSTNAME = "news.rthk.hk";
const MAX_ARTICLE_CONTENT_LENGTH = 6_000;
export const NEWS_SOURCES: readonly NewsSource[] = ["rthk", "now"];

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

const NEWS_SOURCE_DEFINITIONS: Readonly<Record<NewsSource, NewsSourceDefinition>> = {
  rthk: {
    label: "RTHK",
    description: "RTHK Chinese latest news",
    latestNewsUrl: LATEST_NEWS_URL,
    contentSelector: ".itemFullText, .itemIntroText, article, main",
    ignoredSelectors: [],
  },
  now: {
    label: "Now News",
    description: "Now News local news",
    latestNewsUrl: NOW_NEWS_LIST_URL,
    contentSelector: "article, main",
    ignoredSelectors: [".relatedNewsWrap"],
  },
};

export function toRthkArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(value, LATEST_NEWS_URL);
    const isArticle = /^\/rthk\/ch\/component\/k2\/\d+-\d{8}\.htm$/.test(url.pathname);

    return url.protocol === "https:" && url.hostname === RTHK_HOSTNAME && isArticle
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function toNowArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://news.now.com/");
    const newsId = url.searchParams.get("newsId");
    const isArticle = /^\/home\/local\/player$/.test(url.pathname) && /^\d+$/.test(newsId ?? "");

    return url.protocol === "https:" && url.hostname === "news.now.com" && isArticle
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function parseRthkPublicationDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) HKT (\d{2}):(\d{2})$/.exec(cleanText(value));

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute));
}

function getNowNewsItems(data: unknown): readonly unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  return isRecord(data) && Array.isArray(data.newsList) ? data.newsList : [];
}

function parseNowNewsBlockContent(item: Readonly<Record<string, unknown>>): NewsArticleBlock | undefined {
  if (item.newsType === "text" && typeof item.value === "string") {
    const text = extractTextPreservingLineBreaks(item.value).slice(0, MAX_ARTICLE_CONTENT_LENGTH);

    return text ? { type: "text", text } : undefined;
  }

  if (item.newsType === "image" && typeof item.imageUrl === "string") {
    const imageUrl = toSafeMediaUrl(item.imageUrl, "https://news.now.com/");

    return imageUrl ? { type: "image", url: imageUrl, alt: "" } : undefined;
  }

  return undefined;
}

class RthkNewsHandler implements NewsSourceHandler {
  public readonly source: NewsSource = "rthk";
  public readonly definition = NEWS_SOURCE_DEFINITIONS.rthk;

  public parseLatestArticles(html: string): readonly NewsArticle[] {
    const $ = load(html);
    const links = $("a[href*='/rthk/ch/component/k2/']")
      .map((_, anchor) => ({
        title: $(anchor).text(),
        href: $(anchor).attr("href") ?? "",
        publishedAt: parseRthkPublicationDate($(anchor).closest(".ns2-inner").find(".ns2-created").text()),
      }))
      .get();

    return toNewsArticles(links, this.source, toRthkArticleUrl);
  }

  public parseLatestArticleContents(): ReadonlyMap<string, NewsArticleContent> {
    return new Map();
  }

  public parseArticleContent(html: string, articleUrl: string): NewsArticleContent {
    return parseArticleContentFromHtml(html, articleUrl, this.definition);
  }
}

class NowNewsHandler implements NewsSourceHandler {
  public readonly source: NewsSource = "now";
  public readonly definition = NEWS_SOURCE_DEFINITIONS.now;

  public parseLatestArticles(json: string): readonly NewsArticle[] {
    let data: unknown;

    try {
      data = JSON.parse(json);
    } catch {
      throw new Error("Now News returned invalid list data.");
    }

    const links = getNowNewsItems(data).flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }

      const { newsId, title, publishDate } = item;
      return typeof newsId === "string" && typeof title === "string" && typeof publishDate === "number"
        ? [{ title, href: `/home/local/player?newsId=${newsId}`, publishedAt: publishDate }]
        : [];
    });

    return toNewsArticles(links, this.source, toNowArticleUrl);
  }

  public parseLatestArticleContents(json: string): ReadonlyMap<string, NewsArticleContent> {
    let data: unknown;

    try {
      data = JSON.parse(json);
    } catch {
      return new Map();
    }

    const contents = new Map<string, NewsArticleContent>();

    for (const item of getNowNewsItems(data)) {
      if (!isRecord(item)) {
        continue;
      }

      const { newsId, newsContent } = item;
      if (typeof newsId !== "string" || !Array.isArray(newsContent)) {
        continue;
      }

      const url = toNowArticleUrl(`/home/local/player?newsId=${newsId}`);
      const blocks = newsContent
        .filter(isRecord)
        .map((block) => parseNowNewsBlockContent(block))
        .filter((block): block is NewsArticleBlock => block !== undefined);

      if (url && blocks.length > 0) {
        contents.set(url, { blocks });
      }
    }

    return contents;
  }

  public parseArticleContent(html: string, articleUrl: string): NewsArticleContent {
    return parseArticleContentFromHtml(html, articleUrl, this.definition);
  }
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
