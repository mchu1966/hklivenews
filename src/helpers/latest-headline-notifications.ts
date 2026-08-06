import type { NewsArticle } from "../models/news-models";

export interface LatestHeadlineObservation {
  readonly latestHeadlineUrl: string | undefined;
  readonly articleToNotify: NewsArticle | undefined;
}

export function observeLatestHeadline(
  previousLatestHeadlineUrl: string | undefined,
  articles: readonly NewsArticle[],
  shouldNotify: boolean,
  shouldObserve = true,
): LatestHeadlineObservation {
  const latestArticle = articles[0];

  if (!latestArticle || !shouldObserve) {
    return { latestHeadlineUrl: previousLatestHeadlineUrl, articleToNotify: undefined };
  }

  return {
    latestHeadlineUrl: latestArticle.url,
    articleToNotify:
      previousLatestHeadlineUrl && previousLatestHeadlineUrl !== latestArticle.url && shouldNotify
        ? latestArticle
        : undefined,
  };
}

export function getLocalDayKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isSnoozedToday(snoozedDay: string | undefined, now: Date): boolean {
  return snoozedDay === getLocalDayKey(now);
}
