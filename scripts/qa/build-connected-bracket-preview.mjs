import { createRequire } from 'node:module';
import path from 'node:path';
const root = process.cwd();
const require = createRequire(path.join(root, 'apps/v1_web/package.json'));
const viteRequire = createRequire(createRequire(require.resolve('vitest')).resolve('vite'));
const esbuild = viteRequire('esbuild');
await esbuild.build({
  entryPoints: ['scripts/qa/render-connected-bracket-preview.tsx'], bundle: true,
  outfile: '/tmp/round12-preview-bundle.js', platform: 'browser', format: 'iife', jsx: 'automatic',
  tsconfig: 'apps/v1_web/tsconfig.json',
  alias: { react: path.join(root, 'apps/v1_web/node_modules/react'), 'react-dom': path.join(root, 'apps/v1_web/node_modules/react-dom') },
  define: { 'process.env.NODE_ENV': '"production"' }, banner: { js: 'var process = {env: {NODE_ENV: "production"}};' },
});
