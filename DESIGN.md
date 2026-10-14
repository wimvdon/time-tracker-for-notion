# Design

Time Tracker for Notion (Android) is one of three sibling Android apps (Tracker for Simkl, Time Tracker for Notion and
Snoozer) that share one design language. This file is the same in each repository apart from
the "This app" section; change the rules in all three together.

## Icons

- White adaptive-icon background.
- One bold shape with a diagonal gradient through neighbouring hues (top left to bottom
  right), filling most of the 66dp safe zone.
- One white detail inside that shape.
- A themed (monochrome) layer: the same shape with the detail cut out.

| App | Shape | Gradient |
| --- | --- | --- |
| Tracker for Simkl | TV with a play button | `#3D7BFF` → `#7A5CFF` → `#D15CE6` |
| Time Tracker for Notion | Stopwatch dial with a hand | `#FF8A3D` → `#F04438` → `#C81E5A` |
| Snoozer | Nine-lobed "cookie" (the home screen toggle) with a bell | `#22C3B4` → `#3E7BDA` → `#4E5BB0` |

## Colour

- Each app's fallback palette is a full Material 3 tonal scheme generated from its icon's
  middle gradient stop, so every colour role is set (none fall back to Material's purple).
- Settings › Theme offers System / Light / Dark and, on Android 12+, a Dynamic color switch.
  Dynamic color is off by default so the app's own colours show.
- The status and navigation bar icons follow the app's theme, not the system's
  (`SystemBarsFollowTheme`).
- `android:windowBackground` (and the splash background) matches the theme's background.

## Material 3

- Top app bars are Material's `TopAppBar` family with the default title style
  (Title Large, regular weight). Weight is not used to make app bar titles stand out.
- Emphasis through weight is kept for hero content (a title on a detail page, a big number).
- Button labels are in sentence case.
- Icons come from Material's Rounded set; direction-dependent icons use `AutoMirrored`.
- Cards and grouped surfaces use the `surfaceContainer*` roles.
- Components keep Material's shape scale (`MaterialTheme.shapes`). App-level containers use
  `AppShapes`: `Group` (24dp) for grouped settings and banners, `Item` (20dp) for rows in a list.

## Settings screen

Built from `ui/theme/SettingsKit.kt`, so every app's settings look and behave the same:

- `SettingsScaffold`: a large top app bar ("Settings") that collapses on scroll, with a back
  button, over a list of sections.
- Every section is a `CollapsibleSection` card: icon, title and the current value as summary;
  tap to expand. Sections start collapsed, except one the user still has to fill in (no API key
  or workspace yet).
- Inside a section: `SwitchSetting` rows (the whole row is the switch), segmented buttons for a
  single choice, `CollapsibleSubsection` for longer instructions.
- Sections in this order, leaving out what an app does not have:
  1. Connection (account, API key, sync)
  2. The app's own features
  3. Shortcuts and integrations
  4. Appearance (`AppearanceSettings`: Theme, then Dynamic color)
  5. Language and formats
  6. `SettingsFooter`: app name and version, plus links such as data sources

## Motion

- Material 3 easing and duration tokens in `Motion`.
- Screens change with the shared-axis X transition (`Motion.sharedAxisX`, 30dp).
- State changes fade through (`Motion.fadeSpec`).
- Decorative animation is skipped when the user turned animations off
  (`rememberReducedMotion()`).

## Loading

- Content that loads over the network shows placeholders while it loads for the first time
  (`ui/theme/Skeleton.kt`), shaped like what will appear: poster tiles, list rows, form fields,
  lines of text. A soft highlight sweeps across them; with animations off they stay still.
- Screen readers read the placeholders out as one "Loading…" element.
- A refresh keeps the content on screen and shows pull-to-refresh or a small progress
  indicator instead; a busy button shows a spinner in place of its icon.
- An app with nothing to load (Snoozer) leaves `Skeleton.kt` out.

## Wording

Shared settings and actions use the same words in every app and language (strings are kept in
English, Dutch, German, French, Spanish and Italian).

| Meaning | en | nl | de | fr | es | it |
| --- | --- | --- | --- | --- | --- | --- |
| Theme: follow the device | System | Systeem | System | Système | Sistema | Sistema |
| Theme: light / dark | Light / Dark | Licht / Donker | Hell / Dunkel | Clair / Sombre | Claro / Oscuro | Chiaro / Scuro |
| Settings section | Appearance | Weergave | Darstellung | Apparence | Apariencia | Aspetto |
| Wallpaper colours | Dynamic color | Dynamische kleuren | Dynamische Farben | Couleurs dynamiques | Color dinámico | Colori dinamici |
| Back | Back | Terug | Zurück | Retour | Atrás | Indietro |
| Cancel / Save | Cancel / Save | Annuleren / Opslaan | Abbrechen / Speichern | Annuler / Enregistrer | Cancelar / Guardar | Annulla / Salva |
| Clear | Clear | Wissen | Löschen | Effacer | Borrar | Cancella |
| Retry | Retry | Opnieuw proberen | Wiederholen | Réessayer | Reintentar | Riprova |

- Prefer the shortest clear wording ("System", not "Follow device (Auto)").
- American spelling in English ("color").
- Address the user informally in Dutch, German, Spanish and Italian (je, du, tú, tu) and with
  "vous" in French.
- Labels and buttons in sentence case.

## Shared design kit

These files are identical in the three apps apart from their package (and `R` import) lines. Copy a change to
the other two repositories:

- `ui/theme/Motion.kt`: motion tokens, the shared-axis transition and `rememberReducedMotion()`.
- `ui/theme/Shapes.kt`: `AppShapes`.
- `ui/theme/SystemBars.kt`: `SystemBarsFollowTheme()`.
- `ui/theme/Skeleton.kt`: loading placeholders (`Modifier.skeleton()`, `SkeletonLine`,
  `SkeletonBlock`).
- `ui/theme/SettingsKit.kt`: the settings screen components above. It also needs
  `drawable/ic_arrow_back`, `drawable/ic_expand_more` and the strings `section_expanded` and
  `section_collapsed`.

## This app

- Seed `#F04438` (red), green tertiary (`#16A34A`) for Start when a workspace has no colour.
- Signature element: the timer. The elapsed time sits on a nine-lobed cookie shape (the
  Material 3 Expressive shape Snoozer's toggle uses), on both the idle and the running screen:
  idle it stands still at 00:00:00; running it turns slowly and springs in when the timer
  starts, over the same slowly breathing glow as Snoozer's snoozing screen. No progress ring:
  a running timer has no target. Start and Stop are Material 3 Expressive medium buttons
  (56dp, Title Medium label, 24dp icon), round, tightening to 12dp corners while pressed. They
  sit on the cookie's bottom edge, overlapping it by half their height, as a FAB anchored to a
  surface does: labelled, full size, and never over the time. Because they sit on the cookie
  they are never see-through: busy, they keep their colour with a spinner; unavailable, they
  take a solid grey.
- Idle and running share one layout, top to bottom: preset chips; the workspace as the
  screen's title (Headline Small, its colour dot; idle, a button opening the workspace menu,
  each workspace with its dot); the cookie with Start or Stop; one card (`AppShapes.Group`)
  holding every timer field; the lists.
- Presets are made and changed in one place: the pen after the preset chips opens Manage
  presets (each preset: its name over its workspace with colour dot; move up, move down,
  edit, remove), with New preset as a dialog action. New and Edit open a full-screen editor
  (workspace, name, description, extra fields); a new preset starts from the timer form.
  Before the first preset, a "New preset" chip stands in for the chips.
- The card's fields are standard outlined fields with the field's name as its own floating
  label: description, start time (and end time while running), extra fields. Idle, the start
  time is empty ("Now") unless the user picks one for a timer they forgot to start.
- List sections (Active timers, Recent time entries) start with a Title Medium heading and
  are set apart by space, not dividers.
- Start is green and Stop is red whatever the theme or wallpaper colours (a workspace colour
  replaces the green), so their meaning never depends on Dynamic color.
- The launcher icon comes from `windows/scripts/generate-icons.cjs` (`npm run icons`), which
  also draws the Windows icons. Edit the artwork there, not the generated XML.
- The Windows app is not covered by this file. Its timer follows the same order in Fluent
  terms (Subtitle workspace title as a drop-down button, the time in Title Large on a card with
  Start or Stop as the card's action, a card with every field; presets made and edited from
  Manage presets), so the two apps are recognisably the same.
