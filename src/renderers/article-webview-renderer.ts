import type { ImageArticleBlock, NewsArticle, NewsArticleContent } from "../models/news-models";
import { formatPublishedAt, getSourceLabel } from "../news-formatters";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return entities[character] ?? character;
  });
}

function getImageOrigins(content: NewsArticleContent): string {
  return [
    ...new Set(
      content.blocks
        .filter((block): block is ImageArticleBlock => block.type === "image")
        .map((block) => new URL(block.url).origin),
    ),
  ].join(" ");
}

function renderArticleBlocks(article: NewsArticle, content: NewsArticleContent): string {
  if (content.blocks.length === 0) {
    return "<p>No article text was found.</p>";
  }

  return content.blocks
    .map((block) => {
      if (block.type === "text") {
        return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      }

      if (block.type === "image") {
        return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}">`;
      }

      return `<p><a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">View original video</a></p>`;
    })
    .join("\n");
}

export function renderArticleWebview(article: NewsArticle, content: NewsArticleContent): string {
  const source = getSourceLabel(article.source);
  const imageOrigins = getImageOrigins(content) || "'none'";

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${imageOrigins};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(article.title)}</title>
  <style>
    body { color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); line-height: 1.7; margin: 0 auto; max-width: 760px; padding: 32px; }
    h1 { font-size: 1.5em; line-height: 1.35; margin: 0 0 12px; }
    .metadata { color: var(--vscode-descriptionForeground); margin: 0 0 28px; }
    .content p { white-space: pre-wrap; }
    .content img { display: block; height: auto; margin: 20px 0; max-width: 100%; }
    a { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <h1>${escapeHtml(article.title)}</h1>
  <p class="metadata">${escapeHtml(source)} · ${escapeHtml(formatPublishedAt(article.publishedAt))}</p>
  <div class="content">${renderArticleBlocks(article, content)}</div>
  <p><a href="${escapeHtml(article.url)}">Open original article</a></p>
</body>
</html>`;
}
