import { pathToFileURL } from 'node:url';

export function validateKakaoWebConfig(env) {
  for (const name of ['KAKAO_CLIENT_ID', 'KAKAO_LOGIN_JS_KEY']) {
    if (!/^[0-9a-f]{32}$/.test(env[name] ?? '')) {
      throw new Error(`${name} must be a configured 32-character Kakao key`);
    }
  }
  if (!['https://alpha.teameet.co.kr', 'https://teameet.co.kr'].includes(env.KAKAO_WEB_ORIGIN)) {
    throw new Error('KAKAO_WEB_ORIGIN must identify alpha or production');
  }
  if (env.KAKAO_REDIRECT_URI !== `${env.KAKAO_WEB_ORIGIN}/callback/kakao`) {
    throw new Error('KAKAO_REDIRECT_URI must match this environment callback');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    validateKakaoWebConfig(process.env);
    console.log('Kakao web build configuration validated (key values suppressed)');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
