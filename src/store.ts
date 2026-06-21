import { config } from './config.js';
import { logger } from './logger.js';
import { FileBackend } from './storage/fileBackend.js';
import { RedisBackend, redisConfigFromEnv } from './storage/redisBackend.js';
import type { StoreBackend, StoredTransaction } from './storage/types.js';

/**
 * Public transaction-store API.
 *
 * This is a thin facade over a pluggable {@link StoreBackend}: a file-backed
 * store for single-process deployments (local, Docker, Render) and a Redis store
 * for stateless serverless (Vercel). The backend is chosen from the environment
 * — if Redis credentials are present they win — so callers never care which is
 * in use.
 */

export type { StoredTransaction, TxStatus } from './storage/types.js';

let backend: StoreBackend | undefined;

function getBackend(): StoreBackend {
  if (backend) return backend;
  const redisConfig = redisConfigFromEnv();
  if (redisConfig) {
    logger.info('Using Redis transaction store');
    backend = new RedisBackend(redisConfig);
  } else {
    logger.info('Using file transaction store');
    backend = new FileBackend(config.dataDir);
  }
  return backend;
}

/** Prepares the configured store. Safe to call more than once. */
export async function initStore(): Promise<void> {
  await getBackend().init();
}

/** Inserts a new transaction and persists it. */
export async function createTransaction(tx: StoredTransaction): Promise<StoredTransaction> {
  return getBackend().create(tx);
}

/** Returns a transaction by id, or undefined. */
export async function getTransaction(id: string): Promise<StoredTransaction | undefined> {
  return getBackend().get(id);
}

/** Applies a partial update (bumping updatedAt) and persists. Returns the new record. */
export async function updateTransaction(
  id: string,
  patch: Partial<Omit<StoredTransaction, 'id' | 'createdAt'>>,
): Promise<StoredTransaction | undefined> {
  return getBackend().update(id, { ...patch, updatedAt: new Date().toISOString() });
}

/** Returns all transactions (most recent first). */
export async function listTransactions(): Promise<StoredTransaction[]> {
  return getBackend().list();
}
