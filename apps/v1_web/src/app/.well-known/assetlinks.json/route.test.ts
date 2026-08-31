import { afterEach, describe, expect, it } from 'vitest';

import { GET, parseCertificateFingerprints } from './route';

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, '0'),
).join(':').toUpperCase();

describe('Android asset links route', () => {
  afterEach(() => {
    delete process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS;
  });

  it('normalizes and de-duplicates valid SHA-256 fingerprints', () => {
    expect(parseCertificateFingerprints(`${FINGERPRINT.toLowerCase()}, ${FINGERPRINT}`))
      .toEqual([FINGERPRINT]);
  });

  it('fails closed while Play App Signing configuration is missing', async () => {
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('publishes the production package relation when configured', async () => {
    process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS = FINGERPRINT;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'kr.co.teameet',
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });
});
