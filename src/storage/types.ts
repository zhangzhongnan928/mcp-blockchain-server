/**
 * Storage backend abstraction for pending transactions.
 *
 * The server runs in two very different environments:
 *  - A single long-running process (local stdio, Docker, Render) where an
 *    in-memory map mirrored to a JSON file is enough — see {@link FileBackend}.
 *  - Stateless serverless functions (Vercel) where each request may hit a fresh
 *    instance with no shared memory or persistent disk, so state must live in an
 *    external store — see the Redis backend.
 *
 * Both implement this interface; {@link selectBackend} picks one from the
 * environment so the rest of the app is storage-agnostic.
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

export interface StoreBackend {
  /** Prepares the backend (load from disk, ping the remote, …). Idempotent. */
  init(): Promise<void>;
  /** Inserts a new transaction. */
  create(tx: StoredTransaction): Promise<StoredTransaction>;
  /** Returns a transaction by id, or undefined. */
  get(id: string): Promise<StoredTransaction | undefined>;
  /** Applies a partial update (the caller sets updatedAt). Returns the new record, or undefined if missing. */
  update(
    id: string,
    patch: Partial<Omit<StoredTransaction, 'id' | 'createdAt'>>,
  ): Promise<StoredTransaction | undefined>;
  /** Returns all transactions, most recent first. */
  list(): Promise<StoredTransaction[]>;
}
