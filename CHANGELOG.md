# Change Log

All notable changes to the "hklivenews" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.7]

- Added opt-in notifications for newly fetched headlines, with **Show Detail** and **Snooze Today** actions.
  - Added the `hklivenews.latestHeadlineNotifications` setting and **Toggle Latest Headline Notifications** command.
  - Added the **Reset Latest Headline Notification Snooze** command to resume notifications after snooze.

## [1.0.6]

- Refactored news-source integration behind source handlers and a handler factory, separating RTHK and Now News parsing from extension lifecycle code.
  - Moved the concrete RTHK and Now News handlers into dedicated modules while keeping the source-handler factory as the shared integration point.
  - Split shared article HTML extraction and webview rendering into dedicated parser and renderer modules.
  - Consolidated article models, helpers, source selection, and article collection operations into focused modules and removed obsolete compatibility adapters.
  - Added focused tests for article HTML parsing and webview rendering behavior.

## [1.0.5]

- Fixed RTHK article webviews rendering as a single block of text by preserving `<br>` line breaks during HTML extraction.
- Article text blocks now render `<br>` tags for newline characters, ensuring reliable display across all sources.
- README.md add preview section for feature preview.

## [1.0.4]

- Added the `@hklivenews-reporter` chat participant for questions about the current scraped HK Live News articles.
- Added `/hk-news-today` for factual, cited daily news summaries.
- Reporter answers use inline related-news links.
- Reporter answers use only the extension's current in-memory article list and prompt users to refresh when no articles are available.

## [1.0.3]

- Remove the related news in news article webview, for Now News.

## [1.0.2]

- Added an Activity Bar sidebar that groups up to 30 headlines for each selected source.
- Added VS Code webview, so articles can be read without opening an external browser.
- Added in-memory article caching for faster repeat viewing.

## [1.0.1]

- Added optional Now News local headlines alongside RTHK.
- Added source selection through `hklivenews.sources` and the **Configure News Sources** command.
- Added publication time to the status-bar tooltip for each headline.

## [1.0.0] - 2026-07-22

- First Marketplace-ready release of HK Live News.
- First stable release of HK Live News.
- Brings current Chinese-language RTHK headlines to the VS Code status bar.
- Includes automatic five-minute refreshes, one-minute headline rotation, status-bar navigation, and article links.
