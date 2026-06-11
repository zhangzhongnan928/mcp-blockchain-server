# MCP Blockchain Server

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants **read
blockchain data** and **prepare transactions** — while the user keeps full
custody of their keys and signs every transaction in their own wallet.

It runs as a **single, self-contained process**. No database, no Redis, no API
keys, no separate frontend to build. Point your MCP client at it and go.

```
┌──────────────┐   MCP (stdio)   ┌─────────────────────┐   RPC    ┌────────────┐
│ AI assistant │ ──────────────► │  mcp-blockchain     │ ───────► │ Blockchain │
│ (Claude …)   │ ◄────────────── │  server             │ ◄─────── │  (EVM)     │
└──────────────┘                 │   + signing web page │          └────────────┘
                                 └─────────┬───────────┘
                                           │ opens link, signs in wallet
                                           ▼
                                     ┌───────────┐
                                     │   User    │  (MetaMask / Rabby / …)
                                     └───────────┘
```

## Why this design

The hard problem in AI + blockchain is letting an assistant *act* without ever
touching private keys. This server solves it by splitting the work:

- **Reads** (balances, contract state) happen server-side and return directly to
  the assistant.
- **Writes** are only ever *prepared* server-side. The server hands back a URL;
  the user opens it, reviews the details, and **signs in their own wallet**. The
  wallet broadcasts the transaction. The server only ever learns the resulting
  transaction hash. **Private keys never reach the server.**

## Quick start

Requirements: **Node.js 18+**. No clone, no build, no API keys.

Add the server to any MCP client that launches stdio servers. For **Claude
Desktop**, open Settings → Developer → Edit Config and add:

```json
{
  "mcpServers": {
    "blockchain": {
      "command": "npx",
      "args": ["-y", "mcp-blockchain-server"]
    }
  }
}
```

Restart the client. You can now ask things like *"What's the ETH balance of
vitalik.eth?"* or *"Send 0.01 test ETH to 0x… on Sepolia."* For a send, the
assistant returns a link — open it, review, and sign in your wallet.

No configuration is required: the server ships with free public RPC endpoints
and defaults to the **Sepolia testnet**.

### Use it in other clients

The same `npx` command works anywhere that runs an MCP stdio server — the config
shape is identical across clients:

```json
{ "command": "npx", "args": ["-y", "mcp-blockchain-server"] }
```

This is the block to drop into **Cursor** (`.cursor/mcp.json`), **Cline**,
**Windsurf**, **VS Code** (`.vscode/mcp.json`), and others. To pass options, add
an `"env"` block (see [Configuration](#configuration)).

### Run from source (development)

```bash
git clone https://github.com/zhangzhongnan928/mcp-blockchain-server.git
cd mcp-blockchain-server
npm install      # installs and builds (via the prepare script)
```

Then point the client at the build instead of npx:

```json
{ "command": "node", "args": ["/absolute/path/to/mcp-blockchain-server/build/index.js"] }
```

### Remote / web clients (HTTP transport)

For MCP clients that connect over HTTP instead of spawning a local process, run
the server in HTTP mode. It then serves the MCP endpoint **and** the signing
page on one port:

```bash
MCP_TRANSPORT=http PUBLIC_BASE_URL=https://your-host npx -y mcp-blockchain-server
```

- MCP endpoint (Streamable HTTP): `https://your-host/mcp`
- Signing links: `https://your-host/tx/<id>`

Bind a public interface with `HOST=0.0.0.0` (or keep the default `127.0.0.1` and
put it behind a reverse proxy). When exposed publicly, set `MCP_ALLOWED_HOSTS`
and/or `MCP_ALLOWED_ORIGINS` to enable DNS-rebinding protection, and front it
with HTTPS and access control.

## Tools

| Tool | Purpose |
| --- | --- |
| `get-chains` | List supported networks and their chain ids. |
| `get-balance` | Native-token balance for an address on a chain. |
| `read-contract` | Call a read-only contract method (pass an `abi` or set `ETHERSCAN_API_KEY`). |
| `prepare-transaction` | Create an unsigned transaction and return a signing URL. |
| `get-transaction-status` | Track a prepared transaction by id. |

`read-contract` is zero-config when you pass a human-readable ABI:

```jsonc
{
  "chainId": "1",
  "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "method": "balanceOf",
  "args": ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  "abi": ["function balanceOf(address) view returns (uint256)"]
}
```

## Signing flow

1. The assistant calls `prepare-transaction`. The server stores it and returns
   `http://localhost:3000/tx/<id>`.
2. The user opens the link. The page shows the network, recipient, amount, and
   calldata.
3. The user connects their wallet and clicks **Approve & Sign**. The wallet
   signs *and* broadcasts (`eth_sendTransaction`).
4. The page reports the transaction hash back to the server, which watches for
   on-chain confirmation.
5. The assistant polls `get-transaction-status` until it is `CONFIRMED`.

The signing page is plain HTML + vanilla JS served by the same process — there
is nothing extra to build or deploy.

## Configuration

Everything is optional. Copy `.env.example` to `.env` to override defaults.

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_TRANSPORT` | `stdio` | `stdio` for local clients, or `http` to serve MCP over Streamable HTTP at `/mcp`. |
| `PORT` | `3000` | Port for the signing web server (and the `/mcp` endpoint in http mode). |
| `HOST` | `127.0.0.1` | Interface to bind (localhost only by default). Set `0.0.0.0` to expose remotely. |
| `PUBLIC_BASE_URL` | `http://localhost:<PORT>` | Base URL used in signing links and the `/mcp` URL (set when hosting remotely). |
| `DEFAULT_CHAIN_ID` | `11155111` | Default chain (Sepolia testnet). |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` (logs go to stderr). |
| `MCP_DATA_DIR` | `~/.mcp-blockchain` | Where pending transactions are stored. |
| `RPC_URL_<chainId>` | built-in public RPC | Override the RPC for a chain, e.g. `RPC_URL_1=https://…`. |
| `INFURA_API_KEY` | — | If set, upgrades default RPCs to Infura. |
| `ETHERSCAN_API_KEY` | — | If set, `read-contract` can auto-fetch verified ABIs. |
| `MCP_ALLOWED_HOSTS` | — | Comma-separated Host allowlist for http mode (enables DNS-rebind protection). |
| `MCP_ALLOWED_ORIGINS` | — | Comma-separated Origin allowlist for http mode (enables DNS-rebind protection). |

## Supported chains

Ethereum (`1`), Sepolia (`11155111`), Polygon (`137`), Polygon Amoy (`80002`),
Base (`8453`), Base Sepolia (`84532`), Arbitrum One (`42161`), OP Mainnet
(`10`). Each has a built-in public RPC; override any with `RPC_URL_<chainId>`.

## Development

```bash
npm run dev        # run from source with auto-reload (tsx)
npm run build      # compile TypeScript to build/
npm start          # run the compiled server
npm test           # run the test suite (node:test)
npm run typecheck  # type-check without emitting
```

## Security

- **Private keys never reach the server.** It only prepares transactions; the
  user's wallet signs and broadcasts them.
- The signing server binds to **localhost** by default and sets a strict,
  nonce-based Content-Security-Policy on the signing page.
- All tool inputs (addresses, amounts, calldata) are validated before use.
- Logs are written to **stderr** so they never corrupt the MCP stdio stream.

See [docs/security.md](docs/security.md) for details.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture](docs/architecture.md)
- [Tools & HTTP API](docs/api.md)
- [Security](docs/security.md)

## License

MIT — see [LICENSE](LICENSE).
