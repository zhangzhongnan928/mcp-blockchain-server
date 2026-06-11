import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * Zero-dependency, file-backed transaction store.
 *
 * Pending transactions are kept in an in-memory map and mirrored to a single
 * JSON file so they survive restarts. There is no database server to install.
 * Writes are serialized and written atomically (temp file + rename).
 */

export type TxStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'REJECTED';

export interface StoredTransaction {
  id: string;
  chainId: string;
  to: string;
  from?: string;
  /** Human-readable amount in the native token, e.g. "0.01". */
  valueDisplay: string;
  /** Amount in wei as minimal hex, ready for `eth_sendTransaction`. */
  valueWeiHex: string;
  /** Calldata, defaults to "0x". */
  data: string;
  /** Optional gas limit as minimal hex. */
  gasLimitHex?: string;
  status: TxStatus;
  txHash?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const filePath = path.join(config.dataDir, 'transactions.json');
const transactions = new Map<string, StoredTransaction>();

// Serializes file writes so concurrent updates can't interleave/corrupt the file.
let writeChain: Promise<void> = Promise.resolve();
let initialized = false;

/** Loads any persisted transactions from disk. Safe to call more than once. */
export async function initStore(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await fs.mkdir(config.dataDir, { recursive: true });

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredTransaction[];
    for (const tx of parsed) transactions.set(tx.id, tx);
    logger.info(`Loaded ${transactions.size} transaction(s) from ${filePath}`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`No existing transaction store; will create ${filePath}`);
    } else {
      // Corrupt file shouldn't crash the server — start empty and warn.
      logger.warn(`Could not read transaction store, starting empty`, error);
    }
  }
}

function persist(): Promise<void> {
  const snapshot = JSON.stringify([...transactions.values()], null, 2);
  const tmp = `${filePath}.tmp`;
  writeChain = writeChain
    .then(() => fs.writeFile(tmp, snapshot, 'utf8'))
    .then(() => fs.rename(tmp, filePath))
    .catch((error) => logger.error('Failed to persist transaction store', error));
  return writeChain;
}

/** Inserts a new transaction and persists it. */
export async function createTransaction(tx: StoredTransaction): Promise<StoredTransaction> {
  transactions.set(tx.id, tx);
  await persist();
  return tx;
}

/** Returns a transaction by id, or undefined. */
export function getTransaction(id: string): StoredTransaction | undefined {
  return transactions.get(id);
}

/** Applies a partial update (bumping updatedAt) and persists. Returns the new record. */
export async function updateTransaction(
  id: string,
  patch: Partial<Omit<StoredTransaction, 'id' | 'createdAt'>>,
): Promise<StoredTransaction | undefined> {
  const existing = transactions.get(id);
  if (!existing) return undefined;

  const updated: StoredTransaction = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  transactions.set(id, updated);
  await persist();
  return updated;
}

/** Returns all transactions (most recent first). */
export function listTransactions(): StoredTransaction[] {
  return [...transactions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
