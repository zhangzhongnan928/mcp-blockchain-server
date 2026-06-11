import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config, VERSION } from '../config.js';
import { getChains } from '../chains.js';
import { getBalance } from '../services/accountService.js';
import { readContract } from '../services/contractService.js';
import {
  prepareTransaction,
  getTransactionById,
} from '../services/transactionService.js';
import { logger } from '../logger.js';

/** Formats a successful text result for an MCP tool. */
function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function errorText(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function registerTools(server: McpServer): void {
  server.registerTool(
    'get-chains',
    {
      title: 'List supported chains',
      description: 'List the blockchain networks this server supports, with their chain ids and native currencies.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      const chains = getChains().map((c) => ({
        chainId: c.id,
        name: c.name,
        currency: c.nativeCurrency.symbol,
        testnet: c.testnet,
        explorer: c.explorerUrl,
        default: c.id === config.defaultChainId,
      }));
      return text(JSON.stringify(chains, null, 2));
    },
  );

  server.registerTool(
    'get-balance',
    {
      title: 'Get native balance',
      description: "Get an address's native-token balance (e.g. ETH) on a given chain.",
      inputSchema: {
        chainId: z.string().describe('Chain id, e.g. "1" for Ethereum or "11155111" for Sepolia.'),
        address: z.string().describe('The wallet/contract address to check.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ chainId, address }) => {
      try {
        const result = await getBalance(chainId, address);
        return text(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('get-balance failed', error);
        return errorText(`Error fetching balance: ${describeError(error)}`);
      }
    },
  );

  server.registerTool(
    'read-contract',
    {
      title: 'Read a smart contract',
      description:
        'Call a read-only (view/pure) contract method. Provide `abi` as human-readable ' +
        'signatures (e.g. ["function balanceOf(address) view returns (uint256)"]) for zero-config use, ' +
        'or set ETHERSCAN_API_KEY to auto-fetch verified ABIs.',
      inputSchema: {
        chainId: z.string().describe('Chain id, e.g. "1".'),
        address: z.string().describe('Contract address.'),
        method: z.string().describe('Method name to call, e.g. "balanceOf".'),
        args: z.array(z.any()).optional().describe('Arguments for the method, in order.'),
        abi: z
          .union([z.string(), z.array(z.any())])
          .optional()
          .describe('Optional ABI: a signature string, array of signatures, or JSON ABI.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ chainId, address, method, args, abi }) => {
      try {
        const result = await readContract({ chainId, address, method, args, abi });
        return text(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error('read-contract failed', error);
        return errorText(`Error reading contract: ${describeError(error)}`);
      }
    },
  );

  server.registerTool(
    'prepare-transaction',
    {
      title: 'Prepare a transaction for signing',
      description:
        'Create an unsigned transaction and return a URL the user opens to review and sign it in ' +
        'their own wallet. Private keys never reach this server. Share the returned URL with the user.',
      inputSchema: {
        chainId: z.string().describe('Chain id, e.g. "1".'),
        to: z.string().describe('Recipient address.'),
        value: z.string().optional().describe('Amount of native token to send, e.g. "0.01". Defaults to "0".'),
        data: z.string().optional().describe('Calldata hex for contract interactions. Defaults to "0x".'),
        gasLimit: z.string().optional().describe('Optional gas limit (integer). The wallet estimates if omitted.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ chainId, to, value, data, gasLimit }) => {
      try {
        const tx = await prepareTransaction({ chainId, to, value, data, gasLimit });
        const url = `${config.publicBaseUrl}/tx/${tx.id}`;
        return text(
          [
            'Transaction prepared. The user must open this URL to review and sign it in their wallet:',
            '',
            url,
            '',
            `Transaction id: ${tx.id}`,
            `Network: ${chainId}`,
            `To: ${tx.to}`,
            `Amount: ${tx.valueDisplay}`,
            '',
            'Poll "get-transaction-status" with the id above to track progress.',
          ].join('\n'),
        );
      } catch (error) {
        logger.error('prepare-transaction failed', error);
        return errorText(`Error preparing transaction: ${describeError(error)}`);
      }
    },
  );

  server.registerTool(
    'get-transaction-status',
    {
      title: 'Get transaction status',
      description: 'Check the current status of a prepared transaction by its id.',
      inputSchema: {
        id: z.string().describe('The transaction id returned by prepare-transaction.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      const tx = getTransactionById(id);
      if (!tx) return errorText(`Transaction ${id} not found.`);
      return text(
        JSON.stringify(
          {
            id: tx.id,
            status: tx.status,
            chainId: tx.chainId,
            to: tx.to,
            from: tx.from,
            amount: tx.valueDisplay,
            txHash: tx.txHash,
            error: tx.error,
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
          },
          null,
          2,
        ),
      );
    },
  );

  logger.debug('Registered MCP tools');
}

/** Creates a fresh MCP server instance with all tools registered. */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'mcp-blockchain-server', version: VERSION });
  registerTools(server);
  return server;
}

/** Creates a server and connects it over stdio (for local MCP clients). */
export async function startStdioServer(): Promise<McpServer> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  logger.info('MCP server connected over stdio');
  return server;
}
