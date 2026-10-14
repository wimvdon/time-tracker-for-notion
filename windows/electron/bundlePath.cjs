// Maps app://bundle/... URLs to files in the built UI folder (dist/), and nothing else.
// The window loads the UI from this private protocol instead of file:// (Electron security
// checklist), so the page cannot read other files on the PC. Electron-free, so it's unit
// tested in bundlePath.test.cjs.
const path = require('path');

const APP_SCHEME = 'app';
const APP_HOST = 'bundle';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

function resolveBundlePath(root, requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const file = path.normalize(path.join(root, pathname === '/' ? 'index.html' : pathname));
  const inside = path.relative(root, file);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return file;
}

module.exports = { APP_SCHEME, APP_HOST, APP_ORIGIN, resolveBundlePath };
