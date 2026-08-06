import type { NewsArticle, NewsArticleContent, NewsLink } from "../models/news-models";
import type { NewsSource } from "../news-formatters";
import { cleanText } from "./news-helpers";

export const MAX_ARTICLES = 50;

export function toNewsArticles(
  links: readonly NewsLink[],
  source: NewsSource,
  toArticleUrl: (value: string) => string | undefined,
): readonly NewsArticle[] {
  const articles: NewsArticle[] = [];

  for (const link of links) {
    const url = toArticleUrl(link.href);
    const title = cleanText(link.title);

    if (
      url &&
      title &&
      Number.isFinite(link.publishedAt) &&
      !articles.some((article) => article.url === url)
    ) {
      articles.push({ title, url, source, publishedAt: link.publishedAt });
    }
  }

  return articles;
}

export function sortNewsArticlesByPublicationDate(articles: readonly NewsArticle[]): readonly NewsArticle[] {
  return [...articles]
    .filter(
      (article, index, allArticles) => allArticles.findIndex((item) => item.url === article.url) === index,
    )
    .sort((first, second) => second.publishedAt - first.publishedAt);
}

export function mergeNewsArticlesByPublicationDate(articles: readonly NewsArticle[]): readonly NewsArticle[] {
  return sortNewsArticlesByPublicationDate(articles).slice(0, MAX_ARTICLES);
}

export function applyCachedArticleContent(
  articles: readonly NewsArticle[],
  articleContentsByUrl: ReadonlyMap<string, NewsArticleContent>,
): readonly NewsArticle[] {
  return articles.map((article) => {
    const content = articleContentsByUrl.get(article.url);

    return content ? { ...article, content } : article;
  });
}
