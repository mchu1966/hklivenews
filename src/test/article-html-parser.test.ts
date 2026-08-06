import * as assert from "assert";
import { parseArticleContentFromHtml } from "../parsers/article-html-parser";

suite("Article HTML parser", () => {
  test("extracts safe blocks and applies source-specific exclusions", () => {
    const content = parseArticleContentFromHtml(
      `
        <main>
          <p>First line<br>Second line</p>
          <img src="/images/article.jpg" alt="Article image" onerror="alert('unsafe')">
          <video src="/media/article.mp4"></video>
          <div class="related"><p>Excluded content</p></div>
          <img src="javascript:alert('unsafe')" alt="Unsafe image">
          <iframe src="https://example.com/player"></iframe>
        </main>
      `,
      "https://news.now.com/home/local/player?newsId=655631",
      { contentSelector: "main", ignoredSelectors: [".related"] },
    );

    assert.deepStrictEqual(content, {
      blocks: [
        { type: "text", text: "First line\nSecond line" },
        { type: "image", url: "https://news.now.com/images/article.jpg", alt: "Article image" },
        { type: "video", url: "https://news.now.com/media/article.mp4", mimeType: undefined },
      ],
    });
  });
});
