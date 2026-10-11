/**
 * A preset's title is the only label its chip, the tray menu and launcher
 * shortcuts show, so every preset needs one. Presets saved before the title
 * was required get one here: their default description, or else their
 * workspace's name (what their chip showed before). Android applies the same
 * rule, so both apps settle on the same titles for a synced preset.
 */
export function withPresetTitles(workspace) {
  const presets = (workspace.presets || []).map((p) => {
    const name = p.name?.trim() || p.pageTitle?.trim() || workspace.name;
    return name === p.name ? p : { ...p, name };
  });
  return { ...workspace, presets };
}

/** True when `withPresetTitles` would change any of this workspace's presets. */
export function needsPresetTitles(workspace) {
  return (workspace.presets || []).some(
    (p) => p.name !== (p.name?.trim() || p.pageTitle?.trim() || workspace.name)
  );
}
