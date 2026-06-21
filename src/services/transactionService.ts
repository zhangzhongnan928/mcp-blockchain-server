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

/**
 * Reconciles a SUBMITTED transaction with the chain: if its receipt is now
 * available, advances it to CONFIRMED or FAILED. This is a non-blocking,
 * read-time check (the receipt is fetched once, not awaited-until-mined) so it
 * works on stateless serverless hosts where no background task can run after a
 * response is sent. Idempotent and safe to call on any status.
 */
async function reconcileStatus(tx: StoredTransaction): Promise<StoredTransaction> {
  if (tx.status !== 'SUBMITTED' || !tx.txHash) return tx;
  try {
    const provider = getProvider(tx.chainId);
    const receipt = await provider.getTransactionReceipt(tx.txHash);
    if (!receipt) return tx; // not mined yet

    const patch =
      receipt.status === 1
        ? { status: 'CONFIRMED' as const }
        : { status: 'FAILED' as const, error: 'Transaction reverted on-chain.' };
    const updated = await updateTransaction(tx.id, patch);
    if (updated) logger.info(`Transaction ${tx.id} reconciled to ${updated.status} (${tx.txHash})`);
    return updated ?? tx;
  } catch (error) {
    // A transient RPC error shouldn't change the stored status; report it next poll.
    logger.warn(`Could not reconcile transaction ${tx.id}`, error);
    return tx;
  }
}

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

/**
 * Returns a stored transaction by id, reconciling its status against the chain
 * first (so a SUBMITTED tx that has since been mined surfaces as CONFIRMED).
 */
export async function getTransactionById(id: string): Promise<StoredTransaction | undefined> {
  const tx = await getTransaction(id);
  return tx ? reconcileStatus(tx) : undefined;
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
  const tx = await getTransaction(id);
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

  // Confirmation is reconciled lazily on the next status read (see
  // reconcileStatus) so the flow works on stateless serverless hosts.
  return updated!;
}

/** Marks a pending transaction as rejected by the user. */
export async function markRejected(id: string): Promise<StoredTransaction> {
  const tx = await getTransaction(id);
  if (!tx) throw new Error(`Transaction ${id} not found.`);
  if (tx.status !== 'PENDING') {
    throw new Error(`Transaction ${id} is already ${tx.status} and cannot be rejected.`);
  }
  return (await updateTransaction(id, { status: 'REJECTED' }))!;
}
