// Sends one notification straight to Apple, so a device token can be proven routable or not.
//
// The private key is read from a file path and never printed. This repository is public:
// do not paste a .p8, and do not commit the file this points at.
//
//   APNS_TEAM_ID=… APNS_KEY_ID=… APNS_PRIVATE_KEY_FILE=…/AuthKey_XXXX.p8 \
//   APNS_BUNDLE_ID=kr.co.teameet.alpha APNS_ENVIRONMENT=sandbox \
//   node scripts/ios/apns-send.mjs <device-token-hex>
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, constants } from 'node:http2';

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const token = process.argv[2];
if (!token) throw new Error('pass the device token as the first argument');

const teamId = need('APNS_TEAM_ID');
const keyId = need('APNS_KEY_ID');
const bundleId = need('APNS_BUNDLE_ID');
const privateKey = readFileSync(need('APNS_PRIVATE_KEY_FILE'), 'utf8');
const environment = process.env.APNS_ENVIRONMENT ?? 'sandbox';
const host = environment === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';

// The provider token Apple expects: ES256 over base64url(header).base64url(claims), with the
// signature as the raw r‖s pair. DER — node's default — is rejected as malformed.
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const signingInput = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat: issuedAt })}`;
const signer = createSign('SHA256');
signer.update(signingInput);
const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
const providerToken = `${signingInput}.${signature}`;

const payload = JSON.stringify({
  aps: { alert: { title: '라우팅 확인', body: '이 알림이 보이면 토큰이 실제로 주소가 됩니다.' }, sound: 'default' },
  route: '/notifications',
});

const session = connect(`https://${host}`);
session.on('error', (err) => {
  console.log(`connection error: ${err.message}`);
  process.exitCode = 1;
});

const request = session.request({
  [constants.HTTP2_HEADER_METHOD]: 'POST',
  [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
  'apns-topic': bundleId,
  'apns-push-type': 'alert',
  'apns-priority': '10',
  'content-type': 'application/json',
  authorization: `bearer ${providerToken}`,
});

let status = 0;
let apnsId = '';
let body = '';
request.on('response', (headers) => {
  status = headers[constants.HTTP2_HEADER_STATUS];
  apnsId = headers['apns-id'] ?? '';
});
request.setEncoding('utf8');
request.on('data', (chunk) => { body += chunk; });
request.on('end', () => {
  const reason = body ? (JSON.parse(body).reason ?? body) : '';
  console.log(`host=${host} topic=${bundleId} tokenLength=${token.length / 2} bytes`);
  console.log(`status=${status}${reason ? ` reason=${reason}` : ''}${apnsId ? ` apns-id=${apnsId}` : ''}`);
  session.close();
});
request.end(payload);
