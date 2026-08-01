/**
 * 인증번호 메일 템플릿.
 *
 * 이메일 클라이언트는 외부 CSS·웹폰트·<style> 를 자주 잘라내므로 전부 인라인 스타일로 쓰고,
 * 레이아웃도 flex/grid 대신 테이블로 짠다(Outlook 은 지금도 Word 렌더러를 쓴다).
 * 로고는 원격 이미지 하나만 쓴다. 다수 클라이언트가 이미지를 기본 차단하므로, 막혔을 때도
 * 머리말이 멀쩡하도록 옆에 'Teameet' 워드마크를 텍스트로 함께 두고 alt 도 채운다.
 * (data URI·SVG 는 Gmail 이 걸러내고, CID 첨부는 raw MIME 발송이 필요해 쓰지 않았다.)
 *
 * 링크는 넣지 않는다. 코드 입력 방식이라 링크가 필요 없고, 인증 메일의 링크는 피싱과
 * 구분이 어려워 사용자에게 "링크를 눌러도 된다"는 습관을 들이지 않는 편이 안전하다.
 */

export type OtpEmailPurpose = 'verify' | 'password_reset';

interface Copy {
  subject: string;
  heading: string;
  lead: string;
}

const COPY: Record<OtpEmailPurpose, Copy> = {
  verify: {
    subject: '[Teameet] 이메일 인증번호',
    heading: '이메일 인증',
    lead: '아래 인증번호를 입력하면 이메일 확인이 완료돼요.',
  },
  password_reset: {
    subject: '[Teameet] 비밀번호 재설정 인증번호',
    heading: '비밀번호 재설정',
    lead: '아래 인증번호를 입력하면 새 비밀번호를 정할 수 있어요.',
  },
};

/** 프로덕션에 실제로 올라가 있는 브랜드 자산(앱이 /v1 basePath 아래로 서비스된다). */
const LOGO_URL = 'https://teameet.co.kr/v1/brand/icon-192.png';

/** 6자리 코드를 3자리씩 띄워 읽기 쉽게 — 값 자체는 바꾸지 않는다. */
function spaced(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** 코드는 우리가 만든 숫자지만, 템플릿에 값을 끼우는 자리는 습관적으로 이스케이프한다. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function otpEmailSubject(purpose: OtpEmailPurpose): string {
  return COPY[purpose].subject;
}

export function buildOtpEmailText(code: string, purpose: OtpEmailPurpose = 'verify'): string {
  const copy = COPY[purpose];
  return [
    `[Teameet] ${copy.heading}`,
    '',
    copy.lead,
    '',
    `인증번호: ${code}`,
    '',
    '5분 안에 입력해 주세요.',
    '본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.',
    '',
    'Teameet · 같이 뛸 사람을 한 번에',
  ].join('\n');
}

export function buildOtpEmailHtml(code: string, purpose: OtpEmailPurpose = 'verify'): string {
  const copy = COPY[purpose];
  const safeCode = escapeHtml(spaced(code));

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6f8;">
<!-- 미리보기 텍스트: 받은편지함 목록에 제목 옆으로 노출되는 한 줄 -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(copy.lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6f8;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8eaed;">
        <tr>
          <td style="padding:32px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:8px;" valign="middle">
                  <img src="${LOGO_URL}" width="28" height="28" alt="Teameet"
                       style="display:block;width:28px;height:28px;border:0;border-radius:8px;">
                </td>
                <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;font-weight:700;color:#3182f6;letter-spacing:-0.2px;">
                  Teameet
                </td>
              </tr>
            </table>
            <h1 style="margin:14px 0 0 0;font-size:22px;line-height:30px;font-weight:700;color:#191f28;letter-spacing:-0.4px;">
              ${escapeHtml(copy.heading)}
            </h1>
            <p style="margin:10px 0 0 0;font-size:15px;line-height:23px;color:#4e5968;">
              ${escapeHtml(copy.lead)}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#f2f4f6;border-radius:12px;">
              <tr>
                <td align="center" style="padding:22px 16px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
                  <div style="font-size:13px;color:#8b95a1;">인증번호</div>
                  <div style="margin-top:6px;font-size:32px;line-height:40px;font-weight:700;color:#191f28;letter-spacing:6px;">
                    ${safeCode}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
            <p style="margin:0;font-size:14px;line-height:22px;color:#4e5968;">
              5분 안에 입력해 주세요.
            </p>
            <p style="margin:14px 0 0 0;padding-top:16px;border-top:1px solid #f2f4f6;font-size:13px;line-height:20px;color:#8b95a1;">
              본인이 요청하지 않았다면 이 메일은 무시해도 됩니다.
              누군가 주소를 잘못 입력했을 수 있어요.
            </p>
          </td>
        </tr>
      </table>
      <div style="max-width:480px;margin-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:12px;line-height:18px;color:#8b95a1;">
        Teameet · 같이 뛸 사람을 한 번에
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}
