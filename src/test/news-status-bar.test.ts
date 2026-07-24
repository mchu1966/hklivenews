import { NewsStatusBar } from "../news-status-bar";

suite("News status bar", () => {
  test("supports each public display state", () => {
    const statusBar = new NewsStatusBar();

    try {
      statusBar.showArticle(
        {
          title: "Current HK headline",
          source: "rthk",
          publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
        },
        "Article details",
        0,
        1,
      );
      statusBar.showRefreshing();
      statusBar.showPaused();
      statusBar.showUnavailable("Request timed out");
    } finally {
      statusBar.dispose();
    }
  });

  test("renders articles from each supported source", () => {
    const statusBar = new NewsStatusBar();

    try {
      statusBar.showArticle(
        {
          title: "Now headline",
          source: "now",
          publishedAt: Date.parse("2026-07-22T12:34:00+08:00"),
        },
        "Article details",
        1,
        2,
      );
    } finally {
      statusBar.dispose();
    }
  });

  test("renders an article with an unrecognized source label", () => {
    const statusBar = new NewsStatusBar();

    try {
      statusBar.showArticle(
        {
          title: "External headline",
          source: "external",
          publishedAt: 0,
        },
        "Article details",
        0,
        1,
      );
    } finally {
      statusBar.dispose();
    }
  });
});
