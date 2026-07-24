import * as assert from "assert";
import {
  formatHeadline,
  formatNewsPosition,
  formatPublishedAt,
  getNextNewsIndex,
  truncateHeadline,
} from "../news-formatters";

suite("News formatters", () => {
  test("formats one-based news positions", () => {
    assert.strictEqual(formatNewsPosition(0, 12), "1/12");
    assert.strictEqual(formatNewsPosition(11, 12), "12/12");
  });

  test("formats publication timestamps in Hong Kong time", () => {
    assert.strictEqual(formatPublishedAt(Date.parse("2026-07-22T12:34:00+08:00")), "2026-07-22 12:34 HKT");
    assert.strictEqual(formatPublishedAt(Date.parse("2026-07-22T18:30:00Z")), "2026-07-23 02:30 HKT");
  });

  test("wraps headline navigation and handles an empty list", () => {
    assert.strictEqual(getNextNewsIndex(0, 1), 0);
    assert.strictEqual(getNextNewsIndex(2, 3), 0);
    assert.strictEqual(getNextNewsIndex(0, 0), 0);
  });

  test("truncates headlines without splitting Unicode characters", () => {
    assert.strictEqual(truncateHeadline("香港新聞", 8), "香港新聞");
    assert.strictEqual(truncateHeadline("香港今日最新新聞標題", 8), "香港今日最...");
    assert.strictEqual(truncateHeadline("香港新聞", 3), "...");
    assert.strictEqual(truncateHeadline("新聞", 0), "");
    assert.strictEqual(truncateHeadline("😀最新消息速報", 5), "😀最...");
  });

  test("pads short headlines to the requested display width", () => {
    assert.strictEqual(formatHeadline("香港新聞", 8), "香港新聞\u00a0\u00a0\u00a0\u00a0");
    assert.strictEqual(formatHeadline("香港今日最新新聞標題", 8), "香港今日最...");
  });
});
