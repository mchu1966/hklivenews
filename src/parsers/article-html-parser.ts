import { load } from "cheerio";
import { cleanText, extractTextPreservingLineBreaks, toSafeMediaUrl } from "../helpers/news-helpers";
import type { NewsArticleBlock, NewsArticleContent } from "../models/news-models";

const MAX_ARTICLE_CONTENT_LENGTH = 6_000;
const DIRECT_VIDEO_FILE_EXTENSIONS = /\.(mp4|webm|ogv|ogg)$/i;

export interface ArticleHtmlExtractionPolicy {
  readonly contentSelector: string;
  readonly ignoredSelectors: readonly string[];
}

function isDirectVideoUrl(url: string, mimeType: string | undefined): boolean {
  return (
    DIRECT_VIDEO_FILE_EXTENSIONS.test(new URL(url).pathname) ||
    /^video\/(mp4|webm|ogg)$/i.test(mimeType ?? "")
  );
}

export function parseArticleContentFromHtml(
  html: string,
  articleUrl: string,
  policy: ArticleHtmlExtractionPolicy,
): NewsArticleContent {
  const $ = load(html);
  const articleRoot = $(policy.contentSelector).first();
  const blocks: NewsArticleBlock[] = [];

  if (policy.ignoredSelectors.length > 0) {
    articleRoot.find(policy.ignoredSelectors.join(", ")).remove();
  }

  articleRoot.find("script, style, noscript, iframe, object, embed, template").remove();
  articleRoot.find("p, h1, h2, h3, h4, li, img, video").each((_, element) => {
    const node = $(element);
    const tagName = element.tagName.toLowerCase();

    if (tagName === "img") {
      const url = toSafeMediaUrl(node.attr("src") ?? node.attr("data-src"), articleUrl);

      if (url) {
        blocks.push({ type: "image", url, alt: cleanText(node.attr("alt") ?? "") });
      }
      return;
    }

    if (tagName === "video") {
      const videoSource = node.attr("src")
        ? node
        : node
            .find("source")
            .filter((_, sourceElement) => Boolean($(sourceElement).attr("src")))
            .first();
      const url = toSafeMediaUrl(videoSource.attr("src"), articleUrl);
      const mimeType = videoSource.attr("type");

      if (url && isDirectVideoUrl(url, mimeType)) {
        blocks.push({ type: "video", url, mimeType });
      }
      return;
    }

    if (node.parents("p, h1, h2, h3, h4, li").length === 0) {
      const articleText = extractTextPreservingLineBreaks(node.html() ?? "").slice(
        0,
        MAX_ARTICLE_CONTENT_LENGTH,
      );

      if (articleText) {
        blocks.push({ type: "text", text: articleText });
      }
    }
  });

  if (blocks.length === 0) {
    const articleText = extractTextPreservingLineBreaks(articleRoot.html() ?? "").slice(
      0,
      MAX_ARTICLE_CONTENT_LENGTH,
    );

    if (articleText) {
      blocks.push({ type: "text", text: articleText });
    }
  }

  return { blocks };
}
