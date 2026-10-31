import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, isSignInCancelled } from './errors.js';

test('strips the IPC wrapper from error messages', () => {
  const err = new Error("Error invoking remote method 'notion:create': Error: Could not find database");
  assert.equal(errorMessage(err), 'Could not find database');
});

test('"not signed in" from the main process becomes a readable message', () => {
  const err = new Error("Error invoking remote method 'notion:create': Error: NOT_SIGNED_IN");
  assert.notEqual(errorMessage(err), 'NOT_SIGNED_IN');
  assert.match(errorMessage(err), /Notion/);
});

test('a sign-in the user cancelled is recognised', () => {
  assert.equal(isSignInCancelled(new Error("Error invoking remote method 'auth:signIn': Error: SIGN_IN_CANCELLED")), true);
  assert.equal(isSignInCancelled(new Error('Notion sign-in failed (invalid_grant)')), false);
});
