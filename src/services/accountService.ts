import { ethers } from 'ethers';
import { getProvider, requireChain, toChecksumAddress } from '../blockchain.js';
import { logger } from '../logger.js';

export interface BalanceInfo {
  address: string;
  chainId: string;
  chainName: string;
  balance: string;
  symbol: string;
}

/** Returns the native-token balance for an address on the given chain. */
export async function getBalance(chainId: string, address: string): Promise<BalanceInfo> {
  const chain = requireChain(chainId);
  const checksummed = toChecksumAddress(address);

  const provider = getProvider(chainId);
  const balanceWei = await provider.getBalance(checksummed);

  logger.debug(`Fetched balance for ${checksummed} on chain ${chainId}`);

  return {
    address: checksummed,
    chainId: chain.id,
    chainName: chain.name,
    balance: ethers.formatUnits(balanceWei, chain.nativeCurrency.decimals),
    symbol: chain.nativeCurrency.symbol,
  };
}
