/** 번호가 이미 다른 계정에 등록돼 있다는 409 코드. */
export const PHONE_CONFLICT_CODE = 'PHONE_CONFLICT';

/** 409 `details.next` — 원래 계정으로 로그인하면 이 소셜 로그인이 그 계정에 연결된다. */
export const SIGN_IN_THEN_LINK_NEXT = 'sign_in_then_link';

/** 다른 계정이 이미 쓰는 이메일이라는 409 코드. 그 계정에 대해서는 아무것도 알려 주지 않는다. */
export const EMAIL_CONFLICT_CODE = 'EMAIL_CONFLICT';

/** 이 계정에 이미 같은 로그인 수단이 연결돼 있다는 409 코드. */
export const SOCIAL_LINK_PROVIDER_EXISTS_CODE = 'SOCIAL_LINK_PROVIDER_EXISTS';

/** 운영자 계정에는 로그인 수단을 연결할 수 없다는 403 코드. */
export const SOCIAL_LINK_ADMIN_FORBIDDEN_CODE = 'SOCIAL_LINK_ADMIN_FORBIDDEN';

/** 이메일 인증 증명(`emailLinkToken`)이 만료됐거나 이 계정·주소의 것이 아니라는 400 코드. */
export const EMAIL_LINK_TOKEN_INVALID_CODE = 'EMAIL_LINK_TOKEN_INVALID';

/**
 * 인증 메일 발송이 이번에 실패했다는 503 코드. 인증번호는 남지 않으므로 바로 다시 받을 수 있다.
 * 메일을 보낼 수단 자체가 없는 503 은 `EMAIL_SEND_UNAVAILABLE`(`auth-link-errors.ts`)이다.
 */
export const EMAIL_SEND_FAILED_CODE = 'EMAIL_SEND_FAILED';
