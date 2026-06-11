import { ethers } from 'ethers';
import { getChainById, getRpcUrl, type Chain } from './chains.js';
import { logger } from './logger.js';

/**
 * Provider management. One cached {@link ethers.JsonRpcProvider} per chain.
 *
 * Providers are created with a static network hint so ethers does not re-poll
 * `eth_chainId` on every request — fewer round-trips, more stability.
 */

const providerCache = new Map<string, ethers.JsonRpcProvider>();

/** Returns the chain or throws a clear, user-facing error listing valid ids. */
export function requireChain(chainId: string): Chain {
  const chain = getChainById(chainId);
  if (!chain) {
    throw new Error(
      `Unsupported chainId "${chainId}". Use the "get-chains" tool to list supported networks.`,
    );
  }
  return chain;
}

/** Returns a cached provider for the given chain id, creating it on demand. */
export function getProvider(chainId: string): ethers.JsonRpcProvider {
  const cached = providerCache.get(chainId);
  if (cached) return cached;

  const chain = requireChain(chainId);
  const rpcUrl = getRpcUrl(chain);

  const provider = new ethers.JsonRpcProvider(rpcUrl, Number(chain.id), {
    staticNetwork: true,
  });

  providerCache.set(chainId, provider);
  logger.debug(`Created RPC provider for chain ${chainId} (${chain.name})`);
  return provider;
}

/** True if the string is a valid EVM address. */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/** Returns the checksummed form of an address, or throws if invalid. */
export function toChecksumAddress(address: string): string {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return ethers.getAddress(address);
}

/** Destroys all cached providers (used during graceful shutdown). */
export function closeAllProviders(): void {
  for (const [chainId, provider] of providerCache) {
    try {
      provider.destroy();
    } catch (error) {
      logger.warn(`Error destroying provider for chain ${chainId}`, error);
    }
  }
  providerCache.clear();
}
