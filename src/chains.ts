import { config } from './config.js';

/**
 * Built-in registry of supported EVM chains.
 *
 * Every chain ships with a **free public RPC endpoint** (no API key required),
 * so the server works out of the box. Any endpoint can be overridden with an
 * `RPC_URL_<chainId>` environment variable, e.g. `RPC_URL_1=https://...`.
 */

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface Chain {
  /** Decimal chain id as a string, e.g. "1". */
  id: string;
  name: string;
  nativeCurrency: NativeCurrency;
  /** Default public RPC URL (overridable via RPC_URL_<id>). */
  rpcUrl: string;
  explorerUrl: string;
  testnet: boolean;
}

const CHAINS: Chain[] = [
  {
    id: '1',
    name: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    testnet: false,
  },
  {
    id: '11155111',
    name: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    testnet: true,
  },
  {
    id: '137',
    name: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
    testnet: false,
  },
  {
    id: '80002',
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrl: 'https://polygon-amoy-bor-rpc.publicnode.com',
    explorerUrl: 'https://amoy.polygonscan.com',
    testnet: true,
  },
  {
    id: '8453',
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://base-rpc.publicnode.com',
    explorerUrl: 'https://basescan.org',
    testnet: false,
  },
  {
    id: '84532',
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://base-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.basescan.org',
    testnet: true,
  },
  {
    id: '42161',
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    explorerUrl: 'https://arbiscan.io',
    testnet: false,
  },
  {
    id: '10',
    name: 'OP Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://optimism-rpc.publicnode.com',
    explorerUrl: 'https://optimistic.etherscan.io',
    testnet: false,
  },
];

const CHAINS_BY_ID = new Map(CHAINS.map((c) => [c.id, c]));

/** Returns all supported chains. */
export function getChains(): Chain[] {
  return CHAINS;
}

/** Looks up a chain by its decimal id (string). Returns undefined if unknown. */
export function getChainById(chainId: string): Chain | undefined {
  return CHAINS_BY_ID.get(String(chainId));
}

/**
 * Resolves the RPC URL to use for a chain, applying (in priority order):
 *  1. `RPC_URL_<chainId>` environment override
 *  2. an Infura endpoint if INFURA_API_KEY is set and the chain is supported
 *  3. the built-in public RPC
 */
export function getRpcUrl(chain: Chain): string {
  const override = process.env[`RPC_URL_${chain.id}`];
  if (override) return override;

  if (config.infuraApiKey) {
    const infuraHost = INFURA_HOSTS[chain.id];
    if (infuraHost) return `https://${infuraHost}/v3/${config.infuraApiKey}`;
  }

  return chain.rpcUrl;
}

const INFURA_HOSTS: Record<string, string> = {
  '1': 'mainnet.infura.io',
  '11155111': 'sepolia.infura.io',
  '137': 'polygon-mainnet.infura.io',
  '80002': 'polygon-amoy.infura.io',
  '8453': 'base-mainnet.infura.io',
  '84532': 'base-sepolia.infura.io',
  '42161': 'arbitrum-mainnet.infura.io',
  '10': 'optimism-mainnet.infura.io',
};
