import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redisConfigFromEnv } from './redisBackend.js';

const ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
] as const;

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

test('returns undefined when no Redis credentials are present', () => {
  clearEnv();
  assert.equal(redisConfigFromEnv(), undefined);
});

test('reads the Upstash env names', () => {
  clearEnv();
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-a';
  assert.deepEqual(redisConfigFromEnv(), {
    url: 'https://example.upstash.io',
    token: 'token-a',
  });
  clearEnv();
});

test('falls back to the Vercel KV env names', () => {
  clearEnv();
  process.env.KV_REST_API_URL = 'https://kv.example.io';
  process.env.KV_REST_API_TOKEN = 'token-b';
  assert.deepEqual(redisConfigFromEnv(), {
    url: 'https://kv.example.io',
    token: 'token-b',
  });
  clearEnv();
});

test('requires both url and token', () => {
  clearEnv();
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  assert.equal(redisConfigFromEnv(), undefined);
  clearEnv();
});
