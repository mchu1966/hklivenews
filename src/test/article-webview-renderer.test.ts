import * as assert from "assert";
import { renderArticleWebview } from "../renderers/article-webview-renderer";

suite("Article webview renderer", () => {
  test("escapes untrusted values and restricts images to referenced origins", () => {
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
    assert.ok(html.includes("img-src https://media.example.com"));
    assert.ok(!html.includes("<video"));
    assert.ok(!html.includes("media-src"));
  });
});
