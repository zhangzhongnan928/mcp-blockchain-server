import { Redis } from '@upstash/redis';
import { logger } from '../logger.js';
import type { StoreBackend, StoredTransaction } from './types.js';

/**
 * Redis-backed store for stateless/serverless deployments (Vercel).
 *
 * Each transaction is a JSON value at `tx:<id>`; a sorted set `tx:index` keeps
 * ids ordered by creation time so {@link list} works without scanning keys.
 * Keys carry a TTL so abandoned pending entries (which anyone with the public
 * URL could create) clean themselves up.
 *
 * Uses Upstash's REST client, which works inside short-lived serverless
 * invocations where holding a TCP connection isn't viable. Provisioning Upstash
 * via the Vercel Marketplace injects the credentials this reads.
 */

const KEY_PREFIX = 'tx:';
const INDEX_KEY = 'tx:index';
/** Abandoned/junk pending entries expire after this many seconds (7 days). */
const TTL_SECONDS = 7 * 24 * 60 * 60;

/** Reads Upstash credentials from either the Upstash or Vercel KV env names. */
export function redisConfigFromEnv(): { url: string; token: string } | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : undefined;
}

export class RedisBackend implements StoreBackend {
  private readonly redis: Redis;

  constructor(config: { url: string; token: string }) {
    this.redis = new Redis({ url: config.url, token: config.token });
  }

  private key(id: string): string {
    return `${KEY_PREFIX}${id}`;
  }

  async init(): Promise<void> {
    // Verify connectivity early so misconfiguration fails loudly at startup
    // rather than on the first tool call.
    await this.redis.ping();
    logger.info('Connected to Redis transaction store');
  }

  async create(tx: StoredTransaction): Promise<StoredTransaction> {
    const score = Date.parse(tx.createdAt) || 0;
    await Promise.all([
      this.redis.set(this.key(tx.id), tx, { ex: TTL_SECONDS }),
      this.redis.zadd(INDEX_KEY, { score, member: tx.id }),
    ]);
    return tx;
  }

  async get(id: string): Promise<StoredTransaction | undefined> {
    const tx = await this.redis.get<StoredTransaction>(this.key(id));
    return tx ?? undefined;
  }

  async update(
    id: string,
    patch: Partial<Omit<StoredTransaction, 'id' | 'createdAt'>>,
  ): Promise<StoredTransaction | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const updated: StoredTransaction = { ...existing, ...patch };
    await this.redis.set(this.key(id), updated, { ex: TTL_SECONDS });
    return updated;
  }

  async list(): Promise<StoredTransaction[]> {
    const ids = await this.redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
    if (ids.length === 0) return [];

    const records = await this.redis.mget<StoredTransaction[]>(...ids.map((id) => this.key(id)));
    const live: StoredTransaction[] = [];
    const expired: string[] = [];
    ids.forEach((id, i) => {
      const tx = records[i];
      if (tx) live.push(tx);
      else expired.push(id);
    });

    // Drop index entries whose values have aged out, so the index stays bounded.
    if (expired.length > 0) await this.redis.zrem(INDEX_KEY, ...expired);
    return live;
  }
}
