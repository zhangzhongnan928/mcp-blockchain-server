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

/** The base URL for signing links: an explicit override, else derived from the bound port. */
export function getPublicBaseUrl(): string {
  return config.explicitPublicBaseUrl ?? `http://localhost:${getBoundPort()}`;
}
