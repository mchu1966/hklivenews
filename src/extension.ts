// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { getNewsSourceHandler } from "./handlers/news-source-handler";
import {
  MAX_ARTICLES,
  applyCachedArticleContent,
  mergeNewsArticlesByPublicationDate,
  sortNewsArticlesByPublicationDate,
} from "./helpers/news-article-utils";
import { getErrorMessage } from "./helpers/news-helpers";
import {
  getHeadlineQuickPickItems,
  getSelectedNewsSources,
  getSourceQuickPickItems,
} from "./helpers/news-selection-helpers";
import type { NewsArticle, NewsArticleContent, TextArticleBlock } from "./models/news-models";
import { getNextNewsIndex, type NewsSource } from "./news-formatters";
import { createNewsReporter } from "./news-reporter";
import { NewsStatusBar } from "./news-status-bar";
import { NewsTreeProvider } from "./news-view";
import { renderArticleWebview } from "./renderers/article-webview-renderer";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NEXT_INTERVAL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 30_000;

export function getNewsSourcesConfigurationTarget(workspaceValue: unknown): vscode.ConfigurationTarget {
  return workspaceValue === undefined
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
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

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return response.text();
}

interface FetchLatestResult {
  readonly articles: readonly NewsArticle[];
  readonly nowArticleContents: ReadonlyMap<string, NewsArticleContent>;
}

class MultiSourceNewsScraper {
  public async fetchLatestArticles(sources: readonly NewsSource[]): Promise<FetchLatestResult> {
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        const handler = getNewsSourceHandler(source);
        const payload = await fetchHtml(handler.definition.latestNewsUrl);

        return {
          articles: handler.parseLatestArticles(payload),
          contents: handler.parseLatestArticleContents(payload),
        };
      }),
    );

    const articles = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value.articles : [],
    );
    const nowArticleContents = new Map<string, NewsArticleContent>();

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const [url, content] of result.value.contents) {
          nowArticleContents.set(url, content);
        }
      }
    }

    if (articles.length === 0) {
      const failure = results.find((result) => result.status === "rejected");
      throw new Error(
        failure?.status === "rejected" ? getErrorMessage(failure.reason) : "No articles found.",
      );
    }

    return { articles: sortNewsArticlesByPublicationDate(articles), nowArticleContents };
  }

  public async fetchArticleContent(article: NewsArticle): Promise<NewsArticleContent> {
    const handler = getNewsSourceHandler(article.source);

    if (article.source === "now") {
      try {
        const html = await fetchHtml(article.url);
        return handler.parseArticleContent(html, article.url);
      } catch {
        return createTextArticleContent(
          "Article content is only available from the Now News website. Open the original article to read more.",
        );
      }
    }

    const html = await fetchHtml(article.url);
    return handler.parseArticleContent(html, article.url);
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

  public getArticles(): readonly NewsArticle[] {
    return this.articles;
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
      const { articles: fetchedSourceArticles, nowArticleContents } =
        await this.scraper.fetchLatestArticles(sources);

      if (this.isStopped) {
        return;
      }

      for (const [url, content] of nowArticleContents) {
        if (!this.articleContentsByUrl.has(url)) {
          this.cacheArticleContent({ url, source: "now", title: "", publishedAt: 0, content });
        }
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
  const reporter = createNewsReporter(() => controller?.getArticles() ?? []);

  context.subscriptions.push(
    controller,
    reporter,
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
