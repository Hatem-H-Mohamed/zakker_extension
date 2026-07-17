# Contributing to Zakker

This doc is for anyone developing on Zakker with me. It covers the architecture, data flow, and conventions that aren't obvious just from skimming the files.

## Tech stack

Plain vanilla JS, HTML, and CSS on top of the Chrome Extension **Manifest V3** APIs. No build step, no bundler, no framework — you can edit a file and reload the extension to see the change.

## Getting set up

1. Clone the repo.
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the repo folder.
4. After editing any file, go back to `chrome://extensions` and click the refresh icon on the Zakker card.
   - Changes to `content.js` / `content.css` also require reloading the target webpage.
   - Changes to `background.js` restart the service worker automatically on refresh, but you can also inspect it directly via **service worker** link on the extension card (opens its own DevTools).
5. To see console logs from the popup, right-click the toolbar icon → **Inspect popup**.

## Architecture

Three independent execution contexts talk to each other via `chrome.runtime` messaging:

```
┌─────────────┐   SETTINGS_UPDATED    ┌──────────────────┐
│  popup.js    │ ───────────────────► │  background.js    │  (service worker)
│  (popup UI)  │        SHOW_NOW      │  - owns alarms     │
└─────────────┘ ───────────────────► │  - owns azkar queue│
                                       │  - decides how to  │
                                       │    show a zikr     │
                                       └────────┬───────────┘
                                                │ DISPLAY_ZIKR
                                                ▼
                                       ┌──────────────────┐
                                       │  content.js       │  (runs in every tab)
                                       │  - renders overlay │
                                       │    card            │
                                       └──────────────────┘
```

### `background.js` — service worker

The brain of the extension. Responsibilities:

- **Settings bootstrap**: on install/startup, merges `DEFAULT_SETTINGS` with whatever's in `chrome.storage.sync`.
- **Azkar loading**: reads `daily_azkar.json` once on install and caches it into `chrome.storage.local` as `azkarList`.
- **Scheduling**: uses `chrome.alarms` (not `setTimeout` — service workers get killed when idle, alarms survive that) to fire every `intervalMinutes`.
- **Queue management**: keeps a `shuffledQueue` of azkar IDs in `chrome.storage.local` so every zikr is shown once before any repeat; reshuffles when the queue empties. See `shuffle()` / `getNextZikr()`.
- **Display routing** (`showZikr`): based on `displayMode` setting, either:
  - `notification` → `chrome.notifications.create(...)`
  - `overlay` → sends `DISPLAY_ZIKR` to the active tab's content script
  - `both` → tries the overlay first (only if Chrome is focused/not minimized, or the call was manual), falls back to a system notification if that fails (e.g. content script not injected on that page, like `chrome://` URLs)

Service workers in MV3 are **event-driven and non-persistent** — don't add module-level state that needs to survive between events; put anything that must persist into `chrome.storage`.

### `content.js` + `content.css` — page overlay

Injected into every page (`matches: ["<all_urls>"]`, `run_at: "document_idle"`). Listens for `DISPLAY_ZIKR` messages and renders a self-contained glassmorphism card (`#zakker-overlay-card`) built with plain DOM APIs (no innerHTML, to avoid any injection risk on arbitrary pages). Auto-dismisses after `AUTO_DISMISS_MS` (5s) or on manual close. Always rendered `dir="rtl"` since the azkar text is Arabic.

### `popup.js` + `popup.html` + `popup.css` — settings UI

Reads/writes settings directly to `chrome.storage.sync` and notifies the background script via `SETTINGS_UPDATED` so it can reschedule the alarm immediately (rather than waiting for the next `onStartup`). Also handles:
- The custom dropdown component for interval selection (`#intervalContainer`) — this is a hand-rolled UI, not a native `<select>`; the native `<select id="interval">` is kept hidden in the DOM purely as the source of truth that `popup.js` reads from.
- i18n: loads `_locales/<lang>/messages.json` at runtime (independent of Chrome's built-in `chrome.i18n` API, so the user can toggle language without reinstalling) and applies text to any element with `data-i18n="key"`.
- `showNow` button → sends `SHOW_NOW` to trigger an immediate zikr display.

## Message contract

| Message type | Sender → Receiver | Payload | Purpose |
|---|---|---|---|
| `SETTINGS_UPDATED` | popup → background | full settings object | Persist settings + reschedule alarm |
| `SHOW_NOW` | popup → background | none | Force-show a zikr immediately |
| `DISPLAY_ZIKR` | background → content script | `{ text }` | Render the overlay card |

If you add a new message type, document it here.

## Storage schema

| Key | Storage area | Shape | Notes |
|---|---|---|---|
| `enabled` | `sync` | `boolean` | Master on/off switch |
| `intervalMinutes` | `sync` | `number` | Minutes between reminders |
| `displayMode` | `sync` | `"notification" \| "overlay" \| "both"` | |
| `muteNotificationSound` | `sync` | `boolean` | |
| `language` | `sync` | `"en" \| "ar"` | Popup UI language |
| `azkarList` | `local` | `{ id: number, text: string }[]` | Loaded from `daily_azkar.json` on install |
| `shuffledQueue` | `local` | `number[]` | Remaining zikr IDs for the current shuffle cycle |

`sync` storage is used for anything the user configures (so it follows them across signed-in Chrome instances); `local` is used for the derived azkar cache/queue, which is regenerated as needed and not worth syncing.

## Adding or editing azkar

Edit `daily_azkar.json` — it's a flat array of `{ "id": number, "text": string }`. IDs just need to be unique; they aren't shown to the user. The cache in `chrome.storage.local` is only refreshed on `chrome.runtime.onInstalled`, so during development, reload the unpacked extension (which re-triggers `onInstalled`) after changing this file, or manually clear storage.

## Adding a new setting

1. Add it to `DEFAULT_SETTINGS` in `background.js`.
2. Add the corresponding form control in `popup.html`, wire it up in `popup.js` (`getSettingsFromForm` / `applySettingsToForm`), and add a listener that calls `sendSettingsUpdate()`.
3. Add any new i18n strings to **both** `_locales/en/messages.json` and `_locales/ar/messages.json`.
4. If the setting affects display behavior, handle it in `showZikr()` in `background.js`.

## Adding a translation string

Add the key to both `_locales/en/messages.json` and `_locales/ar/messages.json`, then reference it in `popup.html` via `data-i18n="yourKey"`. Missing keys silently fall back to the existing hardcoded text in the HTML.

## Code style

- No build tooling — code must run as-is in the browser. Stick to standard ES2020+ features supported by current Chrome.
- No frameworks/libraries. Keep it dependency-free.
- DOM construction in `content.js` uses `createElement`/`textContent`, never `innerHTML`, since it runs on arbitrary third-party pages.
- Keep `background.js` stateless between events — persist everything needed across service-worker restarts in `chrome.storage`.

## Testing changes manually

There's no automated test suite yet. When testing changes, check:
- Reload behavior after `chrome://extensions` refresh (does state survive correctly via storage?).
- All three display modes (`notification`, `overlay`, `both`), including on a page where content scripts can't run (e.g. `chrome://newtab`) to confirm the `both` fallback works.
- Both languages (`en`/`ar`) and RTL layout.
- Interval changes taking effect immediately (check `chrome://extensions` service worker inspector or the alarm via `chrome.alarms.getAll()` in the console).

## Submitting changes

Open a PR against `master`. Keep changes focused — one feature/fix per PR. Since there's no CI yet, please manually verify the checklist above before requesting review.
