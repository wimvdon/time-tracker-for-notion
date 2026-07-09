import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkspaceColorVariants, contrastRatio } from './color.js';

test('light variant contrasts >=4.5:1 against white for bright colors', () => {
  const { light } = getWorkspaceColorVariants('#eab308'); // bright yellow
  assert.ok(contrastRatio(light, '#ffffff') >= 4.45);
});

test('dark variant contrasts >=4.5:1 against near-black for dark colors', () => {
  const { dark } = getWorkspaceColorVariants('#1e3a5f'); // dark navy
  assert.ok(contrastRatio(dark, '#18181b') >= 4.45);
});

test('already-compliant colors are left close to the original', () => {
  const hex = '#3b82f6'; // preset blue, already reasonably dark
  const { light } = getWorkspaceColorVariants(hex);
  assert.ok(contrastRatio(light, '#ffffff') >= 4.45);
});

test('white input still produces usable variants', () => {
  const { light, dark } = getWorkspaceColorVariants('#ffffff');
  assert.ok(contrastRatio(light, '#ffffff') >= 4.45);
  assert.ok(contrastRatio(dark, '#18181b') >= 4.45);
});

test('black input still produces usable variants', () => {
  const { light, dark } = getWorkspaceColorVariants('#000000');
  assert.ok(contrastRatio(light, '#ffffff') >= 4.45);
  assert.ok(contrastRatio(dark, '#18181b') >= 4.45);
});
