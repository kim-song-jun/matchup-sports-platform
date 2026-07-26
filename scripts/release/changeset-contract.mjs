import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP_PACKAGES = ['v1_api', 'v1_web'];
const BUMP_ORDER = new Map([
  ['patch', 1],
  ['minor', 2],
  ['major', 3],
]);

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }
}

function parseVersion(value, label) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value ?? '');
  if (!match) {
    throw new Error(`${label} must use a stable major.minor.patch version`);
  }
  return match.slice(1).map(Number);
}

function parseChangeset(path, filename) {
  const source = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(source);
  if (!match) {
    throw new Error(`${filename} must contain Changesets frontmatter and a summary`);
  }

  const releases = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const release = /^\s*["']?([^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/.exec(line);
    if (!release) {
      throw new Error(`${filename} contains invalid release frontmatter: ${line}`);
    }
    releases.push({ packageName: release[1].trim(), bump: release[2] });
  }

  if (releases.length === 0) {
    throw new Error(`${filename} must declare at least one package release`);
  }
  if (!match[2].trim()) {
    throw new Error(`${filename} must include a non-empty release summary`);
  }
  return releases;
}

export function loadReleaseContract(repoRoot) {
  const versions = APP_PACKAGES.map((packageName) => {
    const manifestPath = join(repoRoot, 'apps', packageName, 'package.json');
    const manifest = readJson(manifestPath, `${packageName} package manifest`);
    if (manifest.name !== packageName) {
      throw new Error(`${manifestPath} must declare name=${packageName}`);
    }
    parseVersion(manifest.version, `${packageName} version`);
    return manifest.version;
  });
  if (new Set(versions).size !== 1) {
    throw new Error('Fixed package versions must match before resolving a release');
  }

  const changesetDirectory = join(repoRoot, '.changeset');
  const config = readJson(join(changesetDirectory, 'config.json'), 'Changesets config');
  const fixedGroups = Array.isArray(config.fixed) ? config.fixed : [];
  const hasV1FixedGroup = fixedGroups.some(
    (group) =>
      Array.isArray(group) &&
      APP_PACKAGES.every((packageName) => group.includes(packageName)),
  );
  if (!hasV1FixedGroup) {
    throw new Error('Changesets config must keep v1_api and v1_web in one fixed group');
  }
  if (config.privatePackages?.version !== true || config.privatePackages?.tag !== true) {
    throw new Error('Changesets config must version and tag private application packages');
  }

  const filenames = existsSync(changesetDirectory)
    ? readdirSync(changesetDirectory)
        .filter((filename) => filename.endsWith('.md') && filename !== 'README.md')
        .sort()
    : [];
  const releases = filenames.flatMap((filename) =>
    parseChangeset(join(changesetDirectory, filename), filename),
  );
  const appReleases = releases.filter(({ packageName }) => APP_PACKAGES.includes(packageName));
  const unknownPackages = releases
    .map(({ packageName }) => packageName)
    .filter((packageName) => !APP_PACKAGES.includes(packageName));
  if (unknownPackages.length > 0) {
    throw new Error(`Unknown Changesets package: ${[...new Set(unknownPackages)].join(', ')}`);
  }

  const bump = appReleases.reduce((highest, release) => {
    return BUMP_ORDER.get(release.bump) > BUMP_ORDER.get(highest) ? release.bump : highest;
  }, 'patch');

  return {
    baseVersion: versions[0],
    bump,
    changesets: filenames,
  };
}

export function incrementVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version, 'Base version');
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unsupported release bump: ${bump}`);
}

export function assertReleaseChangeset(repoRoot) {
  const contract = loadReleaseContract(repoRoot);
  if (contract.changesets.length === 0) {
    throw new Error('A release changeset is required for behavior-affecting changes');
  }
  return contract;
}
