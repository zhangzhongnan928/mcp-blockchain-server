import { randomBytes } from 'node:crypto';
import http from 'node:http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { config } from '../config.js';
import { getChains, getChainById, getRpcUrl, type Chain } from '../chains.js';
import { logger } from '../logger.js';
import { getPublicBaseUrl, setBoundPort } from '../runtime.js';
import {
  getTransactionById,
  markRejected,
  markSubmitted,
} from '../services/transactionService.js';
import { renderIndexPage, renderSigningPage } from './signingPage.js';
import { mountMcpEndpoint } from './mcpHttp.js';

/** Shapes a chain for the browser, including MetaMask `wallet_addEthereumChain` params. */
function chainView(chain: Chain) {
  const chainIdHex = '0x' + parseInt(chain.id, 10).toString(16);
  return {
    chainId: chain.id,
    chainIdHex,
    name: chain.name,
    currency: chain.nativeCurrency.symbol,
    explorerUrl: chain.explorerUrl,
    testnet: chain.testnet,
    addParams: {
      chainId: chainIdHex,
      chainName: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: [getRpcUrl(chain)],
      blockExplorerUrls: [chain.explorerUrl],
    },
  };
}

async function txView(id: string) {
  const tx = await getTransactionById(id);
  if (!tx) return undefined;
  return {
    id: tx.id,
    chainId: tx.chainId,
    to: tx.to,
    from: tx.from,
    valueDisplay: tx.valueDisplay,
    valueWeiHex: tx.valueWeiHex,
    data: tx.data,
    gasLimitHex: tx.gasLimitHex,
    status: tx.status,
    txHash: tx.txHash,
    error: tx.error,
  };
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Parse JSON bodies — but skip it when the body is already parsed. On Vercel
  // the serverless runtime consumes the request stream and populates req.body;
  // running express.json() again would block waiting on an exhausted stream.
  const parseJson = express.json({ limit: '1mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body !== undefined) return next();
    parseJson(req, res, next);
  });

  // MCP over Streamable HTTP, for remote/web clients (alongside stdio).
  mountMcpEndpoint(app);

  // Baseline security headers for every response.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.get('/', (_req, res) => {
    res.type('html').send(renderIndexPage());
  });

  app.get('/api/chains', (_req, res) => {
    res.json({ chains: getChains().map(chainView) });
  });

  app.get('/api/tx/:id', async (req, res) => {
    const tx = await txView(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });
    const chain = getChainById(tx.chainId);
    if (!chain) return res.status(500).json({ error: 'Unknown chain for transaction.' });
    res.json({ transaction: tx, chain: chainView(chain) });
  });

  app.post('/api/tx/:id/submitted', async (req, res) => {
    try {
      const { txHash, from } = req.body ?? {};
      if (typeof txHash !== 'string') {
        return res.status(400).json({ error: 'txHash is required.' });
      }
      const updated = await markSubmitted(req.params.id, txHash, typeof from === 'string' ? from : undefined);
      res.json({ status: updated.status, txHash: updated.txHash });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/tx/:id/rejected', async (req, res) => {
    try {
      const updated = await markRejected(req.params.id);
      res.json({ status: updated.status });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // The signing page. A per-request nonce locks down the single inline script.
  app.get('/tx/:id', (_req, res) => {
    const nonce = randomBytes(16).toString('base64');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    res.type('html').send(renderSigningPage(nonce));
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

  return app;
}

/**
 * Starts the embedded HTTP server. Resolves with the listening server, or
 * rejects on bind failure so the caller can decide how to proceed without
 * killing the MCP connection.
 *
 * In local (stdio) mode, when the user hasn't pinned a base URL, a busy port is
 * not fatal: we probe the next ports and derive the signing URL from whatever
 * we actually bind. This avoids handing out a `localhost:3000` link that lands
 * on some other dev server. In http mode (or when PUBLIC_BASE_URL is pinned) we
 * bind the exact port and fail on conflict, so deployments stay deterministic.
 */
const MAX_PORT_PROBES = 20;

export function startHttpServer(): Promise<http.Server> {
  const app = createApp();
  const server = http.createServer(app);

  // Only auto-shift when we're free to derive the URL ourselves.
  const allowShift = config.transport === 'stdio' && !config.explicitPublicBaseUrl;

  return new Promise((resolve, reject) => {
    let probes = 0;

    const tryListen = (candidate: number): void => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && allowShift && probes < MAX_PORT_PROBES) {
          probes += 1;
          const next = candidate + 1;
          logger.warn(`Port ${candidate} is in use, trying ${next}…`);
          tryListen(next);
          return;
        }
        reject(err);
      };

      server.once('error', onError);
      server.listen(candidate, config.host, () => {
        server.removeListener('error', onError);
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : candidate;
        setBoundPort(actualPort);
        logger.info(`Signing server listening at ${getPublicBaseUrl()}`);
        resolve(server);
      });
    };

    tryListen(config.port);
  });
}
