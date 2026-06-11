/**
 * Returns a clean, user-displayable message from an error. Errors crossing
 * the IPC bridge arrive wrapped as "Error invoking remote method 'x': Error:
 * actual message" — strip that noise so toasts show only the actual message.
 */
export function errorMessage(err) {
  return String(err?.message || err).replace(
    /^Error invoking remote method '[^']+':\s*(Error:\s*)?/,
    ''
  );
}
