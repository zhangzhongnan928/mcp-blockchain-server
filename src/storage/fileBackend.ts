import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';
import type { StoreBackend, StoredTransaction } from './types.js';

/**
 * Zero-dependency, file-backed transaction store.
 *
 * Pending transactions are kept in an in-memory map and mirrored to a single
 * JSON file so they survive restarts. There is no database server to install.
 * Writes are serialized and written atomically (temp file + rename). Suitable
 * for any single long-running process; not for stateless serverless.
 */
export class FileBackend implements StoreBackend {
  private readonly filePath: string;
  private readonly transactions = new Map<string, StoredTransaction>();
  // Serializes file writes so concurrent updates can't interleave/corrupt the file.
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, 'transactions.json');
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await fs.mkdir(this.dataDir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as StoredTransaction[];
      for (const tx of parsed) this.transactions.set(tx.id, tx);
      logger.info(`Loaded ${this.transactions.size} transaction(s) from ${this.filePath}`);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info(`No existing transaction store; will create ${this.filePath}`);
      } else {
        // Corrupt file shouldn't crash the server — start empty and warn.
        logger.warn(`Could not read transaction store, starting empty`, error);
      }
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify([...this.transactions.values()], null, 2);
    const tmp = `${this.filePath}.tmp`;
    this.writeChain = this.writeChain
      .then(() => fs.writeFile(tmp, snapshot, 'utf8'))
      .then(() => fs.rename(tmp, this.filePath))
      .catch((error) => logger.error('Failed to persist transaction store', error));
    return this.writeChain;
  }

  async create(tx: StoredTransaction): Promise<StoredTransaction> {
    this.transactions.set(tx.id, tx);
    await this.persist();
    return tx;
  }

  async get(id: string): Promise<StoredTransaction | undefined> {
    return this.transactions.get(id);
  }

  async update(
    id: string,
    patch: Partial<Omit<StoredTransaction, 'id' | 'createdAt'>>,
  ): Promise<StoredTransaction | undefined> {
    const existing = this.transactions.get(id);
    if (!existing) return undefined;

    const updated: StoredTransaction = { ...existing, ...patch };
    this.transactions.set(id, updated);
    await this.persist();
    return updated;
  }

  async list(): Promise<StoredTransaction[]> {
    return [...this.transactions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
