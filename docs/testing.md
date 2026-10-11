# Testing

## Running the tests

Windows app (Node's built-in test runner, no extra framework):

```bash
cd windows
npm install
npm test            # node --test "src/**/*.test.js"
```

The tests import only pure modules and the Zustand store with a stubbed `window.notionAPI`, so they run without Electron. On a fresh checkout, `npm install --ignore-scripts` is enough and skips downloading the Electron binary.

CI runs `npm test` in the Windows job of `.github/workflows/release.yml` before building the installer. A failing test blocks the release.

The Android app has no test sources (`android/app/src/test` and `androidTest` don't exist), although the AndroidX test runner is configured in `app/build.gradle.kts`.

## What is covered

All tests are unit tests. 33 tests across 6 files:

| File | Covers |
|---|---|
| `src/lib/rounding.test.js` | Round to nearest 5/10/15 at, below and above the midpoint; exact boundaries; minimum duration at stop |
| `src/lib/format.test.js` | Fallback title per date format; recognising generated titles in any format; leaving real descriptions alone |
| `src/lib/notionValues.test.js` | Building Notion values for every writable type; empty values omitted; number parsing; reading preset values saved by the Android app |
| `src/lib/color.test.js` | Light/dark workspace colour variants reach ~3:1 contrast; extremes (white, black, yellow) stay usable and recognisable |
| `src/lib/presets.test.js` | Untitled presets get their description or the workspace name; workspaces without presets are untouched |
| `src/store/useStore.test.js` | `init()` is idempotent under React StrictMode (no double interval); a failed running-timer query keeps the active timer |

## Strategy

- **Pure logic lives in `src/lib/` and gets unit tests.** Rounding, formatting and value conversion are where silent data errors would end up in the user's Notion database. They are kept free of I/O so `node --test` can cover them.
- **Cross-app compatibility is tested where it can break silently.** For example, preset values synced from Android must parse in the Windows app.
- **Regression tests for the store** pin down bugs that lost data or duplicated work: a cleared timer after a failed query, and double initialisation.
- **Not covered:** the Electron main process, `notionClient.cjs`, React views and the whole Android app. These are verified manually, and the `NOTION_API_BASE_URL` override exists to point the desktop app at a mock Notion server for that purpose.

No coverage tool is configured.
