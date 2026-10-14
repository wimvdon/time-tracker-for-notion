# Testing

## Running the tests

Windows app (Node's built-in test runner, no extra framework):

```bash
cd windows
npm install
npm test            # node --test, unit tests in src/ and electron/
npm run lint        # ESLint
npm run check       # lint + unit tests + build
```

The tests import only pure modules and the Zustand store with a stubbed `window.notionAPI`, so they run without Electron. On a fresh checkout, `npm install --ignore-scripts` is enough and skips downloading the Electron binary.

CI (`.github/workflows/ci.yml`) runs lint and `npm test` on every pull request, and the release workflow runs them again before building the installer. A failing test blocks the merge and the release.

**Installer smoke test (Windows, in CI).** On every pull request and before every release, `windows/scripts/smoke-test-installer.ps1` installs the installer silently on a Windows machine, checks the Start menu shortcut, starts the installed app with all Electron fuses on, waits for its window (titled *Time Tracker*), checks it doesn't crash, and uninstalls it. Pull requests use the *Dev* installer, which is attached to the run so it can be tried by hand without touching the real app.

Android unit tests (`./gradlew testDebugUnitTest` in `android/`) cover the sync payload: round trips, the shapes the Windows app writes, rejecting non-sync pages, and the JSON helpers. CI runs them and then builds the debug and release APKs, so compile and R8 errors fail the check too.

## What is covered

All tests are unit tests. 45 tests across 8 files:

| File | Covers |
|---|---|
| `src/lib/rounding.test.js` | Round to nearest 5/10/15 at, below and above the midpoint; exact boundaries; minimum duration at stop |
| `src/lib/format.test.js` | Fallback title per date format; recognising generated titles in any format; leaving real descriptions alone |
| `src/lib/notionValues.test.js` | Building Notion values for every writable type; empty values omitted; number parsing; reading preset values saved by the Android app |
| `src/lib/color.test.js` | Light/dark workspace colour variants reach ~3:1 contrast; extremes (white, black, yellow) stay usable and recognisable |
| `src/lib/presets.test.js` | Untitled presets get their description or the workspace name; workspaces without presets are untouched |
| `src/store/useStore.test.js` | `init()` is idempotent under React StrictMode (no double interval); a failed running-timer query keeps the active timer |
| `electron/apiKey.test.cjs` | The API key is saved encrypted, an old plain key is moved over, plain fallback without encryption, clearing, undecryptable keys read as empty, the renderer never gets the encrypted field |
| `electron/bundlePath.test.cjs` | `app://bundle/` maps only to files inside `dist/`; `../` and encoded tricks, other schemes and hosts are refused |

## Strategy

- **Pure logic lives in `src/lib/` and gets unit tests.** Rounding, formatting and value conversion are where silent data errors would end up in the user's Notion database. They are kept free of I/O so `node --test` can cover them.
- **Cross-app compatibility is tested where it can break silently.** For example, preset values synced from Android must parse in the Windows app.
- **Regression tests for the store** pin down bugs that lost data or duplicated work: a cleared timer after a failed query, and double initialisation.
- **Security-relevant main-process logic is split into Electron-free modules** (`apiKey.cjs`, `bundlePath.cjs`) so it can be unit tested.
- **Not covered by unit tests:** the rest of the Electron main process (the installer smoke test only checks that it starts), `notionClient.cjs`, React views and the whole Android app. These are verified manually, and the `NOTION_API_BASE_URL` override exists to point the desktop app at a mock Notion server for that purpose.

No coverage tool is configured.
