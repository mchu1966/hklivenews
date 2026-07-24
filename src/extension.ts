// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { load } from "cheerio";
import * as vscode from "vscode";

const LATEST_NEWS_URL = "https://news.rthk.hk/rthk/ch/latest-news.htm";
const NOW_NEWS_LIST_URL =
  "https://newsapi1.now.com/pccw-news-api/api/getNewsListv2?category=119&pageNo=1&pageSize=50";
const RTHK_HOSTNAME = "news.rthk.hk";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NEXT_INTERVAL_MS = 60 * 1000;
const MAX_ARTICLES = 50;
const MAX_ARTICLE_CONTENT_LENGTH = 6_000;
const MAX_HEADLINE_LENGTH = 32;
const FETCH_TIMEOUT_MS = 30_000;
const HONG_KONG_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;
const NEWS_SOURCES = ["rthk", "now"] as const;

type NewsSource = (typeof NEWS_SOURCES)[number];

interface NewsArticle {
  readonly title: string;
  readonly url: string;
  readonly source: NewsSource;
  readonly publishedAt: number;
  readonly content?: string;
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

export function formatNewsPosition(currentIndex: number, totalNews: number): string {
  return `${currentIndex + 1}/${totalNews}`;
}

export function formatPublishedAt(publishedAt: number): string {
  const date = new Date(publishedAt + HONG_KONG_UTC_OFFSET_MS);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute} HKT`;
}

export function getNextNewsIndex(currentIndex: number, totalNews: number): number {
  return totalNews === 0 ? 0 : (currentIndex + 1) % totalNews;
}

export function truncateHeadline(headline: string, maxLength: number): string {
  const characters = Array.from(headline);

  if (characters.length <= maxLength) {
    return headline;
  }

  if (maxLength <= 3) {
    return ".".repeat(maxLength);
  }

  return `${characters.slice(0, maxLength - 3).join("")}...`;
}

export function formatHeadline(headline: string, maxLength: number): string {
  const displayHeadline = truncateHeadline(headline, maxLength);
  const paddingLength = Math.max(0, maxLength - Array.from(displayHeadline).length);

  return `${displayHeadline}${"\u00a0".repeat(paddingLength)}`;
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

export function mergeNewsArticlesByPublicationDate(articles: readonly NewsArticle[]): readonly NewsArticle[] {
  return [...articles]
    .filter(
      (article, index, allArticles) => allArticles.findIndex((item) => item.url === article.url) === index,
    )
    .sort((first, second) => second.publishedAt - first.publishedAt)
    .slice(0, MAX_ARTICLES);
}

export function extractArticleContentFromHtml(html: string, source: NewsSource): string {
  const $ = load(html);
  const content = $(NEWS_SOURCE_DEFINITIONS[source].contentSelector).first().text();

  return cleanText(content).slice(0, MAX_ARTICLE_CONTENT_LENGTH);
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

  public async fetchArticleContent(articleUrl: string): Promise<string> {
    const html = await fetchHtml(articleUrl);

    return extractArticleContentFromHtml(html, this.source);
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

    return mergeNewsArticlesByPublicationDate(articles);
  }

  public async fetchArticleContent(article: NewsArticle): Promise<string> {
    return new NewsScraper(article.source, NEWS_SOURCE_DEFINITIONS[article.source]).fetchArticleContent(
      article.url,
    );
  }
}

class NewsStatusBar implements vscode.Disposable {
  private readonly headlineItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
  private readonly previousItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private readonly positionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  private readonly selectHeadlineItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  private readonly nextItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);

  public constructor() {
    this.headlineItem.command = "hklivenews.openCurrent";
    this.headlineItem.text = "$(newspaper) HK News";
    this.headlineItem.tooltip = "Start HK News refreshing to load the latest headlines.";
    this.previousItem.command = "hklivenews.prev";
    this.previousItem.text = "$(chevron-left)";
    this.previousItem.tooltip = "Previous HK News headline";
    this.positionItem.tooltip = "Current HK News headline";
    this.nextItem.command = "hklivenews.next";
    this.nextItem.text = "$(chevron-right)";
    this.nextItem.tooltip = "Next HK News headline";
    this.selectHeadlineItem.command = "hklivenews.selectHeadline";
    this.selectHeadlineItem.text = "$(menu)";
    this.selectHeadlineItem.tooltip = "Select an HK News headline";
    this.headlineItem.show();
  }

  public showArticle(
    article: NewsArticle,
    detail: string,
    currentIndex: number,
    totalArticles: number,
  ): void {
    this.headlineItem.text = `$(newspaper) ${formatHeadline(article.title, MAX_HEADLINE_LENGTH)}`;
    this.headlineItem.tooltip = `${article.title}\n\n${detail}\n\nPublished: ${formatPublishedAt(article.publishedAt)}\nSource: ${NEWS_SOURCE_DEFINITIONS[article.source].label}\nClick to open the article.`;
    this.positionItem.text = formatNewsPosition(currentIndex, totalArticles);
    this.showNavigationItems();
  }

  public showRefreshing(): void {
    this.headlineItem.text = "$(sync~spin) Refreshing HK News";
    this.hideNavigationItems();
  }

  public showPaused(): void {
    this.headlineItem.text = "$(newspaper) HK News paused";
    this.headlineItem.tooltip = "HK News refreshing is paused.";
    this.hideNavigationItems();
  }

  public showUnavailable(message: string): void {
    this.headlineItem.text = "$(warning) HK News unavailable";
    this.headlineItem.tooltip = `Unable to refresh HK News: ${message}`;
    this.hideNavigationItems();
  }

  public dispose(): void {
    this.headlineItem.dispose();
    this.previousItem.dispose();
    this.positionItem.dispose();
    this.nextItem.dispose();
    this.selectHeadlineItem.dispose();
  }

  private showNavigationItems(): void {
    this.previousItem.show();
    this.positionItem.show();
    this.nextItem.show();
    this.selectHeadlineItem.show();
  }

  private hideNavigationItems(): void {
    this.previousItem.hide();
    this.positionItem.hide();
    this.nextItem.hide();
    this.selectHeadlineItem.hide();
  }
}

class HkLiveNewsController implements vscode.Disposable {
  private readonly scraper = new MultiSourceNewsScraper();
  private readonly statusBar = new NewsStatusBar();
  private articles: readonly NewsArticle[] = [];
  private currentIndex = 0;
  private refreshTimer: NodeJS.Timeout | undefined;
  private autoNextTimer: NodeJS.Timeout | undefined;
  private isRefreshing = false;
  private isRefreshQueued = false;
  private isLoadingArticle = false;
  private isStopped = false;

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
      const articles = await this.scraper.fetchLatestArticles(
        getSelectedNewsSources(vscode.workspace.getConfiguration("hklivenews").get<unknown>("sources")),
      );

      if (this.isStopped) {
        return;
      }

      if (articles.length === 0) {
        throw new Error("The selected sources did not return any current article links.");
      }

      const currentUrl = this.articles[this.currentIndex]?.url;
      const matchingIndex = articles.findIndex((article) => article.url === currentUrl);
      this.articles = articles;
      this.currentIndex = matchingIndex >= 0 ? matchingIndex : 0;
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

    if (this.refreshTimer) {
      await this.refreshForSourceChange();
    }
  }

  public openCurrentArticle(): void {
    const article = this.articles[this.currentIndex];

    if (article) {
      void vscode.env.openExternal(vscode.Uri.parse(article.url));
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

  private async refreshForSourceChange(): Promise<void> {
    if (this.isRefreshing) {
      this.isRefreshQueued = true;
      return;
    }

    await this.refresh(true);
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
      this.articles = this.articles.map((item) => (item.url === article.url ? updatedArticle : item));

      if (!this.isStopped && this.isCurrentArticle(article.url)) {
        this.statusBar.showArticle(
          updatedArticle,
          content || "No article text was found.",
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
  controller = new HkLiveNewsController();

  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand("hklivenews.start", () => controller?.start()),
    vscode.commands.registerCommand("hklivenews.refresh", () => controller?.refresh(true)),
    vscode.commands.registerCommand("hklivenews.stop", () => controller?.stop()),
    vscode.commands.registerCommand("hklivenews.next", () => controller?.next()),
    vscode.commands.registerCommand("hklivenews.prev", () => controller?.previous()),
    vscode.commands.registerCommand("hklivenews.selectHeadline", () => controller?.selectHeadline()),
    vscode.commands.registerCommand("hklivenews.configureSources", () => controller?.configureSources()),
    vscode.commands.registerCommand("hklivenews.openCurrent", () => controller?.openCurrentArticle()),
  );

  void controller.start(false);
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
