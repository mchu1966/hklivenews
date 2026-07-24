// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { load } from "cheerio";
import * as vscode from "vscode";
import { formatPublishedAt, getNextNewsIndex } from "./news-formatters";
import { NewsStatusBar } from "./news-status-bar";
import { NewsTreeProvider } from "./news-view";

export {
  formatHeadline,
  formatNewsPosition,
  formatPublishedAt,
  getNextNewsIndex,
  truncateHeadline,
} from "./news-formatters";

const LATEST_NEWS_URL = "https://news.rthk.hk/rthk/ch/latest-news.htm";
const NOW_NEWS_LIST_URL =
  "https://newsapi1.now.com/pccw-news-api/api/getNewsListv2?category=119&pageNo=1&pageSize=50";
const RTHK_HOSTNAME = "news.rthk.hk";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NEXT_INTERVAL_MS = 60 * 1000;
const MAX_ARTICLES = 50;
const MAX_ARTICLE_CONTENT_LENGTH = 6_000;
const FETCH_TIMEOUT_MS = 30_000;
const NEWS_SOURCES = ["rthk", "now"] as const;
const DIRECT_VIDEO_FILE_EXTENSIONS = /\.(mp4|webm|ogv|ogg)$/i;

type NewsSource = (typeof NEWS_SOURCES)[number];

export interface NewsArticle {
  readonly title: string;
  readonly url: string;
  readonly source: NewsSource;
  readonly publishedAt: number;
  readonly content?: NewsArticleContent;
}

interface TextArticleBlock {
  readonly type: "text";
  readonly text: string;
}

interface ImageArticleBlock {
  readonly type: "image";
  readonly url: string;
  readonly alt: string;
}

interface VideoArticleBlock {
  readonly type: "video";
  readonly url: string;
  readonly mimeType: string | undefined;
}

type NewsArticleBlock = TextArticleBlock | ImageArticleBlock | VideoArticleBlock;

export interface NewsArticleContent {
  readonly blocks: readonly NewsArticleBlock[];
}

export interface HeadlineQuickPickItem {
  readonly label: string;
  readonly description: string;
  readonly articleIndex: number;
}

export interface SourceQuickPickItem {
  readonly label: string;
  readonly description: string;
  readonly source: NewsSource;
  readonly picked: boolean;
}

interface NewsLink {
  readonly title: string;
  readonly href: string;
  readonly publishedAt: number;
}

interface NewsSourceDefinition {
  readonly label: string;
  readonly description: string;
  readonly latestNewsUrl: string;
  readonly articleLinkSelector: string;
  readonly contentSelector: string;
  readonly toArticleUrl: (value: string) => string | undefined;
}

export function toRthkArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(value, LATEST_NEWS_URL);
    const isArticle = /^\/rthk\/ch\/component\/k2\/\d+-\d{8}\.htm$/.test(url.pathname);

    return url.protocol === "https:" && url.hostname === RTHK_HOSTNAME && isArticle
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function toNowArticleUrl(value: string): string | undefined {
  try {
    const url = new URL(value, "https://news.now.com/");
    const newsId = url.searchParams.get("newsId");
    const isArticle = /^\/home\/local\/player$/.test(url.pathname) && /^\d+$/.test(newsId ?? "");

    return url.protocol === "https:" && url.hostname === "news.now.com" && isArticle
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

const NEWS_SOURCE_DEFINITIONS: Readonly<Record<NewsSource, NewsSourceDefinition>> = {
  rthk: {
    label: "RTHK",
    description: "RTHK Chinese latest news",
    latestNewsUrl: LATEST_NEWS_URL,
    articleLinkSelector: 'a[href*="/rthk/ch/component/k2/"]',
    contentSelector: ".itemFullText, .itemIntroText, article, main",
    toArticleUrl: toRthkArticleUrl,
  },
  now: {
    label: "Now News",
    description: "Now News local news",
    latestNewsUrl: NOW_NEWS_LIST_URL,
    articleLinkSelector: 'a[href*="/home/local/player?newsId="]',
    contentSelector: "article, main",
    toArticleUrl: toNowArticleUrl,
  },
};

export function getSelectedNewsSources(value: unknown): readonly NewsSource[] {
  if (!Array.isArray(value)) {
    return ["rthk"];
  }

  const selectedSources = value.filter(
    (source): source is NewsSource =>
      typeof source === "string" && NEWS_SOURCES.includes(source as NewsSource),
  );

  return selectedSources.length > 0 ? [...new Set(selectedSources)] : ["rthk"];
}

export function getSourceQuickPickItems(
  selectedSources: readonly NewsSource[],
): readonly SourceQuickPickItem[] {
  return NEWS_SOURCES.map((source) => ({
    label: NEWS_SOURCE_DEFINITIONS[source].label,
    description: NEWS_SOURCE_DEFINITIONS[source].description,
    source,
    picked: selectedSources.includes(source),
  }));
}

export function getNewsSourcesConfigurationTarget(workspaceValue: unknown): vscode.ConfigurationTarget {
  return workspaceValue === undefined
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
}

export function getHeadlineQuickPickItems(
  articles: readonly Pick<NewsArticle, "title" | "source">[],
): readonly HeadlineQuickPickItem[] {
  return articles.map((article, articleIndex) => ({
    label: article.title,
    description: NEWS_SOURCE_DEFINITIONS[article.source].label,
    articleIndex,
  }));
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

function toNewsArticles(
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

function parseRthkPublicationDate(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) HKT (\d{2}):(\d{2})$/.exec(cleanText(value));

  if (!match) {
    return Number.NaN;
  }

  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute));
}

export function parseNewsArticlesFromHtml(html: string, source: NewsSource): readonly NewsArticle[] {
  const definition = NEWS_SOURCE_DEFINITIONS[source];
  const $ = load(html);
  const links = $(definition.articleLinkSelector)
    .map((_, anchor) => ({
      title: $(anchor).text(),
      href: $(anchor).attr("href") ?? "",
      publishedAt: parseRthkPublicationDate($(anchor).closest(".ns2-inner").find(".ns2-created").text()),
    }))
    .get();

  return toNewsArticles(links, source, definition.toArticleUrl);
}

function getNowNewsItems(data: unknown): readonly unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (typeof data === "object" && data !== null && "newsList" in data && Array.isArray(data.newsList)) {
    return data.newsList;
  }

  return [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export function parseNowNewsArticlesFromJson(json: string): readonly NewsArticle[] {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Now News returned invalid list data.");
  }

  const items = getNowNewsItems(data);
  const links = items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const { newsId, title, publishDate } = item;

    return typeof newsId === "string" && typeof title === "string" && typeof publishDate === "number"
      ? [{ title, href: `/home/local/player?newsId=${newsId}`, publishedAt: publishDate }]
      : [];
  });

  return toNewsArticles(links, "now", toNowArticleUrl);
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

function toSafeMediaUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value, baseUrl);

    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isDirectVideoUrl(url: string, mimeType: string | undefined): boolean {
  return (
    DIRECT_VIDEO_FILE_EXTENSIONS.test(new URL(url).pathname) ||
    /^video\/(mp4|webm|ogg)$/i.test(mimeType ?? "")
  );
}

function getTextArticleBlock(text: string): TextArticleBlock | undefined {
  const normalizedText = cleanText(text).slice(0, MAX_ARTICLE_CONTENT_LENGTH);

  return normalizedText ? { type: "text", text: normalizedText } : undefined;
}

function createTextArticleContent(text: string): NewsArticleContent {
  return { blocks: [{ type: "text", text }] };
}

function getArticleContentSummary(content: NewsArticleContent): string {
  return content.blocks
    .filter((block): block is TextArticleBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ");
}

export function extractArticleContentFromHtml(
  html: string,
  source: NewsSource,
  articleUrl = NEWS_SOURCE_DEFINITIONS[source].latestNewsUrl,
): NewsArticleContent {
  const $ = load(html);
  const articleRoot = $(NEWS_SOURCE_DEFINITIONS[source].contentSelector).first();
  const blocks: NewsArticleBlock[] = [];

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
      const source = node.attr("src")
        ? node
        : node
            .find("source")
            .filter((_, sourceElement) => Boolean($(sourceElement).attr("src")))
            .first();
      const url = toSafeMediaUrl(source.attr("src"), articleUrl);
      const mimeType = source.attr("type");

      if (url && isDirectVideoUrl(url, mimeType)) {
        blocks.push({ type: "video", url, mimeType });
      }
      return;
    }

    if (node.parents("p, h1, h2, h3, h4, li").length === 0) {
      const block = getTextArticleBlock(node.text());

      if (block) {
        blocks.push(block);
      }
    }
  });

  if (blocks.length === 0) {
    const block = getTextArticleBlock(articleRoot.text());

    if (block) {
      blocks.push(block);
    }
  }

  return { blocks };
}

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
        return `<p>${escapeHtml(block.text)}</p>`;
      }

      if (block.type === "image") {
        return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}">`;
      }

      return `<p><a href="${escapeHtml(article.url)}" target="_blank" rel="noreferrer">View original video</a></p>`;
    })
    .join("\n");
}

export function renderArticleWebview(article: NewsArticle, content: NewsArticleContent): string {
  const source = NEWS_SOURCE_DEFINITIONS[article.source].label;
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

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return response.text();
}

class NewsScraper {
  public constructor(
    private readonly source: NewsSource,
    private readonly definition: NewsSourceDefinition,
  ) {}

  public async fetchLatestArticles(): Promise<readonly NewsArticle[]> {
    const latestNews = await fetchHtml(this.definition.latestNewsUrl);

    return this.source === "now"
      ? parseNowNewsArticlesFromJson(latestNews)
      : parseNewsArticlesFromHtml(latestNews, this.source);
  }

  public async fetchArticleContent(articleUrl: string): Promise<NewsArticleContent> {
    const html = await fetchHtml(articleUrl);

    return extractArticleContentFromHtml(html, this.source, articleUrl);
  }
}

class MultiSourceNewsScraper {
  public async fetchLatestArticles(sources: readonly NewsSource[]): Promise<readonly NewsArticle[]> {
    const results = await Promise.allSettled(
      sources.map((source) => new NewsScraper(source, NEWS_SOURCE_DEFINITIONS[source]).fetchLatestArticles()),
    );
    const articles = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

    if (articles.length === 0) {
      const failure = results.find((result) => result.status === "rejected");
      throw new Error(
        failure?.status === "rejected" ? getErrorMessage(failure.reason) : "No articles found.",
      );
    }

    return sortNewsArticlesByPublicationDate(articles);
  }

  public async fetchArticleContent(article: NewsArticle): Promise<NewsArticleContent> {
    return new NewsScraper(article.source, NEWS_SOURCE_DEFINITIONS[article.source]).fetchArticleContent(
      article.url,
    );
  }
}

class HkLiveNewsController implements vscode.Disposable {
  private readonly scraper = new MultiSourceNewsScraper();
  private readonly statusBar = new NewsStatusBar();
  private readonly treeDataProvider: NewsTreeProvider;
  private readonly articleContentsByUrl = new Map<string, NewsArticleContent>();
  private articles: readonly NewsArticle[] = [];
  private sourceArticles: readonly NewsArticle[] = [];
  private currentIndex = 0;
  private refreshTimer: NodeJS.Timeout | undefined;
  private autoNextTimer: NodeJS.Timeout | undefined;
  private isRefreshing = false;
  private isRefreshQueued = false;
  private isLoadingArticle = false;
  private isStopped = false;

  public constructor(treeDataProvider: NewsTreeProvider) {
    this.treeDataProvider = treeDataProvider;
  }

  public async start(showError = true): Promise<void> {
    if (this.refreshTimer) {
      void vscode.window.showInformationMessage("HK News refreshing is already running.");
      return;
    }

    this.isStopped = false;
    this.startRefreshTimer();
    this.startAutomaticRotationTimer();
    await this.refresh(showError);
  }

  public stop(): void {
    if (!this.refreshTimer) {
      void vscode.window.showInformationMessage("HK News refreshing is not running.");
      return;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    this.clearAutoNextTimer();
    this.isStopped = true;
    this.statusBar.showPaused();
    void vscode.window.showInformationMessage("Stopped refreshing HK News.");
  }

  public async refresh(showError: boolean): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.statusBar.showRefreshing();

    try {
      const sources = getSelectedNewsSources(
        vscode.workspace.getConfiguration("hklivenews").get<unknown>("sources"),
      );
      const fetchedSourceArticles = await this.scraper.fetchLatestArticles(sources);

      if (this.isStopped) {
        return;
      }

      if (fetchedSourceArticles.length === 0) {
        throw new Error("The selected sources did not return any current article links.");
      }

      const currentUrl = this.articles[this.currentIndex]?.url;
      const sourceArticles = applyCachedArticleContent(fetchedSourceArticles, this.articleContentsByUrl);
      const articles = mergeNewsArticlesByPublicationDate(sourceArticles);
      const matchingIndex = articles.findIndex((article) => article.url === currentUrl);
      this.articles = articles;
      this.sourceArticles = sourceArticles;
      this.currentIndex = matchingIndex >= 0 ? matchingIndex : 0;
      this.treeDataProvider.setArticles(sourceArticles, sources);
      await this.showCurrentArticle();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.statusBar.showUnavailable(message);

      if (showError) {
        void vscode.window.showErrorMessage(`Unable to refresh HK News: ${message}`);
      }
    } finally {
      this.isRefreshing = false;

      if (this.isRefreshQueued && this.refreshTimer) {
        this.isRefreshQueued = false;
        await this.refresh(true);
      } else {
        this.isRefreshQueued = false;
      }
    }
  }

  public async next(): Promise<void> {
    await this.move(1);
  }

  public async previous(): Promise<void> {
    await this.move(-1);
  }

  public async selectHeadline(): Promise<void> {
    if (this.articles.length === 0) {
      void vscode.window.showInformationMessage("No HK News headlines have been loaded yet.");
      return;
    }

    const selectedHeadline = await vscode.window.showQuickPick(getHeadlineQuickPickItems(this.articles), {
      placeHolder: "Select an HK News headline",
    });

    if (!selectedHeadline) {
      return;
    }

    this.currentIndex = selectedHeadline.articleIndex;
    await this.showCurrentArticle();
  }

  public async configureSources(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("hklivenews");
    const selectedSources = getSelectedNewsSources(configuration.get<unknown>("sources"));
    const selectedItems = await vscode.window.showQuickPick(getSourceQuickPickItems(selectedSources), {
      canPickMany: true,
      placeHolder: "Select one or more HK News sources",
      title: "HK News Sources",
    });

    if (!selectedItems) {
      return;
    }

    if (selectedItems.length === 0) {
      void vscode.window.showInformationMessage("Select at least one HK News source.");
      return;
    }

    await configuration.update(
      "sources",
      selectedItems.map((item) => item.source),
      getNewsSourcesConfigurationTarget(configuration.inspect("sources")?.workspaceValue),
    );
  }

  public async refreshForSourceChange(): Promise<void> {
    if (!this.refreshTimer) {
      return;
    }

    if (this.isRefreshing) {
      this.isRefreshQueued = true;
      return;
    }

    await this.refresh(true);
  }

  public async openCurrentArticle(): Promise<void> {
    const article = this.articles[this.currentIndex];

    if (article) {
      await this.showArticleInWebview(article.url);
    }
  }

  public async showArticleInWebview(articleUrl: string): Promise<void> {
    const article = this.sourceArticles.find((item) => item.url === articleUrl);

    if (!article) {
      void vscode.window.showInformationMessage("This HK News headline is no longer available.");
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "hklivenews.article",
      article.title,
      vscode.ViewColumn.Active,
      { enableScripts: false },
    );
    panel.webview.html = renderArticleWebview(
      article,
      createTextArticleContent("Loading article details..."),
    );

    try {
      const content = article.content ?? (await this.scraper.fetchArticleContent(article));
      const updatedArticle = { ...article, content };
      this.cacheArticleContent(updatedArticle);
      this.articles = this.articles.map((item) => (item.url === article.url ? updatedArticle : item));
      this.sourceArticles = this.sourceArticles.map((item) =>
        item.url === article.url ? updatedArticle : item,
      );
      panel.webview.html = renderArticleWebview(updatedArticle, content);
    } catch {
      panel.webview.html = renderArticleWebview(
        article,
        createTextArticleContent("Unable to load article details. Open the original article to read more."),
      );
    }
  }

  public dispose(): void {
    this.isStopped = true;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.clearAutoNextTimer();
    this.statusBar.dispose();
  }

  private async move(offset: number): Promise<void> {
    if (this.articles.length === 0) {
      void vscode.window.showInformationMessage("No HK News headlines have been loaded yet.");
      return;
    }

    this.currentIndex = (this.currentIndex + offset + this.articles.length) % this.articles.length;
    await this.showCurrentArticle();
  }

  private async showCurrentArticle(): Promise<void> {
    const article = this.getCurrentArticle();

    if (!article || this.isStopped) {
      return;
    }

    this.statusBar.showArticle(
      article,
      "Loading article details...",
      this.currentIndex,
      this.articles.length,
    );

    this.isLoadingArticle = true;

    try {
      const content = article.content ?? (await this.scraper.fetchArticleContent(article));
      const updatedArticle = { ...article, content };
      this.cacheArticleContent(updatedArticle);
      this.articles = this.articles.map((item) => (item.url === article.url ? updatedArticle : item));
      this.sourceArticles = this.sourceArticles.map((item) =>
        item.url === article.url ? updatedArticle : item,
      );

      if (!this.isStopped && this.isCurrentArticle(article.url)) {
        this.statusBar.showArticle(
          updatedArticle,
          getArticleContentSummary(content) || "No article text was found.",
          this.currentIndex,
          this.articles.length,
        );
      }
    } catch {
      if (!this.isStopped && this.isCurrentArticle(article.url)) {
        this.statusBar.showArticle(
          article,
          "Unable to load article details. Click to open the source page.",
          this.currentIndex,
          this.articles.length,
        );
      }
    } finally {
      this.isLoadingArticle = false;
    }
  }

  private async advanceAutomatically(): Promise<void> {
    if (this.isStopped || this.isRefreshing || this.isLoadingArticle || this.articles.length === 0) {
      return;
    }

    this.currentIndex = getNextNewsIndex(this.currentIndex, this.articles.length);
    await this.showCurrentArticle();
  }

  private clearAutoNextTimer(): void {
    if (this.autoNextTimer) {
      clearInterval(this.autoNextTimer);
      this.autoNextTimer = undefined;
    }
  }

  private cacheArticleContent(article: NewsArticle): void {
    if (!article.content) {
      return;
    }

    if (!this.articleContentsByUrl.has(article.url) && this.articleContentsByUrl.size >= MAX_ARTICLES) {
      const oldestUrl = this.articleContentsByUrl.keys().next().value;

      if (oldestUrl) {
        this.articleContentsByUrl.delete(oldestUrl);
      }
    }

    this.articleContentsByUrl.set(article.url, article.content);
  }

  private getCurrentArticle(): NewsArticle | undefined {
    return this.articles[this.currentIndex];
  }

  private isCurrentArticle(articleUrl: string): boolean {
    return this.getCurrentArticle()?.url === articleUrl;
  }

  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(() => void this.refresh(false), REFRESH_INTERVAL_MS);
  }

  private startAutomaticRotationTimer(): void {
    this.autoNextTimer = setInterval(() => void this.advanceAutomatically(), AUTO_NEXT_INTERVAL_MS);
  }
}

let controller: HkLiveNewsController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const treeDataProvider = new NewsTreeProvider();
  controller = new HkLiveNewsController(treeDataProvider);

  context.subscriptions.push(
    controller,
    treeDataProvider,
    vscode.window.registerTreeDataProvider("mainNewsContainer", treeDataProvider),
    vscode.commands.registerCommand("hklivenews.start", () => controller?.start()),
    vscode.commands.registerCommand("hklivenews.refresh", () => controller?.refresh(true)),
    vscode.commands.registerCommand("hklivenews.stop", () => controller?.stop()),
    vscode.commands.registerCommand("hklivenews.next", () => controller?.next()),
    vscode.commands.registerCommand("hklivenews.prev", () => controller?.previous()),
    vscode.commands.registerCommand("hklivenews.selectHeadline", () => controller?.selectHeadline()),
    vscode.commands.registerCommand("hklivenews.configureSources", () => controller?.configureSources()),
    vscode.commands.registerCommand("hklivenews.openCurrent", () => controller?.openCurrentArticle()),
    vscode.commands.registerCommand("hklivenews.openArticle", (articleUrl: string) =>
      controller?.showArticleInWebview(articleUrl),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("hklivenews.sources")) {
        void controller?.refreshForSourceChange();
      }
    }),
  );

  void controller.start(false);
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
