# HK Live News

HK Live News brings the latest Chinese-language RTHK headlines into the VS Code status bar. It scrapes [RTHK Latest News](https://news.rthk.hk/rthk/ch/latest-news.htm) with Puppeteer and opens the selected article in your browser.

## Features

- Loads up to 20 current RTHK Chinese news headlines.
- Starts automatically when VS Code finishes starting, then refreshes every five minutes.
- Advances to the next loaded headline every minute.
- Shows the active headline, its position, and previous/next controls in the status bar.
- Uses a fixed-width headline area, truncating long titles with `...`; hover over a headline to read its full title and article text.
- Opens the selected RTHK article when its headline is clicked.

The status bar uses this layout:

```text
<  1/20  >  HK headline...
```

## Usage

1. Open VS Code. HK Live News starts refreshing automatically after startup completes.
2. Use the status-bar arrows or keyboard shortcuts to move through the current headlines.
3. Click a headline to open its RTHK article.
4. Run **Start Refreshing HK News (default 5 mins)** from the Command Palette to restart scheduled refreshing after it has been stopped.

## Commands

| Command | Description |
| --- | --- |
| `HK Live News: Start Refreshing HK News (default 5 mins)` | Fetches current news and starts five-minute refreshes. |
| `HK Live News: Manually refresh HK News` | Fetches the latest headlines immediately. |
| `HK Live News: Stop Refreshing HK News` | Stops scheduled refreshes. |
| `HK Live News: Show Next HK News Headline` | Selects the next headline. |
| `HK Live News: Show Previous HK News Headline` | Selects the previous headline. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+D` | Show the next headline. |
| `Alt+A` | Show the previous headline. |

## Requirements

- VS Code `1.125.0` or later.
- Network access to `news.rthk.hk`.
- A Puppeteer-compatible Chrome installation. If Puppeteer did not download Chrome during dependency installation, run:

 ```sh
 pnpm exec puppeteer browsers install chrome
 ```

On Linux, Chrome may also require the system libraries listed in the [Puppeteer troubleshooting guide](https://pptr.dev/troubleshooting).

## Development

```sh
pnpm install
pnpm run compile
pnpm run lint
pnpm test
```

Run `pnpm run watch` while developing to continuously compile the extension.

## Known Limitations

- Headline and article extraction depends on the current RTHK page structure. A site redesign can require scraper updates.
- The extension displays up to 50 headlines per refresh.
- No extension settings are currently provided; refreshing is fixed at five minutes and automatic headline rotation at one minute.
- VS Code does not provide extensions with status-bar hover events, so automatic rotation cannot pause specifically while the headline tooltip is open. Use **Stop Refreshing HK News** to pause it.

## Release Notes

### 1.0.0

- First stable release of HK Live News.
- Brings current Chinese-language RTHK headlines to the VS Code status bar.
- Includes automatic five-minute refreshes, one-minute headline rotation, status-bar navigation, and article links.

## License

MIT
