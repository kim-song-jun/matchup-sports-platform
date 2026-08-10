#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";

const REQUIRED_DOMAINS = [
  "games.md",
  "team-schedules.md",
  "tournament-operations.md",
  "tournament-operations-auth.md",
  "tournament-operations-escalations.md",
  "game-realtime.md",
  "game-migration.md",
  "public-records.md",
  "tournaments.md",
];

const SECTION_OWNERS = new Map([
  ["Frozen operational decision table", "domains/games.md"],
  ["Frozen REST and idempotency contract", "global-contract.md"],
  ["Public visibility output matrix", "domains/public-records.md"],
  ["Frozen realtime contract", "domains/game-realtime.md"],
  ["Canonical actor-action matrix", "domains/tournament-operations-auth.md"],
  ["Frozen additive schema ledger", "domains/games.md"],
  ["Frozen worker lease and retry policy", "domains/tournament-operations-escalations.md"],
  ["Consent truth table", "domains/public-records.md"],
  ["Consent lifecycle and retroactivity", "domains/public-records.md"],
  ["Literal migration/cutover phases", "domains/game-migration.md"],
]);

class ContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ContractError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new ContractError(code, detail);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      fail("DOC_INPUT_MALFORMED", `expected --flag value, received ${flag ?? "<empty>"}`);
    }
    if (values.has(flag)) fail("DOC_INPUT_MALFORMED", `duplicate argument ${flag}`);
    values.set(flag, value);
  }
  for (const flag of ["--plan", "--task", "--api-root"]) {
    if (!values.has(flag)) fail("DOC_INPUT_MALFORMED", `missing ${flag}`);
  }
  if (values.size !== 3) fail("DOC_INPUT_MALFORMED", "unsupported argument");
  return {
    planPath: resolve(values.get("--plan")),
    taskPath: resolve(values.get("--task")),
    apiRoot: resolve(values.get("--api-root")),
  };
}

function read(path) {
  if (!existsSync(path)) fail("DOC_INPUT_MISSING", relative(process.cwd(), path));
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function normalized(text) {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function extractHeadingSection(text, title) {
  const escaped = title.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = `${text}\n### __END_OF_DOCUMENT__\n`;
  const match = source.match(
    new RegExp(
      `^### ${escaped}\\n([\\s\\S]*?)(?=^### |^## |^<!-- TASK127_GAME_RECORD_ADR_BUNDLE_END -->)`,
      "m",
    ),
  );
  if (!match) fail("DOC_SOURCE_SECTION_MISSING", title);
  return normalized(`### ${title}\n${match[1]}`);
}

function extractMarkedSections(path, text) {
  const beginPattern = /<!-- API_CONTRACT_SECTION_BEGIN:([^>]+) -->/g;
  const endPattern = /<!-- API_CONTRACT_SECTION_END:([^>]+) -->/g;
  const begins = [...text.matchAll(beginPattern)];
  const ends = [...text.matchAll(endPattern)];
  if (begins.length !== ends.length) fail("DOC_MARKER_MALFORMED", path);
  const sections = new Map();
  for (let index = 0; index < begins.length; index += 1) {
    const begin = begins[index];
    const end = ends[index];
    const title = begin[1];
    if (title !== end[1] || begin.index >= end.index) fail("DOC_MARKER_MALFORMED", `${path}:${title}`);
    if (sections.has(title)) fail("DOC_DOMAIN_DUPLICATE", `${path}:${title}`);
    const contentStart = begin.index + begin[0].length;
    sections.set(title, normalized(text.slice(contentStart, end.index)));
  }
  return sections;
}

function parseTaskMetadata(taskText) {
  const match = taskText.match(
    /<!-- TASK127_GAME_RECORD_ADR_METADATA_BEGIN -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- TASK127_GAME_RECORD_ADR_METADATA_END -->/,
  );
  if (!match) fail("DOC_TASK_IDENTITY_MISSING", "Task 127 ADR metadata");
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    if (error instanceof SyntaxError) fail("DOC_TASK_IDENTITY_MALFORMED", error.message);
    throw error;
  }
}

function canonicalFiles(apiRoot, readmeText) {
  const links = [...readmeText.matchAll(/\]\(\.\/domains\/([^)]+\.md)(?:#[^)]+)?\)/g)].map(
    (match) => match[1],
  );
  const seen = new Set();
  for (const domain of links) {
    if (seen.has(domain)) fail("DOC_DOMAIN_DUPLICATE", domain);
    seen.add(domain);
  }
  for (const domain of REQUIRED_DOMAINS) {
    if (!seen.has(domain)) fail("DOC_DOMAIN_MISSING", domain);
  }
  return ["README.md", "global-contract.md", ...links.map((domain) => `domains/${domain}`)];
}

function slug(text) {
  return text
    .toLowerCase()
    .replaceAll(/[`*_]/g, "")
    .replaceAll(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

function validateLinks(apiRoot, files) {
  let linkCount = 0;
  for (const file of files) {
    const absolute = join(apiRoot, file);
    const text = read(absolute);
    for (const match of text.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|mailto:)/.test(target)) continue;
      linkCount += 1;
      const [relativeTarget, fragment] = target.split("#", 2);
      const targetPath = relativeTarget ? resolve(dirname(absolute), relativeTarget) : absolute;
      if (!existsSync(targetPath)) fail("DOC_LINK_BROKEN", `${file} -> ${target}`);
      if (fragment && extname(targetPath) === ".md") {
        const headings = new Set(
          [...read(targetPath).matchAll(/^#{1,6}\s+(.+)$/gm)].map((heading) => slug(heading[1])),
        );
        if (!headings.has(fragment)) fail("DOC_LINK_BROKEN", `${file} -> ${target}`);
      }
      const canonicalTarget = normalize(relative(apiRoot, realpathSync(targetPath)));
      if (canonicalTarget.startsWith(`v1${normalize("/")}`) || canonicalTarget === "v1") {
        fail("DOC_LEGACY_CANONICAL_REFERENCE", `${file} -> ${target}`);
      }
    }
  }
  return linkCount;
}

function countRows(text) {
  return text.split("\n").filter((line) => /^\|.+\|$/.test(line) && !/^\|[-:|\s]+\|$/.test(line)).length;
}

function run() {
  const { planPath, taskPath, apiRoot } = parseArgs(process.argv.slice(2));
  const planText = read(planPath);
  const taskText = read(taskPath);
  const readmeText = read(join(apiRoot, "README.md"));
  const globalText = read(join(apiRoot, "global-contract.md"));
  const planIdentity = globalText.match(/<!-- API_CONTRACT_PLAN_SHA256:([a-f0-9]{64}) -->/)?.[1];
  if (!planIdentity || planIdentity !== sha256(planText)) {
    fail("DOC_STALE_PLAN_IDENTITY", `${planIdentity ?? "<missing>"} != ${sha256(planText)}`);
  }
  const metadata = parseTaskMetadata(taskText);
  if (resolve(metadata.planPath) !== planPath) fail("DOC_STALE_PLAN_IDENTITY", metadata.planPath);

  const files = canonicalFiles(apiRoot, readmeText);
  if (readmeText.includes("](./v1/") || readmeText.includes("docs/api/v1/domains")) {
    fail("DOC_LEGACY_CANONICAL_REFERENCE", "README.md");
  }
  const linkCount = validateLinks(apiRoot, files);
  const docSections = new Map();
  for (const file of files) {
    for (const [title, content] of extractMarkedSections(file, read(join(apiRoot, file)))) {
      if (docSections.has(title)) fail("DOC_DOMAIN_DUPLICATE", title);
      docSections.set(title, { content, file });
    }
  }

  let tableRows = 0;
  for (const [title, owner] of SECTION_OWNERS) {
    const planSection = extractHeadingSection(planText, title);
    const taskSection = extractHeadingSection(taskText, title);
    if (taskSection !== planSection) fail("DOC_TASK_CONTRACT_DRIFT", title);
    const documented = docSections.get(title);
    if (!documented || documented.file !== owner || documented.content !== planSection) {
      fail("DOC_CONTRACT_DRIFT", `${title} owner=${documented?.file ?? "<missing>"}`);
    }
    tableRows += countRows(planSection);
  }
  if (docSections.size !== SECTION_OWNERS.size) fail("DOC_CONTRACT_DRIFT", "unexpected contract section");

  console.log(
    `V3 PASS domains=${REQUIRED_DOMAINS.length} indexed=${files.length - 2} links=${linkCount} sections=${docSections.size} tableRows=${tableRows} legacyCanonicalReferences=0`,
  );
}

try {
  run();
} catch (error) {
  // no-excuse-ok: catch -- CLI boundary converts typed validation failures to stable exit codes.
  if (error instanceof ContractError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
