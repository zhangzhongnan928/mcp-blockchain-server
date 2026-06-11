import { randomUUID } from 'node:crypto';
import { ethers } from 'ethers';
import { getProvider, requireChain, toChecksumAddress } from '../blockchain.js';
import { logger } from '../logger.js';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
  type StoredTransaction,
} from '../store.js';

export interface PrepareTransactionInput {
  chainId: string;
  to: string;
  /** Amount in the native token (e.g. "0.01"). Defaults to "0". */
  value?: string;
  /** Calldata hex string. Defaults to "0x". */
  data?: string;
  /** Gas limit as a decimal string. Optional — wallet estimates if omitted. */
  gasLimit?: string;
}

const HEX_DATA = /^0x([0-9a-fA-F]{2})*$/;

/** Converts a non-negative bigint to a minimal 0x-hex string (e.g. 0n -> "0x0"). */
function toMinimalHex(value: bigint): string {
  return '0x' + value.toString(16);
}

/**
 * Validates and stores an unsigned transaction for the user to review and sign
 * in their own wallet. Nothing is broadcast here — only a record is created.
 */
export async function prepareTransaction(input: PrepareTransactionInput): Promise<StoredTransaction> {
  const chain = requireChain(input.chainId);
  const to = toChecksumAddress(input.to);

  const valueDisplay = (input.value ?? '0').trim() || '0';
  let valueWeiHex: string;
  try {
    valueWeiHex = toMinimalHex(ethers.parseEther(valueDisplay));
  } catch {
    throw new Error(`Invalid value "${valueDisplay}". Provide an amount in ${chain.nativeCurrency.symbol}, e.g. "0.01".`);
  }

  const data = (input.data ?? '0x').trim() || '0x';
  if (!HEX_DATA.test(data)) {
    throw new Error(`Invalid data "${data}". Must be a 0x-prefixed hex string.`);
  }

  let gasLimitHex: string | undefined;
  if (input.gasLimit !== undefined && input.gasLimit !== '') {
    let gas: bigint;
    try {
      gas = BigInt(input.gasLimit);
    } catch {
      throw new Error(`Invalid gasLimit "${input.gasLimit}". Must be an integer number of gas units.`);
    }
    if (gas <= 0n) throw new Error('gasLimit must be a positive integer.');
    gasLimitHex = toMinimalHex(gas);
  }

  const now = new Date().toISOString();
  const tx: StoredTransaction = {
    id: randomUUID(),
    chainId: chain.id,
    to,
    valueDisplay,
    valueWeiHex,
    data,
    gasLimitHex,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };

  await createTransaction(tx);
  logger.info(`Prepared transaction ${tx.id} on chain ${chain.id}`);
  return tx;
}

/** Returns a stored transaction by id. */
export function getTransactionById(id: string): StoredTransaction | undefined {
  return getTransaction(id);
}

/**
 * Records that the user broadcast the transaction from their wallet, then
 * watches for on-chain confirmation in the background.
 */
export async function markSubmitted(
  id: string,
  txHash: string,
  from?: string,
): Promise<StoredTransaction> {
  const tx = getTransaction(id);
  if (!tx) throw new Error(`Transaction ${id} not found.`);
  if (tx.status !== 'PENDING') {
    throw new Error(`Transaction ${id} is already ${tx.status} and cannot be submitted again.`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error(`Invalid transaction hash "${txHash}".`);
  }

  const updated = await updateTransaction(id, {
    status: 'SUBMITTED',
    txHash,
    from: from ? toChecksumAddress(from) : tx.from,
  });

  // Watch for confirmation without blocking the caller.
  void watchConfirmation(id, txHash, tx.chainId);
  return updated!;
}

/** Marks a pending transaction as rejected by the user. */
export async function markRejected(id: string): Promise<StoredTransaction> {
  const tx = getTransaction(id);
  if (!tx) throw new Error(`Transaction ${id} not found.`);
  if (tx.status !== 'PENDING') {
    throw new Error(`Transaction ${id} is already ${tx.status} and cannot be rejected.`);
  }
  return (await updateTransaction(id, { status: 'REJECTED' }))!;
}

/** Waits for the transaction to be mined and updates its final status. */
async function watchConfirmation(id: string, txHash: string, chainId: string): Promise<void> {
  try {
    const provider = getProvider(chainId);
    const receipt = await provider.waitForTransaction(txHash);

    if (receipt && receipt.status === 1) {
      await updateTransaction(id, { status: 'CONFIRMED' });
      logger.info(`Transaction ${id} confirmed (${txHash})`);
    } else {
      await updateTransaction(id, { status: 'FAILED', error: 'Transaction reverted on-chain.' });
      logger.warn(`Transaction ${id} reverted (${txHash})`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTransaction(id, { status: 'FAILED', error: message });
    logger.error(`Error watching confirmation for ${id}`, error);
  }
}
