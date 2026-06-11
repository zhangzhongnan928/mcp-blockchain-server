# Tools & HTTP API

The server has two surfaces: the **MCP tools** (used by the AI assistant) and a
small **HTTP API** (used by the signing page). The HTTP API is an internal
detail of the signing flow — there is no authentication layer because the server
holds no secrets and binds to localhost by default.

## MCP tools

### `get-chains`

List supported networks. No arguments.

```json
[
  { "chainId": "1", "name": "Ethereum Mainnet", "currency": "ETH", "testnet": false, "default": false },
  { "chainId": "11155111", "name": "Sepolia", "currency": "ETH", "testnet": true, "default": true }
]
```

### `get-balance`

| Argument | Type | Notes |
| --- | --- | --- |
| `chainId` | string | e.g. `"1"`. |
| `address` | string | Address to check. |

```json
{ "address": "0x…", "chainId": "1", "chainName": "Ethereum Mainnet", "balance": "5.688840446715981478", "symbol": "ETH" }
```

### `read-contract`

| Argument | Type | Notes |
| --- | --- | --- |
| `chainId` | string | e.g. `"1"`. |
| `address` | string | Contract address. |
| `method` | string | Read-only method name, e.g. `"balanceOf"`. |
| `args` | array | Optional, in order. |
| `abi` | string \| array | Optional. Human-readable signature(s) or JSON ABI. If omitted, requires `ETHERSCAN_API_KEY`. |

```jsonc
// arguments
{ "chainId": "1", "address": "0xA0b8…eB48", "method": "decimals",
  "abi": ["function decimals() view returns (uint8)"] }
// result: 6
```

BigInt return values are serialized as decimal strings (not converted to ether).

### `prepare-transaction`

| Argument | Type | Notes |
| --- | --- | --- |
| `chainId` | string | e.g. `"1"`. |
| `to` | string | Recipient address. |
| `value` | string | Optional. Amount of native token, e.g. `"0.01"`. Defaults to `"0"`. |
| `data` | string | Optional. Calldata hex. Defaults to `"0x"`. |
| `gasLimit` | string | Optional integer. The wallet estimates if omitted. |

Returns a human-readable message containing the signing URL and the transaction
id. Nothing is broadcast.

### `get-transaction-status`

| Argument | Type | Notes |
| --- | --- | --- |
| `id` | string | The id from `prepare-transaction`. |

```json
{ "id": "…", "status": "CONFIRMED", "chainId": "11155111", "to": "0x…",
  "from": "0x…", "amount": "0.01", "txHash": "0x…",
  "createdAt": "…", "updatedAt": "…" }
```

Status values: `PENDING` → `SUBMITTED` → `CONFIRMED` | `FAILED`, or `REJECTED`.

## HTTP API (used by the signing page)

Base URL: `PUBLIC_BASE_URL` (default `http://localhost:3000`).

| Method & path | Description |
| --- | --- |
| `GET /healthz` | Liveness check → `{ "ok": true }`. |
| `GET /api/chains` | Supported chains (with `wallet_addEthereumChain` params). |
| `GET /api/tx/:id` | Transaction + chain details, or `404`. |
| `POST /api/tx/:id/submitted` | Body `{ txHash, from? }`. Marks the tx submitted and starts watching for confirmation. |
| `POST /api/tx/:id/rejected` | Marks a pending tx rejected. |
| `GET /tx/:id` | The HTML signing page. |
| `GET /` | A minimal landing page. |
| `POST /GET /DELETE /mcp` | MCP Streamable HTTP endpoint (only relevant in `MCP_TRANSPORT=http`). |

Errors are returned as `{ "error": "message" }` with an appropriate HTTP status.

## MCP over HTTP

When `MCP_TRANSPORT=http`, the MCP protocol is available at `/mcp` using the
Streamable HTTP transport. Connect a client to `<PUBLIC_BASE_URL>/mcp`; an
`initialize` request opens a session returned in the `Mcp-Session-Id` header,
which subsequent requests must include. This is in addition to the tools above —
the same five tools are exposed regardless of transport.
