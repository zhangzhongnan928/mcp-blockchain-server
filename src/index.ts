#!/usr/bin/env node
import type http from 'node:http';
import { config } from './config.js';
import { logger } from './logger.js';
import { initStore } from './store.js';
import { startHttpServer } from './http/server.js';
import { startMcpServer } from './mcp/server.js';
import { closeAllProviders } from './blockchain.js';

async function main(): Promise<void> {
  logger.info('Starting MCP Blockchain Server v0.2.0');

  // Load any persisted (pending) transactions.
  await initStore();

  // Start the embedded signing server. A bind failure (e.g. port in use) is
  // non-fatal: the read-only MCP tools keep working, only signing links break.
  let httpServer: http.Server | undefined;
  try {
    httpServer = await startHttpServer();
  } catch (error) {
    logger.warn(
      `Could not start signing server on ${config.host}:${config.port} ` +
        `(${error instanceof Error ? error.message : String(error)}). ` +
        'Read-only tools still work; set PORT to a free port to enable signing links.',
    );
  }

  // Connect the MCP server over stdio (this is what the AI client talks to).
  await startMcpServer();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down…`);
    closeAllProviders();
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info('MCP Blockchain Server is ready');
}

main().catch((error) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
