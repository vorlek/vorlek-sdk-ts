import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const docsRoot = process.env.VORLEK_DOCS_DIR
  ? path.resolve(process.env.VORLEK_DOCS_DIR)
  : path.resolve(repoRoot, '../vorlek-docs');
const input = process.env.VORLEK_OPENAPI_SOURCE ?? path.join(docsRoot, 'openapi.json');
const output = path.join(repoRoot, 'src/types.generated.ts');

await mkdir(path.dirname(output), { recursive: true });

await new Promise<void>((resolve, reject) => {
  const child = spawn(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'openapi-typescript', input, '-o', output],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`openapi-typescript exited with code ${code}`));
    }
  });
});
