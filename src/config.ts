import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';

/**
 * Central, validated configuration for the server.
 *
 * Everything here has a sensible default so the server runs with **zero
 * configuration**. Environment variables (optionally loaded from a `.env`
 * file) only need to be set to override a default or to enable an optional
 * feature (e.g. a private RPC endpoint or an Etherscan key).
 */

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

/** Current server version (single source of truth). */
export const VERSION = '0.4.0';

function parseList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const port = parsePort(process.env.PORT, 3000);

// Vercel exposes the deployment host (no scheme) rather than a full URL. Prefer
// the stable production domain over the per-deployment URL.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const vercelBaseUrl = vercelHost ? `https://${vercelHost}` : '';

// An explicit public base URL, if the user pinned one (or the platform provides
// one). When unset, the URL is derived at runtime from the port we actually
// bind — see runtime.ts — so signing links always point at *this* server.
const explicitPublicBaseUrl =
  (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || vercelBaseUrl || '').replace(/\/$/, '') ||
  undefined;

export const config = {
  /** Desired port for the embedded HTTP (signing) server. */
  port,
  /** Whether PORT was explicitly provided (affects auto-port-selection). */
  portExplicitlySet: !!process.env.PORT,
  /** Interface to bind. Defaults to localhost only for safety. */
  host: process.env.HOST || '127.0.0.1',
  /** Explicit base URL for transaction links, or undefined to derive from the bound port. */
  explicitPublicBaseUrl,
  /** Log verbosity: error | warn | info | debug. */
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  /** Default chain used when a tool call omits chainId. */
  defaultChainId: process.env.DEFAULT_CHAIN_ID || '11155111', // Sepolia testnet
  /** Directory where pending transactions are persisted (JSON file store). */
  dataDir: process.env.MCP_DATA_DIR || path.join(os.homedir(), '.mcp-blockchain'),
  /** Optional Etherscan (v2 multichain) key, used only to auto-fetch contract ABIs. */
  etherscanApiKey: process.env.ETHERSCAN_API_KEY || '',
  /** Optional Infura key, used to upgrade default public RPCs when present. */
  infuraApiKey: process.env.INFURA_API_KEY || '',
  /**
   * Which MCP transport to expose:
   *  - "stdio" (default): the process is launched by a local client; MCP runs
   *    over stdio. The signing server still runs for local links.
   *  - "http": the process is a long-running server; MCP is served over
   *    Streamable HTTP at /mcp alongside the signing page.
   */
  transport: process.env.MCP_TRANSPORT === 'http' ? ('http' as const) : ('stdio' as const),
  /** Allowed Host header values for the HTTP transport (enables DNS-rebind protection when set). */
  mcpAllowedHosts: parseList(process.env.MCP_ALLOWED_HOSTS),
  /** Allowed Origin values for the HTTP transport (enables DNS-rebind protection when set). */
  mcpAllowedOrigins: parseList(process.env.MCP_ALLOWED_ORIGINS),
} as const;

export type AppConfig = typeof config;
