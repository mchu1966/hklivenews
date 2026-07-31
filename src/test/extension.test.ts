import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  applyCachedArticleContent,
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
  renderArticleWebview,
  sortNewsArticlesByPublicationDate,
  toNowArticleUrl,
  toRthkArticleUrl,
  truncateHeadline,
} from "../extension";
import { groupArticlesBySource, NewsTreeProvider } from "../news-view";

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

  test("keeps every source article available for the sidebar before applying the status bar limit", () => {
    const sourceArticles = ["rthk", "now"] as const;
    const articles = sourceArticles.flatMap((source) =>
      Array.from({ length: 35 }, (_, index) => ({
        title: `${source} news ${index + 1}`,
        url: `https://example.com/${source}/${index + 1}`,
        source,
        publishedAt: index,
      })),
    );

    assert.strictEqual(sortNewsArticlesByPublicationDate(articles).length, 70);
    assert.strictEqual(mergeNewsArticlesByPublicationDate(articles).length, 50);
  });

  test("keeps downloaded article content when refreshing matching headlines", () => {
    const cachedContent = { blocks: [{ type: "text" as const, text: "Cached details" }] };
    const articles = applyCachedArticleContent(
      [
        {
          title: "Updated headline",
          url: "https://news.now.com/home/local/player?newsId=655631",
          source: "now" as const,
          publishedAt: 1_784_852_800_000,
        },
      ],
      new Map([["https://news.now.com/home/local/player?newsId=655631", cachedContent]]),
    );

    assert.deepStrictEqual(articles[0]?.content, cachedContent);
  });

  test("extracts safe text, image, and direct-video blocks from article HTML", () => {
    assert.deepStrictEqual(
      extractArticleContentFromHtml(
        `
          <article>
            <p> 第一段\n 文字 </p>
            <script>window.addEventListener('DOMContentLoaded', () => alert('unsafe'))</script>
            <img src="/images/news.jpg" alt="新聞圖片" onerror="alert('unsafe')">
            <img src="javascript:alert('unsafe')" alt="不安全圖片">
            <video controls src="/media/news.mp4"><source src="/media/fallback.webm" type="video/webm"></video>
            <video src="https://media.example.com/live.m3u8"></video>
            <iframe src="https://example.com/player"></iframe>
          </article>
        `,
        "now",
        "https://news.now.com/home/local/player?newsId=655882",
      ),
      {
        blocks: [
          { type: "text", text: "第一段 文字" },
          { type: "image", url: "https://news.now.com/images/news.jpg", alt: "新聞圖片" },
          { type: "video", url: "https://news.now.com/media/news.mp4", mimeType: undefined },
        ],
      },
    );
    assert.deepStrictEqual(extractArticleContentFromHtml("<main></main>", "rthk"), { blocks: [] });
  });

  test("excludes the related-news section from Now News article details", () => {
    assert.deepStrictEqual(
      extractArticleContentFromHtml(
        `
          <main>
            <article>
              <p>這是新聞正文。</p>
            </article>
            <div class="relatedNewsWrap">
              <ul class="relatedNews">
                <li>
                  <img src="/images/related-news.jpg" alt="相關新聞圖片">
                  <a href="/home/local/player?newsId=655632">另一則新聞</a>
                </li>
              </ul>
            </div>
          </main>
        `,
        "now",
        "https://news.now.com/home/local/player?newsId=655631",
      ),
      { blocks: [{ type: "text", text: "這是新聞正文。" }] },
    );
  });

  test("preserves <br> line breaks while collapsing other whitespace", () => {
    assert.deepStrictEqual(
      extractArticleContentFromHtml(
        `
          <main>
            <p>這是第一段。<br>這是第二段。<br><br>這是第三段。</p>
          </main>
        `,
        "rthk",
        "https://news.rthk.hk/rthk/ch/component/k2/1234567-20260731.htm",
      ),
      { blocks: [{ type: "text", text: "這是第一段。\n這是第二段。\n\n這是第三段。" }] },
    );
    assert.deepStrictEqual(
      extractArticleContentFromHtml(
        `
          <div class="itemFullText">
            第一行文字<br/>
            第二行文字<br/>
            第三行文字
          </div>
        `,
        "rthk",
        "https://news.rthk.hk/rthk/ch/component/k2/1234567-20260731.htm",
      ),
      { blocks: [{ type: "text", text: "第一行文字\n第二行文字\n第三行文字" }] },
    );
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

  test("groups tree headlines into every selected source section", () => {
    assert.deepStrictEqual(
      groupArticlesBySource(
        [
          { title: "RTHK headline", url: "https://example.com/rthk", source: "rthk", publishedAt: 1 },
          { title: "Now headline", url: "https://example.com/now", source: "now", publishedAt: 2 },
        ],
        ["rthk", "now"],
      ),
      [
        {
          source: "rthk",
          articles: [
            { title: "RTHK headline", url: "https://example.com/rthk", source: "rthk", publishedAt: 1 },
          ],
        },
        {
          source: "now",
          articles: [
            { title: "Now headline", url: "https://example.com/now", source: "now", publishedAt: 2 },
          ],
        },
      ],
    );
  });

  test("limits each sidebar source section to 30 headlines", () => {
    const groupedArticles = groupArticlesBySource(
      [
        ...Array.from({ length: 35 }, (_, index) => ({
          title: `RTHK headline ${index + 1}`,
          url: `https://example.com/rthk/${index + 1}`,
          source: "rthk" as const,
          publishedAt: index,
        })),
        ...Array.from({ length: 35 }, (_, index) => ({
          title: `Now headline ${index + 1}`,
          url: `https://example.com/now/${index + 1}`,
          source: "now" as const,
          publishedAt: index,
        })),
      ],
      ["rthk", "now"],
    );

    assert.strictEqual(groupedArticles[0]?.articles.length, 30);
    assert.strictEqual(groupedArticles[1]?.articles.length, 30);
  });

  test("assigns stable IDs to source sections and article items", () => {
    const provider = new NewsTreeProvider();
    const sourceItem = provider.getTreeItem({ source: "rthk", articles: [] });
    const articleItem = provider.getTreeItem({
      title: "RTHK headline",
      url: "https://example.com/rthk",
      source: "rthk",
      publishedAt: 1,
    });

    assert.strictEqual(sourceItem.id, "source:rthk");
    assert.strictEqual(articleItem.id, "article:https://example.com/rthk");
    provider.dispose();
  });

  test("renders safe image previews and links videos to the original article", () => {
    const html = renderArticleWebview(
      {
        title: "<strong>Headline</strong>",
        url: "https://example.com/article?title=<headline>",
        source: "rthk",
        publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
      },
      {
        blocks: [
          { type: "text", text: "Article <script>alert('unsafe')</script>" },
          { type: "image", url: "https://media.example.com/article.jpg", alt: "<image>" },
          { type: "video", url: "https://media.example.com/article.mp4", mimeType: "video/mp4" },
        ],
      },
    );

    assert.ok(html.includes("&lt;strong&gt;Headline&lt;/strong&gt;"));
    assert.ok(html.includes("Article &lt;script&gt;alert(&#39;unsafe&#39;)&lt;/script&gt;"));
    assert.ok(html.includes('<img src="https://media.example.com/article.jpg" alt="&lt;image&gt;">'));
    assert.ok(
      html.includes(
        'href="https://example.com/article?title=&lt;headline&gt;" target="_blank" rel="noreferrer">View original video</a>',
      ),
    );
    assert.ok(html.includes("img-src https://media.example.com"));
    assert.ok(!html.includes("<video"));
    assert.ok(!html.includes("media-src"));
    assert.ok(!html.includes("window.addEventListener"));
  });
});
