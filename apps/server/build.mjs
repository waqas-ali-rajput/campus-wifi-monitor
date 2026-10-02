// Bundles the server (and the shared package source) into dist/index.js.
// Runtime npm dependencies stay external and are loaded from node_modules.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@campus/shared');

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/index.js',
  sourcemap: true,
  external,
  logLevel: 'info',
});
// migrations are read from disk at runtime
