# Getting Started

This guide gets the MCP Blockchain Server running and connected to an AI
assistant.

## Prerequisites

- **Node.js 18 or higher** (nothing else — no database, no Redis, no API keys).

## Install

```bash
git clone https://github.com/zhangzhongnan928/mcp-blockchain-server.git
cd mcp-blockchain-server
npm install
```

`npm install` compiles the TypeScript to `build/` automatically (via the
`prepare` script). To rebuild later, run `npm run build`.

## Connect to an MCP client

The server speaks MCP over stdio, so an MCP client launches it as a subprocess.

### Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "blockchain": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-blockchain-server/build/index.js"]
    }
  }
}
```

Use an **absolute** path to `build/index.js`. Restart Claude Desktop; the
blockchain tools appear in the tools menu.

### Passing configuration

All configuration is optional (see the table in the [README](../README.md)).
To override a default, add an `env` block:

```json
{
  "mcpServers": {
    "blockchain": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-blockchain-server/build/index.js"],
      "env": {
        "DEFAULT_CHAIN_ID": "1",
        "ETHERSCAN_API_KEY": "your-key"
      }
    }
  }
}
```

## Try it

Ask the assistant:

- *"List the blockchain networks you support."* → `get-chains`
- *"What's the ETH balance of vitalik.eth on mainnet?"* → `get-balance`
- *"Send 0.001 test ETH to 0x… on Sepolia."* → `prepare-transaction`, which
  returns a link. Open it, connect your wallet, review, and sign.

## Running standalone (for development)

```bash
npm run dev    # run from source with auto-reload
npm start      # run the compiled build
npm test       # run the test suite
```

When running standalone, the signing web server is available at
`http://localhost:3000`. The MCP protocol is served on stdio, so you typically
interact through an MCP client rather than directly.

## Troubleshooting

- **Tools don't appear in the client.** Check the path in the config is
  absolute and that `build/index.js` exists (`npm run build`). Check the
  client's MCP logs — this server writes diagnostics to stderr.
- **"Port already in use."** Another process holds port 3000. Set `PORT` to a
  free port. Read-only tools still work even if the signing server can't bind.
- **A signing link won't open.** Make sure the same server process is still
  running; the link points at its local HTTP server.
