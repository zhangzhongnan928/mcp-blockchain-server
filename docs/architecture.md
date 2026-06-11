# Architecture

The server is a **single Node.js process** that exposes two interfaces:

1. An **MCP server** — what the AI assistant talks to. It runs over **stdio**
   (default, for local clients) or **Streamable HTTP** at `/mcp` (for
   remote/web clients), selected with `MCP_TRANSPORT`.
2. An **embedded HTTP server** — serves the transaction signing page and the
   small API that page uses. In HTTP transport mode it also hosts `/mcp`, so
   MCP and signing share one port.

There is no database, cache, message queue, or separate frontend.

## Transports

| Mode (`MCP_TRANSPORT`) | MCP interface | Used by |
| --- | --- | --- |
| `stdio` (default) | stdin/stdout of the subprocess | Local clients that launch the server (Claude Desktop, Cursor, …). |
| `http` | `POST/GET/DELETE /mcp` (Streamable HTTP, session-based) | Remote/web clients; one hosted instance. |

In both modes the signing page is served over HTTP. `src/http/mcpHttp.ts`
implements the stateful Streamable HTTP transport: an `initialize` request opens
a session (returned via the `Mcp-Session-Id` header) that later requests reuse.

```
            stdio (MCP)                         HTTP (localhost)
AI client ───────────────► mcp/server.ts        http/server.ts ◄─── User's browser
                                │                      │                 │
                                ▼                      ▼                 ▼
                          services/*  ◄──────────────────────────  signing page
                                │  (prepare / read / balance)     (eth_sendTransaction)
                                ▼
                         blockchain.ts ──► ethers JsonRpcProvider ──► EVM RPC
                                │
                                ▼
                            store.ts  ──► ~/.mcp-blockchain/transactions.json
```

## Modules

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Entry point. Loads the store, starts the HTTP and MCP servers, handles shutdown. |
| `src/config.ts` | Reads environment variables into a validated config object (with defaults). |
| `src/logger.ts` | Minimal logger that writes to **stderr only** (stdout is reserved for MCP). |
| `src/chains.ts` | Built-in registry of EVM chains with public RPC endpoints. |
| `src/blockchain.ts` | Cached ethers providers; address helpers. |
| `src/store.ts` | File-backed JSON store for pending transactions. |
| `src/services/*` | Core logic: balances, contract reads, transaction lifecycle. |
| `src/mcp/server.ts` | Registers the MCP tools and connects the stdio transport. |
| `src/http/server.ts` | Express app: signing API + serves the signing page. |
| `src/http/signingPage.ts` | The self-contained HTML/JS signing page. |

## Read flow

1. The assistant calls `get-balance` / `read-contract`.
2. The service resolves a provider from `blockchain.ts` and queries the chain
   via ethers.
3. The result is returned to the assistant. Nothing is stored.

## Write (signing) flow

1. The assistant calls `prepare-transaction`. The service validates inputs,
   converts the amount to wei, and writes a `PENDING` record to the store. It
   returns a `/tx/<id>` URL.
2. The user opens the URL. The signing page fetches the transaction and chain
   details from `GET /api/tx/:id`.
3. The user connects a wallet and approves. The page calls
   `eth_sendTransaction`; the **wallet signs and broadcasts**.
4. The page reports the hash to `POST /api/tx/:id/submitted`. The service marks
   the record `SUBMITTED` and watches for confirmation in the background,
   updating it to `CONFIRMED` or `FAILED`.
5. The assistant polls `get-transaction-status` for the outcome.

The key property: the server prepares and tracks transactions but **never sees a
private key or a signed payload** — only the public transaction hash.

## State & persistence

Pending transactions live in memory and are mirrored to a single JSON file
(`MCP_DATA_DIR/transactions.json`, default `~/.mcp-blockchain`). Writes are
serialized and atomic (temp file + rename), so records survive restarts without
a database.

## Technology

- Node.js 18+ with TypeScript (ES modules)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk)
- [ethers v6](https://docs.ethers.org/v6/) for EVM access
- Express for the embedded HTTP server
- Zod for tool input schemas
