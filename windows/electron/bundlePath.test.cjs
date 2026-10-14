const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveBundlePath } = require('./bundlePath.cjs');

const root = path.join(path.sep, 'app', 'dist');

test('maps app://bundle/ URLs to files in the UI folder', () => {
  assert.equal(resolveBundlePath(root, 'app://bundle/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveBundlePath(root, 'app://bundle/assets/a.js'), path.join(root, 'assets', 'a.js'));
  assert.equal(resolveBundlePath(root, 'app://bundle/'), path.join(root, 'index.html'));
});

test('ignores the query string (Mica and accent colour are passed there)', () => {
  assert.equal(
    resolveBundlePath(root, 'app://bundle/index.html?mica=1&accent=%23ff0000'),
    path.join(root, 'index.html'),
  );
});

test('never resolves outside the UI folder', () => {
  for (const url of [
    'app://bundle/../secret.txt',
    'app://bundle/%2e%2e/secret.txt',
    'app://bundle/assets/%2e%2e%2f%2e%2e%2fsecret.txt',
    'app://bundle/..%5csecret.txt',
    'app://bundle/a%00.js',
    'app://bundle/%E0%A4%A',
  ]) {
    const file = resolveBundlePath(root, url);
    assert.ok(file === null || file.startsWith(root + path.sep), url);
  }
});

test('refuses other schemes and hosts', () => {
  assert.equal(resolveBundlePath(root, 'file:///etc/passwd'), null);
  assert.equal(resolveBundlePath(root, 'app://other/index.html'), null);
  assert.equal(resolveBundlePath(root, 'not a url'), null);
});
