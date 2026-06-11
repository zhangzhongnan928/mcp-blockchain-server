# Deploying as a remote connector

The default setup runs the server **locally** over stdio — your MCP client
launches it as a subprocess and signing links point at `127.0.0.1`. That's all
you need for desktop clients like Claude Desktop, Cursor, or Cline.

You only need a **remote** deployment when the client connects over the network
instead of spawning a process — for example Claude's **"Add custom connector"**
dialog, which asks for a hosted `https://…/mcp` URL.

In remote mode one process serves both:

- the MCP endpoint (Streamable HTTP) at **`/mcp`**, and
- the signing page at **`/tx/<id>`**.

> **Heads-up on custody.** This server holds **no private keys** — it only reads
> chain data and *prepares* unsigned transactions that you approve in your own
> wallet. A hosted instance is authless by default, so treat the URL as
> semi-secret and read [Security](#security) before exposing it.

---

## Option A — Test now with a tunnel (no deploy)

Fastest way to try the connector dialog. You run the server locally and expose
it through a temporary public HTTPS URL.

```bash
# 1. Start a tunnel to the port the server will use (prints an https URL).
cloudflared tunnel --url http://localhost:3000
#   -> https://random-words.trycloudflare.com

# 2. Start the server in HTTP mode, telling it its public URL:
MCP_TRANSPORT=http HOST=127.0.0.1 \
  PUBLIC_BASE_URL=https://random-words.trycloudflare.com \
  npx -y mcp-blockchain-server@latest
```

Your connector URL is `https://random-words.trycloudflare.com/mcp`. (`ngrok
http 3000` works the same way.) The tunnel URL changes each run — fine for
testing, not for permanent use.

---

## Option B — One-click deploy to Render

The repo includes [`render.yaml`](../render.yaml).

1. Push this repo to your GitHub account (or use a fork).
2. In [Render](https://render.com): **New → Blueprint**, select the repo.
3. Render builds the `Dockerfile` and starts the service.

Render assigns a URL (e.g. `https://mcp-blockchain-server.onrender.com`) and
exposes it to the app as `RENDER_EXTERNAL_URL`, which the server uses to build
signing links automatically — **no manual `PUBLIC_BASE_URL` needed**.

Your connector URL: `https://<your-service>.onrender.com/mcp`

> Render's free plan sleeps when idle, so the first request after a pause takes
> a few seconds to wake.

---

## Option C — Docker anywhere (Fly.io, Railway, a VPS…)

The [`Dockerfile`](../Dockerfile) runs the server in HTTP mode on port 3000.

```bash
docker build -t mcp-blockchain-server .
docker run -p 3000:3000 \
  -e PUBLIC_BASE_URL=https://your-domain.example \
  mcp-blockchain-server
```

The image defaults to `MCP_TRANSPORT=http` and `HOST=0.0.0.0`. On any host that
isn't Render, **set `PUBLIC_BASE_URL` to your public HTTPS URL** — otherwise the
signing links the assistant hands out won't resolve. Most platforms (Fly,
Railway, …) inject their own `PORT`; the server honors it.

---

## Connect it in Claude

In the **"Add custom connector"** dialog:

| Field | Value |
| --- | --- |
| Name | anything, e.g. `Blockchain` |
| Remote MCP server URL | `https://<your-host>/mcp` (note the **`/mcp`**) |
| OAuth Client ID / Secret | **leave blank** — the server is authless |

Save, then start a chat and ask it to, say, *"list supported chains"* to confirm
the tools are available.

---

## Hosting environment variables

| Variable | For a remote deploy |
| --- | --- |
| `MCP_TRANSPORT` | `http` (the Docker image sets this) |
| `HOST` | `0.0.0.0` (the Docker image sets this) |
| `PORT` | Usually injected by the platform; defaults to `3000`. |
| `PUBLIC_BASE_URL` | Your public `https://…` URL. Auto-derived on Render. **Required elsewhere** for working signing links. |
| `MCP_ALLOWED_HOSTS` | Optional. Comma-separated hostnames to accept on `/mcp` (enables DNS-rebind protection). |
| `MCP_ALLOWED_ORIGINS` | Optional. Comma-separated allowed `Origin` values. |

See the [main README](../README.md#configuration) for the full list (RPC keys,
default chain, etc.).

---

## Security

This server is **authless** — anyone with the URL can call its tools. The blast
radius is limited because it never holds keys:

- **Read tools** expose only public chain data.
- **`prepare-transaction`** creates a pending, unsigned transaction and returns a
  signing link. Funds move only when *you* sign in your own wallet, so a stranger
  can't drain anything — at most they can create junk pending entries.

For a personal connector, the practical protection is to **keep the URL
private**. To harden further:

- Set `MCP_ALLOWED_HOSTS` to your domain so the `/mcp` endpoint rejects
  mismatched `Host` headers (test the connection first, then lock it down).
- Put it behind your platform's access control or a reverse proxy if you want
  real authentication.
- Always serve over HTTPS (every option above does).
