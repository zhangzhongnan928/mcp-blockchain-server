import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { createMcpServer } from '../mcp/server.js';

/**
 * Mounts the MCP Streamable HTTP transport at `/mcp` on an existing Express
 * app, so remote/web MCP clients can use the server over HTTP (in addition to,
 * or instead of, stdio). Uses the standard stateful pattern: an `initialize`
 * request creates a session; later requests carry the `mcp-session-id` header.
 */

const transports = new Map<string, StreamableHTTPServerTransport>();

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
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // A new session may only begin with an `initialize` request.
        if (sessionId || !isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'No valid session. Send an initialize request first.' },
            id: null,
          });
          return;
        }

        const dnsProtection = config.mcpAllowedHosts.length > 0 || config.mcpAllowedOrigins.length > 0;
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: dnsProtection,
          allowedHosts: dnsProtection ? config.mcpAllowedHosts : undefined,
          allowedOrigins: dnsProtection ? config.mcpAllowedOrigins : undefined,
          onsessioninitialized: (sid) => {
            transports.set(sid, newTransport);
            logger.info(`MCP HTTP session opened: ${sid}`);
          },
        });
        newTransport.onclose = () => {
          const sid = newTransport.sessionId;
          if (sid && transports.delete(sid)) logger.info(`MCP HTTP session closed: ${sid}`);
        };

        await createMcpServer().connect(newTransport);
        transport = newTransport;
      }

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

  // GET (SSE stream) and DELETE (session teardown) reuse the session transport.
  const handleSession = async (req: Request, res: Response) => {
    setCors(res);
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get('/mcp', handleSession);
  app.delete('/mcp', handleSession);

  logger.info('Mounted MCP Streamable HTTP endpoint at /mcp');
}
