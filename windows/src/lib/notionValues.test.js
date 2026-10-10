import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPropertyValue, coerceInputValue, emptyValueFor, WRITABLE_EXTRA_TYPES } from './notionValues.js';

test('empty values are omitted (null) for every writable type', () => {
  for (const type of WRITABLE_EXTRA_TYPES) {
    if (type === 'checkbox') continue;
    assert.equal(buildPropertyValue(type, emptyValueFor(type)), null, type);
  }
});

test('text-like types trim and wrap their value', () => {
  assert.deepEqual(buildPropertyValue('rich_text', '  notes '), {
    rich_text: [{ text: { content: 'notes' } }],
  });
  assert.deepEqual(buildPropertyValue('url', 'https://x.be '), { url: 'https://x.be' });
  assert.deepEqual(buildPropertyValue('email', 'a@b.be'), { email: 'a@b.be' });
  assert.deepEqual(buildPropertyValue('phone_number', '+32 470 00 00 00'), {
    phone_number: '+32 470 00 00 00',
  });
});

test('number parses strings and rejects non-numbers', () => {
  assert.deepEqual(buildPropertyValue('number', '2.5'), { number: 2.5 });
  assert.equal(buildPropertyValue('number', 'abc'), null);
});

test('select, status and multi_select use option names', () => {
  assert.deepEqual(buildPropertyValue('select', 'High'), { select: { name: 'High' } });
  assert.deepEqual(buildPropertyValue('status', 'Done'), { status: { name: 'Done' } });
  assert.deepEqual(buildPropertyValue('multi_select', ['a', 'b']), {
    multi_select: [{ name: 'a' }, { name: 'b' }],
  });
});

test('checkbox is sent with boolean value', () => {
  assert.deepEqual(buildPropertyValue('checkbox', true), { checkbox: true });
  assert.deepEqual(buildPropertyValue('checkbox', false), { checkbox: false });
});

test('people and relation wrap an id', () => {
  assert.deepEqual(buildPropertyValue('people', 'u1'), { people: [{ id: 'u1' }] });
  assert.deepEqual(buildPropertyValue('relation', 'p1'), { relation: [{ id: 'p1' }] });
});

test('date converts a datetime-local value to local ISO with offset', () => {
  const result = buildPropertyValue('date', '2026-06-11T14:30');
  assert.match(result.date.start, /^2026-06-11T14:30:00\.000[+-]\d{2}:\d{2}$/);
});

test('files wraps a URL as an external file', () => {
  assert.deepEqual(buildPropertyValue('files', 'https://x.be/f.pdf'), {
    files: [{ name: 'https://x.be/f.pdf', type: 'external', external: { url: 'https://x.be/f.pdf' } }],
  });
});

test('preset values synced from Android are read in this app\'s input shapes', () => {
  assert.deepEqual(coerceInputValue('multi_select', 'a, b,'), ['a', 'b']);
  assert.deepEqual(coerceInputValue('multi_select', ['a']), ['a']);
  assert.equal(coerceInputValue('checkbox', 'false'), false);
  assert.equal(coerceInputValue('checkbox', 'true'), true);
  assert.equal(coerceInputValue('checkbox', true), true);
  assert.equal(coerceInputValue('relation', 'id1,id2'), 'id1');
  assert.equal(coerceInputValue('people', ''), '');
  assert.equal(coerceInputValue('rich_text', 'notes'), 'notes');
  assert.equal(coerceInputValue('number', 3), '3');
  assert.deepEqual(coerceInputValue('multi_select', null), []);
});
