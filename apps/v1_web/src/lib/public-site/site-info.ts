import { fetchPublicV1 } from '@/lib/seo';

/** `GET /api/v1/public/site-info` 응답을 정규화한 값. 상호·이메일은 비면 저장소 기본값으로 채운다. */
export type PublicSiteInfo = {
  readonly companyName: string;
  readonly representativeName: string | null;
  readonly businessRegistrationNumber: string | null;
  readonly address: string | null;
  readonly mailOrderSalesNumber: string | null;
  readonly contactEmail: string;
  /** 비회원 문의 개인정보 보관 기간 문구(예: "문의 처리 완료 후 1년"). */
  readonly guestInquiryRetention: string | null;
};

/**
 * 약관·개인정보처리방침 본문에 이미 공개된 값만 둔다. 사업자등록번호·주소 같은 값은 저장소에 없으므로
 * 어드민이 입력하기 전에는 지어내지 않고 그 줄을 렌더하지 않는다.
 */
export const SITE_INFO_DEFAULTS = {
  companyName: '아이위(IWI)',
  contactEmail: 'teameetsports@naver.com',
} as const;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSiteInfo(raw: Readonly<Record<string, unknown>> | null): PublicSiteInfo {
  return {
    companyName: clean(raw?.companyName) ?? SITE_INFO_DEFAULTS.companyName,
    representativeName: clean(raw?.representativeName),
    businessRegistrationNumber: clean(raw?.businessRegistrationNumber),
    address: clean(raw?.address),
    mailOrderSalesNumber: clean(raw?.mailOrderSalesNumber),
    contactEmail: clean(raw?.contactEmail) ?? SITE_INFO_DEFAULTS.contactEmail,
    guestInquiryRetention: clean(raw?.guestInquiryRetention),
  };
}

// 루트 레이아웃이 모든 요청에서 기다리므로 API 무응답이 사이트 전체를 멈추지 않게 상한을 둔다.
// fetch 에 signal 을 넘기면 Next 가 같은 렌더 안의 중복 요청을 합치지 않아 race 로 끊는다.
export const SITE_INFO_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`site-info 응답이 ${ms}ms 안에 오지 않았어요`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 서버 컴포넌트 전용. 실패해도 페이지를 깨지 않되, 기본값으로 떨어진 사실은 서버 로그에 남긴다. */
export async function fetchPublicSiteInfo(): Promise<PublicSiteInfo> {
  try {
    const data = await withTimeout(
      fetchPublicV1<Record<string, unknown>>('/public/site-info'),
      SITE_INFO_TIMEOUT_MS,
    );
    if (!data) console.warn('[public-site] 사업자 정보 API 가 404 — 저장소 기본값(상호·이메일)만 보여요');
    return normalizeSiteInfo(data);
  } catch (error) {
    console.warn('[public-site] 사업자 정보 조회 실패 — 저장소 기본값(상호·이메일)만 보여요', error);
    return normalizeSiteInfo(null);
  }
}

export type BusinessInfoRow = {
  readonly key: keyof PublicSiteInfo;
  readonly label: string;
  readonly value: string;
};

const BUSINESS_INFO_FIELDS: readonly { readonly key: keyof PublicSiteInfo; readonly label: string }[] = [
  { key: 'companyName', label: '상호' },
  { key: 'representativeName', label: '대표자' },
  { key: 'businessRegistrationNumber', label: '사업자등록번호' },
  { key: 'address', label: '사업장 주소' },
  { key: 'mailOrderSalesNumber', label: '통신판매업 신고번호' },
  { key: 'contactEmail', label: '이메일' },
];

/** 푸터 사업자 정보 줄. 값이 없는 항목은 빈 줄로 남기지 않고 뺀다. */
export function businessInfoRows(info: PublicSiteInfo): BusinessInfoRow[] {
  return BUSINESS_INFO_FIELDS.flatMap(({ key, label }) => {
    const value = info[key];
    return value ? [{ key, label, value }] : [];
  });
}
