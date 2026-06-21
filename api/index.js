// Vercel serverless entry point.
//
// Vercel runs `npm run build` (see vercel.json) to compile TypeScript into
// build/, then bundles this function. We reuse the exact same Express app that
// the container/stdio modes use — the app is stateless (stateless MCP transport
// + Redis store), so it is safe to (re)create per cold start and share across
// invocations on a warm instance.
//
// All routes (/mcp, /tx/:id, /api/*) are rewritten to this function; Express
// dispatches on the original request URL.
import { createApp } from '../build/http/server.js';
import { initStore } from '../build/store.js';

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = initStore()
      .then(() => createApp())
      .catch((error) => {
        // Reset so the next invocation retries init rather than caching failure.
        appPromise = undefined;
        throw error;
      });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app(req, res);
}
