// When the description (page title) of a running timer is saved while the user types.
// Same rule and delay as the Android app (viewmodel/DescriptionAutoSave.kt).

/** Pause after the last keystroke before the description is written to Notion. */
export const DESCRIPTION_AUTOSAVE_DELAY_MS = 800;

/**
 * Saves only a real change. An emptied field is not saved while typing (the page would get
 * the date as title until the next word is typed); Enter, leaving the field or Stop saves it.
 */
export function shouldAutoSaveDescription(draft, saved) {
  const trimmed = (draft ?? '').trim();
  return trimmed !== '' && trimmed !== (saved ?? '').trim();
}
