import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The API loads the root .env and starts its Express listener on port 5000.
await import('../server/src/server.js');

// Run Vite in this process too, so the root dev command does not need to
// spawn sibling npm processes (which can fail in restricted Windows shells).
const client = await createServer({
  configFile: resolve(root, 'client/vite.config.js'),
  root: resolve(root, 'client')
});
await client.listen();
client.printUrls();
