const CERTIFICATE_FINGERPRINT_PATTERN = /^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i;

export const dynamic = 'force-dynamic';

export function parseCertificateFingerprints(rawValue: string | undefined): string[] {
  if (!rawValue) return [];
  const fingerprints = rawValue
    .split(',')
    .map((value) => value.trim().toUpperCase());

  if (fingerprints.some((value) => !CERTIFICATE_FINGERPRINT_PATTERN.test(value))) {
    return [];
  }

  return [...new Set(fingerprints)];
}

export async function GET() {
  const fingerprints = parseCertificateFingerprints(
    process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS,
  );

  if (fingerprints.length === 0) {
    return Response.json(
      { error: 'Android App Links certificate fingerprint is missing or invalid.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'kr.co.teameet',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ], {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
