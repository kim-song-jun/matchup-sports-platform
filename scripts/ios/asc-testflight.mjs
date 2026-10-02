#!/usr/bin/env node
// Prepares TestFlight so a person only has to add people.
//
// Creating an internal group and attaching a build is clicking through App Store Connect
// otherwise, and it has to be redone for every build. Adding testers is deliberately NOT
// here: who gets access is a decision, and their email addresses are personal data that has
// no reason to pass through a script in a public repository.
//
// Credentials come from the environment; the .p8 lives outside this repository. This is the
// App Store Connect API key, a DIFFERENT key from the APNs one.
//
//   ASC_KEY_ID=…  ASC_ISSUER_ID=…  ASC_KEY_FILE=…
//
// Usage:
//   node scripts/ios/asc-testflight.mjs status
//   node scripts/ios/asc-testflight.mjs prepare "<group name>" <build number>
//
// The second argument is the BUILD number (CFBundleVersion, e.g. 5), not the marketing
// version: App Store Connect's `filter[version]` on builds means exactly that. Passing
// "0.1.3" finds nothing and reports the build as not uploaded — measured.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. See the header of this script.`);
    process.exit(2);
  }
  return value;
}

function bearerToken() {
  const keyId = required('ASC_KEY_ID');
  const issuer = required('ASC_ISSUER_ID');
  const key = readFileSync(required('ASC_KEY_FILE'), 'utf8');
  const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const head = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = encode({ iss: issuer, iat: issuedAt, exp: issuedAt + 1200, aud: 'appstoreconnect-v1' });
  const signer = createSign('SHA256');
  signer.update(`${head}.${body}`);
  // Raw r||s, not DER: Apple rejects the default encoding with a bare 401.
  const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${signature}`;
}

const token = bearerToken();

async function api(path, init = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`${init.method ?? 'GET'} ${path} → ${response.status}`);
    console.error(text.slice(0, 800));
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

async function appFor(bundleId) {
  const found = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = found.data[0];
  if (!app) {
    console.error(`No app record for ${bundleId}. Create it in App Store Connect first.`);
    process.exit(1);
  }
  return app;
}

const BUNDLE_ID = process.env.TEAMEET_BUNDLE_ID ?? 'kr.co.teameet.alpha';
const [command, ...rest] = process.argv.slice(2);

if (command === 'status') {
  const app = await appFor(BUNDLE_ID);
  console.log(`app: ${app.attributes.name} (${app.id})`);
  const builds = await api(`/v1/builds?filter[app]=${app.id}&limit=10&sort=-version`);
  for (const b of builds.data) {
    const a = b.attributes;
    console.log(`  build ${a.version}  ${a.processingState}  expired=${a.expired}  uploaded=${a.uploadedDate}`);
  }
  const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=50`);
  console.log(`beta groups: ${groups.data.length}`);
  for (const g of groups.data) {
    console.log(`  ${g.id}  ${g.attributes.name}  internal=${g.attributes.isInternalGroup}`);
  }
} else if (command === 'prepare') {
  const [name, version] = rest;
  if (!name || !version) {
    console.error('Usage: asc-testflight.mjs prepare "<group name>" <build number>');
    process.exit(2);
  }
  const app = await appFor(BUNDLE_ID);

  const groups = await api(`/v1/betaGroups?filter[app]=${app.id}&limit=50`);
  // Reused rather than recreated: a second group with the same name would split the testers
  // already in the first one, and Apple allows the duplicate.
  let group = groups.data.find((g) => g.attributes.name === name);
  if (group) {
    console.log(`group already exists: ${group.id}`);
  } else {
    const created = await api('/v1/betaGroups', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'betaGroups',
          // Internal: no Beta App Review, and it takes effect as soon as the build finishes
          // processing. External groups need Apple's review on the first build.
          attributes: { name, isInternalGroup: true },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        },
      }),
    });
    group = created.data;
    console.log(`created group: ${group.id}`);
  }

  const builds = await api(`/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(version)}`);
  const build = builds.data[0];
  if (!build) {
    console.error(`No build ${version} for ${BUNDLE_ID}. Upload it first, and wait for processing.`);
    process.exit(1);
  }
  if (build.attributes.processingState !== 'VALID') {
    console.error(`Build ${version} is ${build.attributes.processingState}, not VALID. Wait and re-run.`);
    process.exit(1);
  }

  await api(`/v1/betaGroups/${group.id}/relationships/builds`, {
    method: 'POST',
    body: JSON.stringify({ data: [{ type: 'builds', id: build.id }] }),
  });
  console.log(`attached build ${version} to "${name}"`);
  console.log('Testers are not added by this script — add them in App Store Connect.');
} else {
  console.error('Usage: asc-testflight.mjs <status|prepare>');
  process.exit(2);
}
