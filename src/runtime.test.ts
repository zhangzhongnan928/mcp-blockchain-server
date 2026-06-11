import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicBaseUrl, getBoundPort, setBoundPort } from './runtime.js';

test('default base URL uses the IPv4 loopback, not "localhost"', () => {
  // Avoids dual-stack ambiguity where "localhost" resolves to ::1 first.
  assert.match(getPublicBaseUrl(), /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('base URL reflects the actually-bound port', () => {
  setBoundPort(34567);
  assert.equal(getBoundPort(), 34567);
  assert.equal(getPublicBaseUrl(), 'http://127.0.0.1:34567');
});
