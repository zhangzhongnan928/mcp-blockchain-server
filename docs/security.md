# Security

## Core principle: key isolation

The server's entire purpose is to let an AI assistant act on-chain **without
ever touching a private key**. This is structural, not a policy:

1. The server only ever *prepares* transactions. It builds an unsigned request
   (to, value, data, gas) and stores it.
2. The user reviews the request in a web page and signs it **in their own
   wallet** (MetaMask, Rabby, hardware wallet, etc.).
3. The wallet — not the server — broadcasts the transaction.
4. The server is told only the public **transaction hash**, which it uses to
   watch for confirmation.

At no point does the server receive a private key, a seed phrase, or a signed
transaction payload. There is nothing key-related for it to leak.

## Transaction review

Before signing, the page shows the network, recipient, amount, gas limit, and
raw calldata. Amounts are converted to wei **server-side with ethers** and
passed through verbatim to the wallet, so what the user sees is what the wallet
signs. The wallet shows its own confirmation as a second checkpoint.

## Signing server hardening

- **Localhost by default.** `HOST` binds to `127.0.0.1`; the server is not
  exposed to the network unless you deliberately change it.
- **Strict CSP.** The signing page is served with a nonce-based
  Content-Security-Policy (`default-src 'none'`, scripted only via a per-request
  nonce). There are no third-party scripts.
- **No `innerHTML`.** Transaction data is rendered with `textContent`, so
  on-chain values cannot inject markup.
- **Request body limits** and JSON-only parsing on the API.

## Input validation

All tool inputs are validated before use:

- Addresses are checked and checksummed with ethers.
- Amounts must parse as a valid token value; calldata must be valid hex.
- Gas limits must be positive integers.
- A transaction can only be submitted once (state transitions are guarded).

## Logging

Diagnostics are written to **stderr** at the configured `LOG_LEVEL`. This keeps
the MCP stdout stream clean and avoids logging sensitive request bodies. No
private keys or signed payloads ever pass through the server, so they cannot
appear in logs.

## Operational notes

- **Default network is a testnet** (Sepolia) to reduce the blast radius of
  mistakes. Switch to mainnet deliberately via `DEFAULT_CHAIN_ID` or per call.
- **Public RPCs** are used by default. For production or higher rate limits,
  set `RPC_URL_<chainId>` or `INFURA_API_KEY` to use your own endpoints.
- **Hosting the signing page remotely** (setting `HOST`/`PUBLIC_BASE_URL`) means
  exposing an HTTP service. Put it behind HTTPS and restrict access; the page
  was designed for local, single-user use.

## Recommendations for users

1. Always review transaction details — in the page *and* in your wallet — before
   signing.
2. Prefer a hardware wallet for anything valuable.
3. Keep your wallet software up to date and beware of phishing links.
