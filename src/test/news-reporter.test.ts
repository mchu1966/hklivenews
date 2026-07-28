import * as assert from "assert";
import { formatScrapedNewsContext, MAX_SCRAPED_NEWS_CONTEXT_LENGTH } from "../news-reporter";

suite("News reporter", () => {
  test("describes an empty scraped-news list", () => {
    const context = formatScrapedNewsContext([]);

    assert.match(context, /No current scraped articles are available/i);
    assert.match(context, /refresh HK Live News/i);
  });

  test("formats articles from multiple sources with publication times and URLs", () => {
    const context = formatScrapedNewsContext([
      {
        title: "RTHK headline",
        url: "https://news.rthk.hk/article",
        source: "rthk",
        publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
      },
      {
        title: "Now News headline",
        url: "https://news.now.com/article",
        source: "now",
        publishedAt: Date.parse("2026-07-22T13:00:00+08:00"),
      },
    ]);

    assert.match(context, /"source":"RTHK"/);
    assert.match(context, /"source":"Now News"/);
    assert.match(context, /"publishedAt":"2026-07-22 12:34 HKT"/);
    assert.match(context, /"url":"https:\/\/news\.now\.com\/article"/);
    assert.doesNotMatch(context, /"citation":/);
  });

  test("includes already-fetched text article content", () => {
    const context = formatScrapedNewsContext([
      {
        title: "Detailed headline",
        url: "https://example.com/article",
        source: "rthk",
        publishedAt: 0,
        content: {
          blocks: [
            { type: "text", text: "First paragraph." },
            { type: "image", url: "https://example.com/image.jpg", alt: "Image" },
            { type: "text", text: "Second paragraph." },
          ],
        },
      },
    ]);

    assert.match(context, /"content":"First paragraph\. Second paragraph\."/);
    assert.doesNotMatch(context, /image\.jpg/);
  });

  test("keeps the structured context within its size limit", () => {
    const context = formatScrapedNewsContext(
      Array.from({ length: 50 }, (_, index) => ({
        title: `Headline ${index} ${"x".repeat(1_000)}`,
        url: `https://example.com/articles/${index}/${"y".repeat(1_000)}`,
        source: "now" as const,
        publishedAt: index,
        content: { blocks: [{ type: "text" as const, text: "z".repeat(5_000) }] },
      })),
    );

    assert.ok(context.length <= MAX_SCRAPED_NEWS_CONTEXT_LENGTH);
    assert.match(context, /"truncated":true/);
  });

  test("omits content when it is absent or contains no text blocks", () => {
    const context = formatScrapedNewsContext([
      {
        title: "No content",
        url: "https://example.com/no-content",
        source: "rthk",
        publishedAt: 0,
      },
      {
        title: "Media only",
        url: "https://example.com/media-only",
        source: "now",
        publishedAt: 1,
        content: {
          blocks: [{ type: "image", url: "https://example.com/image.jpg", alt: "Image" }],
        },
      },
    ]);

    assert.doesNotMatch(context, /"content":/);
    assert.match(context, /"headline":"No content"/);
    assert.match(context, /"headline":"Media only"/);
  });
});
