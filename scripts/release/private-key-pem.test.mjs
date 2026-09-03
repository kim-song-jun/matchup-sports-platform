// The shapes a private key reaches CI in, against the shared bash lib. A generated EC key
// stands in for the real .p8 — same PKCS#8 encoding, nothing secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lib', 'private-key-pem.sh');
const pem = execFileSync('sh', ['-c', 'openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt']).toString();
const oneLine = pem.trimEnd().split('\n').join('\\n') + '\\n';
const base64 = Buffer.from(pem).toString('base64');

function run(fn, value) {
  const script = `source "$1"; ${fn} "$2"`;
  return execFileSync('bash', ['-c', script, 'bash', lib, value], { encoding: 'utf8' });
}

test('a raw multi-line PEM is accepted as is', () => {
  assert.equal(run('normalize_private_key', pem), pem);
});

test('a PEM flattened to one line with literal \\n is restored to a real PEM', () => {
  assert.equal(run('normalize_private_key', oneLine).trimEnd(), pem.trimEnd());
});

test('a base64-encoded PEM (with wrapping) is decoded', () => {
  const wrapped = base64.replace(/(.{64})/g, '$1\n');
  // Command substitution in the lib drops the final newline of a decoded value; the PEM body is what matters.
  assert.equal(run('normalize_private_key', wrapped).trimEnd(), pem.trimEnd());
});

test('a PEM pasted with Windows CRLF comes out LF-only', () => {
  const crlf = pem.replace(/\n/g, '\r\n');
  const out = run('normalize_private_key', crlf);
  assert.ok(!out.includes('\r'), 'no carriage return may survive');
  assert.equal(out.trimEnd(), pem.trimEnd());
  assert.ok(!run('private_key_one_line', out).includes('\r'));
});

test('a truncated PEM still carrying the BEGIN line is refused', () => {
  const truncated = pem.slice(0, Math.floor(pem.length * 0.6));
  assert.throws(() => run('normalize_private_key', truncated), /Command failed/);
});

test('one-line form has no real newlines and round-trips through the literal form', () => {
  const flat = run('private_key_one_line', pem);
  assert.ok(!flat.includes('\n'), 'the flattened key must be a single line');
  assert.equal(flat, oneLine);
  assert.equal(run('normalize_private_key', flat).trimEnd(), pem.trimEnd());
});
