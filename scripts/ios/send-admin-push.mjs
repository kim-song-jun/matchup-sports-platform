// Sends one in-app notification + push to a Teameet account through the admin endpoint, so
// the real send path (API → APNs / FCM) can be exercised against a device under test.
//
// Credentials come from the environment and are never written anywhere. This repository is
// public: do not paste an account into this file or into a PR.
//
//   TEAMEET_WEB_ORIGIN=https://alpha.teameet.co.kr   (default)
//   TEAMEET_ADMIN_EMAIL=…  TEAMEET_ADMIN_PASSWORD=…   an account with adminRole=ops
//   TEAMEET_UITEST_EMAIL=…  TEAMEET_UITEST_PASSWORD=… the recipient (the device's account)
//
//   node scripts/ios/send-admin-push.mjs "<title>" "<body>" [/route]
//
// Prints the endpoint's own summary. Note that its `push` tally counts web subscriptions
// only — a delivery to an app device shows up there as 0. Whether it arrived is read on the
// device, which is what scripts/ios/verify-push-delivery.sh does.
const ORIGIN = process.env.TEAMEET_WEB_ORIGIN ?? 'https://alpha.teameet.co.kr';
const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const [title, body, route = '/notifications'] = process.argv.slice(2);
if (!title) throw new Error('usage: send-admin-push.mjs "<title>" "<body>" [/route]');

async function session(email, password) {
  const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('teameet_v1_session=')) ?? '';
  const token = cookie.split(';')[0].split('=')[1];
  if (!token) throw new Error(`login failed for the ${email === process.env.TEAMEET_ADMIN_EMAIL ? 'admin' : 'recipient'} account: HTTP ${res.status}`);
  return `teameet_v1_session=${token}`;
}
async function api(cookie, method, path, payload) {
  const res = await fetch(`${ORIGIN}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie, origin: ORIGIN },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const recipient = await session(need('TEAMEET_UITEST_EMAIL'), need('TEAMEET_UITEST_PASSWORD'));
const me = await api(recipient, 'GET', '/auth/me');
const userId = me.json?.data?.user?.id ?? me.json?.data?.id;
if (!userId) throw new Error(`could not read the recipient's id: HTTP ${me.status}`);

const admin = await session(need('TEAMEET_ADMIN_EMAIL'), need('TEAMEET_ADMIN_PASSWORD'));
const sent = await api(admin, 'POST', '/admin/ops/push-send', { target: 'user', userId, title, body, url: route });
console.log(`${sent.status} ${JSON.stringify(sent.json?.data ?? sent.json)}`);
if (sent.status !== 201 && sent.status !== 200) process.exitCode = 1;
