# HK Live News

HK Live News brings the latest Chinese-language Hong Kong headlines into the VS Code status bar. It fetches your selected sources directly and opens the selected article in your browser.

## Features

- Combines the 50 most recently published headlines from RTHK and Now News.
- Starts automatically when VS Code finishes starting, then refreshes every five minutes.
- Advances to the next loaded headline every minute.
- Shows the active headline, its position, and previous/next controls in the status bar.
- Uses a fixed-width headline area, truncating long titles with `...`; hover over a headline to read its full title and article text.
- Opens the selected source article when its headline is clicked.

The status bar uses this layout:

```text
<  1/20  >  HK headline...
```

## Usage

1. Open VS Code. HK Live News starts refreshing automatically after startup completes.
2. Use the status-bar arrows or keyboard shortcuts to move through the current headlines.
3. Click the list button beside the headline position to select a headline from the full list.
4. Click a headline to open its source article.
5. Run **Configure News Sources** from the Command Palette to select one or more sources with checkboxes.
6. Run **Start Refreshing HK News (default 5 mins)** from the Command Palette to restart scheduled refreshing after it has been stopped.

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

Run `pnpm run watch` while developing to continuously compile the extension.

## Known Limitations

- Headline and article extraction depends on the current source page structures. A site redesign can require scraper updates.
- The extension displays up to 50 headlines per refresh.
- `hklivenews.sources` controls the sources to combine; refreshing remains fixed at five minutes and automatic headline rotation at one minute.
- VS Code does not provide extensions with status-bar hover events, so automatic rotation cannot pause specifically while the headline tooltip is open. Use **Stop Refreshing HK News** to pause it.

## Release Notes

### 1.0.0

- First stable release of HK Live News.
- Brings current Chinese-language RTHK headlines to the VS Code status bar.
- Includes automatic five-minute refreshes, one-minute headline rotation, status-bar navigation, and article links.

## License

MIT
