import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiRoot = join(repoRoot, 'apps/v1_api');
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const ts = apiRequire('typescript');
const { getTscConfigPath } = apiRequire('@nestjs/cli/lib/compiler/helpers/get-tsc-config.path');
const normalize = (path) => path.replaceAll('\\', '/');

function selectNestConfig() {
  const previousCwd = process.cwd();
  try {
    process.chdir(apiRoot);
    const nestConfig = JSON.parse(readFileSync(join(apiRoot, 'nest-cli.json'), 'utf8'));
    return resolve(apiRoot, getTscConfigPath(nestConfig, []));
  } finally {
    process.chdir(previousCwd);
  }
}

function parseConfig(configPath) {
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(loaded.error, undefined, `Cannot read ${configPath}`);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath), undefined, configPath);
  assert.deepEqual(parsed.errors, [], `Cannot parse ${configPath}`);
  return parsed;
}

const selectedConfigPath = selectNestConfig();
const selectedConfig = parseConfig(selectedConfigPath);
let productionProgram;
function getProductionProgram() {
  productionProgram ??= ts.createProgram({
    rootNames: selectedConfig.fileNames,
    options: selectedConfig.options,
  });
  return productionProgram;
}

function isTestSource(fileName) {
  const rel = normalize(relative(apiRoot, fileName));
  if (rel.startsWith('../') || isAbsolute(rel) || rel.startsWith('node_modules/')) return false;
  return rel.startsWith('test/') || /\.(?:spec|integration-spec|test|fixtures?)\.tsx?$/.test(rel);
}

function isTestArtifact(fileName) {
  const rel = normalize(relative(apiRoot, fileName));
  return rel.startsWith('dist/test/') || /\.(?:spec|integration-spec|test|fixtures?)\.(?:js|d\.ts)(?:\.map)?$/.test(rel);
}

function assertProductionGraph(program) {
  const leakedFiles = program.getSourceFiles()
    .filter((source) => !source.isDeclarationFile && isTestSource(source.fileName))
    .map((source) => normalize(relative(apiRoot, source.fileName)));
  assert.deepEqual(leakedFiles, [], `Production program includes test files: ${leakedFiles.join(', ')}`);
}

function emitSource(program, source) {
  const emitted = new Map();
  const result = program.emit(source, (fileName, body) => emitted.set(normalize(resolve(fileName)), body));
  assert.equal(result.emitSkipped, false, `Skipped emission for ${source.fileName}`);
  assert.deepEqual(result.diagnostics, [], `Emission failed for ${source.fileName}`);
  return emitted;
}

function runtimeEntrypoints() {
  const result = new Set();
  const dockerfile = readFileSync(join(repoRoot, 'deploy/Dockerfile.v1-api'), 'utf8');
  for (const match of dockerfile.matchAll(/CMD\s*\[\s*"node"\s*,\s*"dist\/([A-Za-z0-9._/-]+)\.js"\s*\]/g)) {
    result.add(match[1]);
  }
  for (const script of ['deploy/deploy-alpha.sh', 'deploy/deploy-prod.sh']) {
    for (const match of readFileSync(join(repoRoot, script), 'utf8').matchAll(/node\s+dist\/([A-Za-z0-9._/-]+)\.js/g)) {
      result.add(match[1]);
    }
  }
  for (const compose of ['deploy/docker-compose.prod.yml', 'deploy/docker-compose.alpha.yml']) {
    const source = readFileSync(join(repoRoot, compose), 'utf8');
    for (const match of source.matchAll(/^\s*command:\s*\[\s*["']node["']\s*,\s*["']dist\/([A-Za-z0-9._/-]+)\.js["']\s*\]/gm)) {
      result.add(match[1]);
    }
  }
  assert.ok(result.size > 0, 'No production Node entrypoint was inspected');
  return [...result].sort();
}

test('actual Nest production config removes test roots without narrowing the lint config', () => {
  assert.equal(normalize(relative(apiRoot, selectedConfigPath)), 'tsconfig.build.json');
  const leakedRoots = selectedConfig.fileNames.filter(isTestSource).map((fileName) => normalize(relative(apiRoot, fileName)));
  assert.deepEqual(leakedRoots, [], `Nest build still includes test roots: ${leakedRoots.join(', ')}`);

  const broadConfig = parseConfig(join(apiRoot, 'tsconfig.json'));
  assert.ok(broadConfig.fileNames.some(isTestSource), 'General typecheck must still include the existing tests');
  for (const root of ['src/main.ts', 'prisma/seed-alpha-tournament-qa.ts', 'prisma/seed-alpha-showcase-results.ts']) {
    assert.ok(selectedConfig.fileNames.includes(join(apiRoot, root).replaceAll('\\', '/')),
      `Nest build lost required runtime root ${root}`);
  }
});

test('closed production program excludes test files, including transitive imports', () => {
  assertProductionGraph(getProductionProgram());
});

test('all deployed Node entrypoints actually emit at the paths copied into runtime images', (context) => {
  const program = getProductionProgram();
  const entrypoints = runtimeEntrypoints();
  assert.ok(entrypoints.includes('src/main'), 'Runtime image main entrypoint was not inspected');
  assert.ok(entrypoints.includes('prisma/seed-alpha-tournament-qa'), 'Alpha tournament seed was not inspected');
  assert.ok(entrypoints.includes('prisma/seed-alpha-showcase-results'), 'Alpha results seed was not inspected');
  assert.ok(entrypoints.includes('src/jobs/v1-game-operations-worker.main'), 'Compose worker entrypoint was not inspected');
  for (const entrypoint of entrypoints) {
    const source = program.getSourceFile(join(apiRoot, `${entrypoint}.ts`));
    assert.ok(source, `Missing production source ${entrypoint}.ts`);
    const emitted = emitSource(program, source);
    const expectedJs = normalize(join(apiRoot, 'dist', `${entrypoint}.js`));
    assert.ok(emitted.get(expectedJs)?.trim(), `No executable JavaScript emitted at ${expectedJs}`);
    assert.equal([...emitted.keys()].some(isTestArtifact), false, `Test artifact emitted with ${entrypoint}`);
  }
  context.diagnostic(`Selected in-memory JavaScript emissions: ${entrypoints.map((path) => `dist/${path}.js`).join(', ')}`);
});

test('original broad config is a failing control and really emits the Jest fixture', (context) => {
  const broadConfig = parseConfig(join(apiRoot, 'tsconfig.json'));
  const broadProgram = ts.createProgram({ rootNames: broadConfig.fileNames, options: broadConfig.options });
  assert.throws(() => assertProductionGraph(broadProgram), /Production program includes test files/);
  const fixture = broadProgram.getSourceFile(join(apiRoot,
    'src/tournaments/tournament-players.mdqa140-deleted-nickname.fixtures.ts'));
  assert.ok(fixture, 'Original production build no longer contains the regression fixture');
  const emitted = emitSource(broadProgram, fixture);
  const emittedFixture = emitted.get(normalize(join(apiRoot,
    'dist/src/tournaments/tournament-players.mdqa140-deleted-nickname.fixtures.js')));
  assert.ok(emittedFixture, 'Broad config did not emit the regression artifact');
  assert.match(emittedFixture, /jest\.fn\(/, 'Control did not exercise the actual Jest-based fixture');
  context.diagnostic(`Original broad config rejected: ${broadConfig.fileNames.filter(isTestSource).length} test roots; actual Jest fixture JavaScript emitted`);
});

test('an excluded test file reintroduced by a runtime import fails the closed-graph guard', () => {
  const mainPath = normalize(join(apiRoot, 'src/main.ts'));
  const originalHost = ts.createCompilerHost(selectedConfig.options);
  const originalGetSourceFile = originalHost.getSourceFile.bind(originalHost);
  originalHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (normalize(resolve(fileName)) === mainPath) {
      const body = `${readFileSync(mainPath, 'utf8')}\nimport './tournaments/tournament-players.mdqa140-deleted-nickname.fixtures';\n`;
      return ts.createSourceFile(fileName, body, languageVersion, true);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const importedFixtureProgram = ts.createProgram({
    rootNames: [mainPath],
    options: selectedConfig.options,
    host: originalHost,
  });
  assert.throws(() => assertProductionGraph(importedFixtureProgram), /Production program includes test files/);
});
