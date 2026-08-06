import * as assert from "assert";
import {
  getLocalDayKey,
  isSnoozedToday,
  observeLatestHeadline,
} from "../helpers/latest-headline-notifications";
import type { NewsArticle } from "../models/news-models";

const firstArticle: NewsArticle = {
  title: "First headline",
  url: "https://example.com/first",
  source: "rthk",
  publishedAt: 2,
};

const secondArticle: NewsArticle = {
  title: "Second headline",
  url: "https://example.com/second",
  source: "rthk",
  publishedAt: 1,
};

suite("Latest Headline Notification Test Suite", () => {
  test("establishes a baseline without notifying on the first successful refresh", () => {
    assert.deepStrictEqual(observeLatestHeadline(undefined, [firstArticle, secondArticle], true), {
      latestHeadlineUrl: firstArticle.url,
      articleToNotify: undefined,
    });
  });

  test("notifies only when the latest headline changes and notifications are allowed", () => {
    assert.deepStrictEqual(observeLatestHeadline(secondArticle.url, [firstArticle, secondArticle], true), {
      latestHeadlineUrl: firstArticle.url,
      articleToNotify: firstArticle,
    });
  });

  test("updates the baseline without notifying when notifications are disabled or snoozed", () => {
    assert.deepStrictEqual(observeLatestHeadline(secondArticle.url, [firstArticle, secondArticle], false), {
      latestHeadlineUrl: firstArticle.url,
      articleToNotify: undefined,
    });
  });

  test("preserves the baseline when a successful refresh has no articles", () => {
    assert.deepStrictEqual(observeLatestHeadline(firstArticle.url, [], true), {
      latestHeadlineUrl: firstArticle.url,
      articleToNotify: undefined,
    });
  });

  test("preserves the baseline when a source fails during refresh", () => {
    assert.deepStrictEqual(observeLatestHeadline(secondArticle.url, [firstArticle], true, false), {
      latestHeadlineUrl: secondArticle.url,
      articleToNotify: undefined,
    });
  });

  test("builds a padded local calendar day key", () => {
    const date = new Date(2026, 0, 2, 0, 0, 0);

    assert.strictEqual(getLocalDayKey(date), "2026-01-02");
  });

  test("expires a snooze on the next local calendar day", () => {
    assert.strictEqual(isSnoozedToday("2026-08-06", new Date(2026, 7, 6, 23, 59, 0)), true);
    assert.strictEqual(isSnoozedToday("2026-08-06", new Date(2026, 7, 7, 0, 0, 0)), false);
  });
});
