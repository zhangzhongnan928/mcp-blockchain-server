import { config } from './config.js';

/**
 * Tiny dependency-free logger.
 *
 * CRITICAL: this server speaks the MCP protocol over **stdout** (stdio
 * transport). Writing anything other than protocol frames to stdout corrupts
 * the JSON-RPC stream and breaks the client. Therefore all log output goes to
 * **stderr**, which MCP clients surface as server logs.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(config.logLevel as Level)] ?? LEVELS.info;

function emit(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] > threshold) return;

  const timestamp = new Date().toISOString();
  let line = `${timestamp} ${level.toUpperCase()} ${message}`;

  if (meta !== undefined) {
    if (meta instanceof Error) {
      line += ` ${meta.stack || meta.message}`;
    } else if (typeof meta === 'string') {
      line += ` ${meta}`;
    } else {
      try {
        line += ` ${JSON.stringify(meta)}`;
      } catch {
        line += ` ${String(meta)}`;
      }
    }
  }

  // Always stderr — never stdout (reserved for the MCP protocol).
  process.stderr.write(line + '\n');
}

export const logger = {
  error: (message: string, meta?: unknown) => emit('error', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
};
