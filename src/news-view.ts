import * as vscode from "vscode";

const MAX_ARTICLES_PER_SOURCE = 30;

export interface NewsTreeArticle {
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly publishedAt: number;
}

interface SourceSection {
  readonly source: string;
  readonly articles: readonly NewsTreeArticle[];
}

type NewsTreeElement = SourceSection | NewsTreeArticle;

export function groupArticlesBySource(
  articles: readonly NewsTreeArticle[],
  sources: readonly string[],
): readonly SourceSection[] {
  return sources.map((source) => ({
    source,
    articles: articles.filter((article) => article.source === source).slice(0, MAX_ARTICLES_PER_SOURCE),
  }));
}

export class NewsTreeProvider implements vscode.TreeDataProvider<NewsTreeElement>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<NewsTreeElement | undefined>();
  private articles: readonly NewsTreeArticle[] = [];
  private sources: readonly string[] = [];

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public setArticles(articles: readonly NewsTreeArticle[], sources: readonly string[]): void {
    this.articles = articles;
    this.sources = sources;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: NewsTreeElement): vscode.TreeItem {
    if (this.isSourceSection(element)) {
      const item = new vscode.TreeItem(
        `${this.getSourceLabel(element.source)} (${element.articles.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `source:${element.source}`;
      item.contextValue = "newsSource";
      item.iconPath = new vscode.ThemeIcon("newspaper");
      return item;
    }

    const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);
    item.id = `article:${element.url}`;
    item.description = new Date(element.publishedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    item.tooltip = element.title;
    item.command = {
      command: "hklivenews.openArticle",
      title: "Open HK News Article",
      arguments: [element.url],
    };
    return item;
  }

  public getChildren(element?: NewsTreeElement): Thenable<NewsTreeElement[]> {
    if (!element) {
      return Promise.resolve([...groupArticlesBySource(this.articles, this.sources)]);
    }

    return Promise.resolve(this.isSourceSection(element) ? [...element.articles] : []);
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private isSourceSection(element: NewsTreeElement): element is SourceSection {
    return "articles" in element;
  }

  private getSourceLabel(source: string): string {
    return source === "rthk" ? "RTHK" : source === "now" ? "Now News" : source;
  }
}
