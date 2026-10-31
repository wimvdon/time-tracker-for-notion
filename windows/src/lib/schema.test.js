import test from 'node:test';
import assert from 'node:assert/strict';
import { countMissingExtraProps } from './schema.js';
import { WRITABLE_EXTRA_TYPES } from './notionValues.js';

const schema = {
  Client: { type: 'select' },
  Project: { type: 'relation' },
  Hours: { type: 'formula' },
};

test('fields Notion does not send, and fields the app cannot write, count as missing', () => {
  const extraProps = [{ propName: 'Client' }, { propName: 'Project' }, { propName: 'Gone' }, { propName: 'Hours' }];
  assert.equal(countMissingExtraProps(extraProps, schema, WRITABLE_EXTRA_TYPES), 2);
});

test('nothing is missing when every field is there, or none are configured', () => {
  assert.equal(countMissingExtraProps([{ propName: 'Client' }, { propName: '' }], schema, WRITABLE_EXTRA_TYPES), 0);
  assert.equal(countMissingExtraProps(undefined, schema, WRITABLE_EXTRA_TYPES), 0);
});
