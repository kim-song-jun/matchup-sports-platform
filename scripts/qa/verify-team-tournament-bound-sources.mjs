#!/usr/bin/env node

import {
  closeSync,
  constants,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const DEFAULT_PDF =
  '/Users/sungjun/Downloads/Teameet_app_v1_팀관리_대회운영_상세기획서_2026-07-28.pdf';
const DEFAULT_PREVIEW = '/Users/sungjun/Downloads/preview.html';
const DESIGN_PATH =
  'docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html';

class VerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new VerificationError('MALFORMED_INPUT', `Unexpected argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new VerificationError('MALFORMED_INPUT', `Missing value for ${token}`);
    }
    const name = token.slice(2);
    if (Object.hasOwn(options, name)) {
      throw new VerificationError('MALFORMED_INPUT', `Duplicate option: ${token}`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

const OPENAT_HELPER = String.raw`
import hashlib
import json
import os
import stat
import sys

def identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_size, value.st_mtime_ns)

def write_all(fd, data):
    offset = 0
    while offset < len(data):
        written = os.write(fd, data[offset:])
        if written <= 0:
            raise OSError('short descriptor output write')
        offset += written

def emit(value):
    sys.stdout.write(json.dumps(value, separators=(',', ':')))

def main():
    descriptors = []
    try:
        request = json.loads(sys.stdin.read())
        if set(request) != {'path', 'root', 'parts'}:
            raise ValueError('invalid request shape')
        path = request['path']
        root = request['root']
        parts = request['parts']
        if root != '/' or not isinstance(path, str) or not isinstance(parts, list):
            raise ValueError('invalid source root')
        if not parts or any(not isinstance(part, str) or not part or part in ('.', '..') or '/' in part for part in parts):
            raise ValueError('invalid source path component')
        if path != root + '/'.join(parts):
            raise ValueError('source path escapes root')
        nofollow = getattr(os, 'O_NOFOLLOW', None)
        directory = getattr(os, 'O_DIRECTORY', None)
        if nofollow is None or directory is None:
            raise ValueError('required open flags are unavailable')
        root_fd = os.open(root, os.O_RDONLY | directory | nofollow)
        descriptors.append(root_fd)
        if not stat.S_ISDIR(os.fstat(root_fd).st_mode):
            raise ValueError('root is not a directory')
        parent_fd = root_fd
        for part in parts[:-1]:
            child_fd = os.open(part, os.O_RDONLY | directory | nofollow, dir_fd=parent_fd)
            descriptors.append(child_fd)
            if not stat.S_ISDIR(os.fstat(child_fd).st_mode):
                raise ValueError('intermediate component is not a directory')
            parent_fd = child_fd
        file_fd = os.open(parts[-1], os.O_RDONLY | nofollow, dir_fd=parent_fd)
        descriptors.append(file_fd)
        before = [(fd, identity(os.fstat(fd))) for fd in descriptors]
        if not stat.S_ISREG(before[-1][1][2]):
            raise ValueError('source is not a regular file')
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = os.read(file_fd, 65536)
            if not chunk:
                break
            digest.update(chunk)
            write_all(3, chunk)
            size += len(chunk)
        if size != before[-1][1][3] or any(identity(os.fstat(fd)) != saved for fd, saved in before):
            emit({'ok': False, 'code': 'SOURCE_CHANGED_DURING_READ'})
            return
        emit({'ok': True, 'code': 'BOUND_SOURCE_DESCRIPTOR_OK', 'path': path, 'size': size, 'sha256': digest.hexdigest()})
    except Exception:
        emit({'ok': False, 'code': 'SOURCE_DESCRIPTOR_INVALID'})
    finally:
        for fd in reversed(descriptors):
            os.close(fd)

main()
`;

function helperResult(absolutePath, root, relativeParts, outputDescriptor) {
  const result = spawnSync('python3', ['-c', OPENAT_HELPER], {
    input: JSON.stringify({ path: absolutePath, root, parts: relativeParts }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe', outputDescriptor],
    maxBuffer: 16 * 1024,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0 || result.signal || result.stderr !== '') {
    throw new VerificationError(
      'SOURCE_DESCRIPTOR_INVALID',
      `${absolutePath}: descriptor helper did not complete successfully`,
    );
  }
  if (typeof result.stdout !== 'string' || result.stdout.length === 0 || result.stdout.length > 4096) {
    throw new VerificationError('SOURCE_DESCRIPTOR_INVALID', `${absolutePath}: descriptor helper output is invalid`);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new VerificationError('SOURCE_DESCRIPTOR_INVALID', `${absolutePath}: descriptor helper output is invalid`);
  }
  const expectedKeys = ['code', 'ok', 'path', 'sha256', 'size'];
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(',') !== expectedKeys.join(',') ||
    parsed.ok !== true ||
    parsed.code !== 'BOUND_SOURCE_DESCRIPTOR_OK' ||
    parsed.path !== absolutePath ||
    !Number.isSafeInteger(parsed.size) ||
    parsed.size < 0 ||
    !/^[0-9a-f]{64}$/.test(parsed.sha256)
  ) {
    const code = parsed?.code === 'SOURCE_CHANGED_DURING_READ'
      ? 'SOURCE_CHANGED_DURING_READ'
      : 'SOURCE_DESCRIPTOR_INVALID';
    throw new VerificationError(code, `${absolutePath}: descriptor helper result is invalid`);
  }
  return parsed;
}

export function descriptorRead(filePath) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  const { root } = parse(absolutePath);
  const relativeParts = absolutePath.slice(root.length).split(sep).filter(Boolean);
  let temporaryDirectory;
  let outputDescriptor;

  try {
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
      throw new VerificationError(
        'SOURCE_DESCRIPTOR_INVALID',
        `descriptor-relative source reads are unsupported on ${process.platform}`,
      );
    }
    if (root !== '/' || relativeParts.length === 0) {
      throw new VerificationError('SOURCE_DESCRIPTOR_INVALID', `${absolutePath} does not name a file`);
    }
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'teameet-bound-source-'));
    outputDescriptor = openSync(
      join(temporaryDirectory, 'source-bytes'),
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    const helper = helperResult(absolutePath, root, relativeParts, outputDescriptor);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytesRead = 0;
    let offset = 0;
    const digest = createHash('sha256');
    const chunks = [];
    do {
      bytesRead = readSync(outputDescriptor, buffer, 0, buffer.length, offset);
      if (bytesRead > 0) {
        const chunk = Buffer.from(buffer.subarray(0, bytesRead));
        chunks.push(chunk);
        digest.update(chunk);
        offset += bytesRead;
      }
    } while (bytesRead > 0);
    const sha256 = digest.digest('hex');
    if (offset !== helper.size || sha256 !== helper.sha256) {
      throw new VerificationError(
        'SOURCE_CHANGED_DURING_READ',
        `${absolutePath}: descriptor helper byte stream does not match its verified digest`,
      );
    }
    const bytes = Buffer.concat(chunks);
    const result = {
      path: absolutePath,
      size: bytes.length,
      sha256,
    };
    Object.defineProperty(result, 'bytes', { value: bytes, enumerable: false });
    return result;
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw new VerificationError(
      'SOURCE_DESCRIPTOR_INVALID',
      `${absolutePath}: ${error.message}`,
    );
  } finally {
    if (outputDescriptor !== undefined) closeSync(outputDescriptor);
    if (temporaryDirectory !== undefined) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function verifyDigest(label, observed, expected) {
  if (!expected) {
    throw new VerificationError('MALFORMED_INPUT', `Missing expected ${label} SHA-256`);
  }
  if (observed !== expected) {
    throw new VerificationError(
      'SOURCE_DIGEST_MISMATCH',
      `${label} SHA-256 mismatch: expected ${expected}, observed ${observed}`,
    );
  }
}

function readCommittedDesign(commit, repoRoot) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new VerificationError('MALFORMED_INPUT', 'design commit must be a full 40-character SHA');
  }
  const result = spawnSync('git', ['show', `${commit}:${DESIGN_PATH}`], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new VerificationError(
      'SOURCE_DESCRIPTOR_INVALID',
      `git show failed for committed design: ${result.stderr.toString('utf8').trim()}`,
    );
  }
  return {
    path: `${commit}:${DESIGN_PATH}`,
    size: result.stdout.length,
    sha256: createHash('sha256').update(result.stdout).digest('hex'),
  };
}

export function verifyBoundSources(options, repoRoot = process.cwd()) {
  const pdf = descriptorRead(
    options['pdf-path'] ?? process.env.V1_BOUND_PDF_PATH ?? DEFAULT_PDF,
  );
  const preview = descriptorRead(
    options['preview-path'] ?? process.env.V1_BOUND_PREVIEW_PATH ?? DEFAULT_PREVIEW,
  );
  const designPath = options['design-path'] ?? process.env.V1_BOUND_DESIGN_PATH;
  const design = designPath
    ? descriptorRead(designPath)
    : readCommittedDesign(options['design-commit'], repoRoot);

  verifyDigest('PDF', pdf.sha256, options['pdf-sha']);
  verifyDigest('preview', preview.sha256, options['preview-sha']);
  verifyDigest('committed design', design.sha256, options['design-sha']);

  return {
    code: 'BOUND_SOURCES_OK',
    pdf,
    preview,
    design: {
      ...design,
      commit: options['design-commit'] ?? null,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const result = verifyBoundSources(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof VerificationError ? error.code : 'BOUND_SOURCE_VERIFICATION_FAILED';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = code === 'SOURCE_DIGEST_MISMATCH' ? 65 : 64;
  }
}
