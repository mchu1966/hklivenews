import * as assert from "assert";
import * as vscode from "vscode";
import { groupArticlesBySource, NewsTreeProvider } from "../news-view";

suite("News tree view", () => {
  test("groups selected sources and limits each section to 30 articles", () => {
    const articles = Array.from({ length: 31 }, (_, index) => ({
      title: `RTHK headline ${index + 1}`,
      url: `https://example.com/rthk/${index + 1}`,
      source: "rthk",
      publishedAt: index,
    }));

    const groupedArticles = groupArticlesBySource(articles, ["rthk", "now"]);

    assert.strictEqual(groupedArticles.length, 2);
    assert.strictEqual(groupedArticles[0]?.articles.length, 30);
    assert.deepStrictEqual(groupedArticles[1], { source: "now", articles: [] });
  });

  test("returns no sections when no sources are selected", () => {
    assert.deepStrictEqual(
      groupArticlesBySource(
        [{ title: "RTHK headline", url: "https://example.com/rthk", source: "rthk", publishedAt: 1 }],
        [],
      ),
      [],
    );
  });

  test("returns source sections and their respective article children", async () => {
    const provider = new NewsTreeProvider();

    try {
      provider.setArticles(
        [
          { title: "RTHK headline", url: "https://example.com/rthk", source: "rthk", publishedAt: 1 },
          { title: "Now headline", url: "https://example.com/now", source: "now", publishedAt: 2 },
        ],
        ["rthk", "now"],
      );

      const sections = await provider.getChildren();
      const rthkSection = sections[0];

      assert.strictEqual(sections.length, 2);
      assert.ok(rthkSection);
      assert.deepStrictEqual(await provider.getChildren(rthkSection), [
        { title: "RTHK headline", url: "https://example.com/rthk", source: "rthk", publishedAt: 1 },
      ]);
      assert.deepStrictEqual(
        await provider.getChildren({
          title: "RTHK headline",
          url: "https://example.com/rthk",
          source: "rthk",
          publishedAt: 1,
        }),
        [],
      );
    } finally {
      provider.dispose();
    }
  });

  test("creates source and article tree items with expected commands", () => {
    const provider = new NewsTreeProvider();

    try {
      const sourceItem = provider.getTreeItem({ source: "now", articles: [] });
      const articleItem = provider.getTreeItem({
        title: "Now headline",
        url: "https://example.com/now",
        source: "now",
        publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
      });

      assert.strictEqual(sourceItem.label, "Now News (0)");
      assert.strictEqual(sourceItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
      assert.strictEqual(sourceItem.contextValue, "newsSource");
      assert.deepStrictEqual(articleItem.command, {
        command: "hklivenews.openArticle",
        title: "Open HK News Article",
        arguments: ["https://example.com/now"],
      });
      assert.strictEqual(articleItem.tooltip, "Now headline");
    } finally {
      provider.dispose();
    }
  });

  test("notifies the view when articles are replaced", () => {
    const provider = new NewsTreeProvider();
    let changeCount = 0;
    const subscription = provider.onDidChangeTreeData(() => {
      changeCount += 1;
    });

    try {
      provider.setArticles([], []);
      provider.setArticles([], ["rthk"]);

      assert.strictEqual(changeCount, 2);
    } finally {
      subscription.dispose();
      provider.dispose();
    }
  });
});
