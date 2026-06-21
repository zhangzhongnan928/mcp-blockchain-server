import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { createMcpServer } from '../mcp/server.js';

/**
 * Mounts the MCP Streamable HTTP transport at `/mcp` on an existing Express app,
 * so remote/web MCP clients can use the server over HTTP (in addition to, or
 * instead of, stdio).
 *
 * This uses the transport's **stateless** mode: every POST spins up a fresh
 * server + transport, handles the single JSON-RPC request, and tears down. All
 * of this server's tools are plain request/response (no server-initiated
 * notifications), so nothing is lost — and it works identically on a long-lived
 * container and on stateless serverless (Vercel), where an in-memory session map
 * would not survive between requests.
 */

function setCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

export function mountMcpEndpoint(app: Express): void {
  app.options('/mcp', (_req, res) => {
    setCors(res);
    res.sendStatus(204);
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    setCors(res);

    const dnsProtection = config.mcpAllowedHosts.length > 0 || config.mcpAllowedOrigins.length > 0;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no session is created or tracked
      enableDnsRebindingProtection: dnsProtection,
      allowedHosts: dnsProtection ? config.mcpAllowedHosts : undefined,
      allowedOrigins: dnsProtection ? config.mcpAllowedOrigins : undefined,
    });
    const server = createMcpServer();

    // Tear down per-request resources once the response is done.
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP POST', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // In stateless mode there is no session to attach an SSE stream to, and no
  // session to delete. Report that clearly rather than hanging.
  const notAllowed = (_req: Request, res: Response) => {
    setCors(res);
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed: this endpoint is stateless (POST only).' },
      id: null,
    });
  };
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  logger.info('Mounted MCP Streamable HTTP endpoint at /mcp (stateless)');
}
