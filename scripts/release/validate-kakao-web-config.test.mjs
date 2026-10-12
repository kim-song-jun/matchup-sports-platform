import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./validate-kakao-web-config.mjs', import.meta.url));
const valid = {
  KAKAO_CLIENT_ID: '1'.repeat(32),
  KAKAO_LOGIN_JS_KEY: '2'.repeat(32),
  KAKAO_REDIRECT_URI: 'https://alpha.teameet.co.kr/callback/kakao',
  KAKAO_WEB_ORIGIN: 'https://alpha.teameet.co.kr',
};
const run = (patch = {}) => spawnSync(process.execPath, [script], {
  env: { ...process.env, ...valid, ...patch }, encoding: 'utf8',
});

test('CLI accepts configured alpha and production inputs without logging keys', () => {
  for (const origin of ['https://alpha.teameet.co.kr', 'https://teameet.co.kr']) {
    const result = run({ KAKAO_WEB_ORIGIN: origin, KAKAO_REDIRECT_URI: `${origin}/callback/kakao` });
    assert.equal(result.status, 0);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(valid.KAKAO_LOGIN_JS_KEY));
  }
});

test('CLI rejects missing/malformed login keys and a callback from the other environment', () => {
  for (const patch of [{ KAKAO_LOGIN_JS_KEY: '' }, { KAKAO_LOGIN_JS_KEY: 'wrong' },
    { KAKAO_CLIENT_ID: '' }, { KAKAO_REDIRECT_URI: 'https://teameet.co.kr/callback/kakao' }]) {
    assert.equal(run(patch).status, 1);
  }
});
