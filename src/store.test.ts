import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the store at a throwaway directory before it (and config) are loaded.
const dir = mkdtempSync(path.join(tmpdir(), 'mcp-store-'));
process.env.MCP_DATA_DIR = dir;

const store = await import('./store.js');

function sample(id: string): store.StoredTransaction {
  const now = new Date().toISOString();
  return {
    id,
    chainId: '11155111',
    to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    valueDisplay: '0.01',
    valueWeiHex: '0x2386f26fc10000',
    data: '0x',
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
}

test('create, get and persist a transaction', async () => {
  await store.initStore();
  await store.createTransaction(sample('id-1'));

  const got = await store.getTransaction('id-1');
  assert.equal(got?.status, 'PENDING');

  const onDisk = JSON.parse(readFileSync(path.join(dir, 'transactions.json'), 'utf8'));
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].id, 'id-1');
});

test('update mutates status and bumps updatedAt', async () => {
  await store.createTransaction(sample('id-2'));
  const before = (await store.getTransaction('id-2'))!.updatedAt;
  await new Promise((r) => setTimeout(r, 5));

  const updated = await store.updateTransaction('id-2', { status: 'CONFIRMED', txHash: '0xabc' });
  assert.equal(updated?.status, 'CONFIRMED');
  assert.equal(updated?.txHash, '0xabc');
  assert.notEqual(updated?.updatedAt, before);
});

test('updating a missing transaction returns undefined', async () => {
  const result = await store.updateTransaction('nope', { status: 'FAILED' });
  assert.equal(result, undefined);
});

test('listTransactions returns most-recent first', async () => {
  const all = await store.listTransactions();
  assert.ok(all.length >= 2);
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].createdAt >= all[i].createdAt);
  }
});
