import { NEWS_SOURCES, getNewsSourceDefinition } from "../handlers/news-source-handler";
import type { NewsSource } from "../news-formatters";

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
  return NEWS_SOURCES.map((source) => {
    const definition = getNewsSourceDefinition(source);

    return {
      label: definition.label,
      description: definition.description,
      source,
      picked: selectedSources.includes(source),
    };
  });
}

export function getHeadlineQuickPickItems(
  articles: readonly { readonly title: string; readonly source: NewsSource }[],
): readonly HeadlineQuickPickItem[] {
  return articles.map((article, articleIndex) => ({
    label: article.title,
    description: getNewsSourceDefinition(article.source).label,
    articleIndex,
  }));
}
