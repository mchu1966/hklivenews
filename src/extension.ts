// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

const LATEST_NEWS_URL = "https://news.rthk.hk/rthk/ch/latest-news.htm";
const RTHK_HOSTNAME = "news.rthk.hk";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NEXT_INTERVAL_MS = 60 * 1000;
const MAX_ARTICLES = 50;
const MAX_ARTICLE_CONTENT_LENGTH = 6_000;
const MAX_HEADLINE_LENGTH = 32;
const NEWS_SOURCES = ["rthk", "now"] as const;

type NewsSource = (typeof NEWS_SOURCES)[number];

interface NewsArticle {
  readonly title: string;
  readonly url: string;
  readonly source: NewsSource;
  readonly content?: string;
}

export interface HeadlineQuickPickItem {
  readonly label: string;
  readonly description: string;
  readonly articleIndex: number;
}

interface NewsLink {
  readonly title: string;
  readonly href: string;
}

interface NewsSourceDefinition {
  readonly label: string;
  readonly latestNewsUrl: string;
  readonly articleLinkSelector: string;
  readonly contentSelector: string;
  readonly toArticleUrl: (value: string) => string | undefined;
}

interface PuppeteerPage {
  goto(
    url: string,
    options: { readonly waitUntil: "domcontentloaded"; readonly timeout: number },
  ): Promise<unknown>;
  waitForSelector(selector: string, options: { readonly timeout: number }): Promise<unknown>;
  $$eval<T>(selector: string, pageFunction: (elements: Element[]) => T): Promise<T>;
  evaluate<T, Argument>(pageFunction: (argument: Argument) => T, argument: Argument): Promise<T>;
}

interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}

interface PuppeteerModule {
  launch(options: { readonly headless: true }): Promise<PuppeteerBrowser>;
}

async function loadPuppeteer(): Promise<PuppeteerModule> {
  return Function("moduleName", "return import(moduleName)")("puppeteer") as Promise<PuppeteerModule>;
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
    latestNewsUrl: LATEST_NEWS_URL,
    articleLinkSelector: 'a[href*="/rthk/ch/component/k2/"]',
    contentSelector: ".itemFullText, .itemIntroText, article, main",
    toArticleUrl: toRthkArticleUrl,
  },
  now: {
    label: "Now News",
    latestNewsUrl: "https://news.now.com/home/local",
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

export function formatNewsPosition(currentIndex: number, totalNews: number): string {
  return `${currentIndex + 1}/${totalNews}`;
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

    if (url && title && !articles.some((article) => article.url === url)) {
      articles.push({ title, url, source });
    }
  }

  return articles.slice(0, MAX_ARTICLES);
}

class NewsScraper {
  public constructor(
    private readonly source: NewsSource,
    private readonly definition: NewsSourceDefinition,
  ) {}

  public async fetchLatestArticles(): Promise<readonly NewsArticle[]> {
    const puppeteer = await loadPuppeteer();
    const browser = await puppeteer.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(this.definition.latestNewsUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector(this.definition.articleLinkSelector, { timeout: 15_000 });

      const links = await page.$$eval(this.definition.articleLinkSelector, (anchors) =>
        anchors.map((anchor) => ({
          title: anchor.textContent ?? "",
          href: (anchor as HTMLAnchorElement).href,
        })),
      );

      return toNewsArticles(links, this.source, this.definition.toArticleUrl);
    } finally {
      await browser.close();
    }
  }

  public async fetchArticleContent(articleUrl: string): Promise<string> {
    const puppeteer = await loadPuppeteer();
    const browser = await puppeteer.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(articleUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

      const content = await page.evaluate(
        (contentSelector) => document.querySelector(contentSelector)?.textContent ?? "",
        this.definition.contentSelector,
      );

      return cleanText(content).slice(0, MAX_ARTICLE_CONTENT_LENGTH);
    } finally {
      await browser.close();
    }
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

    return articles
      .filter(
        (article, index, allArticles) => allArticles.findIndex((item) => item.url === article.url) === index,
      )
      .slice(0, MAX_ARTICLES);
  }

  public async fetchArticleContent(article: NewsArticle): Promise<string> {
    return new NewsScraper(article.source, NEWS_SOURCE_DEFINITIONS[article.source]).fetchArticleContent(
      article.url,
    );
  }
}

class HkLiveNewsController implements vscode.Disposable {
  private readonly scraper = new MultiSourceNewsScraper();
  private readonly headlineStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
  private readonly previousStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  private readonly positionStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  private readonly selectHeadlineStatusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98,
  );
  private readonly nextStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
  private articles: readonly NewsArticle[] = [];
  private currentIndex = 0;
  private refreshTimer: NodeJS.Timeout | undefined;
  private autoNextTimer: NodeJS.Timeout | undefined;
  private isRefreshing = false;
  private isLoadingArticle = false;
  private isStopped = false;

  public constructor() {
    this.headlineStatusItem.command = "hklivenews.openCurrent";
    this.headlineStatusItem.text = "$(newspaper) HK News";
    this.headlineStatusItem.tooltip = "Start HK News refreshing to load the latest headlines.";
    this.previousStatusItem.command = "hklivenews.prev";
    this.previousStatusItem.text = "$(chevron-left)";
    this.previousStatusItem.tooltip = "Previous HK News headline";
    this.positionStatusItem.tooltip = "Current HK News headline";
    this.nextStatusItem.command = "hklivenews.next";
    this.nextStatusItem.text = "$(chevron-right)";
    this.nextStatusItem.tooltip = "Next HK News headline";
    this.selectHeadlineStatusItem.command = "hklivenews.selectHeadline";
    this.selectHeadlineStatusItem.text = "$(menu)";
    this.selectHeadlineStatusItem.tooltip = "Select an HK News headline";
    this.headlineStatusItem.show();
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
    this.showPausedState();
    void vscode.window.showInformationMessage("Stopped refreshing HK News.");
  }

  public async refresh(showError: boolean): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    this.showRefreshingState();

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
      this.showUnavailableState(message);

      if (showError) {
        void vscode.window.showErrorMessage(`Unable to refresh HK News: ${message}`);
      }
    } finally {
      this.isRefreshing = false;
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

    this.headlineStatusItem.dispose();
    this.previousStatusItem.dispose();
    this.positionStatusItem.dispose();
    this.nextStatusItem.dispose();
    this.selectHeadlineStatusItem.dispose();
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

    this.updateStatusBar(article, "Loading article details...");

    this.isLoadingArticle = true;

    try {
      const content = article.content ?? (await this.scraper.fetchArticleContent(article));
      const updatedArticle = { ...article, content };
      this.articles = this.articles.map((item) => (item.url === article.url ? updatedArticle : item));

      if (!this.isStopped && this.isCurrentArticle(article.url)) {
        this.updateStatusBar(updatedArticle, content || "No article text was found.");
      }
    } catch {
      if (!this.isStopped && this.isCurrentArticle(article.url)) {
        this.updateStatusBar(article, "Unable to load article details. Click to open the source page.");
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

  private updateStatusBar(article: NewsArticle, detail: string): void {
    this.headlineStatusItem.text = `$(newspaper) ${formatHeadline(article.title, MAX_HEADLINE_LENGTH)}`;
    this.headlineStatusItem.tooltip = `${article.title}\n\n${detail}\n\nSource: ${NEWS_SOURCE_DEFINITIONS[article.source].label}\nClick to open the article.`;
    this.positionStatusItem.text = formatNewsPosition(this.currentIndex, this.articles.length);
    this.showNavigationItems();
  }

  private showRefreshingState(): void {
    this.headlineStatusItem.text = "$(sync~spin) Refreshing HK News";
    this.hideNavigationItems();
  }

  private showPausedState(): void {
    this.headlineStatusItem.text = "$(newspaper) HK News paused";
    this.headlineStatusItem.tooltip = "HK News refreshing is paused.";
    this.hideNavigationItems();
  }

  private showUnavailableState(message: string): void {
    this.headlineStatusItem.text = "$(warning) HK News unavailable";
    this.headlineStatusItem.tooltip = `Unable to refresh HK News: ${message}`;
    this.hideNavigationItems();
  }

  private showNavigationItems(): void {
    this.previousStatusItem.show();
    this.positionStatusItem.show();
    this.nextStatusItem.show();
    this.selectHeadlineStatusItem.show();
  }

  private hideNavigationItems(): void {
    this.previousStatusItem.hide();
    this.positionStatusItem.hide();
    this.nextStatusItem.hide();
    this.selectHeadlineStatusItem.hide();
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
    vscode.commands.registerCommand("hklivenews.openCurrent", () => controller?.openCurrentArticle()),
  );

  void controller.start(false);
}

export function deactivate(): void {
  controller?.dispose();
  controller = undefined;
}
