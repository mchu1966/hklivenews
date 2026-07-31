# HK Live News

<p align="center">
 <img src="resources/hklivenews-icon.png" alt="HK Live News icon" width="128">
</p>

HK Live News brings the latest Chinese-language Hong Kong headlines into the VS Code status bar. It fetches your selected sources directly and opens selected articles in an internal VS Code webview.

## Features

- Combines headlines from the selected sources, keeping the 50 most recently published items in the status bar.
- Shows source-grouped headlines in the Activity Bar sidebar, with up to 30 items per source.
- Starts automatically when VS Code finishes starting, then refreshes every five minutes.
- Advances to the next loaded headline every minute.
- Shows the active headline, its position, and previous/next controls in the status bar.
- Uses a fixed-width headline area, truncating long titles with `...`; hover over a headline to read its full title and an article-text excerpt.
- Opens the selected article in an internal VS Code webview, with a link to the original article.
- Provides `@hklivenews-reporter`, a chat participant grounded in the same currently scraped articles shown by the extension.

The status bar uses this layout:

```text
<  1/20 ≡ >  HK headline...
```

## Usage

1. Open VS Code. HK Live News starts refreshing automatically after startup completes.
2. Use the status-bar arrows or keyboard shortcuts to move through the current headlines.
3. Click the list button beside the headline position to select a headline from the full list.
4. Click a headline to read it in an internal VS Code webview, then use the original-article link when needed.
5. Run **Configure News Sources** from the Command Palette to select one or more sources with checkboxes.
6. Run **Start Refreshing HK News (default 5 mins)** from the Command Palette to restart scheduled refreshing after it has been stopped.

## Chat Reporter

Use `@hklivenews-reporter` in VS Code Chat to ask questions about the articles currently loaded by HK Live News. Use `/hk-news-today` with the participant for a factual summary of today's available headlines.

The reporter uses only the in-memory articles already scraped by the extension. It does not search the web or fetch additional articles. When the requested information is absent, or no articles have loaded yet, it says so and suggests running **HK Live News: Manually refresh HK News**.

Reporter answers list related headlines as clickable links that open the original articles in your external browser.

## Settings

Use `hklivenews.sources` to choose one or more sources. The default is `rthk`.

```json
{
 "hklivenews.sources": ["rthk", "now"]
}
```

Available values are `rthk` (RTHK Chinese latest news) and `now` (Now News local news). When multiple sources are selected, their headlines are combined and sorted by publication time in the status bar. The source name appears in each article tooltip.

## Commands

| Command | Description |
| --- | --- |
| `HK Live News: Start Refreshing HK News (default 5 mins)` | Fetches current news and starts five-minute refreshes. |
| `HK Live News: Manually refresh HK News` | Fetches the latest headlines immediately. |
| `HK Live News: Stop Refreshing HK News` | Stops scheduled refreshes. |
| `HK Live News: Show Next HK News Headline` | Selects the next headline. |
| `HK Live News: Show Previous HK News Headline` | Selects the previous headline. |
| `HK Live News: Select HK News Headline` | Opens the headline picker. |
| `HK Live News: Configure News Sources` | Opens a checkbox list to select the sources to combine. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+D` | Show the next headline. |
| `Alt+A` | Show the previous headline. |

## Requirements

- VS Code `1.125.0` or later.
- Network access to the selected source websites.

## Development

```sh
pnpm install
pnpm run compile
pnpm run lint
pnpm test
```

Run `pnpm run watch` while developing to continuously compile and bundle the extension.

The build pipeline has two steps:

1. `tsc` compiles TypeScript from `src/` to `out/`
2. `esbuild` bundles `out/` into `dist/extension.js` (the file VS Code actually loads)

Run `pnpm run bundle` after `pnpm run compile` to rebuild the distributable, or use `pnpm run watch` to do both automatically on file changes.

## Known Limitations

- Headline and article extraction depends on the current source page structures. A site redesign can require scraper updates.
- The status bar displays up to 50 combined headlines per refresh; the sidebar displays up to 30 headlines for each selected source.
- Each extracted text block in an article tooltip is limited to 6,000 characters.
- The chat reporter can answer only from the current in-memory article list. Article details appear only after the extension has already loaded them.
- `hklivenews.sources` controls the sources to combine; refreshing remains fixed at five minutes and automatic headline rotation at one minute.
- VS Code does not provide extensions with status-bar hover events, so automatic rotation cannot pause specifically while the headline tooltip is open. Use **Stop Refreshing HK News** to pause it.

## Changelog

Check the [CHANGELOG.md](https://github.com/mchu1966/hklivenews/blob/HEAD/CHANGELOG.md) for any version changes.

## Reporting issues

Report any issues on the github [issues](https://github.com/mchu1966/hklivenews/issues) page. Follow the template and add as much information as possible.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/mchu1966/hklivenews/blob/HEAD/LICENSE) file for details
