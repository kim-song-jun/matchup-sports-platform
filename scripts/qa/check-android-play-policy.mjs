import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n?/g, '\n');
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};
const rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) throw new Error(message);
};

const manifest = read('apps/v1_android/app/src/main/AndroidManifest.xml');
const declaredPermissions = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/g)]
  .map((match) => match[1])
  .sort();
const expectedPermissions = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.INTERNET',
  'android.permission.POST_NOTIFICATIONS',
].sort();
if (JSON.stringify(declaredPermissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error('Android manifest permission set drifted: ' + declaredPermissions.join(', '));
}
for (const permission of [
  'ACCESS_FINE_LOCATION',
  'ACCESS_BACKGROUND_LOCATION',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'MANAGE_EXTERNAL_STORAGE',
  'READ_MEDIA_IMAGES',
  'READ_MEDIA_VIDEO',
  'CAMERA',
  'RECORD_AUDIO',
  'READ_CONTACTS',
  'com.google.android.gms.permission.AD_ID',
]) {
  rejectMatch(manifest, new RegExp(permission.replaceAll('.', '\\.')), 'Forbidden permission declared: ' + permission);
}
requireMatch(manifest, /android:allowBackup="false"/, 'Android backups must stay disabled');
requireMatch(manifest, /android:usesCleartextTraffic="false"/, 'Cleartext traffic must stay disabled');

const gradle = read('apps/v1_android/app/build.gradle.kts');
requireMatch(gradle, /compileSdk\s*=\s*36/, 'compileSdk must remain 36');
requireMatch(gradle, /targetSdk\s*=\s*36/, 'targetSdk must remain 36');
requireMatch(gradle, /minSdk\s*=\s*26/, 'minSdk contract drifted');
requireMatch(gradle, /create\("production"\)[\s\S]*?WEBVIEW_DEBUGGING_ENABLED", "false"/, 'Production WebView debugging must be disabled');
requireMatch(gradle, /https:\/\/teameet\.co\.kr/, 'Production must use the TLS origin');

const activity = read('apps/v1_android/app/src/main/java/kr/co/teameet/MainActivity.java');
for (const [pattern, message] of [
  [/setAllowFileAccess\(false\)/, 'WebView file access must stay disabled'],
  [/setAllowContentAccess\(false\)/, 'WebView content access must stay disabled'],
  [/MIXED_CONTENT_NEVER_ALLOW/, 'WebView mixed content must stay disabled'],
  [/setAcceptThirdPartyCookies\(webView, false\)/, 'Third-party cookies must stay disabled'],
  [/ACTION_OPEN_DOCUMENT/, 'Uploads must use the system picker'],
  [/ACCESS_COARSE_LOCATION/, 'Location must remain approximate-only'],
  [/request\.isForMainFrame\(\)/, 'External navigation must stay main-frame scoped'],
  [/onRenderProcessGone/, 'Renderer failure recovery must remain implemented'],
]) requireMatch(activity, pattern, message);

const profileService = read('apps/v1_api/src/profile/profile.service.ts');
requireMatch(profileService, /v1PushSubscription\.deleteMany\(\{ where: \{ userId: user\.id \} \}\)/, 'Withdrawal must remove web push subscriptions');
requireMatch(profileService, /v1PushDevice\.updateMany\([\s\S]*?userId: user\.id, revokedAt: null[\s\S]*?revokedAt: withdrawnAt/, 'Withdrawal must revoke native push devices');

const adminService = read('apps/v1_api/src/admin/admin.service.ts');
for (const [pattern, message] of [
  [/v1PushSubscription\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove web push subscriptions'],
  [/v1PushDevice\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove native push identifiers'],
  [/gender: null/, 'Final deletion must clear profile gender'],
  [/birthDate: null/, 'Final deletion must clear profile birth date'],
  [/v1UserRegion\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove saved regions'],
  [/v1UserSportPreference\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove sport preferences'],
  [/v1SearchHistory\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove search history'],
  [/v1VerificationToken\.deleteMany\(\{ where: \{ userId \} \}\)/, 'Final deletion must remove verification targets'],
]) requireMatch(adminService, pattern, message);

const deletionPage = read('apps/v1_web/src/app/account-deletion/page.tsx');
requireMatch(deletionPage, /\/my\/settings\/withdrawal/, 'Deletion page must link the in-app request');
requireMatch(deletionPage, /teameetsports@naver\.com/, 'Deletion page must expose a public request channel');
requireMatch(deletionPage, /개인정보처리방침/, 'Deletion page must link retained-data details');

const dataSafety = read('apps/v1_android/play/data-safety.md');
for (const text of ['ACCESS_COARSE_LOCATION', 'Firebase Cloud Messaging', 'https://teameet.co.kr/terms?document=privacy', 'https://teameet.co.kr/account-deletion']) {
  if (!dataSafety.includes(text)) throw new Error('Data Safety worksheet is missing: ' + text);
}

process.stdout.write(JSON.stringify({
  status: 'passed',
  permissions: declaredPermissions,
  targetSdk: 36,
  checked: ['data-safety', 'account-deletion', 'permissions', 'webview', 'release-baseline'],
}) + '\n');
