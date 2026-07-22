import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {
  formatHeadline,
  formatNewsPosition,
  getNextNewsIndex,
  toRthkArticleUrl,
  truncateHeadline,
} from "../extension";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Sample test", () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  test("accepts only RTHK Chinese K2 article links", () => {
    assert.strictEqual(
      toRthkArticleUrl("/rthk/ch/component/k2/1863167-20260722.htm?spTabChangeable=0"),
      "https://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm?spTabChangeable=0",
    );
    assert.strictEqual(
      toRthkArticleUrl("http://news.rthk.hk/rthk/ch/component/k2/1863167-20260722.htm"),
      undefined,
    );
    assert.strictEqual(toRthkArticleUrl("https://example.com/article.htm"), undefined);
  });

  test("formats the one-based current news position", () => {
    assert.strictEqual(formatNewsPosition(0, 12), "1/12");
    assert.strictEqual(formatNewsPosition(11, 12), "12/12");
  });

  test("truncates long status-bar headlines with an ellipsis", () => {
    assert.strictEqual(truncateHeadline("香港新聞", 8), "香港新聞");
    assert.strictEqual(truncateHeadline("香港今日最新新聞標題", 8), "香港今日最...");
  });

  test("pads short status-bar headlines to the configured width", () => {
    assert.strictEqual(formatHeadline("香港新聞", 8), "香港新聞\u00a0\u00a0\u00a0\u00a0");
    assert.strictEqual(formatHeadline("香港今日最新新聞標題", 8), "香港今日最...");
  });

  test("wraps automatic headline rotation to the first article", () => {
    assert.strictEqual(getNextNewsIndex(0, 3), 1);
    assert.strictEqual(getNextNewsIndex(2, 3), 0);
  });
});
