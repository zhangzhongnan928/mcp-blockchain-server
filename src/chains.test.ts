import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getChains, getChainById, getRpcUrl } from './chains.js';

test('every chain has the required fields', () => {
  for (const chain of getChains()) {
    assert.ok(chain.id, 'id');
    assert.ok(chain.name, 'name');
    assert.ok(chain.rpcUrl.startsWith('https://'), `rpcUrl for ${chain.id}`);
    assert.ok(chain.explorerUrl.startsWith('https://'), `explorerUrl for ${chain.id}`);
    assert.equal(typeof chain.testnet, 'boolean');
    assert.ok(chain.nativeCurrency.symbol, 'currency symbol');
    assert.equal(chain.nativeCurrency.decimals, 18);
  }
});

test('getChainById resolves known and unknown ids', () => {
  assert.equal(getChainById('1')?.name, 'Ethereum Mainnet');
  assert.equal(getChainById('11155111')?.testnet, true);
  assert.equal(getChainById('does-not-exist'), undefined);
});

test('getRpcUrl honours RPC_URL_<id> overrides', () => {
  const chain = getChainById('1')!;
  assert.equal(getRpcUrl(chain), chain.rpcUrl);

  process.env.RPC_URL_1 = 'https://my-private-node.example';
  try {
    assert.equal(getRpcUrl(chain), 'https://my-private-node.example');
  } finally {
    delete process.env.RPC_URL_1;
  }
});
