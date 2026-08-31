#!/usr/bin/env node
// Creates and installs an App Store provisioning profile through the App Store Connect API.
//
// Why this exists: Xcode's archive action always asks for a *development* provisioning
// profile, and Apple will not issue one to a team with no registered devices. Nobody on this
// project has an iPhone, and TestFlight does not need one, so that requirement can never be
// met. A distribution profile contains no device list at all, so creating one directly and
// naming it for manual signing skips the development profile entirely.
//
// Credentials come from the environment and are never written anywhere. The repository is
// public: the .p8 must live outside it. This is the App Store Connect API key, which is a
// DIFFERENT key from the APNs one — same extension, different purpose, different page of the
// portal.
//
//   ASC_KEY_ID=…      key id
//   ASC_ISSUER_ID=…   issuer id from the Keys page
//   ASC_KEY_FILE=…    path to AuthKey_XXXXXXXX.p8, outside the repository
//
// Usage:
//   node scripts/ios/asc-profile.mjs list
//   node scripts/ios/asc-profile.mjs create "Teameet Alpha App Store" kr.co.teameet.alpha
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. See the header of this script.`);
    process.exit(2);
  }
  return value;
}

// A 20-minute token, the maximum Apple accepts. ES256 must be encoded as a raw r||s pair;
// Node's default DER encoding is rejected with a bare 401 that says nothing about why.
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
    // Apple's errors are descriptive; printing the body is what makes them useful.
    console.error(`${init.method ?? 'GET'} ${path} → ${response.status}`);
    console.error(text.slice(0, 800));
    process.exit(1);
  }
  return JSON.parse(text);
}

async function findBundleId(identifier) {
  const found = await api(`/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}`);
  const match = found.data.find((entry) => entry.attributes.identifier === identifier);
  if (!match) {
    console.error(`No App ID registered for ${identifier}. Register it before creating a profile.`);
    process.exit(1);
  }
  return match.id;
}

async function findDistributionCertificate() {
  const found = await api('/v1/certificates?limit=200');
  // Apple reports several distribution flavours; the one a locally signed archive can use is
  // whichever has its private key in this machine's keychain, which the archive step verifies.
  const certificate = found.data.find((entry) => entry.attributes.certificateType.includes('DISTRIBUTION'));
  if (!certificate) {
    console.error('No distribution certificate on the account.');
    console.error('Create one: Xcode → Settings → Accounts → Manage Certificates → + → Apple Distribution');
    process.exit(1);
  }
  return certificate.id;
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'list') {
  for (const kind of ['bundleIds', 'certificates', 'profiles']) {
    const found = await api(`/v1/${kind}?limit=200`);
    console.log(`${kind}: ${found.data.length}`);
    for (const entry of found.data) {
      const a = entry.attributes;
      console.log(`  ${entry.id}  ${a.identifier ?? a.certificateType ?? a.profileType}  ${a.name ?? a.displayName ?? ''}`);
    }
  }
} else if (command === 'create') {
  const [name, identifier] = rest;
  if (!name || !identifier) {
    console.error('Usage: asc-profile.mjs create "<profile name>" <bundle identifier>');
    process.exit(2);
  }
  const created = await api('/v1/profiles', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'profiles',
        attributes: { name, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: await findBundleId(identifier) } },
          certificates: { data: [{ type: 'certificates', id: await findDistributionCertificate() }] },
        },
      },
    }),
  });

  // Installed by UUID, which is how Xcode indexes the directory. Writing it under the profile
  // name instead leaves Xcode unable to find it.
  const profile = Buffer.from(created.data.attributes.profileContent, 'base64');
  const directory = join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles');
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, 'asc-profile.tmp');
  writeFileSync(temporary, profile);
  const decoded = execFileSync('security', ['cms', '-D', '-i', temporary], { encoding: 'utf8' });
  const uuid = decoded.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
  if (!uuid) {
    console.error('The profile Apple returned has no UUID; not installing it.');
    process.exit(1);
  }
  writeFileSync(join(directory, `${uuid}.mobileprovision`), profile);
  console.log(`created and installed: ${name} (${uuid})`);
  console.log('Name it as PROVISIONING_PROFILE_SPECIFIER when archiving.');
} else {
  console.error('Usage: asc-profile.mjs <list|create>');
  process.exit(2);
}
