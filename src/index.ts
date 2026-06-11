#!/usr/bin/env node
import type http from 'node:http';
import { config, VERSION } from './config.js';
import { logger } from './logger.js';
import { initStore } from './store.js';
import { startHttpServer } from './http/server.js';
import { startStdioServer } from './mcp/server.js';
import { closeAllProviders } from './blockchain.js';

async function main(): Promise<void> {
  logger.info(`Starting MCP Blockchain Server v${VERSION} (transport: ${config.transport})`);

  // Load any persisted (pending) transactions.
  await initStore();

  // The HTTP server hosts the signing page and the MCP-over-HTTP endpoint.
  // In stdio mode a bind failure is non-fatal (read-only tools still work via
  // stdio, only signing links break). In http mode it is the only transport,
  // so a bind failure is fatal.
  let httpServer: http.Server | undefined;
  try {
    httpServer = await startHttpServer();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (config.transport === 'http') {
      throw new Error(`Could not start HTTP server on ${config.host}:${config.port}: ${detail}`);
    }
    logger.warn(
      `Could not start signing server on ${config.host}:${config.port} (${detail}). ` +
        'Read-only tools still work; set PORT to a free port to enable signing links.',
    );
  }

  // Connect the stdio transport unless we are running as an HTTP server.
  if (config.transport === 'stdio') {
    await startStdioServer();
  } else {
    logger.info(`MCP available over HTTP at ${config.publicBaseUrl}/mcp`);
  }

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
