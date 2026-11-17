import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const minimumNode = '22.23.5';
export function assertNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[1]) !== 22 || Number(match[2]) < 23 ||
      (Number(match[2]) === 23 && Number(match[3]) < 5)) {
    throw new Error(`Node.js ${version} rejected: use patched Node.js >=${minimumNode} <23 (ICTIS SMR261116).`);
  }
}

export function checkConfiguration(root) {
  const read = (path) => readFileSync(resolve(root, path), 'utf8');
  for (const path of ['package.json', 'apps/v1_api/package.json', 'apps/v1_web/package.json']) {
    if (JSON.parse(read(path)).engines.node !== '>=22.23.5 <23') throw new Error(`${path}: insecure Node engine range`);
  }
  if (read('.nvmrc').trim() !== minimumNode) throw new Error('.nvmrc: incorrect security baseline');
  for (const path of ['deploy/Dockerfile.v1-api', 'deploy/Dockerfile.v1-web', 'deploy/Dockerfile.dev', 'deploy/Dockerfile.v1-verification', 'scripts/qa/harness/task168-stage-b-image/Dockerfile']) {
    const bases = [...read(path).matchAll(/^FROM\s+(node:\S+)/gm)].map((m) => m[1]);
    if (!bases.length || bases.some((base) => !/^node:22\.23\.5-(?:alpine|bookworm-slim)@sha256:[a-f0-9]{64}$/.test(base))) {
      throw new Error(`${path}: Node base must pin the patched version and digest`);
    }
  }
  for (const path of ['.github/workflows/deploy.yml', '.github/workflows/promote-main.yml']) {
    const versions = [...read(path).matchAll(/node-version:\s*([^\r\n]+)/g)].map((m) => m[1].trim());
    if (!versions.length || versions.some((version) => version !== "'22.23.5'")) throw new Error(`${path}: CI Node security baseline drift`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertNodeVersion(process.versions.node);
  checkConfiguration(process.cwd());
  console.log(`Node.js security baseline PASS: ${process.versions.node}`);
}
