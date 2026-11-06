import { parse as legacyParse } from 'node:url';
import { normalizePushEndpoint } from './push-endpoint';

describe('normalizePushEndpoint', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', 'https://fcm.googleapis.com/fcm/send/abc'],
    ['https://FCM.GoogleAPIs.com/fcm/send/abc', 'https://fcm.googleapis.com/fcm/send/abc'],
    ['https://fcm.googleapis.com:443/fcm/send/abc', 'https://fcm.googleapis.com/fcm/send/abc'],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', 'https://wns2-par02p.notify.windows.com/w/?token=x'],
    ['https://web.push.apple.com/QGx', 'https://web.push.apple.com/QGx'],
  ])('accepts %s as %s', (raw, normalized) => {
    expect(normalizePushEndpoint(raw)).toBe(normalized);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evilfcm.googleapis.com.evil.example/x',
    'https://notfcm.googleapis.co/x',
    'https://127.0.0.1\\@fcm.googleapis.com/x',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
  ])('rejects %s', (raw) => {
    expect(normalizePushEndpoint(raw)).toBeNull();
  });

  // web-push re-reads the endpoint with the legacy url.parse; the value handed over must mean the same host there.
  it.each([
    'https://\tfcm.googleapis.com/x',
    'https://fcm.googleapis.com\\@127.0.0.1/x',
    'https://fcm.googleapis.com/x?\\@127.0.0.1',
    'https://fcm.googleapis.com#@127.0.0.1/x',
  ])('hands web-push a form its legacy parser reads as the checked host: %s', (raw) => {
    const normalized = normalizePushEndpoint(raw) as string;
    expect(normalized).not.toBeNull();
    expect(legacyParse(normalized).hostname).toBe(new URL(normalized).hostname);
    expect(legacyParse(normalized).port ?? '').toBe('');
  });
});
