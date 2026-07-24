import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  extractArticleContentFromHtml,
  formatHeadline,
  formatNewsPosition,
  formatPublishedAt,
  getHeadlineQuickPickItems,
  getNewsSourcesConfigurationTarget,
  getNextNewsIndex,
  getSelectedNewsSources,
  getSourceQuickPickItems,
  mergeNewsArticlesByPublicationDate,
  parseNewsArticlesFromHtml,
  parseNowNewsArticlesFromJson,
  toNowArticleUrl,
  toRthkArticleUrl,
  truncateHeadline,
} from "../extension";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  test("accepts only RTHK Chinese K2 article links", () => {
    assert.strictEqual(
      toRthkArticleUrl("/rthk/ch/component/k2/1863167-20260722.htm?spTabChangeable=0"),
      "https://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm?spTabChangeable=0",
    );
    assert.strictEqual(
      toRthkArticleUrl("http://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm"),
      undefined,
    );
    assert.strictEqual(toRthkArticleUrl("https://example.com/article.htm"), undefined);
  });

  test("accepts only Now News local article links", () => {
    assert.strictEqual(
      toNowArticleUrl("/home/local/player?newsId=655631"),
      "https://news.now.com/home/local/player?newsId=655631",
    );
    assert.strictEqual(toNowArticleUrl("https://news.now.com/home/local/player?newsId=abc"), undefined);
    assert.strictEqual(toNowArticleUrl("https://example.com/home/local/player?newsId=655631"), undefined);
  });

  test("parses validated RTHK headlines from server-rendered HTML", () => {
    const articles = parseNewsArticlesFromHtml(
      `
        <div class="ns2-inner">
          <a href="/rthk/ch/component/k2/1863167-20260722.htm"> 第一則 RTHK 新聞 </a>
          <div class="ns2-created">2026-07-22 HKT 12:34</div>
        </div>
        <div class="ns2-inner">
          <a href="/rthk/ch/component/k2/1863167-20260722.htm"> 重複新聞 </a>
          <div class="ns2-created">2026-07-22 HKT 12:33</div>
        </div>
        <a href="/rthk/ch/latest-news.htm"> 非文章連結 </a>
      `,
      "rthk",
    );

    assert.deepStrictEqual(articles, [
      {
        title: "第一則 RTHK 新聞",
        url: "https://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm",
        source: "rthk",
        publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
      },
    ]);
  });

  test("parses validated Now News headlines and publication dates from its list API", () => {
    const articles = parseNowNewsArticlesFromJson(
      JSON.stringify([
        { newsId: "655631", title: " 第一則 Now 新聞 ", publishDate: 1_784_852_800_000 },
        { newsId: "not-a-number", title: "非文章連結", publishDate: 1_784_852_800_001 },
      ]),
    );

    assert.deepStrictEqual(articles, [
      {
        title: "第一則 Now 新聞",
        url: "https://news.now.com/home/local/player?newsId=655631",
        source: "now",
        publishedAt: 1_784_852_800_000,
      },
    ]);
  });

  test("sorts merged sources by publication date before limiting the article list", () => {
    const articles = mergeNewsArticlesByPublicationDate([
      {
        title: "Older RTHK news",
        url: "https://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm",
        source: "rthk",
        publishedAt: 1_000,
      },
      {
        title: "Newest Now news",
        url: "https://news.now.com/home/local/player?newsId=655631",
        source: "now",
        publishedAt: 3_000,
      },
      {
        title: "Middle Now news",
        url: "https://news.now.com/home/local/player?newsId=655632",
        source: "now",
        publishedAt: 2_000,
      },
    ]);

    assert.deepStrictEqual(
      articles.map((article) => article.title),
      ["Newest Now news", "Middle Now news", "Older RTHK news"],
    );
  });

  test("keeps the 50 most recently published articles across all sources", () => {
    const articles = mergeNewsArticlesByPublicationDate(
      Array.from({ length: 51 }, (_, index) => ({
        title: `News ${index}`,
        url: `https://news.now.com/home/local/player?newsId=${index + 1}`,
        source: "now" as const,
        publishedAt: index,
      })),
    );

    assert.strictEqual(articles.length, 50);
    assert.strictEqual(articles[0]?.title, "News 50");
    assert.strictEqual(articles.at(-1)?.title, "News 1");
  });

  test("extracts and normalizes server-rendered article content", () => {
    assert.strictEqual(
      extractArticleContentFromHtml("<article> 第一段\n 第二段 </article>", "now"),
      "第一段 第二段",
    );
    assert.strictEqual(extractArticleContentFromHtml("<main></main>", "rthk"), "");
  });

  test("formats the one-based current news position", () => {
    assert.strictEqual(formatNewsPosition(0, 12), "1/12");
    assert.strictEqual(formatNewsPosition(11, 12), "12/12");
  });

  test("formats publication dates in Hong Kong time for article tooltips", () => {
    assert.strictEqual(formatPublishedAt(Date.parse("2026-07-22T12:34:00+08:00")), "2026-07-22 12:34 HKT");
  });

  test("truncates long status-bar headlines with an ellipsis", () => {
    assert.strictEqual(truncateHeadline("香港新聞", 8), "香港新聞");
    assert.strictEqual(truncateHeadline("香港今日最新新聞標題", 8), "香港今日最...");
  });

  test("pads short status-bar headlines to the configured width", () => {
    assert.strictEqual(formatHeadline("香港新聞", 8), "香港新聞\u00a0\u00a0\u00a0\u00a0");
    assert.strictEqual(formatHeadline("香港今日最新新聞標題", 8), "香港今日最...");
  });

  test("builds headline choices with their source and original position", () => {
    assert.deepStrictEqual(
      getHeadlineQuickPickItems([
        { title: "第一則新聞", source: "rthk" },
        { title: "第二則新聞", source: "now" },
      ]),
      [
        { label: "第一則新聞", description: "RTHK", articleIndex: 0 },
        { label: "第二則新聞", description: "Now News", articleIndex: 1 },
      ],
    );
  });

  test("wraps automatic headline rotation to the first article", () => {
    assert.strictEqual(getNextNewsIndex(0, 3), 1);
    assert.strictEqual(getNextNewsIndex(2, 3), 0);
  });

  test("selects each valid configured source once and defaults to RTHK", () => {
    assert.deepStrictEqual(getSelectedNewsSources(["now", "rthk", "now", "unknown"]), ["now", "rthk"]);
    assert.deepStrictEqual(getSelectedNewsSources([]), ["rthk"]);
    assert.deepStrictEqual(getSelectedNewsSources("rthk"), ["rthk"]);
  });

  test("builds checkbox items for every available news source", () => {
    assert.deepStrictEqual(getSourceQuickPickItems(["now"]), [
      { label: "RTHK", description: "RTHK Chinese latest news", source: "rthk", picked: false },
      { label: "Now News", description: "Now News local news", source: "now", picked: true },
    ]);
  });

  test("updates the active configuration scope for news sources", () => {
    assert.strictEqual(getNewsSourcesConfigurationTarget(undefined), vscode.ConfigurationTarget.Global);
    assert.strictEqual(getNewsSourcesConfigurationTarget(["rthk"]), vscode.ConfigurationTarget.Workspace);
  });
});
