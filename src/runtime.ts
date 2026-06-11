import { config } from './config.js';

/**
 * Runtime state that isn't known until the server is actually listening.
 *
 * The signing URL handed to users must point at the port we *really* bound. In
 * local (stdio) mode we may auto-shift off a busy port (e.g. 3000 taken by a
 * Next.js dev server), so the public base URL is derived from the bound port
 * unless the user pinned PUBLIC_BASE_URL explicitly.
 */

let boundPort: number | undefined;

export function setBoundPort(port: number): void {
  boundPort = port;
}

export function getBoundPort(): number {
  return boundPort ?? config.port;
}

/**
 * The base URL for signing links: an explicit override, else derived from the
 * interface and port we actually bound.
 *
 * We emit the concrete bind host (127.0.0.1) rather than "localhost". On
 * dual-stack machines "localhost" can resolve to ::1 (IPv6) first and land on a
 * *different* server that happens to hold the same port on the other stack
 * (e.g. a Next.js dev server on [::]:3000), producing a confusing 404. Using
 * the IPv4 loopback we bound removes that ambiguity.
 */
export function getPublicBaseUrl(): string {
  if (config.explicitPublicBaseUrl) return config.explicitPublicBaseUrl;
  const host = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;
  return `http://${host}:${getBoundPort()}`;
}
