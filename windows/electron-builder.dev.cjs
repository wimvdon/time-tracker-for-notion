// Installer for pull request / test builds (npm run dist:dev): the normal build settings from
// package.json, but as a separate app, "Time Tracker for Notion Dev", with its own app ID,
// Start menu entry and settings folder. It installs next to the real app, so testing a
// pull request never touches your real settings, API key or running timer.
const pkg = require('./package.json');

const productName = `${pkg.build.productName} Dev`;

module.exports = {
  ...pkg.build,
  appId: `${pkg.build.appId}.dev`,
  productName,
  // The packaged package.json decides the app's name at runtime, and with it the settings
  // folder (%APPDATA%\Time Tracker for Notion Dev) and the single-instance lock.
  extraMetadata: { name: `${pkg.name}-dev`, productName },
};
