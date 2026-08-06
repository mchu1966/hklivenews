import { load } from "cheerio";
import { toNewsArticles } from "../helpers/news-article-utils";
import { cleanText } from "../helpers/news-helpers";
import type { NewsArticle, NewsArticleContent } from "../models/news-models";
import type { NewsSource } from "../news-formatters";
import { parseArticleContentFromHtml } from "../parsers/article-html-parser";
import type { NewsSourceDefinition, NewsSourceHandler } from "./news-source-handler";

const LATEST_NEWS_URL = "https://news.rthk.hk/rthk/ch/latest-news.htm";
const RTHK_HOSTNAME = "news.rthk.hk";

export const RTHK_NEWS_SOURCE_DEFINITION: NewsSourceDefinition = {
  label: "RTHK",
  description: "RTHK Chinese latest news",
  latestNewsUrl: LATEST_NEWS_URL,
  contentSelector: ".itemFullText, .itemIntroText, article, main",
  ignoredSelectors: [],
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

function parseRthkPublicationDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) HKT (\d{2}):(\d{2})$/.exec(cleanText(value));

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute));
}

export class RthkNewsHandler implements NewsSourceHandler {
  public readonly source: NewsSource = "rthk";
  public readonly definition = RTHK_NEWS_SOURCE_DEFINITION;

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
