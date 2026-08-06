import { toNewsArticles } from "../helpers/news-article-utils";
import { extractTextPreservingLineBreaks, isRecord, toSafeMediaUrl } from "../helpers/news-helpers";
import type { NewsArticle, NewsArticleBlock, NewsArticleContent } from "../models/news-models";
import type { NewsSource } from "../news-formatters";
import { parseArticleContentFromHtml } from "../parsers/article-html-parser";
import type { NewsSourceDefinition, NewsSourceHandler } from "./news-source-handler";

const NOW_NEWS_LIST_URL =
  "https://newsapi1.now.com/pccw-news-api/api/getNewsListv2?category=119&pageNo=1&pageSize=50";
const MAX_ARTICLE_CONTENT_LENGTH = 6_000;

export const NOW_NEWS_SOURCE_DEFINITION: NewsSourceDefinition = {
  label: "Now News",
  description: "Now News local news",
  latestNewsUrl: NOW_NEWS_LIST_URL,
  contentSelector: "article, main",
  ignoredSelectors: [".relatedNewsWrap"],
};

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

export class NowNewsHandler implements NewsSourceHandler {
  public readonly source: NewsSource = "now";
  public readonly definition = NOW_NEWS_SOURCE_DEFINITION;

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
