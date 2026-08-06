import * as vscode from "vscode";
import { formatHeadline, formatNewsPosition, formatPublishedAt, getSourceLabel } from "./news-formatters";

const STATUS_BAR_HEADLINE_LENGTH = 32;

export interface NewsStatusArticle {
  readonly title: string;
  readonly source: string;
  readonly publishedAt: number;
}

export function createArticleTooltip(article: NewsStatusArticle, detail: string): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  const detailLines = detail.split("\n");

  tooltip.appendText(article.title);
  tooltip.appendMarkdown("\n\n");

  for (const [index, line] of detailLines.entries()) {
    tooltip.appendText(line);

    if (index < detailLines.length - 1) {
      tooltip.appendMarkdown("  \n");
    }
  }

  tooltip.appendMarkdown("\n\n");
  tooltip.appendText(`Published: ${formatPublishedAt(article.publishedAt)}`);
  tooltip.appendMarkdown("  \n");
  tooltip.appendText(`Source: ${getSourceLabel(article.source)}`);
  tooltip.appendMarkdown("  \n");
  tooltip.appendText("Click to open the article.");

  return tooltip;
}

export class NewsStatusBar implements vscode.Disposable {
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
    article: NewsStatusArticle,
    detail: string,
    currentIndex: number,
    totalArticles: number,
  ): void {
    this.headlineItem.text = `$(newspaper) ${formatHeadline(article.title, STATUS_BAR_HEADLINE_LENGTH)}`;
    this.headlineItem.tooltip = createArticleTooltip(article, detail);
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
